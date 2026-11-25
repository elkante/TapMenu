/**
 * Canonical URL & QR Resolution Utility
 * 
 * Ensures that EVERY QR code and direct customer menu link generated is ABSOLUTE,
 * immutable, and never breaks or points to local/inaccessible addresses regardless
 * of local development, preview deployments, or device differences.
 */

export const DEFAULT_CANONICAL_DOMAIN = 'https://tapmenu.me';

/**
 * Returns the true absolute, canonical base URL of the TapMenu platform.
 * 
 * 1. Checks explicit environment variable VITE_PUBLIC_APP_URL if defined.
 * 2. If running on a live public domain (e.g. tapmenu.me, production host, Vercel/Netlify),
 *    uses window.location.origin.
 * 3. If running on localhost, 127.0.0.1, or local private IPs (192.168.x.x, 10.x.x),
 *    falls back to DEFAULT_CANONICAL_DOMAIN ('https://tapmenu.me') so that any QR code
 *    or NFC tag scanned on a real phone (e.g. iPhone 17) always points to the real live site.
 */
export function getAbsoluteBaseUrl(): string {
  try {
    const envUrl = (import.meta as any).env?.VITE_PUBLIC_APP_URL;
    if (envUrl && typeof envUrl === 'string' && envUrl.trim().startsWith('http')) {
      return envUrl.trim().replace(/\/+$/, '');
    }
  } catch {}

  if (typeof window !== 'undefined' && window.location) {
    try {
      const origin = window.location.origin;
      const hostname = window.location.hostname.toLowerCase();

      const isLocalHost = 
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.16.') ||
        hostname.startsWith('172.17.') ||
        hostname.startsWith('172.18.') ||
        hostname.startsWith('172.19.') ||
        hostname.startsWith('172.2') ||
        hostname.startsWith('172.30.') ||
        hostname.startsWith('172.31.') ||
        hostname.endsWith('.local');

      if (!isLocalHost && origin && origin.startsWith('http')) {
        return origin.replace(/\/+$/, '');
      }
    } catch {}
  }

  return DEFAULT_CANONICAL_DOMAIN;
}

/**
 * Returns an absolute, immutable customer table URL.
 * Example: https://tapmenu.me/?r=orion-kitchen&table=Table%201
 */
export function getAbsoluteTableUrl(slug: string, tableNumber: string): string {
  const base = getAbsoluteBaseUrl();
  const cleanSlug = encodeURIComponent((slug || '').trim());
  const cleanTable = encodeURIComponent((tableNumber || '').trim());
  return `${base}/?r=${cleanSlug}&table=${cleanTable}`;
}

/**
 * Returns an absolute, immutable vendor walk-up counter URL.
 * Example: https://tapmenu.me/?r=kfcc
 */
export function getAbsoluteVendorUrl(slug: string): string {
  const base = getAbsoluteBaseUrl();
  const cleanSlug = encodeURIComponent((slug || '').trim());
  return `${base}/?r=${cleanSlug}`;
}

/**
 * Sanitizes any raw or legacy urlPayload to guarantee it is absolute and valid.
 * Converts relative paths or localhost links to canonical public URLs.
 */
export function ensureAbsolutePayload(rawUrl: string | undefined, slug: string, tableNumber?: string): string {
  if (tableNumber) {
    return getAbsoluteTableUrl(slug, tableNumber);
  }
  if (!rawUrl || rawUrl.startsWith('/') || rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1')) {
    return getAbsoluteVendorUrl(slug);
  }
  return rawUrl;
}
