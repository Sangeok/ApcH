# BUG-17 — 메인 루프 기록

## 게이트① (2026-09-30)

FEAT-59(업로드 옵션 개편)를 위해 프로덕션 a-pch.com/dashboard에서 파일 선택 상태를 관찰하던 중, 브라우저 콘솔에서
`media-src` CSP 위반을 봤다. 폼의 길이 안내 줄도 나타나지 않았다. 원인 줄(`next.config.js:97`)을 소유자에게
보고했고, 소유자가 「좋다. 방금 이야기한 것을 바탕으로 수정을 진행해」로 답했다 — 소유자 직접 발주로 게이트①을
연 것으로 기록한다. 게이트②는 계획 검증 뒤 소유자가 따로 연다.

- 담당: `next.config.js`는 web-dev 정의의 「수정 가능」(`apps/web/src/**`) 목록 밖이다. 다만 FEAT-32가 web-dev로 같은
  파일의 CSP `connect-src`를 고쳤고 그대로 인수됐다(`docs/plans/FEAT-32.md` 「고칠 파일」, `docs/agents/web-dev/FEAT-32.md`).
  그 전례를 따라 web-dev로 둔다.
- 병행: FEAT-59와 파일이 겹치지 않는다.

## 필수 경로 확정 (2026-09-30)

| # | 경로 | 판정 | 이유 |
| --- | --- | --- | --- |
| 1 | 인용 전수 대조 | **채택** | 모든 항목 |
| 2 | 스케치 추출·실행 | **채택** | js 블록(한 줄 교체) — 적용 후 문법·평가 |
| 3 | before/after 기계 적용 | **채택** | 기존 파일 수정 |
| 4 | 전칭 여집합 열거 | **채택** | 「업로드 폼은 `blob:`만 쓴다」·「다른 지시자 불변」 |
| 7 | 음성 시험 | **채택** | CSP는 화이트리스트다 — `blob:`가 없으면 정말 막히고 있으면 정말 풀리는지 |
| 9 | 구조적 아티팩트 | **채택** | config 변경. 헤더 문자열이 아니라 지시자 단위로 파싱해 비교 |
| 5 | 돌연변이 검사 | 비채택 | 순수 함수 없음 |
| 6 | 실제 사건 재생 | 비채택 | 외부 신호 해석 없음(관측된 콘솔 위반은 경로 7 하니스에서 같은 문구로 재현) |
| 8 | 실물 렌더 | 비채택 | 화면 변경 없음. 브라우저 동작은 경로 7이 덮는다 |

## 라운드 1 — 무편집 라운드 (소득 0)

- 1: 인용(`next.config.js:58,60,90-103,96,97`, `UploadPodcast.tsx:42-57,44,47,49,51,53,55,261-263,322,333`,
  `clip-count-budget.ts:23-30`) 전부 내용 일치.
- 2·3: 스크래치패드 `v17/`에 `git archive HEAD`로 before/after 사본. before 블록이 `:97`과 바이트 일치(개수 1), 적용 후
  `node --check` 통과.
- 9: 두 사본의 `next.config.js`를 `NODE_ENV=production SKIP_ENV_VALIDATION=1`로 import해 `headers()`를 실제로 평가하고 CSP를 지시자
  단위로 파싱 — 헤더 항목 1개(`/(.*)`), 지시자 11 → 11, 바뀐 것은 `media-src` 하나(`'self' https://*.amazonaws.com` →
  `'self' blob: https://*.amazonaws.com`). 개발 모드 평가는 `[]`(`:60` 주장 확인).
- 4: `createObjectURL`·`new Audio(`·`<video`·`<audio`·`createElement("video"|"audio")` 전수 — blob URL 생성은
  `UploadPodcast.tsx:44` 하나뿐. 나머지 `<video>` 5곳은 blob을 쓰지 않는다.
- 7: 파싱한 before/after CSP 문자열을 헤더로 내는 로컬 서버(`serve.py`)에서 `readVideoDurationSeconds`와 같은 경로
  (File → `createObjectURL` → `<video preload=metadata>`)를 실행. before → `error` + 콘솔 `Loading media from 'blob:…' violates the
  following Content Security Policy directive: "media-src 'self' https://*.amazonaws.com"`(프로덕션 관측과 같은 문구), after →
  `duration=300.01`.

