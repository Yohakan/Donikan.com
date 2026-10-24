const buckets = new Map<string, { n: number; t: number }>();

/** Basit bellek içi hız sınırı (sunucusuz ortamda "en iyi çaba" düzeyindedir). */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.t > windowMs) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || now - b.t > windowMs) {
    buckets.set(key, { n: 1, t: now });
    return true;
  }
  b.n++;
  return b.n <= max;
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'yerel';
}

/** Girdi temizleme: kontrol karakterlerini ve script etiketlerini siler, uzunluğu sınırlar. */
export function cleanText(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/<\/?script[^>]*>/gi, '')
    .trim()
    .slice(0, max);
}

/** Yayınlanan siteler için CSP. `sandbox` yönergesi sayfayı opak bir origin'e alır; böylece
 *  üretilen JS, bu uygulamanın çerezlerine/depolamasına erişemez. */
export const SITE_CSP = [
  "default-src 'self'",
  "img-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "media-src 'self' https: data:",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'sandbox allow-scripts allow-forms allow-popups allow-modals',
].join('; ');
