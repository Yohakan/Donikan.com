# PromptSite

Prompt yaz → Gemini analiz etsin → site üretsin → canlı önizle, düzenle, yayınla, ZIP indir.

## Klasör yapısı
```
promptsite/
├─ prisma/schema.prisma
├─ src/
│  ├─ app/
│  │  ├─ api/generate/route.ts            (SSE: analiz → üretim → doğrulama → görseller)
│  │  ├─ api/projects/[id]/route.ts       (GET, PATCH kaydet, POST yayınla/kaldır/geri yükle)
│  │  ├─ s/[slug]/[[...path]]/route.ts    (yayınlanan siteler + CSP)
│  │  ├─ layout.tsx · page.tsx · globals.css
│  ├─ components/Studio.tsx               (arayüz)
│  └─ lib/ gemini · pipeline · prompts · images · assemble · store · db · security · util · types
└─ .env.example
```

## Veritabanı (PostgreSQL)
Vercel'de dosya sistemi kalıcı olmadığı için PostgreSQL kullanılır (ücretsiz Neon yeterli).
Vercel > projen > Storage > Create Database > Neon > bağla. `DATABASE_URL` otomatik eklenir.
Ardından **Redeploy** et; build sırasında tablolar otomatik oluşur (`prisma db push`).

## Kurulum (yerel)
```bash
npm install
cp .env.example .env     # GEMINI_API_KEY ve DATABASE_URL yaz
npx prisma db push
npm run dev              # http://localhost:3000
```

## Vercel Environment Variables
`GEMINI_API_KEY`, `GEMINI_MODEL`, `DATABASE_URL` (+ isteğe bağlı `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY`)

## Güvenlik notları
- API anahtarı yalnızca sunucuda okunur.
- Önizleme iframe'i sandbox'lıdır; yayınlanan sayfalara CSP + sandbox eklenir.
- Hız sınırı bellek içidir; yoğun kullanımda Redis tabanlı sınırlayıcıya geçin.
- Kullanıcı girişi yok; herkese açık kullanım için kimlik doğrulama ekleyin.
