'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { previewHtml } from '@/lib/assemble';
import { readmeFor, slugify } from '@/lib/util';
import type { ProjectData, SiteFile } from '@/lib/types';

const Editor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <p className="p-4 text-sm text-mute">Editör yükleniyor…</p>,
});

const KEY = 'promptsite:proje';
const EXAMPLES = [
  'Kadıköy\'de üçüncü nesil bir kahve dükkânı için sıcak, toprak tonlarında bir site: menü, hikâyemiz, galeri, rezervasyon formu ve iletişim.',
  'Freelance UX tasarımcı için koyu temalı, minimal bir portfolyo: 4 vaka çalışması, hakkımda, hizmetler ve iletişim.',
  'B2B proje yönetimi SaaS\'ı için İngilizce landing page: özellikler, aylık/yıllık geçişli fiyat planları, müşteri yorumları ve SSS.',
  'Ankara\'da çocuk diş hekimi kliniği için güven veren, renkli ve oyunbaz bir site; randevu formu ve ekip bölümü olsun.',
];
const STAGES = [
  { k: 'analiz', l: 'Analiz' },
  { k: 'tasarim', l: 'Tasarım' },
  { k: 'kod', l: 'Kod' },
  { k: 'gorsel', l: 'Görseller' },
];
type StageState = 'bekliyor' | 'calisiyor' | 'bitti' | 'hata';
const initStages = (): Record<string, StageState> => ({ analiz: 'bekliyor', tasarim: 'bekliyor', kod: 'bekliyor', gorsel: 'bekliyor' });
const DEVICES = { desktop: { l: 'Masaüstü', w: '100%' }, tablet: { l: 'Tablet', w: '768px' }, mobile: { l: 'Mobil', w: '390px' } } as const;
type Device = keyof typeof DEVICES;
const langOf = (p: string) => (p.endsWith('.html') ? 'html' : p.endsWith('.css') ? 'css' : p.endsWith('.js') ? 'javascript' : p.endsWith('.json') ? 'json' : 'plaintext');
const JSON_HDR = { 'Content-Type': 'application/json' };

