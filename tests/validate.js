// 자동 반영 전 안전장치: 데이터 파일이 망가지지 않았는지 검사
// 실행: node tests/validate.js   (실패하면 exit 1 → 자동 커밋 중단)
const fs = require("fs"), path = require("path");
const errs = [];
const load = f => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", f), "utf8")); } catch (e) { errs.push(`${f} JSON 오류: ${e.message}`); return null; } };
const R = load("tax-rules.json"), G = load("guide.json"), U = load("updates.json");
const rate = (v, name, max = 1) => { if (typeof v !== "number" || v < 0 || v > max) errs.push(`${name} 값 이상: ${v}`); };
const ascending = (list, key, name) => {
  let prev = -1;
  list.forEach((b, i) => {
    const v = b[key];
    if (v === null && i !== list.length - 1) errs.push(`${name}: 마지막 구간만 null 가능`);
    if (v !== null && v <= prev) errs.push(`${name}: 구간이 오름차순이 아님 (${v})`);
    if (v !== null) prev = v;
  });
};
if (R) {
  R.capitalGains.brackets.forEach(b => rate(b.rate, "양도세 세율", 0.6)); ascending(R.capitalGains.brackets, "upTo", "양도세 구간");
  // 누진공제 일관성: 구간 경계에서 세액이 이어져야 함
  const B = R.capitalGains.brackets;
  for (let i = 1; i < B.length; i++) {
    const x = B[i - 1].upTo, a = x * B[i - 1].rate - B[i - 1].deduct, b = x * B[i].rate - B[i].deduct;
    if (Math.abs(a - b) > 1) errs.push(`양도세 누진공제 불일치: ${x}원 경계 (${a} vs ${b})`);
  }
  rate(R.capitalGains.surcharge.twoHouses, "중과 2주택", 0.5); rate(R.capitalGains.surcharge.threePlus, "중과 3주택", 0.5);
  rate(R.acquisition.heavy.eight, "취득세 8%", 0.2); rate(R.acquisition.heavy.twelve, "취득세 12%", 0.2);
  R.propertyTax.standardBrackets.forEach(b => rate(b.rate, "재산세율", 0.01)); ascending(R.propertyTax.standardBrackets, "upTo", "재산세 구간");
  R.comprehensive.brackets.forEach(b => { rate(b.rate, "종부세율", 0.1); rate(b.rateHeavy, "종부세 중과세율", 0.1); }); ascending(R.comprehensive.brackets, "upTo", "종부세 구간");
  R.brokerage.sale.forEach(b => rate(b.rate, "중개보수 매매", 0.01)); ascending(R.brokerage.sale, "under", "중개보수 매매 구간");
  R.brokerage.lease.forEach(b => rate(b.rate, "중개보수 임대", 0.01)); ascending(R.brokerage.lease, "under", "중개보수 임대 구간");
  if (!R.meta || !R.meta.version) errs.push("meta.version 없음");
}
if (G && !(G.categories || []).length) errs.push("guide.json 카테고리 비어 있음");
if (U) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(U.lastChecked || "")) errs.push("updates.json lastChecked 날짜 형식 오류");
  (U.items || []).forEach((u, i) => ["date", "status", "category", "title", "body"].forEach(k => { if (!u[k]) errs.push(`updates.json ${i}번째 항목에 ${k} 없음`); }));
}
if (errs.length) { console.log("✗ 검사 실패\n- " + errs.join("\n- ")); process.exit(1); }
console.log("✓ 데이터 검사 통과");