메인 루프 라운드가 무소득이라 `plan-verifier` 독립 패스를 부른다.

## 라운드 2 — 독립 패스 #1 (plan-verifier, 2026-10-01)

브리핑은 계약 셋(항목ID·계획서 경로·경로 1·2·3·4·7·9 카탈로그 발췌)뿐. 검증자가 계약 준수를 스스로 확인했다.

**1차 보고: 결함 0건, 단 경로 7 「실행하지 못한 경로」** — 검증자는 브라우저가 없다고 판단했다. `plan-verifier.md` 절차 2상
실행 못 한 경로가 있는 보고는 무소득 보고가 아니다. BUG-09 전례(메인 루프도 실행할 수 없던 경로를 브리핑에서 뺀 것)와 달리
이번 경로 7은 **이 머신에서 실행 가능**했다 — 메인 루프 라운드 1이 실행했고, Bash로 쓸 수 있는 헤드리스 Chrome·Edge가 설치돼 있다.
그래서 목록을 줄이지 않고, 같은 검증자에게 **환경 사실(브라우저 경로)만** 알려 경로 7을 마저 실행하고 보고 전체를 다시 내게 했다.
메인 루프의 경로 7 방법·결과·결함 정보는 전달하지 않았다.

**재보고: 결함 0건, 실행하지 못한 경로 없음.**
- 1: 인용 전부 내용 일치 + 인과 배선(`:110` → `:83` → `:166` → `:261/:322/:333`) 확인.
- 2·3: before 줄 `grep -c` = 1, `cat -A`로 14칸 들여쓰기·끝 공백 없음까지 바이트 일치, 치환 결과가 after와 일치, `node --check` 통과.
- 4: 지시자 여집합 10개 전부 source-list 동일(계획서가 나열한 10개 = media-src 제외 완전 여집합). 다른 `<video>` 5곳은 S3 https 재생.
- 7: 검증자 자체 하니스(Node HTTP 서버가 실제 `next.config.js`에서 뽑은 CSP를 응답 헤더로 냄 + `chrome.exe --headless=new
  --virtual-time-budget=5000 --dump-dom`). blob: 없음 → `securitypolicyviolation` `media-src`·차단 대상 `blob`, blob: 있음 → 위반 없음.
- 9: 지시자→source-list 맵 파싱, 11개 순서 동일, `media-src`만 additive 변경. `media-src`가 명시돼 있어 `default-src`로 폴백하지
  않으므로 수정 위치가 `media-src`여야 함도 확인.

**검증자 관찰(결함 아님)**: 옛 `media-src` 문자열을 담은 문서 미러 둘 — `docs/proposals/completed/2026-03-25-deployment-infrastructure-proposal.md:258`
(completed 이력이라 동결이 정상), `apps/web/docs/architecture/vercel-project-setup-guide.md:350`(살아있는 참조 문서). 계획서 범위
(`next.config.js`) 밖이고 web-dev의 쓰기 범위(`apps/web/src/**`)도 밖이다 → **인수 단계에서 메인 루프가 가이드 한 줄을 갱신할 후보**로
남긴다(FEAT-58·BUG-16 인수의 「문서 두 줄 갱신」 전례). 테스트·스냅샷에 CSP를 단언하는 것은 0건.

**트리 청결 검산(메인 루프 직접)**: 라운드 종료 `git status --porcelain` = `?? nul` 한 줄(세션 시작 전부터 있던 파일). 무수정 확인.

**판정: 독립 무편집 클린 패스 1사이클 — 결함 0, 필수 6경로 전수.** 보드에 `검증:` 줄을 쓴다. 게이트②는 소유자 몫이다.

## 게이트② (2026-10-01)

소유자가 「BUG-17, FEAT-59 구현 승인」으로 게이트②를 열었다. 계획서는 클린 패스본(`dd8f6c7` 시점) 그대로다.
