import { AppError, geminiJSON } from './gemini';
import { ANALYSIS_SYSTEM, BUILD_SYSTEM, FIX_SYSTEM, REVISE_SYSTEM } from './prompts';
import { findPhoto, svgFallback } from './images';
import { sanitizeFiles } from './util';
import type { SiteFile } from './types';

export type Emit = (e: Record<string, unknown>) => void;
const maxOut = () => Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 60000);

/** Yalnızca bozuk JSON durumunda yeniden dener. */
async function retry<T>(fn: () => Promise<T>, emit: Emit, n = 2): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e: any) {
      if (e?.code !== 'parse' || i >= n) throw e;
      emit({ type: 'log', message: 'Yanıt bozuk geldi, yeniden deneniyor…' });
    }
  }
}

function normAnalysis(a: any) {
  const x = a && typeof a === 'object' ? a : {};
  return {
    ...x,
    marka: x.marka && typeof x.marka === 'object' ? x.marka : { ad: 'Yeni Site' },
    dil: typeof x.dil === 'string' ? x.dil : 'tr',
    renkPaleti: x.renkPaleti && typeof x.renkPaleti === 'object' ? x.renkPaleti : {},
    gorselIhtiyaclari: Array.isArray(x.gorselIhtiyaclari)
      ? x.gorselIhtiyaclari.filter((g: any) => g && typeof g.id === 'string').slice(0, 8)
      : [],
    varsayimlar: Array.isArray(x.varsayimlar) ? x.varsayimlar : [],
  };
}

