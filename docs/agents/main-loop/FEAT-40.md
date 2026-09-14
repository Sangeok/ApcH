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

## 필수 경로 확정 (2026-09-14)

| 경로 | 채택 | 근거 |
| --- | --- | --- |
| 1 인용 전수 대조 | ○ | 전 항목 필수. 위젯·clip-review·검출기 스크립트 인용 20여 곳 |
| 2 스케치 추출·실행 | ○ | 이동·신규·임포트 교체를 실제 트리에 적용해 `check`·`test`가 진짜 검사 |
| 3 before/after 기계 적용 | ○ | 임포트 교체 여덟 + `git mv` 여섯 — 적용 가능성과 rename 추적 |
| 4 전칭 여집합 열거 | ○ | "외부 소비자는 위젯 안 두 곳뿐", "옮기는 파일의 임포트는 절대·같은 폴더뿐", "web-dev가 못 쓰는 문서 넷" |
| 5 돌연변이 | × | 로직 신설·변경 없음(파일 위치·임포트만) |
| 6 실제 사건 재생 | × | 외부 신호 해석 없음 |
| 7 음성 시험 | ○ | FSD 경계 규칙(W2)에 기댄다 — 새 슬라이스가 clip-review를 직접 보면 정말 실패하는가 |
| 8 실물 렌더 | × | 렌더 로직 무변경이고 이 러너로 렌더 불가 — 경로 2의 `check`(tsc·lint·FSD)가 임포트·모양을 덮는다 |
| 9 구조적 아티팩트 | × | schema·config·생성 파일 변경 없음 |

## 라운드 1 (2026-09-14, 편집) — 구현 영향 2건 + 위생 2건

- **경로 1·4 (인용·전칭)**: 이동 대상 6파일의 **모든 임포트 문**을 열거 — 상대 임포트는 `CaptionStyleEditor.tsx:11-12`·`CaptionPreviewPlayer.tsx:7-14`뿐,
  `caption-preview.ts`·`caption-presets.ts`는 절대 경로뿐, 테스트 둘은 같은 폴더 상대 + 절대(`~/fsd/features/clip-review/model/schemas`는 테스트라 FSD 분석 제외 `verify-fsd-boundaries.mjs:155·262`).
  `apps/web/src`·`scripts` 전역에서 이동 모듈 참조를 열거 — 코드 소비자는 `CaptionStyleDialog.tsx:16`·`use-clip-draft-review.ts:19` 둘뿐(나머지는 주석). 검출기 규칙
  `:68-73`(features public entry)·`:202-204`(W2)·`:210-212`(W6)·`:155`·`:262`(테스트 제외) 일치. 두 컴포넌트 모두 `"use client"`·default export. `TranscriptWord` 사용처 계획서와 일치.
- **경로 2·3 (실제 트리 임시 적용)** — 스크래치패드 `feat40/apply_and_restore.py`: `git mv` 6 + 신규 2 + 임포트 교체 8을 계획서대로 적용 →
  `npm run check -w apps/web` **EXIT 0**(`FSD boundary check passed.` · `✔ No ESLint warnings or errors` · tsc) · `npm test -w apps/web` **131/131** ·
  `git diff --cached -M --name-status` 여섯 이동 전부 **R100** · 불변 3파일 `git rev-parse HEAD:<옛>` == `:<새>` 전부 True · 워킹트리≡인덱스.
  `finally`에서 역 `git mv` + `git checkout --` + 생성 파일 삭제 → `git status --porcelain`이 적용 전 스냅샷과 **동일**(FEAT-38 보류 변경 무손상).
- **경로 7**: 적용 상태에서 `caption-style/model/caption-preview.ts`의 임포트를 `~/fsd/features/clip-review`로 되돌리자 `verify:fsd` **EXIT 1**,
  `src/fsd/features/caption-style/model/caption-preview.ts:1 [W2] peer slice import is forbidden: clip-review`. `TranscriptWord` 하강이 장식이 아님을 실증.
