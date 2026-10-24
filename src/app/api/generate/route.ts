import { prisma } from '@/lib/db';
import { AppError } from '@/lib/gemini';
import { createSite, reviseSite } from '@/lib/pipeline';
import { cleanText, clientIp, rateLimit } from '@/lib/security';
import { addVersion, loadProject } from '@/lib/store';
import { sanitizeFiles } from '@/lib/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const json = (hata: string, status: number) => Response.json({ hata }, { status });

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`g:${ip}`, 4, 60_000) || !rateLimit(`gh:${ip}`, 30, 3_600_000)) {
    return json('Çok fazla istek gönderdiniz. Lütfen bir dakika bekleyip tekrar deneyin.', 429);
  }

  const body: any = await req.json().catch(() => null);
  if (!body) return json('Geçersiz istek.', 400);
  const projectId = typeof body.projectId === 'string' ? body.projectId : null;
  const prompt = cleanText(body.prompt, 4000);
  const instruction = cleanText(body.instruction, 1500);
  if (projectId ? instruction.length < 3 : prompt.length < 10) {
    return json(projectId ? 'Lütfen değişiklik isteğini yazın.' : 'Prompt en az 10 karakter olmalı.', 400);
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: Record<string, unknown>) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          /* istemci bağlantıyı kapatmış olabilir */
        }
      };
      const hb = setInterval(() => {
        try {
          controller.enqueue(enc.encode(': ping\n\n'));
        } catch {}
      }, 15000);

      try {
        if (projectId) {
          const cur = await loadProject(projectId);
          if (!cur) throw new AppError('Proje bulunamadı. Yeni bir proje oluşturun.');
          const r = await reviseSite(cur.files, instruction, cur.analysis, emit);
          const files = sanitizeFiles(r.files);
          if (!files) throw new AppError('Güncellenen dosyalar geçersiz. Lütfen tekrar deneyin.');
          await addVersion(projectId, files, instruction);
          emit({ type: 'done', project: await loadProject(projectId), ozet: r.ozet });
        } else {
          const r = await createSite(prompt, emit);
          const files = sanitizeFiles(r.files);
          if (!files) throw new AppError('Üretilen dosyalar geçersiz. Lütfen tekrar deneyin.');
          const title = String(r.analysis.marka?.ad || prompt.slice(0, 60)).slice(0, 80);
          const proj = await prisma.project.create({
            data: {
              title,
              prompt,
              analysis: JSON.stringify(r.analysis),
              versions: { create: { number: 1, note: 'İlk üretim', files: JSON.stringify(files) } },
            },
          });
          emit({ type: 'done', project: await loadProject(proj.id) });
        }
      } catch (e: any) {
        console.error(e);
        emit({ type: 'error', message: e instanceof AppError ? e.message : 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.' });
      } finally {
        clearInterval(hb);
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
