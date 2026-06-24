// Interný inferenčný engine (FALLBACK) – OpenAI-compatible vLLM na H200.
// Použije sa LEN keď zlyhá Gemini. Beží výhradne na serveri (API routes),
// takže token (VLLM_API_KEY) sa nikdy nedostane ku klientovi.
//
// OBMEDZENIE: gpt-oss-120b je textový model – nemá web search ani víziu.
// Preto je fallback vhodný len pre textové úlohy (rozpoznanie jedla z textu,
// hodnotenie zdravosti), NIE pre čítanie fotky obalu či web vyhľadávanie EAN.

const VLLM_BASE_URL = (process.env.VLLM_BASE_URL || "https://vllm.gymbeam.tech").replace(/\/+$/, "");
const VLLM_MODEL = process.env.VLLM_MODEL || "openai/gpt-oss-120b";
const VLLM_TIMEOUT_MS = Number(process.env.VLLM_TIMEOUT_MS || 40000);

// Fallback je aktívny iba ak je nastavený token. Bez neho sa správame, akoby
// fallback neexistoval (a necháme prebublať pôvodnú chybu z Gemini).
export function isVllmConfigured(): boolean {
  return !!process.env.VLLM_API_KEY;
}

export type VllmResult = {
  text: string;
  usage: { model: string; promptTokens: number; outputTokens: number; totalTokens: number };
};

// Zavolá chat completion a vráti čistý text odpovede (očakáva sa JSON v obsahu).
export async function vllmChatJSON(opts: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<VllmResult> {
  const apiKey = process.env.VLLM_API_KEY;
  if (!apiKey) throw new Error("Interný vLLM nie je nakonfigurovaný (chýba VLLM_API_KEY).");

  const timeoutMs = opts.timeoutMs ?? VLLM_TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${VLLM_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: VLLM_MODEL,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 2048,
        response_format: { type: "json_object" },
        stream: false,
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`vLLM HTTP ${res.status}: ${body.slice(0, 300)}`);
    }

    const data: any = await res.json();
    const text = String(data?.choices?.[0]?.message?.content ?? "").trim();
    if (!text) throw new Error("Prázdna odpoveď z interného vLLM.");

    const u = data?.usage || {};
    return {
      text,
      usage: {
        model: `vllm:${data?.model || VLLM_MODEL}`,
        promptTokens: Number(u.prompt_tokens ?? 0),
        outputTokens: Number(u.completion_tokens ?? 0),
        totalTokens: Number(u.total_tokens ?? 0),
      },
    };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error(`Interný vLLM neodpovedal do ${timeoutMs} ms (timeout).`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
