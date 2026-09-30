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
