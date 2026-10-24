const hex = (v: any, d: string) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : d);

async function getJSON(url: string, headers: Record<string, string>): Promise<any> {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), 8000);
  try {
    const r = await fetch(url, { headers, signal: c.signal });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(id);
  }
}

/** Unsplash, yoksa Pexels'ten tek görsel URL'si getirir; bulunamazsa null. */
export async function findPhoto(query: string, width = 1600): Promise<string | null> {
  const q = encodeURIComponent((query || '').slice(0, 80));
  if (!q) return null;
  const w = Math.min(Math.max(Math.round(width) || 1200, 400), 2000);

  const uk = process.env.UNSPLASH_ACCESS_KEY;
  if (uk) {
    const j = await getJSON(`https://api.unsplash.com/search/photos?query=${q}&per_page=1&orientation=landscape&content_filter=high`, {
      Authorization: `Client-ID ${uk}`,
    });
    const raw = j?.results?.[0]?.urls?.raw;
    if (raw) return `${raw}&w=${w}&q=75&auto=format&fit=crop`;
  }
  const pk = process.env.PEXELS_API_KEY;
  if (pk) {
    const j = await getJSON(`https://api.pexels.com/v1/search?query=${q}&per_page=1&orientation=landscape`, { Authorization: pk });
    const s = j?.photos?.[0]?.src;
    if (s) return w > 1000 ? s.large2x || s.large : s.large || s.medium;
  }
  return null;
}

/** Görsel bulunamazsa kullanılan, palete uyumlu SVG data URI (kırık görsel asla çıkmaz). */
export function svgFallback(palette: any = {}, w = 1600, h = 900): string {
  const a = hex(palette?.birincil, '#4f46e5');
  const b = hex(palette?.vurgu || palette?.ikincil, '#f59e0b');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/>` +
    `<circle cx="${w * 0.78}" cy="${h * 0.25}" r="${h * 0.35}" fill="#fff" fill-opacity=".14"/>` +
    `<circle cx="${w * 0.15}" cy="${h * 0.9}" r="${h * 0.45}" fill="#000" fill-opacity=".12"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29');
}
