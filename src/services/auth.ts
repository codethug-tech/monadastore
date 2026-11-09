// Admin authentication against Supabase Auth.
//
// This replaces the old client-side password check, which shipped the password
// in the JavaScript bundle and stored it in localStorage. Here the password
// never exists in the app: Supabase verifies it server-side and returns a JWT
// that the database uses to decide what the caller is allowed to do.

import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase';

export interface AuthResult {
  ok: boolean;
  message: string;
  /** True when the failure is "no account exists yet", so the UI can offer signup. */
  needsSetup?: boolean;
}

export interface AdminSession {
  user: User;
  session: Session;
}

/** True when Supabase is configured, which is required for real auth. */
export function isAuthAvailable(): boolean {
  return getSupabaseClient() !== null;
}

/** The currently signed-in admin, or null. */
export async function getAdminSession(): Promise<AdminSession | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.user) return null;
  return { user: data.session.user, session: data.session };
}

export async function signInAdmin(email: string, password: string): Promise<AuthResult> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      ok: false,
      message: 'Supabase is not configured, so secure sign-in is unavailable.',
    };
  }

  const { error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('invalid login credentials')) {
      return { ok: false, message: 'Wrong email or password.' };
    }
    if (msg.includes('email not confirmed')) {
      return {
        ok: false,
        message: 'That account has not been confirmed. Check your email, or turn off confirmation in Supabase.',
      };
    }
    return { ok: false, message: error.message };
  }

  return { ok: true, message: 'Signed in.' };
}

/**
 * Creates the first admin account.
 *
 * Supabase may require email confirmation depending on project settings. When
 * it does, signIn immediately after will fail and the caller shows that message.
 */
export async function signUpAdmin(email: string, password: string): Promise<AuthResult> {
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, message: 'Supabase is not configured.' };
  }
  if (password.length < 8) {
    return { ok: false, message: 'Password must be at least 8 characters.' };
  }

  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('already registered') || msg.includes('already exists')) {
      return { ok: false, message: 'That email already has an account. Sign in instead.' };
    }
    return { ok: false, message: error.message };
  }

  // With email confirmation on, there is no session yet.
  if (!data.session) {
    return {
      ok: false,
      message:
        'Account created. Check your email to confirm it, then sign in. (Or turn off "Confirm email" in Supabase → Authentication → Providers → Email.)',
    };
  }

  return { ok: true, message: 'Admin account created and signed in.' };
}

export async function signOutAdmin(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  await client.auth.signOut();
}

/** Sends a password reset email. */
export async function sendPasswordReset(email: string): Promise<AuthResult> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, message: 'Supabase is not configured.' };
  const { error } = await client.auth.resetPasswordForEmail(email.trim());
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: 'Password reset email sent.' };
}

/** True when the signed-in user is allowed to administer the store. */
export function isAdminUser(user: User | null): boolean {
  if (!user) return false;
  // Any authenticated user is an admin in this single-owner store. If you add
  // staff later, gate this on a claim or an admins table instead.
  return Boolean(user.id);
}
