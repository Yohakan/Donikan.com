import { GEMINI_API_KEY_FALLBACK } from './secrets';

export class AppError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

export function parseJSON<T>(text: string): T {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(t) as T;
  } catch {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(t.slice(a, b + 1)) as T;
      } catch {
        /* aşağıda hata fırlatılır */
      }
    }
    throw new AppError('Yapay zekâ geçerli bir JSON üretemedi.', 'parse');
  }
}

/** Gemini'yi JSON modunda çağırır. API anahtarı yalnızca sunucuda okunur. */
export async function geminiJSON<T = any>(
  system: string,
  user: string,
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<T> {
  const key = process.env.GEMINI_API_KEY || GEMINI_API_KEY_FALLBACK;
  if (!key) throw new AppError('GEMINI_API_KEY tanımlı değil. Vercel > Settings > Environment Variables bölümüne ekleyin.');
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Number(process.env.GEMINI_TIMEOUT_MS || 240000));
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal: ctrl.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: opts.temperature ?? 0.7,
          maxOutputTokens: opts.maxTokens ?? 8192,
        },
      }),
    });

    if (!res.ok) {
      console.error('Gemini hata', res.status, (await res.text()).slice(0, 400));
      if (res.status === 429) throw new AppError('Gemini istek/kota sınırına ulaşıldı. Biraz bekleyip tekrar deneyin.');
      if (res.status === 401 || res.status === 403) throw new AppError('Gemini API anahtarı geçersiz veya yetkisiz (GEMINI_API_KEY).');
      if (res.status === 400 || res.status === 404)
        throw new AppError(`Gemini isteği reddetti (${res.status}). GEMINI_API_KEY ve GEMINI_MODEL ("${model}") değerlerini kontrol edin.`);
      throw new AppError(`Gemini servisi şu an yanıt vermiyor (${res.status}). Lütfen tekrar deneyin.`);
    }

    const data: any = await res.json();
    if (data?.promptFeedback?.blockReason) throw new AppError('İstek güvenlik filtresine takıldı. Prompt\'u değiştirip tekrar deneyin.');
    const text: string = (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text || '').join('');
    if (!text) throw new AppError('Yapay zekâ boş yanıt döndürdü. Tekrar deneyin.', 'parse');
    return parseJSON<T>(text);
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new AppError('İstek zaman aşımına uğradı. Daha kısa bir prompt ile tekrar deneyin.');
    if (e instanceof AppError) throw e;
    console.error(e);
    throw new AppError('Gemini\'ye bağlanılamadı. İnternet bağlantısını kontrol edip tekrar deneyin.');
  } finally {
    clearTimeout(timer);
  }
}