- **경로 4 (문서 여집합)**: 옛 경로를 가리키는 살아 있는 문서 열거 — 계획서 목록 넷 외에 `TASK_BACKLOG.md:26`(FEAT-38 source)이 더 있다. `docs/release-checks.md:78`은 BUG-13
  게이트 서술의 파일명뿐(경로 없음)이라 무관, `PROJECT_BOARD.md:90`은 이력 행. **커밋 보류 중인 FEAT-38의 `packages/db/prisma/schema.prisma:96` 주석(+생성 클라이언트 사본)도
  옛 경로를 인용한다** — FEAT-38은 메인 루프 소관이라 FEAT-38 커밋 전에 새 경로로 고치고 클라이언트를 재생성한다(이 계획서의 일이 아님).

**결함 → 계획서 일괄 편집**

| # | 결함 | 구분 | 반영 |
| --- | --- | --- | --- |
| B1 | 계획서가 구현자에게 `git mv`(옛 파일 삭제 동반)를 시키는데 web-dev 정의(`web-dev.md:53`)가 Bash를 읽기·검증 전용으로 묶는다 — 계획서 스스로 "막히면 보류"라 적어 구현이 첫 단계에서 멈춘다 | **구현 영향** | 이동 6건은 게이트② 직후 **메인 루프가 `git mv`로 선행**(커밋 안 함), web-dev는 새 경로에서 임포트만 Edit·B-3도 새 경로로 대조. 「고칠 파일」 표기·스케치 첫 문단·「범위 밖 의존」 끝 문단 교체 |
| B2 | 인수 명령 `git show HEAD:… \| diff - <워킹카피>`가 CRLF 워킹카피(`caption-presets.ts`·`caption-presets.test.mjs`, `git ls-files --eol` `w/crlf`)에서 **내용이 같아도 전 줄 불일치**를 낸다(임시 적용에서 실측 False) — 인수가 거짓 실패하거나 구현자가 줄끝을 "고치게" 된다 | **구현 영향(인수 절차)** | blob id 대조(`git rev-parse HEAD:<옛>` == `:<새>`) + `git diff --quiet -- <새>` + `git diff --cached -M --name-status`의 `R100`으로 교체, working-copy diff 금지 이유 명시 |
| H1 | 「범위 밖 의존」 "문서 넷"이 `TASK_BACKLOG.md` FEAT-38 source 인용을 빠뜨림 | 문서 위생 | 다섯째 항목 추가 |
| H2 | `CaptionStyleEditor.tsx`의 before==after 무변경 블록(`:12`)이 "임포트 3줄 교체"로 계수됨 | 문서 위생 | 블록 제거·"2줄"로 교정, 무변경을 산문으로 |

계획서를 고쳤으므로 준비 상태 리셋 → 라운드 2(무편집).

## 라운드 2 (2026-09-14, 무편집) — 무소득

- 계획서를 파일에서 전문 재독(회상 아님). 라운드 1 일괄 편집이 일관되게 반영됐다 — 「고칠 파일」 여섯 행 `(이동 — git mv는 메인 루프가 선행)`,
  스케치 첫 문단·「범위 밖 의존」 끝 문단의 이동 분담, `CaptionStyleEditor` "임포트 2줄", 무변경 블록 제거, 인수 절차의 blob id 대조와
  working-copy diff 금지 이유, 문서 인용 다섯째 항목. 남은 옛 문구("막히면 보류", `git show … | diff -`) 0.
- 새 인용 `.claude/agents/web-dev.md:53` — "상태를 바꾸는 명령 실행 — Bash는 **읽기·검증 전용**이다…" 내용 일치.
- `feat40/apply_and_restore.py` 재실행: `check` EXIT 0 · `test` 131/131 · 여섯 이동 `R100` · 불변 3파일 blob id 일치·워킹트리≡인덱스 ·
  W2 음성 시험 EXIT 1 · 복원 후 `git status --porcelain` == 적용 전 스냅샷. 계획서의 코드 블록은 라운드 1에서 무변경 블록 제거 외에 바뀌지 않았다.
