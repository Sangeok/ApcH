# FEAT-40 — 메인 루프 기록

## 게이트① (2026-09-14)

소유자 직접 발주(pm 미경유) — 세션 지시 "Feat 40 수행". FEAT-41 완료 직후, 남은 착수 가능 후보(FEAT-40·44, BUG-12, FEAT-27)를
보고받고 FEAT-40을 지목했다. `계획지시`로 보드에 기록.

담당은 `web-dev` — area가 `apps/web/src/fsd` 안(`features/caption-style` 신설, `widgets/clip-draft-review`, `features/clip-review/model`, `shared`)이다.
미결 FEAT-38(main-loop, 마이그레이션 대기)과는 파일이 겹치지 않는다 — FEAT-38의 커밋 보류 변경은 `apps/web/src/fsd/shared/analytics/lib/metadata.ts`·
`metadata.test.mjs`와 `packages/db`에 있다.

### 계획 단계에서 반드시 다룰 것

- **인수 기준이 기계적이다 — 계획서가 검증 방법까지 정한다.** 백로그 요구: 옮기는 테스트 2개(`caption-preview.test.mjs`·
  `caption-presets.test.mjs`)의 diff는 **경로 변경뿐**이어야 한다. 테스트가 상대 경로로 대상 모듈을 import하면 함께 옮겨 내용이 그대로인지,
  아니면 import 줄이 바뀌어야 하는지를 실제 파일에서 확인하고, 인수 때 돌릴 명령(예: `git diff -M --stat`의 rename 유사도, 이동 전후 내용 바이트
  비교)을 적는다. 옮기는 **비테스트** 파일(`CaptionStyleEditor.tsx`·`CaptionPreviewPlayer.tsx`·`caption-preview.ts`·`caption-presets.ts`)도
  import 경로 외 변경이 없어야 "동작 무변경"이 성립한다.
- **FSD 경계.** `features` 슬라이스끼리 peer import 금지 — `TranscriptWord`를 `shared`로 내리고 `features/clip-review`는 재수출만 남긴다(백로그 ②).
  새 슬라이스의 공개 표면(barrel)을 정하고 `npm run check -w apps/web`의 `verify:fsd`가 통과하는지로 확인한다. `parseTranscriptWords`와 그 테스트는
  제자리(백로그 ②).
- **줄번호 인용 주석은 고치지 않는다.** 옮기는 `caption-preview.ts`·`caption-preview.test.mjs`에는 `main.py:NNN` 줄번호 주석이 여럿 있고 이미 낡았다.
  그걸 고치는 것은 **FEAT-44**의 일이고, 여기서 고치면 "테스트 diff는 경로 변경뿐" 기준이 깨진다. 백로그 FEAT-44에 "FEAT-40과 동시 진행 금지 —
  먼저 끝난 쪽의 결과를 뒤쪽이 기준으로 삼는다"가 적혀 있다.
- **옛 경로를 가리키는 참조 전수.** 옮기는 파일 경로를 저장소 전역에서 열거한다(코드 import, 테스트 러너 글로브, `apps/web/CLAUDE.md` 테스트 표·FSD
  레이어 표, 백로그 FEAT-42·FEAT-44의 area·인용). web-dev가 쓸 수 없는 문서(`apps/web/CLAUDE.md`·백로그)는 계획서에 목록으로 남겨 메인 루프가 인수 때 처리한다.
- **동작 무변경의 증거.** `npm run check -w apps/web` 통과, `npm test -w apps/web`의 테스트 수·통과 수가 이동 전과 같을 것. 워킹트리에 FEAT-38 보류
  변경이 있어 현재 기준선은 **131개 전부 통과**다.
