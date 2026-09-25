(async function () {
  const $ = (s, el = document) => el.querySelector(s);
  const won = (n) => Math.round(n).toLocaleString("ko-KR") + "원";
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function korMoney(n) {
    if (!n) return "";
    const jo = Math.floor(n / 1e12), eok = Math.floor((n % 1e12) / 1e8), man = Math.floor((n % 1e8) / 1e4), rest = n % 1e4;
    const parts = [];
    if (jo) parts.push(jo + "조");
    if (eok) parts.push(eok + "억");
    if (man) parts.push(man.toLocaleString("ko-KR") + "만");
    if (rest) parts.push(rest.toLocaleString("ko-KR"));
    return parts.join(" ") + "원";
  }

  async function load(path) {
    const r = await fetch(path, { cache: "no-cache" });
    if (!r.ok) throw new Error(path);
    return r.json();
  }

  let R, G, U;
  try {
    [R, G, U] = await Promise.all([load("data/tax-rules.json"), load("data/guide.json"), load("data/updates.json")]);
  } catch (e) {
    $("#basis").innerHTML = '<span class="offline">데이터를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</span>';
    return;
  }
  $("#basis").textContent = `${R.meta.basis} · 최근 확인 ${U.lastChecked}`;

  /* ───── 탭 ───── */
  document.querySelectorAll("nav.tabs button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("nav.tabs button").forEach(x => x.setAttribute("aria-selected", x === b));
    ["calc", "guide", "updates"].forEach(t => $("#tab-" + t).classList.toggle("hidden", t !== b.dataset.tab));
    window.scrollTo(0, 0);
  }));

  /* ───── 폼 부품 ───── */
  const money = (id, label, hint = "") => `
    <div class="field"><label for="${id}">${label}</label>
      <input type="text" inputmode="numeric" id="${id}" data-money autocomplete="off" placeholder="0">
      <div class="money-read" id="${id}-read"></div>${hint ? `<div class="hint">${hint}</div>` : ""}</div>`;
  const date = (id, label) => `<div class="field"><label for="${id}">${label}</label><input type="date" id="${id}"></div>`;
  const num = (id, label, hint = "") => `<div class="field"><label for="${id}">${label}</label><input type="number" inputmode="numeric" min="0" id="${id}" placeholder="0">${hint ? `<div class="hint">${hint}</div>` : ""}</div>`;
  const chips = (id, label, opts, sel) => `<div class="field"><span class="lbl">${label}</span><div class="chips" data-chips="${id}">${opts.map(([v, t]) => `<button type="button" data-v="${v}" aria-pressed="${v == sel}">${t}</button>`).join("")}</div></div>`;
  const check = (id, label, small = "") => `<label class="check"><input type="checkbox" id="${id}"><span>${label}${small ? `<small>${small}</small>` : ""}</span></label>`;

  const areaHint = `조정대상지역: ${R.adjustedAreas.list.join(", ")}`;

  const forms = {
    yangdo: () => `<div class="card">
        ${money("salePrice", "판 가격 (양도가액)")}
        ${money("acquirePrice", "산 가격 (취득가액)")}
        ${money("expenses", "필요경비", "취득세, 중개보수, 법무사비, 확장·샷시 공사비 등")}
        ${date("acquireDate", "산 날짜 (잔금일)")}
        ${date("saleDate", "파는 날짜 (잔금일)")}
        ${num("residenceYears", "실제 거주한 기간 (년)")}
        ${chips("houses", "팔 때 세대 전체 주택 수 (이 집 포함)", [[1, "1주택"], [2, "2주택"], [3, "3주택 이상"]], 1)}
      </div>
      <div class="card">
        ${check("acquiredInAdjusted", "살 때 조정대상지역이었음", "비과세 받으려면 2년 거주 필요")}
        ${check("soldInAdjusted", "팔 때 조정대상지역임", "다주택 중과 판단")}
        ${check("temporaryTwo", "일시적 2주택 (기한 내 종전주택 처분)", "1주택처럼 비과세 적용")}
        ${check("surchargeExempt", "중과 배제 주택에 해당", "지방 저가주택, 장기임대주택 등")}
        <details class="areas"><summary>조정대상지역 목록 보기</summary>${esc(R.adjustedAreas.list.join(", "))}<br><small>${esc(R.adjustedAreas.asOf)}</small></details>
      </div>`,
    chwideuk: () => `<div class="card">
        ${money("price", "취득가액 (매매가)")}
        ${chips("housesAfter", "이 집을 산 후 세대 주택 수", [[1, "1주택"], [2, "2주택"], [3, "3주택"], [4, "4주택 이상"]], 1)}
      </div>
      <div class="card">
        ${check("adjusted", "산 집이 조정대상지역", "")}
        ${check("temporaryTwo", "일시적 2주택", "종전주택 기한 내 처분 조건")}
        ${check("over85", "전용면적 85㎡ 초과", "농어촌특별세 부과")}
        ${check("firstHome", "생애최초 주택 구입", "12억 이하, 최대 200만원 감면")}
        <details class="areas"><summary>조정대상지역 목록 보기</summary>${esc(R.adjustedAreas.list.join(", "))}<br><small>${esc(R.adjustedAreas.asOf)}</small></details>
      </div>`,
    boyu: () => `<div class="card">
        ${money("p1", "주택 1 공시가격", '<a href="https://www.realtyprice.kr" target="_blank" rel="noopener">공시가격 조회</a>')}
        ${money("p2", "주택 2 공시가격 (있으면)")}
        ${money("p3", "주택 3 공시가격 (있으면)")}
        ${money("p4", "그 외 주택 공시가격 합계 (있으면)")}
      </div>
      <div class="card">
        ${check("oneHouseHousehold", "1세대 1주택자 (주택 1채만 입력했을 때)", "공제 12억 + 재산세 특례")}
        ${num("age", "나이 (만)", "1세대 1주택 고령자 세액공제용")}
        ${num("years", "보유기간 (년)", "1세대 1주택 장기보유 세액공제용")}
      </div>`,
    junggae: () => `<div class="card">
        ${chips("type", "거래 종류", [["sale", "매매"], ["jeonse", "전세"], ["monthly", "월세"]], "sale")}
        ${chips("property", "물건 종류", [["house", "주택"], ["officetel", "주거용 오피스텔"], ["other", "상가·토지 등"]], "house")}
        ${money("amount", "거래금액 / 보증금")}
        <div id="monthly-wrap" class="hidden">${money("monthly", "월세")}</div>
        ${check("vat", "부가세 포함해서 보기", "일반과세자 중개사무소")}
      </div>`
  };

  let current = "yangdo";
  const state = {};

  function renderForm() {
    $("#calc-form").innerHTML = forms[current]();
    const s = state[current] || {};
    document.querySelectorAll("#calc-form [data-money]").forEach(inp => {
      if (s[inp.id]) { inp.value = Number(s[inp.id]).toLocaleString("ko-KR"); $("#" + inp.id + "-read").textContent = korMoney(s[inp.id]); }
      inp.addEventListener("input", () => {
        const n = Number(inp.value.replace(/[^\d]/g, "")) || 0;
        inp.value = n ? n.toLocaleString("ko-KR") : "";
        $("#" + inp.id + "-read").textContent = korMoney(n);
        compute();
      });
    });
    document.querySelectorAll("#calc-form input[type=date], #calc-form input[type=number]").forEach(inp => {
      if (s[inp.id] !== undefined) inp.value = s[inp.id];
      inp.addEventListener("input", compute);
    });
    document.querySelectorAll("#calc-form input[type=checkbox]").forEach(inp => {
      if (s[inp.id]) inp.checked = true;
      inp.addEventListener("change", compute);
    });
    document.querySelectorAll("#calc-form [data-chips]").forEach(g => {
      if (s[g.dataset.chips] !== undefined) g.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v == s[g.dataset.chips]));
      g.addEventListener("click", e => {
        const b = e.target.closest("button"); if (!b) return;
        g.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
        compute();
      });
    });
    compute();
  }

  function read() {
    const v = {};
    document.querySelectorAll("#calc-form [data-money]").forEach(i => v[i.id] = Number(i.value.replace(/[^\d]/g, "")) || 0);
    document.querySelectorAll("#calc-form input[type=date]").forEach(i => v[i.id] = i.value);
    document.querySelectorAll("#calc-form input[type=number]").forEach(i => v[i.id] = i.value === "" ? "" : Number(i.value));
    document.querySelectorAll("#calc-form input[type=checkbox]").forEach(i => v[i.id] = i.checked);
    document.querySelectorAll("#calc-form [data-chips]").forEach(g => {
      const b = g.querySelector('[aria-pressed="true"]'); const x = b ? b.dataset.v : "";
      v[g.dataset.chips] = isNaN(Number(x)) ? x : Number(x);
    });
    state[current] = v;
    return v;
  }

  function compute() {
    const v = read();
    let res = null, empty = "";
    if (current === "yangdo") {
      if (!v.salePrice || !v.acquirePrice || !v.acquireDate || !v.saleDate) empty = "판 가격, 산 가격, 날짜를 넣으면 바로 계산돼요.";
      else res = Calc.capitalGains(R, { ...v, residenceYears: Number(v.residenceYears) || 0 });
    } else if (current === "chwideuk") {
      if (!v.price) empty = "취득가액을 넣으면 바로 계산돼요.";
      else res = Calc.acquisition(R, v);
    } else if (current === "boyu") {
      const prices = [v.p1, v.p2, v.p3, v.p4].filter(Boolean);
      if (!prices.length) empty = "공시가격을 넣으면 바로 계산돼요.";
      else res = Calc.holding(R, { prices, oneHouseHousehold: v.oneHouseHousehold && prices.length === 1, age: Number(v.age) || 0, years: Number(v.years) || 0 });
    } else if (current === "junggae") {
      $("#monthly-wrap").classList.toggle("hidden", v.type !== "monthly");
      if (!v.amount) empty = "금액을 넣으면 바로 계산돼요.";
      else res = Calc.brokerage(R, v);
    }
    const out = $("#calc-result");
    if (!res) { out.innerHTML = `<p class="disclaimer">${empty}</p>`; return; }
    const label = { yangdo: "예상 양도세 (지방세 포함)", chwideuk: "예상 취득세 (부가세목 포함)", boyu: "예상 연간 보유세", junggae: "중개보수 상한" }[current];
    out.innerHTML = `<div class="card result">
      <div><small>${label}</small></div>
      <div class="total">${won(res.total)}</div>
      <table class="steps">${res.steps.map(([k, n, d]) => `<tr><td>${esc(k)}${d ? `<span class="d">${esc(d)}</span>` : ""}</td><td class="v ${n < 0 ? "neg" : ""}">${n < 0 ? "−" + won(-n) : won(n)}</td></tr>`).join("")}</table>
      ${res.notes.length ? `<div class="note">${res.notes.map(n => `<p>${esc(n)}</p>`).join("")}</div>` : ""}
      <p class="disclaimer">참고용 추정치예요. 실제 신고 전에는 홈택스·위택스나 세무사에게 확인하세요.</p>
    </div>`;
  }

  document.querySelectorAll(".seg button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll(".seg button").forEach(x => x.setAttribute("aria-pressed", x === b));
    current = b.dataset.calc; renderForm();
  }));
  renderForm();

  /* ───── 가이드 ───── */
  let openCat = null;
  function highlight(text, q) {
    const t = esc(text);
    if (!q) return t;
    return t.split(esc(q)).join(`<mark>${esc(q)}</mark>`);
  }
  function renderGuide() {
    const q = $("#guide-search").value.trim();
    const body = $("#guide-body");
    if (q) {
      const hits = [];
      G.categories.forEach(c => c.sections.forEach(s => s.items.forEach(it => {
        if (it.includes(q) || s.title.includes(q)) hits.push({ c, s, it });
      })));
      body.innerHTML = hits.length ? hits.map(h => `<div class="card guide"><h3>${esc(h.c.name)} · ${esc(h.s.title)}</h3><p style="margin:0">${highlight(h.it, q)}</p></div>`).join("")
        : `<p class="disclaimer">'${esc(q)}' 검색 결과가 없어요.</p>`;
      return;
    }
    if (!openCat) {
      body.innerHTML = `<div class="cat-list">${G.categories.map(c => `<button class="cat-btn" data-id="${c.id}"><div><b>${esc(c.name)}</b><span>${esc(c.summary)}</span></div><span aria-hidden="true">›</span></button>`).join("")}</div>`;
      body.querySelectorAll(".cat-btn").forEach(b => b.addEventListener("click", () => { openCat = b.dataset.id; renderGuide(); window.scrollTo(0, 0); }));
      return;
    }
    const c = G.categories.find(x => x.id === openCat);
    const rel = U.items.filter(u => u.category === c.name);
    body.innerHTML = `<div class="guide"><button class="back">‹ 전체 카테고리</button>
      <h2>${esc(c.name)}</h2><p style="color:var(--muted);margin-top:0">${esc(c.summary)}</p>
      ${rel.length ? `<div class="note">${rel.map(u => `<p><b>${esc(u.status)}</b> · ${esc(u.title)}</p>`).join("")}</div><br>` : ""}
      ${c.sections.map(s => `<div class="card"><h3>${esc(s.title)}</h3><ul>${s.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("")}
      <div class="card links"><h3>원문·공식 사이트</h3>${c.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join("")}</div></div>`;
    body.querySelector(".back").addEventListener("click", () => { openCat = null; renderGuide(); });
  }
  $("#guide-search").addEventListener("input", renderGuide);
  renderGuide();

  /* ───── 변경사항 ───── */
  $("#updates-body").innerHTML = `<p class="disclaimer" style="margin-top:0">매달 국세청·기재부·법제처 자료를 확인해서 업데이트해요. 마지막 확인: ${esc(U.lastChecked)}</p>` +
    U.items.map(u => {
      const plan = u.status !== "시행 중";
      return `<div class="card upd ${plan ? "plan" : ""}"><div class="meta"><span class="badge">${esc(u.status)}</span><span>${esc(u.category)}</span><span style="color:var(--muted)">${esc(u.date)}</span></div>
      <h3>${esc(u.title)}</h3><p>${esc(u.body)}</p>${u.source ? `<a href="${esc(u.source)}" target="_blank" rel="noopener">출처 보기 ↗</a>` : ""}</div>`;
    }).join("");

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
