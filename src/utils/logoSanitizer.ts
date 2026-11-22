/**
 * Restaurant Logo Sanitizer
 * Guarantees that restaurant logos never render mojibake or corrupt UTF-8 strings
 * like 'ðŸ›¡ï¸', 'Ÿ›iŸ', 'dY>?,?', '???', etc.
 */

export function sanitizeRestaurantLogo(logo?: string | null, fallback = '🍽️'): string {
  if (!logo || typeof logo !== 'string') return fallback;
  const trimmed = logo.trim();
  if (!trimmed) return fallback;

  // 1. Valid web image URL or Data URI or Blob URL
  if (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  // 2. Corrupted mojibake markers or Latin-1 decoding errors of UTF-8 emojis
  // E.g.: 'ðŸ›¡ï¸', 'Ÿ›iŸ', 'dY?', '\uFFFD', 'A?', 'A', etc.
  if (
    trimmed.includes('ð') ||
    trimmed.includes('Ÿ') ||
    trimmed.includes('›') ||
    trimmed.includes('¡') ||
    trimmed.includes('ï') ||
    trimmed.includes('¸') ||
    trimmed.includes('dY') ||
    trimmed.includes('\uFFFD') ||
    trimmed.includes('?') ||
    trimmed.includes('A') ||
    trimmed.includes('') ||
    /[\u0080-\u009F]/.test(trimmed)
  ) {
    return fallback;
  }

  // 3. Reject any long string that isn't a URL (legitimate emojis/icons are <= 8 code units)
  if (trimmed.length > 8 && !trimmed.includes('/')) {
    return fallback;
  }

  return trimmed;
}

export function isImageLogo(logo?: string | null): boolean {
  if (!logo || typeof logo !== 'string') return false;
  const trimmed = logo.trim();
  return (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('blob:')
  );
}
