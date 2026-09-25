// Cloudflare Worker: 세금노트 챗봇 중계 서버
// - Gemini API 키는 Worker의 비밀값(GEMINI_API_KEY)에만 저장 (코드·GitHub에 없음)
// - 매 질문마다 앱의 최신 세율/가이드/변경사항 데이터를 읽어서 답변 근거로 넣음
const APP = "https://will-011114.github.io/budongsan-tax";
const ALLOWED_ORIGINS = ["https://will-011114.github.io"];
// 무료 등급 모델을 차례로 시도 (없거나 한도 초과면 다음 모델)
const MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-flash-lite-latest"];
const TIMEOUT_MS = 25000; // 모델 하나당 최대 대기 시간

const SYSTEM = (rules, guide, updates) => `너는 "부동산 세금 노트" 앱의 상담 도우미야. 사용자는 부동산 업계에서 일하는 분이야.

규칙:
- 휴대폰 화면용 일반 텍스트로 써. 마크다운 기호(**, #, 표)는 쓰지 말고 목록은 "- "로.
- 존댓말로, 짧고 쉽게. 결론을 먼저 1~2문장, 그다음 이유를 3~5개 항목으로.
- 아래 [최신 데이터]가 가장 정확한 기준이야. 네가 알고 있는 내용과 다르면 [최신 데이터]를 따라.
- [최신 데이터]에 없는 내용은 추측하지 말고 "정확한 확인이 필요해요"라고 말하고 국세청 126, 위택스, 세무사 확인을 권해.
- 세액 계산이 필요하면 대략적인 계산 과정을 보여주고, 정확한 금액은 앱의 '계산기' 탭을 쓰라고 안내해.
- 판단에 필요한 정보(세대 주택 수, 조정대상지역 여부, 보유·거주 기간, 취득일 등)가 없으면 먼저 그걸 물어봐.
- "정부안·국회 심의 중" 항목은 아직 시행되지 않았다고 분명히 구분해.
- 답변 끝에 한 줄: "※ 참고용 안내예요. 실제 신고 전에는 세무사나 홈택스·위택스에서 확인해 주세요."
- 부동산·세금과 무관한 질문엔 짧게 답하고 이 앱은 부동산 세금 전용이라고 안내해.

[최신 데이터 — 세율표 JSON]
${JSON.stringify(rules)}

[최신 데이터 — 세법 가이드]
${guide.categories.map(c => `## ${c.name}\n` + c.sections.map(s => `### ${s.title}\n- ` + s.items.join("\n- ")).join("\n")).join("\n\n")}

[최신 데이터 — 변경사항 (마지막 확인 ${updates.lastChecked})]
${updates.items.map(u => `- [${u.status}] ${u.date} ${u.category}: ${u.title} — ${u.body}`).join("\n")}`;

const cors = (origin) => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
});
const json = (obj, status, origin) => new Response(JSON.stringify(obj), { status, headers: cors(origin) });

async function callGemini(env, model, system, contents) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
      }),
    });
  } finally { clearTimeout(timer); }
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
    if (req.method !== "POST") {
      // 점검용: 주소 뒤에 ?diag=1 을 붙여 열면 모델별 상태와 응답 시간을 보여줌
      if (new URL(req.url).searchParams.get("diag") === "1") {
        const out = [];
        for (const model of MODELS) {
          const t0 = Date.now();
          try {
            const r = await callGemini(env, model, "한 단어로 답해: 안녕", [{ role: "user", parts: [{ text: "안녕" }] }]);
            out.push({ model, status: r.status, ms: Date.now() - t0 });
          } catch (e) { out.push({ model, error: String(e), ms: Date.now() - t0 }); }
        }
        return json({ keySet: !!env.GEMINI_API_KEY, models: out }, 200, origin);
      }
      return json({ ok: true, msg: "세금노트 챗봇 서버 작동 중" }, 200, origin);
    }
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "허용되지 않은 접근" }, 403, origin);

    let body;
    try { body = await req.json(); } catch { return json({ error: "잘못된 요청" }, 400, origin); }
    const history = (body.messages || []).slice(-12)
      .filter(m => m && typeof m.text === "string" && m.text.trim())
      .map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text.slice(0, 2000) }] }));
    if (!history.length || history[history.length - 1].role !== "user") return json({ error: "질문이 비어 있어요" }, 400, origin);

    const load = (p) => fetch(`${APP}/data/${p}`, { cf: { cacheTtl: 600 } }).then(r => r.json());
    let system;
    try {
      const [rules, guide, updates] = await Promise.all([load("tax-rules.json"), load("guide.json"), load("updates.json")]);
      system = SYSTEM(rules, guide, updates);
    } catch { return json({ error: "최신 세법 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }, 502, origin); }

    let lastErr = "";
    for (const model of MODELS) {
      let r;
      try { r = await callGemini(env, model, system, history); }
      catch (e) { lastErr = `${model}: timeout`; continue; }
      if (r.ok) {
        const d = await r.json();
        const text = (d.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
        if (text) return json({ text, model }, 200, origin);
        lastErr = "빈 응답";
        continue;
      }
      lastErr = `${model}: ${r.status}`;
      if (r.status === 404 || r.status === 429 || r.status === 400 || r.status >= 500) continue; // 다음 모델 시도
      break;
    }
    const limit = lastErr.includes("429");
    return json({ error: limit ? "오늘 무료 사용량을 다 썼어요. 내일 다시 이용해 주세요." : "답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요.", detail: lastErr }, limit ? 429 : 502, origin);
  },
};