- 비차단 메모(편집하지 않음): 「못 덮는 범위」의 "순수 모델 바이트 불변"은 `caption-presets.ts`에만 정확히 해당하고 `caption-preview.ts`는 임포트 1줄이 바뀐다 —
  같은 계획서 「고칠 파일」·스케치·인수 기준이 그 차이를 정확히 적고 있어 구현·인수에 영향 없음.

**판정: 무소득** → `plan-verifier` 독립 패스 디스패치 자격. 필수 경로는 확정표의 1·2·3·4·7.

## 독립 패스 1사이클 (2026-09-14, plan-verifier)

브리핑은 계약 셋(항목ID·계획서 경로·경로 1·2·3·4·7 카탈로그 발췌)뿐. 검증자가 계약 준수를 스스로 확인했다.

**보고: 결함 0건.** 필수 경로 다섯 전부 실행, 실행 못 한 경로 없음. 하니스는 스크래치패드(`sim-fsd.mjs`).
- 경로 1: 계획서 인용 전수 내용 일치. **서브임계 관찰 1건(검증자 판정: 결함 아님)** — `caption-presets.test.mjs`의 constants 임포트를 `:9-11`로
  인용했으나 import 문은 `:8-11`에 걸친다(8행 `import {`). 그 파일은 이 계획에서 바이트 무변경이고 인용이 대상 import를 모호함 없이 지목하므로
  구현·인수 영향 없음. 메인 루프도 편집하지 않는다(편집하면 준비 상태만 리셋되고 얻는 것이 없다).
- 경로 2: 스케치 편집을 이동-후 파일맵에 적용하고 저장소의 실제 FSD 분석기(`verify-fsd-boundaries.mjs`)를 임포트해 실행 → 위반 0. 타입 정합은 구성으로
  확인(`verbatimModuleSyntax` 하 `import type`/`export type`, 배럴 named/default 재수출). 기준선 `npm test -w apps/web` 131/131. **전체 `tsc`는
  검증자가 트리를 바꿀 수 없어 미실행** — 메인 루프 라운드 1·2가 계획서대로 **실제 트리에 임시 적용해 `npm run check -w apps/web`(tsc·lint·verify:fsd)
  EXIT 0**을 확인했으므로 두 증거를 합쳐 경로 2를 소진한 것으로 판정한다(BUG-09 경로 2와 같은 결합).
- 경로 3: before 문자열 전부 현재 트리와 일치(transcript.ts 인터페이스 블록은 CRLF 정규화 후 일치 — 계획서가 경고한 autocrlf 현상 그 자체),
  옛 6경로 소멸 후 W7 0 = 옛 경로를 참조하는 파일 없음.
- 경로 4: 이동 모듈·`TranscriptWord` 전 소비자 전역 grep, 여집합 공집합.
- 경로 7: 돌연변이 셋 — `shared/lib/transcript.ts` 제거 → W7 4건, `TranscriptWord` 하강 생략 → W2 3건, 위젯의 슬라이스 내부 직접 임포트 → W6 1건.

**트리 검산**(메인 루프 직접): 패스 종료 후 `git status --short`가 디스패치 직전 스냅샷과 동일 — 커밋 보류 중인 FEAT-38 변경
(`git diff --ignore-cr-at-eol --numstat` 수치까지 동일), `apps/web/.claude/settings.local.json`, `nul`. 검증자 무수정 준수 확인.

**판정: 클린 패스.** 정지 규칙 계수 0(구현 영향 결함은 라운드 1의 두 건뿐이고 독립 패스 0건). 보드에 `검증:` 줄 기록.
다음은 게이트②이며 소유자만 연다. 개방 시 메인 루프가 이동 6건을 `git mv`로 선행한 뒤 web-dev를 디스패치한다(계획서 「구현 스케치」 첫 문단).
