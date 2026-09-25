/* 세금 계산 로직. 모든 세율은 data/tax-rules.json에서 받아온다.
   브라우저에선 window.Calc, Node(테스트)에선 module.exports. */
(function (root) {
  const floor10 = (n) => Math.floor(n / 10) * 10; // 원 단위 절사(10원 미만)
  const pos = (n) => Math.max(0, n);

  function progressive(amount, brackets) {
    for (const b of brackets) {
      if (b.upTo === null || amount <= b.upTo) return { tax: amount * b.rate - b.deduct, rate: b.rate };
    }
  }

  // 만 나이 계산과 같은 방식으로 '만 보유연수'
  function fullYears(from, to) {
    const a = new Date(from), b = new Date(to);
    if (isNaN(a) || isNaN(b) || b < a) return 0;
    let y = b.getFullYear() - a.getFullYear();
    if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) y--;
    return Math.max(0, y);
  }

  /* ───────── 양도소득세 ───────── */
  function capitalGains(R, i) {
    const C = R.capitalGains;
    const steps = [];
    const holding = fullYears(i.acquireDate, i.saleDate);
    const residence = Math.floor(i.residenceYears || 0);
    const gain = i.salePrice - i.acquirePrice - (i.expenses || 0);
    steps.push(["양도차익", gain, "양도가액 − 취득가액 − 필요경비"]);
    if (gain <= 0) return { total: 0, steps, notes: ["양도차익이 없어서 낼 세금이 없어요."], holding };

    const notes = [];
    const actsAsOne = i.houses === 1 || i.temporaryTwo;
    const E = C.oneHouseExemption;
    const needResidence = i.acquiredInAdjusted ? E.minResidenceYearsIfAcquiredInAdjusted : 0;
    const exemptOK = actsAsOne && holding >= E.minHoldingYears && residence >= needResidence;

    let taxableGain = gain;
    if (exemptOK) {
      if (i.salePrice <= E.highValueLine) {
        steps.push(["1세대 1주택 비과세", -gain, `양도가 ${fmtEok(E.highValueLine)} 이하`]);
        return { total: 0, steps, notes: ["1세대 1주택 비과세 대상이라 양도세가 없어요. (실제 요건은 세대 구성·보유기간 계산 방식에 따라 달라질 수 있어요)"], holding };
      }
      taxableGain = gain * (i.salePrice - E.highValueLine) / i.salePrice;
      steps.push(["고가주택 과세 양도차익", taxableGain, `양도차익 × (양도가 − ${fmtEok(E.highValueLine)}) ÷ 양도가`]);
    } else if (actsAsOne) {
      if (holding < E.minHoldingYears) notes.push(`보유기간이 ${E.minHoldingYears}년 미만이라 비과세가 안 돼요.`);
      else if (residence < needResidence) notes.push(`조정대상지역에서 취득한 주택은 ${needResidence}년 이상 거주해야 비과세예요.`);
    }

    const S = C.surcharge;
    const surchargeRate = (S.active && i.soldInAdjusted && !i.surchargeExempt && !actsAsOne)
      ? (i.houses >= 3 ? S.threePlus : i.houses === 2 ? S.twoHouses : 0) : 0;
    if (surchargeRate) notes.push(`조정대상지역 ${i.houses >= 3 ? "3주택 이상" : "2주택"} 중과: 기본세율 + ${Math.round(surchargeRate * 100)}%p, 장기보유특별공제 배제`);

    // 장기보유특별공제
    let ltdRate = 0;
    const L = C.longTermDeduction;
    if (!(surchargeRate && S.excludesLongTermDeduction)) {
      if (exemptOK && residence >= L.oneHouse.residence.minYears && holding >= L.oneHouse.holding.minYears) {
        ltdRate = Math.min(holding * L.oneHouse.holding.ratePerYear, L.oneHouse.holding.max)
                + Math.min(residence * L.oneHouse.residence.ratePerYear, L.oneHouse.residence.max);
      } else if (holding >= L.general.minYears) {
        ltdRate = Math.min(holding * L.general.ratePerYear, L.general.max);
      }
    }
    const ltd = taxableGain * ltdRate;
    if (ltd) steps.push(["장기보유특별공제", -ltd, `${Math.round(ltdRate * 100)}% (보유 ${holding}년${exemptOK ? `, 거주 ${residence}년` : ""})`]);

    const income = taxableGain - ltd;
    const base = pos(income - C.basicDeduction);
    steps.push(["기본공제", -Math.min(income, C.basicDeduction), "연 1회 250만원"]);
    steps.push(["과세표준", base, ""]);

    // 세율: 단기세율과 (기본+중과) 중 큰 쪽
    const basic = progressive(base, C.brackets);
    const withSurcharge = basic.tax + base * surchargeRate;
    let tax = withSurcharge, rateDesc = `기본세율 ${Math.round(basic.rate * 100)}%${surchargeRate ? ` + 중과 ${Math.round(surchargeRate * 100)}%p` : ""}`;
    const st = holding < 1 ? C.shortTermHousing.under1y : holding < 2 ? C.shortTermHousing.under2y : 0;
    if (st && base * st > tax) { tax = base * st; rateDesc = `단기보유 ${Math.round(st * 100)}% (보유 ${holding < 1 ? "1년 미만" : "1~2년"})`; }
    tax = floor10(pos(tax));
    steps.push(["양도소득세", tax, rateDesc]);
    const local = floor10(tax * C.localTaxRate);
    steps.push(["지방소득세", local, "양도세의 10%"]);
    return { total: tax + local, steps, notes, holding };
  }

  /* ───────── 취득세 ───────── */
  function standardAcqRate(A, price) {
    if (price <= A.lowLine) return A.lowRate;
    if (price > A.highLine) return A.highRate;
    const r = (price / 100000000 * 2 / 3 - 3) / 100;
    return Math.round(r * 10000) / 10000;
  }
  function acquisition(R, i) {
    const A = R.acquisition;
    const steps = [], notes = [];
    let kind = "standard", rate;
    if (i.housesAfter >= 4) kind = "twelve";
    else if (i.housesAfter === 3) kind = i.adjusted ? "twelve" : "eight";
    else if (i.housesAfter === 2 && i.adjusted && !i.temporaryTwo) kind = "eight";
    rate = kind === "standard" ? standardAcqRate(A.standard, i.price) : A.heavy[kind];
    if (kind !== "standard") notes.push(`${i.housesAfter}주택${i.adjusted ? "(조정대상지역)" : ""} 중과세율 ${rate * 100}% 적용`);
    let acq = floor10(i.price * rate);
    steps.push(["취득세", acq, `${(rate * 100).toFixed(2).replace(/\.?0+$/, "")}%`]);
    if (i.firstHome && kind === "standard" && i.housesAfter === 1 && i.price <= A.firstHome.maxPrice) {
      const red = Math.min(acq, A.firstHome.maxReduction);
      acq -= red;
      steps.push(["생애최초 감면", -red, `최대 ${A.firstHome.maxReduction / 10000}만원`]);
      notes.push("생애최초 감면은 3개월 내 전입, 3년 이상 실거주 조건이 있어요. 인구감소지역 등은 한도가 더 커요.");
    }
    const edu = floor10(i.price * (kind === "standard" ? rate * A.educationTax.standardFactor : A.educationTax.heavyRate));
    steps.push(["지방교육세", edu, ""]);
    const rural = i.over85 ? floor10(i.price * A.ruralTaxOver85[kind]) : 0;
    steps.push(["농어촌특별세", rural, i.over85 ? "전용 85㎡ 초과" : "85㎡ 이하 비과세"]);
    return { total: acq + edu + rural, steps, notes, rate };
  }

  /* ───────── 재산세 + 종부세 ───────── */
  function bracketTax(list, base) {
    let prev = 0;
    for (const b of list) {
      if (b.upTo === null || base <= b.upTo) return b.base + (base - prev) * b.rate;
      prev = b.upTo;
    }
  }
  function holding(R, i) {
    const P = R.propertyTax, K = R.comprehensive;
    const prices = i.prices.filter(p => p > 0);
    const n = prices.length;
    const oneHouse = n === 1 && i.oneHouseHousehold;
    const steps = [], notes = [];
    let propTotal = 0, propStdSum = 0, propBaseSum = 0;
    prices.forEach((p, idx) => {
      const ratio = oneHouse ? P.marketRatio.oneHouse.find(r => r.upTo === null || p <= r.upTo).ratio : P.marketRatio.other;
      const base = p * ratio;
      const special = oneHouse && p <= P.oneHouseSpecial.maxPublicPrice;
      const tax = bracketTax(special ? P.oneHouseSpecial.brackets : P.standardBrackets, base);
      propStdSum += tax; propBaseSum += base;
      const urban = base * P.urbanAreaRate;
      const edu = tax * P.educationTaxFactor;
      const sub = floor10(tax) + floor10(urban) + floor10(edu);
      propTotal += sub;
      steps.push([`재산세 (주택${n > 1 ? idx + 1 : ""})`, sub, `과표 ${Math.round(ratio * 100)}%${special ? ", 1주택 특례세율" : ""} · 도시지역분·지방교육세 포함`]);
    });

    const sum = prices.reduce((a, b) => a + b, 0);
    const ded = oneHouse ? K.deductionOneHouse : K.deductionGeneral;
    const kBase = pos((sum - ded) * K.marketRatio);
    let comp = 0;
    if (kBase > 0) {
      const heavy = n >= K.heavyMinHouses && kBase > K.heavyMinBase;
      let prev = 0, t = 0;
      for (const b of K.brackets) {
        const top = b.upTo === null ? kBase : Math.min(kBase, b.upTo);
        if (top > prev) t += (top - prev) * (heavy ? b.rateHeavy : b.rate);
        if (b.upTo === null || kBase <= b.upTo) break;
        prev = b.upTo;
      }
      // 재산세 중복분 공제 (근사)
      const avgRatio = propBaseSum / sum;
      const overlapBase = (sum - ded) * K.marketRatio * avgRatio;
      const credit = propStdSum * (bracketTax(P.standardBrackets, overlapBase / n) * n) / (bracketTax(P.standardBrackets, propBaseSum / n) * n);
      let compTax = pos(t - Math.min(credit, propStdSum));
      if (oneHouse) {
        const ageR = (K.oneHouseCredit.age.find(a => (i.age || 0) >= a.min) || { rate: 0 }).rate;
        const holdR = (K.oneHouseCredit.holding.find(a => (i.years || 0) >= a.min) || { rate: 0 }).rate;
        const cr = Math.min(ageR + holdR, K.oneHouseCredit.max);
        if (cr) { notes.push(`1세대 1주택 세액공제 ${Math.round(cr * 100)}% (고령 ${Math.round(ageR * 100)}% + 장기보유 ${Math.round(holdR * 100)}%)`); compTax *= (1 - cr); }
      }
      const rural = compTax * K.ruralTaxFactor;
      comp = floor10(compTax) + floor10(rural);
      steps.push(["종합부동산세", comp, `공제 ${fmtEok(ded)} 후 과표 ${fmtEok(kBase)}${heavy ? ", 3주택 중과세율" : ""} · 농특세 포함`]);
    } else {
      steps.push(["종합부동산세", 0, `공시가 합계가 공제액 ${fmtEok(ded)} 이하`]);
    }
    notes.push("세부담상한, 합산배제 임대주택, 부부 공동명의 특례는 반영 안 된 추정치예요.");
    return { total: propTotal + comp, steps, notes };
  }

  /* ───────── 중개보수 ───────── */
  function brokerage(R, i) {
    const B = R.brokerage;
    const steps = [], notes = [];
    let amount = i.amount, table, rate, cap = null;
    if (i.type === "monthly") {
      amount = i.amount + i.monthly * B.monthlyMultiplier;
      if (amount < B.smallLine) amount = i.amount + i.monthly * B.monthlyMultiplierSmall;
      steps.push(["거래금액 환산", amount, `보증금 + 월세 × ${amount === i.amount + i.monthly * B.monthlyMultiplier ? B.monthlyMultiplier : B.monthlyMultiplierSmall}`]);
    }
    if (i.property === "officetel") {
      rate = i.type === "sale" ? B.officetel.sale : B.officetel.lease;
    } else if (i.property === "other") {
      rate = B.otherMax; notes.push("주택 외(상가·토지 등)는 0.9% 이내에서 협의해서 정해요.");
    } else {
      table = i.type === "sale" ? B.sale : B.lease;
      const row = table.find(r => r.under === null || amount < r.under);
      rate = row.rate; cap = row.cap;
    }
    let fee = amount * rate;
    if (cap !== null && fee > cap) fee = cap;
    fee = Math.floor(fee);
    steps.push(["중개보수 상한", fee, `${(rate * 100).toFixed(1)}%${cap ? ` (한도 ${cap / 10000}만원)` : ""}`]);
    let total = fee;
    if (i.vat) { const v = Math.floor(fee * B.vat); steps.push(["부가가치세", v, "일반과세자 10%"]); total += v; }
    notes.push("표의 금액은 '상한'이에요. 실제 보수는 이 안에서 협의해요.");
    return { total, steps, notes };
  }

  function fmtEok(n) {
    const eok = Math.floor(n / 1e8), man = Math.round((n % 1e8) / 1e4);
    if (!n) return "0원";
    return (eok ? eok + "억" : "") + (man ? (eok ? " " : "") + man.toLocaleString("ko-KR") + "만" : "") + "원";
  }

  const api = { capitalGains, acquisition, holding, brokerage, fullYears, fmtEok, standardAcqRate };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Calc = api;
})(typeof window !== "undefined" ? window : globalThis);
