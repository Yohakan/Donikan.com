import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { clientIp, rateLimit } from '@/lib/security';
import { addVersion, loadProject } from '@/lib/store';
import { sanitizeFiles, slugify } from '@/lib/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bad = (hata: string, status = 400) => NextResponse.json({ hata }, { status });
type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const p = await loadProject(params.id);
  return p ? NextResponse.json(p) : bad('Proje bulunamadı.', 404);
}

/** Elle düzenlenen dosyaları yeni sürüm olarak kaydeder. */
export async function PATCH(req: Request, { params }: Ctx) {
  if (!rateLimit(`p:${clientIp(req)}`, 60, 60_000)) return bad('Çok fazla istek. Biraz bekleyin.', 429);
  const body: any = await req.json().catch(() => null);
  const files = sanitizeFiles(body?.files);
  if (!files) return bad('Geçersiz dosya verisi.');
  if (!(await loadProject(params.id))) return bad('Proje bulunamadı.', 404);
  await addVersion(params.id, files, 'Elle düzenleme');
  return NextResponse.json(await loadProject(params.id));
}

/** action: publish | unpublish | restore */
export async function POST(req: Request, { params }: Ctx) {
  if (!rateLimit(`p:${clientIp(req)}`, 60, 60_000)) return bad('Çok fazla istek. Biraz bekleyin.', 429);
  const body: any = await req.json().catch(() => null);
  const p = await loadProject(params.id);
  if (!p) return bad('Proje bulunamadı.', 404);

  if (body?.action === 'publish') {
    let slug = p.slug;
    if (!slug) {
      for (let i = 0; i < 5 && !slug; i++) {
        const c = `${slugify(p.title) || 'site'}-${randomBytes(3).toString('hex')}`;
        if (!(await prisma.project.findUnique({ where: { slug: c } }))) slug = c;
      }
    }
    if (!slug) return bad('Link üretilemedi, tekrar deneyin.', 500);
    await prisma.project.update({ where: { id: p.id }, data: { slug, published: true } });
  } else if (body?.action === 'unpublish') {
    await prisma.project.update({ where: { id: p.id }, data: { published: false } });
  } else if (body?.action === 'restore' && typeof body.versionId === 'string') {
    const v = await prisma.version.findFirst({ where: { id: body.versionId, projectId: p.id } });
    if (!v) return bad('Sürüm bulunamadı.', 404);
    await addVersion(p.id, JSON.parse(v.files), `Sürüm ${v.number} geri yüklendi`);
  } else {
    return bad('Geçersiz işlem.');
  }
  return NextResponse.json(await loadProject(p.id));
}
