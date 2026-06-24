// OpenAI fallback – použije sa LEN keď zlyhá Gemini.
// Token ide do OPENAI_API_KEY (server-only env, nikdy ku klientovi).
const OPENAI_MODEL = process.env.OPENAI_FALLBACK_MODEL || "gpt-4o-mini";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 30000);

export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export type OpenAIResult = {
  text: string;
  usage: { model: string; promptTokens: number; outputTokens: number; totalTokens: number };
};

export async function openAIChatJSON(opts: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<OpenAIResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Interný OpenAI fallback nie je nakonfigurovaný (chýba OPENAI_API_KEY).");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OPENAI_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 2048,
        response_format: { type: "json_object" },
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 300)}`);
    }

    const data: any = await res.json();
    const text = String(data?.choices?.[0]?.message?.content ?? "").trim();
    if (!text) throw new Error("Prázdna odpoveď z OpenAI.");

    const u = data?.usage || {};
    return {
      text,
      usage: {
        model: `openai:${data?.model || OPENAI_MODEL}`,
        promptTokens: Number(u.prompt_tokens ?? 0),
        outputTokens: Number(u.completion_tokens ?? 0),
        totalTokens: Number(u.total_tokens ?? 0),
      },
    };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error(`OpenAI fallback neodpovedal do ${OPENAI_TIMEOUT_MS} ms (timeout).`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
