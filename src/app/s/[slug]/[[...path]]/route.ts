import { prisma } from '@/lib/db';
import { SITE_CSP } from '@/lib/security';
import type { SiteFile } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  txt: 'text/plain; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  webmanifest: 'application/manifest+json',
};

const baseHeaders = {
  'Content-Security-Policy': SITE_CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'public, max-age=0, must-revalidate',
};

const notFound = () =>
  new Response(
    '<!DOCTYPE html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bulunamadı</title>' +
      '<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;color:#333"><div style="text-align:center"><h1>404</h1><p>Bu site bulunamadı ya da yayından kaldırıldı.</p></div></body></html>',
    { status: 404, headers: { ...baseHeaders, 'Content-Type': 'text/html; charset=utf-8' } },
  );

export async function GET(_req: Request, { params }: { params: { slug: string; path?: string[] } }) {
  const p = await prisma.project.findUnique({ where: { slug: params.slug } });
  if (!p || !p.published) return notFound();
  const v = await prisma.version.findFirst({ where: { projectId: p.id }, orderBy: { number: 'desc' } });
  if (!v) return notFound();

  const files: SiteFile[] = JSON.parse(v.files);
  const rel = params.path?.map((s) => decodeURIComponent(s)).join('/') || 'index.html';
  const f = files.find((x) => x.yol === rel);
  if (!f) return notFound();

  const ext = rel.split('.').pop()?.toLowerCase() || 'txt';
  let body = f.icerik;
  if (ext === 'html') {
    const base = `/s/${params.slug}/`;
    const docPath = rel === 'index.html' ? `/s/${params.slug}` : `${base}${rel}`;
    // <base> kullandığımız için çapa (#...) bağlantıları sayfayı yeniden yüklemesin diye mutlak yola çevrilir.
    body = body.replace(/(href=["'])#/gi, (_m: string, a: string) => `${a}${docPath}#`);
    body = /<head[^>]*>/i.test(body)
      ? body.replace(/<head[^>]*>/i, (m: string) => `${m}<base href="${base}">`)
      : `<base href="${base}">${body}`;
  }
  return new Response(body, { headers: { ...baseHeaders, 'Content-Type': TYPES[ext] || 'text/plain; charset=utf-8' } });
}
