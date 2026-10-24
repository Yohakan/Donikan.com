import type { SiteFile } from './types';

export const SAFE_PATH = /^(?!.*\.\.)[A-Za-z0-9_\-][A-Za-z0-9_\-./]{0,100}$/;

/** Dosya listesini doğrular ve temizler; geçersizse null döner. */
export function sanitizeFiles(x: any): SiteFile[] | null {
  if (!Array.isArray(x) || !x.length || x.length > 40) return null;
  const seen = new Set<string>();
  const out: SiteFile[] = [];
  let total = 0;
  for (const f of x) {
    if (!f || typeof f.yol !== 'string' || typeof f.icerik !== 'string') return null;
    const yol = f.yol.replace(/^\.\//, '');
    if (!SAFE_PATH.test(yol) || seen.has(yol)) return null;
    seen.add(yol);
    total += f.icerik.length;
    out.push({ yol, icerik: f.icerik });
  }
  return total > 3_000_000 ? null : out;
}

export function slugify(s: string): string {
  return s
    .replace(/İ/g, 'i')
    .toLowerCase()
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function readmeFor(title: string, prompt: string, files: SiteFile[]): string {
  return `# ${title}

Bu site PromptSite ile üretildi.

## Dosyalar
${files.map((f) => `- \`${f.yol}\``).join('\n')}

## Çalıştırma
Derleme gerekmez. \`index.html\` dosyasını tarayıcıda açın ya da klasörü herhangi bir statik barındırmaya
(Vercel, Netlify, GitHub Pages, cPanel...) yükleyin.

Yerelde küçük bir sunucu ile denemek için:

\`\`\`bash
npx serve .
\`\`\`

## Üretim prompt'u
> ${prompt.replace(/\n/g, '\n> ')}
`;
}
