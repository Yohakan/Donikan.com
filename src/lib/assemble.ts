import type { SiteFile } from './types';

const norm = (p: string) => p.replace(/^\.?\//, '').split(/[?#]/)[0];

/**
 * Önizleme için CSS/JS dosyalarını HTML içine gömer (iframe srcDoc tek belge ister).
 * Sayfalar arası linkler üst pencereye mesaj olarak iletilir.
 */
export function previewHtml(files: SiteFile[], page = 'index.html'): string {
  const get = (p: string) => files.find((f) => f.yol === p)?.icerik;
  let html = get(page) ?? get('index.html') ?? '<p style="font-family:sans-serif;padding:2rem">index.html bulunamadı.</p>';

  html = html.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi, (m: string) => {
    const href = /href=["']([^"']+)["']/i.exec(m)?.[1];
    const css = href ? get(norm(href)) : undefined;
    return css !== undefined ? `<style>${css}</style>` : m;
  });

  html = html.replace(/<script\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (m: string, _a: string, src: string) => {
    const js = get(norm(src));
    return js !== undefined ? `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>` : m;
  });

  const nav =
    "<script>document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');" +
    "if(!a)return;var h=a.getAttribute('href')||'';if(/^([a-z][a-z0-9+.-]*:|#|\\/\\/)/i.test(h))return;" +
    "e.preventDefault();parent.postMessage({sitePage:h.split('#')[0]},'*');});</script>";

  return html.includes('</body>') ? html.replace('</body>', () => nav + '</body>') : html + nav;
}
