# Monada Store — Supabase setup

Everything on the app side is built and verified. This is the backend side, start to finish. About 10 minutes.

---

## 1. Create the project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. **New project**.
3. Name it `monada-store`.
4. **Save the database password somewhere safe.** You will not need it for this app, but you cannot recover it later.
5. Region: pick the one closest to Venezuela — `South America (São Paulo)` is the usual choice.
6. Wait for provisioning (about 2 minutes).

---

## 2. Run the schema

This creates the tables, the photo bucket, and the access rules.

1. In your project, open **SQL Editor** in the left sidebar.
2. In the app, open the admin panel at `yoursite.com/#admin`.
3. Go to the **Supabase & SQL** tab.
4. Click **Copy SQL**.
5. Paste the whole thing into the Supabase SQL Editor.
6. Click **Run** (or press `Ctrl+Enter`).

You should see `Success. No rows returned`. That is correct — it is all DDL.

The script is safe to run more than once. If you change the schema later, just run it again.

**What it creates:**

| Object | Purpose |
|---|---|
| `products` | Your catalog |
| `orders` | Every WhatsApp order, with customer details |
| `store_settings` | WhatsApp number, BCV rate, socials, free-delivery threshold |
| `product-images` bucket | Where uploaded photos live |

---

## 3. Get your API credentials

1. In Supabase: **Project Settings** → **API**.
2. Copy **Project URL** — looks like `https://abcdefghijk.supabase.co`.
3. Copy the **`anon` `public`** key — the long `eyJ...` string.

> **Use the `anon` key, never `service_role`.** The anon key is designed to be public and is protected by the access rules you just created. The `service_role` key bypasses all of them; putting it in a website hands your whole database to anyone who opens developer tools.

---

## 4. Put the credentials in the app

Two ways. Pick one.

### Option A — `.env` file (recommended for deployment)

```bash
cp .env.example .env
```

Then edit `.env`:

```
VITE_SUPABASE_URL=https://abcdefghijk.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Rebuild: `npm run build`.

### Option B — the admin panel (no rebuild)

Admin panel → **Supabase & SQL** → paste the URL and key → **Save & Verify**.

Useful for testing, but it saves to that browser only. For production use Option A so every visitor gets the same backend.

---

## 5. Verify it actually works

```bash
npm run verify
```

This runs two things:

- **`verify:schema`** — 60 checks that the SQL matches what the app reads and writes. No credentials needed.
- **`verify:supabase`** — real round-trips against your project: inserts a product, reads it back, updates it, deletes it. Same for orders and settings. Uploads a test image, fetches it over public HTTP, deletes it. Cleans up after itself.

**Writing needs an admin login.** The catalog is world-readable, but products, settings and photos can only be written by a signed-in admin (that is the whole point of the security rules). So `verify:supabase` signs in with your admin account. Add these to `.env`:

```
VERIFY_ADMIN_EMAIL=you@example.com
VERIFY_ADMIN_PASSWORD=your-admin-password
```

Note the names: deliberately **not** prefixed with `VITE_`, so Vite cannot bake your password into the browser bundle. Use the account you created in Supabase Auth → Users for the admin panel.

Without them the write checks are reported as **skipped** rather than failed, and you still get a useful read-only report.

Expected output:

```
✓ 15 checks passed.
  Your backend is ready.
```

If something fails, the message names the exact problem. The two most common:

| Message | Fix |
|---|---|
| `products table — relation does not exist` | Step 2 was not run, or only partly. Re-run the full schema. |
| `Bucket not found` | The storage section of the schema did not run. Re-run it. |

---

## 6. Confirm in the browser

1. Open the admin panel.
2. The sidebar badge should read **Supabase Live** (green).
3. Add a product with a photo.
4. Reload the page. The product should still be there.
5. Open the site in a different browser or on your phone. The product should appear there too.

That last step is the real test. If it shows up in a second browser, the backend is genuinely working.

---

## What is stored where

| Data | Location | Survives clearing browser data |
|---|---|---|
| Products | Supabase `products` + local cache | Yes |
| Product photos | Supabase Storage `product-images` | Yes |
| Orders | Supabase `orders` | Yes |
| Settings | Supabase `store_settings` + local cache | Yes |
| Cart | Browser only | No (intentional) |
| Wishlist | Browser only | No |

The app always writes to the browser first, then to Supabase. If Supabase is unreachable, the storefront keeps working from the local copy and syncs when the connection returns.

---

## Security — what the rules actually do

The schema now ships **locked down**. Verified against the live project:

| Data | Anonymous visitor | Signed-in admin |
|---|---|---|
| Read products | ✅ yes (storefront needs it) | ✅ yes |
| Read store settings | ✅ yes (WhatsApp number, BCV rate) | ✅ yes |
| **Read customer orders** | ❌ blocked | ✅ yes |
| Place an order | ✅ yes (guest checkout) | ✅ yes |
| Write products / settings | ❌ blocked | ✅ yes |
| Upload / delete photos | ❌ blocked | ✅ yes |

The anon key is in your website's JavaScript. That is fine — it is a public key by design. What protects your data is Row Level Security, not secrecy of the key.

Customer names, phone numbers and addresses are only readable by a signed-in admin. Prove this any time with:

```bash
npm run verify:security
```

That check plants a real order as the admin, then tries to read it back as a stranger. An empty table would otherwise make the test pass for the wrong reason.

### Before you take real money

1. **Create your admin account** in Supabase → Authentication → Users. Without it you cannot log into the admin panel, so you cannot add products.
2. **Add the admin credentials to `.env`** (`VERIFY_ADMIN_EMAIL` / `VERIFY_ADMIN_PASSWORD`) so `npm run verify` can test the write paths.
3. **Turn off public sign-ups** in Supabase → Authentication → Providers → Email, so strangers cannot create accounts. Only `authenticated` users can write, so anyone who signs up would become an admin.
4. Never put the `service_role` key in this project. It bypasses every rule above.

Point 3 is the one people miss. The policies grant write access to *any* authenticated user.

---

## Troubleshooting

**Badge says "Supabase (sin verificar)"**
Credentials are saved but not tested. Click **Test Connection**.

**Badge says "Local Fallback"**
No credentials found. Check `.env` exists and the variable names start with `VITE_`.

**Photos save but vanish on another device**
Supabase is not connected, so photos went to `localStorage`. Fix the credentials.

**"new row violates row-level security policy"**
The policies did not run. Re-run the full schema.

**Changes do not appear on other devices**
The browser is serving its local cache. Hard-reload (`Ctrl+Shift+R`).
