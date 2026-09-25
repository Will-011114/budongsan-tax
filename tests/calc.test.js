// 실행: node tests/calc.test.js   (세율 파일을 고친 뒤 계산이 깨지지 않았는지 확인)
const C = require("../calc.js"), R = require("../data/tax-rules.json");
let fail = 0;
const eq = (name, got, want) => { const ok = Math.abs(got - want) < 1; if (!ok) fail++; console.log(`${ok ? "✓" : "✗"} ${name}: ${got}${ok ? "" : ` (기대값 ${want})`}`); };
eq("양도세 1주택 15억 10년보유·거주", C.capitalGains(R,{salePrice:15e8,acquirePrice:5e8,acquireDate:"2016-01-01",saleDate:"2026-09-01",residenceYears:10,houses:1,acquiredInAdjusted:true,soldInAdjusted:true}).total, 4801500);
eq("양도세 1주택 10억 비과세", C.capitalGains(R,{salePrice:10e8,acquirePrice:5e8,acquireDate:"2020-01-01",saleDate:"2026-09-01",residenceYears:3,houses:1,acquiredInAdjusted:true}).total, 0);
eq("양도세 조정 2주택 중과", C.capitalGains(R,{salePrice:10e8,acquirePrice:6e8,acquireDate:"2018-01-01",saleDate:"2026-09-01",houses:2,soldInAdjusted:true}).total, 233816000);
eq("양도세 비조정 2주택", C.capitalGains(R,{salePrice:10e8,acquirePrice:6e8,acquireDate:"2018-01-01",saleDate:"2026-09-01",houses:2}).total, 118206000);
eq("양도세 1년 미만 단기", C.capitalGains(R,{salePrice:6e8,acquirePrice:5e8,acquireDate:"2026-01-01",saleDate:"2026-09-01",houses:1}).total, 75075000);
eq("취득세 7억 1주택", C.acquisition(R,{price:7e8,housesAfter:1}).total, 12859000);
eq("취득세 5억 생애최초", C.acquisition(R,{price:5e8,housesAfter:1,firstHome:true}).total, 3500000);
eq("취득세 10억 조정 2주택 85초과", C.acquisition(R,{price:10e8,housesAfter:2,adjusted:true,over85:true}).total, 90000000);
eq("재산세 1주택 공시 3억", C.holding(R,{prices:[3e8],oneHouseHousehold:true}).total, 299400);
eq("재산세 1주택 공시 8억", C.holding(R,{prices:[8e8],oneHouseHousehold:true}).total, 1260000);
eq("중개보수 매매 10억 (VAT 포함)", C.brokerage(R,{type:"sale",property:"house",amount:10e8,vat:true}).total, 5500000);
eq("중개보수 월세 1천/50", C.brokerage(R,{type:"monthly",property:"house",amount:1e7,monthly:5e5}).total, 240000);
eq("중개보수 전세 3억", C.brokerage(R,{type:"jeonse",property:"house",amount:3e8}).total, 900000);
console.log(fail ? `\n${fail}개 실패` : "\n모두 통과"); process.exit(fail ? 1 : 0);
