// OpenAI je jediný AI engine appky. Token ide do OPENAI_API_KEY (server-only, nikdy ku klientovi).
// Hlavný model. Rozpoznávanie jedla je úloha na presné dodržanie inštrukcií,
// kde slabší model vynecháva položky – preto nie „mini". Dá sa prepísať cez
// OPENAI_MODEL bez zásahu do kódu.
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1";
// Záloha, ak hlavný model nie je na účte dostupný (404 / model_not_found).
const OPENAI_FALLBACK_MODEL = process.env.OPENAI_FALLBACK_MODEL || "gpt-4o-mini";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 45000);

// Modely s uvažovaním (gpt-5, o1/o3/o4…) neberú max_tokens ani temperature.
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o[1-9])/i.test(model);
}

function buildBody(model: string, opts: { system: string; content: string | any[]; temperature?: number; maxTokens?: number; json?: boolean }) {
  const tokens = opts.maxTokens ?? 2048;
  return {
    model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.content },
    ],
    ...(isReasoningModel(model)
      ? { max_completion_tokens: tokens }
      : { max_tokens: tokens, temperature: opts.temperature ?? 0.3 }),
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  };
}

export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export type OpenAIResult = {
  text: string;
  // "length" = odpoveď narazila na strop max_tokens a je odseknutá (nekompletný JSON)
  finishReason: string;
  usage: { model: string; promptTokens: number; outputTokens: number; totalTokens: number };
};

// Spoločné jadro – jedno volanie chat completions (text alebo multimodálny obsah).
async function chat(opts: {
  system: string;
  content: string | any[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  timeoutMs?: number;
}): Promise<OpenAIResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI nie je nakonfigurované (chýba OPENAI_API_KEY).");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? OPENAI_TIMEOUT_MS);
  try {
    const send = (model: string) =>
      fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(buildBody(model, opts)),
        signal: ctrl.signal,
      });

    let res = await send(OPENAI_MODEL);

    // Model nie je na účte dostupný → skús zálohu, nech appka nespadne celá.
    if (!res.ok && (res.status === 404 || res.status === 400) && OPENAI_FALLBACK_MODEL !== OPENAI_MODEL) {
      const body = await res.clone().text().catch(() => "");
      if (/model/i.test(body)) {
        console.warn(`OpenAI: model ${OPENAI_MODEL} nedostupný, skúšam ${OPENAI_FALLBACK_MODEL}.`);
        res = await send(OPENAI_FALLBACK_MODEL);
      }
    }

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
      finishReason: String(data?.choices?.[0]?.finish_reason ?? ""),
      usage: {
        model: `openai:${data?.model || OPENAI_MODEL}`,
        promptTokens: Number(u.prompt_tokens ?? 0),
        outputTokens: Number(u.completion_tokens ?? 0),
        totalTokens: Number(u.total_tokens ?? 0),
      },
    };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error("AI nestihla odpovedať včas. Skús to prosím o chvíľu znova.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Textová požiadavka s vynúteným JSON výstupom.
export function openAIChatJSON(opts: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<OpenAIResult> {
  return chat({
    system: opts.system,
    content: opts.user,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    json: true,
    timeoutMs: opts.timeoutMs,
  });
}

// Požiadavka s obrázkom (vision) + vynúteným JSON výstupom.
export function openAIVisionJSON(opts: {
  system: string;
  prompt: string;
  imageBase64: string;
  mimeType: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<OpenAIResult> {
  const content = [
    { type: "text", text: opts.prompt },
    { type: "image_url", image_url: { url: `data:${opts.mimeType};base64,${opts.imageBase64}` } },
  ];
  return chat({
    system: opts.system,
    content,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    json: true,
    timeoutMs: opts.timeoutMs,
  });
}
