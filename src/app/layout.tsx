import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PromptSite — Prompt\'tan web sitesi',
  description: 'Bir prompt yazın; yapay zekâ analiz etsin, siteyi tasarlasın, canlı yayınlasın ve kodunu indirin.',
};

const themeScript = `try{var t=localStorage.getItem('tema')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