/** HTML / JSON / bağlantı doğrulaması. Boş dizi = sorun yok. */
export function validate(files: any): string[] {
  const errs: string[] = [];
  if (!Array.isArray(files) || !files.length) return ['"dosyalar" boş veya dizi değil'];
  const map = new Map<string, string>();
  for (const f of files) {
    if (!f || typeof f.yol !== 'string' || typeof f.icerik !== 'string') {
      errs.push('Geçersiz dosya girdisi (yol ve icerik string olmalı)');
      continue;
    }
    map.set(f.yol.replace(/^\.\//, ''), f.icerik);
  }
  if (!map.has('index.html')) errs.push('index.html eksik');

  for (const [yol, c] of map) {
    if (/\.html?$/i.test(yol)) {
      const e = (m: string) => errs.push(`${yol}: ${m}`);
      if (!/<!doctype html>/i.test(c)) e('<!DOCTYPE html> yok');
      if (!/<html[^>]*\blang=/i.test(c)) e('<html lang> yok');
      if (!/<title>[^<]+<\/title>/i.test(c)) e('<title> yok');
      if (!/<meta[^>]+name=["']viewport["']/i.test(c)) e('viewport meta yok');
      if (!/<h1[\s>]/i.test(c)) e('<h1> yok');
      if (!/<\/body>\s*<\/html>\s*$/i.test(c.trim())) e('</body></html> ile bitmiyor (kesilmiş olabilir)');
      if (/lorem ipsum|dolor sit amet/i.test(c)) e('lorem ipsum içeriyor');
      if (/<img\b(?![^>]*\balt=)[^>]*>/i.test(c)) e('alt özniteliği olmayan <img> var');

      const clean = c
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '');
      for (const t of ['div', 'section', 'main', 'header', 'footer', 'nav', 'ul', 'ol', 'form', 'article', 'aside', 'table', 'button', 'select']) {
        const o = (clean.match(new RegExp(`<${t}[\\s>]`, 'gi')) || []).length;
        const k = (clean.match(new RegExp(`</${t}>`, 'gi')) || []).length;
        if (o !== k) e(`<${t}> etiketi dengesiz (${o} açılış / ${k} kapanış)`);
      }
      for (const m of c.matchAll(/\b(?:href|src)=["']([^"']*)["']/gi)) {
        const u = m[1].trim();
        if (!u || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/$|\{\{)/i.test(u)) continue;
        const p = u.replace(/^\.?\//, '').split(/[?#]/)[0];
        if (p && !map.has(p)) e(`var olmayan dosyaya bağlantı: ${u}`);
      }
    }
    if (/\.js$/i.test(yol)) {
      try {
        new Function(c); // yalnızca derler, çalıştırmaz
      } catch (err: any) {
        errs.push(`${yol}: JS sözdizimi hatası: ${err.message}`);
      }
    }
    if (/\.css$/i.test(yol)) {
      const s = c.replace(/\/\*[\s\S]*?\*\//g, '');
      if ((s.match(/\{/g) || []).length !== (s.match(/\}/g) || []).length) errs.push(`${yol}: süslü parantezler dengesiz`);
    }
  }
  return errs.slice(0, 15);
}

/** Doğrular; hata varsa Gemini'ye en fazla 2 düzeltme turu yaptırır. */
async function validateAndFix(files: any, emit: Emit): Promise<SiteFile[]> {
  let cur = files;
  for (let i = 0; i <= 2; i++) {
    const errs = validate(cur);
    if (!errs.length) break;
    if (i === 2) {
      if (!Array.isArray(cur) || errs.some((x) => x.includes('index.html eksik') || x.includes('boş veya dizi'))) {
        throw new AppError('Üretilen site eksik çıktı. Lütfen tekrar deneyin.');
      }
      emit({ type: 'log', message: 'Bazı küçük sorunlar otomatik düzeltilemedi, site yine de hazırlandı.' });
      break;
    }
    emit({ type: 'log', message: `Doğrulamada ${errs.length} sorun bulundu, otomatik düzeltiliyor (${i + 1}/2)…` });
    try {
      const fixed: any = await geminiJSON(FIX_SYSTEM, JSON.stringify({ hatalar: errs, dosyalar: cur }), { temperature: 0.2, maxTokens: maxOut() });
      if (Array.isArray(fixed?.dosyalar) && fixed.dosyalar.length) cur = fixed.dosyalar;
    } catch (e: any) {
      if (!(e instanceof AppError) || e.code !== 'parse') throw e;
    }
  }
  const clean = sanitizeFiles(cur);
  if (!clean) throw new AppError('Üretilen dosya yapısı geçersiz. Lütfen tekrar deneyin.');
  return clean;
}

/** {{IMG:id}} yer tutucularını gerçek görsele ya da SVG yedeğe çevirir. */
async function resolveImages(files: SiteFile[], needs: any[], palette: any): Promise<SiteFile[]> {
  const ids = new Set<string>();
  for (const f of files) for (const m of f.icerik.matchAll(/\{\{IMG:([A-Za-z0-9_-]+)\}\}/g)) ids.add(m[1]);
  if (!ids.size) return files;
  const need = new Map<string, any>((needs || []).filter((n) => n && typeof n.id === 'string').map((n) => [n.id, n]));
  const urls = new Map<string, string>();
  await Promise.all(
    [...ids].map(async (id) => {
      const n = need.get(id);
      const url = n ? await findPhoto(String(n.aramaSorgusu || n.aciklama || ''), Number(n.genislik) || 1600) : null;
      urls.set(id, url || svgFallback(palette, Number(n?.genislik) || 1600, Number(n?.yukseklik) || 900));
    }),
  );
  return files.map((f) => ({ ...f, icerik: f.icerik.replace(/\{\{IMG:([A-Za-z0-9_-]+)\}\}/g, (_m: string, id: string) => urls.get(id) || '') }));
}

export async function createSite(prompt: string, emit: Emit) {
  const st = (stage: string, status: string) => emit({ type: 'stage', stage, status });

  // 1) ANALİZ
  st('analiz', 'calisiyor');
  const raw = await retry(() => geminiJSON(ANALYSIS_SYSTEM, prompt, { temperature: 0.4, maxTokens: 8192 }), emit);
  const analysis = normAnalysis(raw);
  emit({ type: 'analysis', analysis });
  st('analiz', 'bitti');

  // 2) ÜRETİM
  st('tasarim', 'calisiyor');
  const out: any = await retry(
    () =>
      geminiJSON(BUILD_SYSTEM, `ORİJİNAL PROMPT:\n${prompt}\n\nANALİZ JSON:\n${JSON.stringify(analysis)}`, {
        temperature: 0.8,
        maxTokens: maxOut(),
      }),
    emit,
  );
  st('tasarim', 'bitti');

  // 3) DOĞRULAMA + OTOMATİK DÜZELTME
  st('kod', 'calisiyor');
  let files = await validateAndFix(out?.dosyalar, emit);
  st('kod', 'bitti');

  // 4) GÖRSELLER
  st('gorsel', 'calisiyor');
  files = await resolveImages(files, analysis.gorselIhtiyaclari, analysis.renkPaleti);
  st('gorsel', 'bitti');

  return { analysis, files };
}

export async function reviseSite(files: SiteFile[], instruction: string, analysis: any, emit: Emit) {
  const st = (stage: string, status: string) => emit({ type: 'stage', stage, status });
  st('analiz', 'bitti');
  st('tasarim', 'calisiyor');
  const out: any = await retry(
    () =>
      geminiJSON(REVISE_SYSTEM, JSON.stringify({ talimat: instruction, analiz: analysis, dosyalar: files }), {
        temperature: 0.6,
        maxTokens: maxOut(),
      }),
    emit,
  );
  st('tasarim', 'bitti');
  st('kod', 'calisiyor');
  let next = await validateAndFix(out?.dosyalar, emit);
  st('kod', 'bitti');
  st('gorsel', 'calisiyor');
  next = await resolveImages(next, Array.isArray(out?.yeniGorseller) ? out.yeniGorseller : [], analysis?.renkPaleti);
  st('gorsel', 'bitti');
  return { files: next, ozet: typeof out?.ozet === 'string' ? out.ozet.slice(0, 200) : '' };
}
