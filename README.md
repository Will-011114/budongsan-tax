# 부동산 세금 노트

엄마용 부동산 세금 앱 (웹앱/PWA).
계산기 4개(양도세, 취득세, 보유세, 중개보수) + 카테고리별 세법 가이드 + 최근 변경사항.

## 파일 구조

| 파일 | 역할 |
|---|---|
| `data/tax-rules.json` | **세율·공제액·기준금액 전부.** 법이 바뀌면 이 파일만 고치면 됨 |
| `data/guide.json` | 세법 가이드 카테고리별 내용 |
| `data/updates.json` | 변경사항 탭 내용 |
| `calc.js` | 계산 로직 (숫자는 전부 tax-rules.json에서 가져옴) |
| `app.js`, `index.html` | 화면 |
| `tests/calc.test.js` | 계산 검증. `node tests/calc.test.js` |

## 처음 올리기 (GitHub Pages, 무료)

1. github.com에서 **New repository** 클릭 → 이름 `budongsan-tax` → **Public** → Create
2. 저장소 화면에서 **uploading an existing file** 클릭 → 이 폴더의 파일을 전부 끌어다 놓기 (`data`, `tests` 폴더 포함) → **Commit changes**
3. **Settings → Pages** → Source: `Deploy from a branch`, Branch: `main` / `/ (root)` → Save
4. 1~2분 뒤 `https://<내아이디>.github.io/budongsan-tax/` 로 접속됨

## 엄마 폰에 설치

- **아이폰**: 사파리로 주소 열기 → 공유 버튼 → **홈 화면에 추가**
- **안드로이드**: 크롬으로 주소 열기 → 메뉴(⋮) → **홈 화면에 추가** (또는 앱 설치)

## 업데이트 방식 (자동)

매일 Claude가 법제처·기재부·국세청·행안부·국토부 자료를 확인해서 바뀐 게 있으면
`data/*.json`을 고쳐 `main`에 바로 커밋 → GitHub Pages가 자동 배포 → 앱을 열면 최신 내용.
- 커밋 전에 `tests/validate.js`(데이터 검사)와 `tests/calc.test.js`(계산 검사)를 통과해야만 반영됨
- 계산기 수치가 바뀐 날만 알림이 옴
- 잘못 반영됐으면: GitHub → Commits → 해당 커밋 → **Revert** 버튼으로 되돌리기
- 자세한 규칙은 `UPDATE_GUIDE.md`

## 주의

참고용 추정치. 세부담상한, 합산배제, 부부 공동명의 특례, 중과 배제 세부 요건 등은 단순화돼 있음.
