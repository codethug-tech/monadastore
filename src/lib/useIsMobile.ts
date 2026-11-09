import { useEffect, useState } from 'react';

/**
 * Tracks whether the viewport is phone-sized.
 *
 * Used to tighten the header and hide secondary controls on small screens,
 * where the full desktop row does not fit and causes horizontal scrolling.
 */
export function useIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < breakpoint;
  });

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [breakpoint]);

  return isMobile;
}