export default function Studio() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [text, setText] = useState('');
  const [project, setProject] = useState<ProjectData | null>(null);
  const [files, setFiles] = useState<SiteFile[]>([]);
  const [pv, setPv] = useState<SiteFile[]>([]);
  const [analysis, setAnalysis] = useState<any>(null);
  const [selected, setSelected] = useState('index.html');
  const [page, setPage] = useState('index.html');
  const [tab, setTab] = useState<'preview' | 'code' | 'analysis'>('preview');
  const [device, setDevice] = useState<Device>('desktop');
  const [stages, setStages] = useState(initStages());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState('');
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState('');
  const [reload, setReload] = useState(0);
  const lastReq = useRef<any>(null);
  const finished = useRef(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 3500);
  };

  const applyProject = (p: ProjectData) => {
    setProject(p);
    setFiles(p.files);
    setPv(p.files);
    setAnalysis(p.analysis);
    setSelected((s) => (p.files.some((f) => f.yol === s) ? s : p.files[0]?.yol || 'index.html'));
    setPage('index.html');
    setDirty(false);
    try {
      localStorage.setItem(KEY, p.id);
    } catch {}
  };

  // Tema + son projeyi yükle
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    let id: string | null = null;
    try {
      id = localStorage.getItem(KEY);
    } catch {}
    if (id) {
      fetch(`/api/projects/${id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((p) => p && applyProject(p))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Editör değişikliği önizlemeye gecikmeli yansır
  useEffect(() => {
    const t = setTimeout(() => setPv(files), 350);
    return () => clearTimeout(t);
  }, [files]);

  // Önizleme içindeki sayfa linkleri
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const p = e.data?.sitePage;
      if (typeof p !== 'string') return;
      const n = p.replace(/^\.?\//, '');
      if (files.some((f) => f.yol === n)) setPage(n);
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, [files]);

  const html = useMemo(() => previewHtml(pv, page), [pv, page]);
  const htmlPages = files.filter((f) => /\.html?$/i.test(f.yol)).map((f) => f.yol);
  const current = files.find((f) => f.yol === selected);
  const limit = project ? 1500 : 4000;

  function toggleTheme() {
    const t = theme === 'dark' ? 'light' : 'dark';
    setTheme(t);
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem('tema', t);
    } catch {}
  }

  function onEvent(ev: any) {
    if (ev.type === 'stage') setStages((s) => ({ ...s, [ev.stage]: ev.status }));
    else if (ev.type === 'log') setLog(ev.message);
    else if (ev.type === 'analysis') setAnalysis(ev.analysis);
    else if (ev.type === 'done') {
      finished.current = true;
      applyProject(ev.project);
      if (lastReq.current?.projectId) setText('');
      setTab('preview');
      flash(ev.ozet || 'Site hazır');
    } else if (ev.type === 'error') {
      finished.current = true;
      setError(ev.message);
      setStages((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v === 'calisiyor' ? 'hata' : v])) as Record<string, StageState>);
    }
  }

  async function run(body: any) {
    setBusy(true);
    setError(null);
    setLog('');
    setStages(initStages());
    lastReq.current = body;
    finished.current = false;
    try {
      const res = await fetch('/api/generate', { method: 'POST', headers: JSON_HDR, body: JSON.stringify(body) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.hata || 'Sunucuya ulaşılamadı.');
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data: '));
          if (line) onEvent(JSON.parse(line.slice(6)));
        }
      }
      if (!finished.current) throw new Error('Bağlantı beklenmedik şekilde kesildi (zaman aşımı olabilir). Yeniden deneyin.');
    } catch (e: any) {
      setError(e.message || 'Bağlantı hatası.');
      setStages((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v === 'calisiyor' ? 'hata' : v])) as Record<string, StageState>);
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<boolean> {
    if (!project) return true;
    const r = await fetch(`/api/projects/${project.id}`, { method: 'PATCH', headers: JSON_HDR, body: JSON.stringify({ files }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(j.hata || 'Kaydedilemedi.');
      return false;
    }
    setProject(j);
    setDirty(false);
    flash('Kaydedildi');
    return true;
  }

  async function submit() {
    if (busy) return;
    if (project) {
      if (dirty && !(await save())) return;
      run({ projectId: project.id, instruction: text });
    } else run({ prompt: text });
  }

  async function act(action: string, extra: any = {}) {
    if (!project) return;
    if (action === 'restore' && dirty && !confirm('Kaydedilmemiş değişiklikler silinecek. Devam edilsin mi?')) return;
    if (action === 'publish' && dirty && !(await save())) return;
    const r = await fetch(`/api/projects/${project.id}`, { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ action, ...extra }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.hata || 'İşlem başarısız.');
    applyProject(j);
    flash(action === 'publish' ? 'Yayında' : action === 'unpublish' ? 'Yayından kaldırıldı' : 'Sürüm geri yüklendi');
  }

  async function download() {
    if (!project) return;
    const JSZip = (await import('jszip')).default;
    const name = slugify(project.title) || 'site';
    const zip = new JSZip();
    const root = zip.folder(name)!;
    files.forEach((f) => root.file(f.yol, f.icerik));
    root.file('README.md', readmeFor(project.title, project.prompt, files));
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function newProject() {
    setProject(null);
    setFiles([]);
    setPv([]);
    setAnalysis(null);
    setText('');
    setError(null);
    setStages(initStages());
    setDirty(false);
    try {
      localStorage.removeItem(KEY);
    } catch {}
  }

  const url = project?.slug && typeof window !== 'undefined' ? `${location.origin}/s/${project.slug}` : '';
  const showProgress = busy || Object.values(stages).some((s) => s !== 'bekliyor');

  return (
    <div className="flex min-h-screen flex-col lg:h-screen">
      <header className="flex items-center justify-between border-b border-line bg-panel px-4 py-2.5">
        <div className="flex items-center gap-2 font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-sm text-brand-ink">P</span>
          PromptSite
        </div>
        <button className="btn" onClick={toggleTheme} aria-label="Temayı değiştir">
          {theme === 'dark' ? 'Açık tema' : 'Koyu tema'}
        </button>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[390px_1fr]">
        {/* SOL PANEL */}
        <aside className="space-y-4 border-b border-line bg-panel p-4 lg:overflow-auto lg:border-b-0 lg:border-r">
          <div>
            <label htmlFor="prompt" className="text-sm font-semibold">
              {project ? 'Ne değiştirmek istiyorsun?' : 'Nasıl bir site istiyorsun?'}
            </label>
            <textarea
              id="prompt"
              className="input mt-2 w-full resize-y"
              rows={project ? 4 : 8}
              maxLength={limit}
              value={text}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && text.trim().length >= (project ? 3 : 10)) submit();
              }}
              placeholder={project ? 'Başlığı değiştir, ana rengi maviye çevir, SSS bölümü ekle…' : 'Sektör, hedef kitle, ton, renk, bölümler, dil… ne kadar detay, o kadar iyi.'}
            />
            <div className="mt-1 flex justify-between text-xs text-mute">
              <span>Ctrl/⌘ + Enter ile gönder</span>
              <span>
                {text.length}/{limit}
              </span>
            </div>
          </div>

          {!project && (
            <div>
              <p className="mb-2 text-xs font-semibold text-mute">Örnek prompt'lar</p>
              <div className="flex flex-col gap-2">
                {EXAMPLES.map((ex) => (
                  <button key={ex} className="card text-left text-xs text-mute hover:bg-soft hover:text-ink" disabled={busy} onClick={() => setText(ex)}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" disabled={busy || text.trim().length < (project ? 3 : 10)} onClick={submit}>
              {busy ? 'Çalışıyor…' : project ? 'Revize et' : 'Üret'}
            </button>
            {project && (
              <button className="btn" disabled={busy} onClick={newProject}>
                Yeni proje
              </button>
            )}
          </div>

          {showProgress && (
            <ol className="card space-y-2 text-sm" aria-live="polite">
              {STAGES.map((s) => {
                const st = stages[s.k];
                return (
                  <li key={s.k} className="flex items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center text-xs">
                      {st === 'calisiyor' ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                      ) : st === 'bitti' ? (
                        <span className="text-good">✓</span>
                      ) : st === 'hata' ? (
                        <span className="text-bad">✕</span>
                      ) : (
                        <span className="text-mute">○</span>
                      )}
                    </span>
                    <span className={st === 'bekliyor' ? 'text-mute' : ''}>{s.l}</span>
                  </li>
                );
              })}
              {log && <li className="pt-1 text-xs text-mute">{log}</li>}
            </ol>
          )}

          {error && (
            <div role="alert" className="card border-bad text-sm text-bad">
              <p>{error}</p>
              {lastReq.current && (
                <button className="btn mt-2" disabled={busy} onClick={() => run(lastReq.current)}>
                  Yeniden dene
                </button>
              )}
            </div>
          )}

          {analysis?.varsayimlar?.length > 0 && (
            <div className="card text-sm">
              <p className="mb-1 font-semibold">Yaptığım varsayımlar</p>
              <ul className="list-disc space-y-1 pl-4 text-xs text-mute">
                {analysis.varsayimlar.map((v: string, i: number) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            </div>
          )}

          {project && (
            <div>
              <p className="mb-2 text-xs font-semibold text-mute">Sürüm geçmişi</p>
              <ul className="space-y-1.5">
                {project.versions.map((v, i) => (
                  <li key={v.id} className="card flex items-center justify-between gap-2 !p-2 text-xs">
                    <span className="min-w-0">
                      <b>v{v.number}</b> <span className="text-mute">· {v.note}</span>
                    </span>
                    {i === 0 ? (
                      <span className="shrink-0 text-good">güncel</span>
                    ) : (
                      <button className="btn !px-2 !py-1 text-xs" disabled={busy} onClick={() => act('restore', { versionId: v.id })}>
                        Geri yükle
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        {/* SAĞ PANEL */}
        <section className="flex min-h-[75vh] min-w-0 flex-col lg:min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel px-3 py-2">
            <div role="tablist" className="flex gap-1">
              {(
                [
                  ['preview', 'Önizleme'],
                  ['code', 'Kod'],
                  ['analysis', 'Analiz'],
                ] as const
              ).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'tab-on' : ''}`} onClick={() => setTab(k)}>
                  {l}
                </button>
              ))}
            </div>
            {project && (
              <div className="flex flex-wrap gap-2">
                {dirty && (
                  <button className="btn" onClick={save}>
                    Kaydet
                  </button>
                )}
                <button className="btn btn-primary" onClick={() => act('publish')}>
                  {project.published ? 'Yayını güncelle' : 'Yayınla'}
                </button>
                <button className="btn" onClick={download}>
                  İndir (ZIP)
                </button>
              </div>
            )}
          </div>

          {project?.published && url && (
            <div className="flex flex-wrap items-center gap-2 border-b border-line bg-soft px-3 py-2 text-sm">
              <a className="min-w-0 truncate font-medium underline" href={url} target="_blank" rel="noreferrer">
                {url}
              </a>
              <button
                className="btn !py-1"
                onClick={() => navigator.clipboard.writeText(url).then(() => flash('Link kopyalandı'))}
              >
                Linki kopyala
              </button>
              <button className="btn !py-1" onClick={() => act('unpublish')}>
                Yayından kaldır
              </button>
            </div>
          )}

          {!project && !busy && (
            <div className="grid flex-1 place-items-center p-8 text-center text-mute">
              <div>
                <p className="text-lg font-semibold text-ink">Henüz bir site yok</p>
                <p className="mt-1 text-sm">Soldaki kutuya prompt'unu yaz ve "Üret"e bas.</p>
              </div>
            </div>
          )}
          {!project && busy && (
            <div className="grid flex-1 place-items-center p-8 text-center text-mute">
              <p className="text-sm">Siten hazırlanıyor… Bu işlem 1–3 dakika sürebilir.</p>
            </div>
          )}

          {project && tab === 'preview' && (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                {(Object.keys(DEVICES) as Device[]).map((d) => (
                  <button key={d} className={`tab ${device === d ? 'tab-on' : ''}`} onClick={() => setDevice(d)}>
                    {DEVICES[d].l}
                  </button>
                ))}
                {htmlPages.length > 1 && (
                  <select className="input !py-1" value={page} onChange={(e) => setPage(e.target.value)} aria-label="Sayfa">
                    {htmlPages.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                )}
                <span className="flex-1" />
                <button className="btn !py-1" onClick={() => setReload((n) => n + 1)}>
                  Yenile
                </button>
                <button className="btn !py-1" onClick={() => boxRef.current?.requestFullscreen?.()}>
                  Tam ekran
                </button>
              </div>
              <div ref={boxRef} className="flex min-h-[480px] flex-1 justify-center overflow-auto bg-bg p-3">
                <iframe
                  key={reload}
                  ref={frameRef}
                  title="Site önizlemesi"
                  sandbox="allow-scripts allow-forms allow-popups allow-modals"
                  srcDoc={html}
                  style={{ width: DEVICES[device].w }}
                  className="max-w-full self-stretch rounded-lg border border-line bg-white"
                />
              </div>
            </>
          )}

          {project && tab === 'code' && (
            <div className="flex min-h-[520px] flex-1">
              <ul className="w-44 shrink-0 overflow-auto border-r border-line bg-panel p-2 text-sm">
                {files.map((f) => (
                  <li key={f.yol}>
                    <button
                      className={`w-full truncate rounded-md px-2 py-1.5 text-left ${selected === f.yol ? 'bg-soft font-medium' : 'text-mute hover:text-ink'}`}
                      onClick={() => setSelected(f.yol)}
                    >
                      {f.yol}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="min-w-0 flex-1">
                <Editor
                  height="100%"
                  theme={theme === 'dark' ? 'vs-dark' : 'light'}
                  path={selected}
                  language={langOf(selected)}
                  value={current?.icerik ?? ''}
                  onChange={(v) => {
                    setFiles((prev) => prev.map((f) => (f.yol === selected ? { ...f, icerik: v ?? '' } : f)));
                    setDirty(true);
                  }}
                  options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: 'on', automaticLayout: true, tabSize: 2 }}
                />
              </div>
            </div>
          )}

          {project && tab === 'analysis' && <AnalysisView a={analysis} />}
        </section>
      </div>

      {toast && (
        <div role="status" className="fixed bottom-4 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-lg bg-ink px-4 py-2 text-sm text-bg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v?: React.ReactNode }) {
  if (!v) return null;
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[150px_1fr]">
      <dt className="text-xs font-semibold text-mute">{k}</dt>
      <dd className="text-sm">{v}</dd>
    </div>
  );
}

function AnalysisView({ a }: { a: any }) {
  if (!a) return <p className="p-6 text-sm text-mute">Bu proje için analiz kaydı yok.</p>;
  const list = (x: any) => (Array.isArray(x) && x.length ? x.join(', ') : null);
  return (
    <div className="flex-1 overflow-auto p-4">
      <dl className="card divide-y divide-line">
        <Row k="Site tipi" v={a.siteTipi} />
        <Row k="Marka" v={a.marka && `${a.marka.ad || ''}${a.marka.slogan ? ' — ' + a.marka.slogan : ''}`} />
        <Row k="Hedef kitle" v={a.hedefKitle} />
        <Row k="Ton" v={a.ton} />
        <Row k="Dil" v={a.dil} />
        <Row
          k="Renk paleti"
          v={
            a.renkPaleti && Object.keys(a.renkPaleti).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(a.renkPaleti).map(([k, v]) => (
                  <span key={k} className="inline-flex items-center gap-1.5 text-xs">
                    <span className="h-4 w-4 rounded border border-line" style={{ background: String(v) }} />
                    {k} {String(v)}
                  </span>
                ))}
              </div>
            )
          }
        />
        <Row k="Fontlar" v={a.fontlar && `${a.fontlar.baslik || ''} / ${a.fontlar.govde || ''}`} />
        <Row k="Sayfalar" v={list(a.sayfalar?.map?.((s: any) => s.dosya))} />
        <Row k="Bölümler" v={list(a.bolumler?.map?.((s: any) => s.baslik))} />
        <Row k="Özellikler" v={list(a.ozellikler)} />
        <Row k="Görseller" v={list(a.gorselIhtiyaclari?.map?.((g: any) => `${g.id} (${g.aramaSorgusu})`))} />
        <Row k="SEO başlığı" v={a.seoBilgisi?.baslik} />
        <Row k="SEO açıklaması" v={a.seoBilgisi?.aciklama} />
        <Row k="Anahtar kelimeler" v={list(a.seoBilgisi?.anahtarKelimeler)} />
        <Row k="Varsayımlar" v={list(a.varsayimlar)} />
      </dl>
    </div>
  );
}
