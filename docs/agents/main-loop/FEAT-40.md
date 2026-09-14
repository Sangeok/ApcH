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

## 게이트② (2026-09-14)

소유자가 `검토대기` → `구현승인` 개방(세션 지시 "진행"). 개방 직전에 진행 순서(메인 루프 `git mv` 6건 → web-dev 신규 2·임포트 8 →
메인 루프 인수·문서 갱신)와 "사용자 화면 무변경", "FEAT-44는 이 항목 뒤 새 경로 기준"을 고지받았다.

앵커: 독립 패스 직후 트리 검산에서 계획서·대상 파일 불변 확인, 그 뒤 커밋은 보드 `검증:` 줄(`e1b7723`)뿐 — 재검증 불요.

**인덱스 주의(이후 커밋 절차)**: `git mv`는 rename을 인덱스에 스테이징한다. 보드 전이 커밋은 `git mv` **전에** 끝내고, 이동 뒤의 문서 전용
커밋은 반드시 경로 지정 커밋(`git commit -- <paths>`)으로 해 스테이징된 rename이 딸려 들어가지 않게 한다. rename과 임포트 편집은 구현 커밋
하나로 함께 들어간다.

### 이동 선행 (메인 루프)

보드 전이 커밋(`c281a51`) 뒤 인덱스가 비었음을 확인하고, `features/caption-style/{ui,model}`을 만든 다음 `git mv` 6건을 수행했다.
`git diff --cached -M --name-status` → 여섯 줄 전부 `R100`, 스테이징 개수 6. 커밋하지 않은 채 web-dev를 디스패치했다(브리핑: 인덱스·워킹트리를
바꾸는 git 명령 금지, B-3은 새 경로로 대조, 옮긴 `caption-presets.ts`·테스트 둘은 열지 않음, FEAT-38 보류 변경 제외, 기준선 131).

## 인수 (2026-09-14)

web-dev 보고: 완료, check 통과 · test 131/131. 인수 조건 다섯을 보고가 아니라 직접 재현했다.

| # | 조건 | 직접 본 것 |
| --- | --- | --- |
| 1 | 변경 파일 ↔ 「고칠 파일」 | `git status`: 스테이징 rename 6(여전히 전부 `R100`) + 신규 2(`shared/lib/transcript.ts`·`features/caption-style/index.ts`) + 임포트 편집 6(`clip-review/model/transcript.ts`, 옮겨진 `caption-preview.ts`·`CaptionPreviewPlayer.tsx`·`CaptionStyleEditor.tsx`, `CaptionStyleDialog.tsx`, `use-clip-draft-review.ts`) — 계획서 열한 행과 일치. 그 밖엔 보드·백로그·보고서와 FEAT-38 보류 변경뿐 |
| 2 | diff ↔ 스케치 | 워킹트리 diff = 스케치 임포트 교체 여덟 줄 그대로(그 밖의 줄·`main.py:NNN` 주석 변화 0), 신규 두 파일 내용이 스케치 블록과 일치. **기계적 기준**: 불변 3파일 `git rev-parse HEAD:<옛>` == `git rev-parse :<새>` 전부 True, `git diff --quiet -- <새>` 전부 종료코드 0, 옛 6경로 전부 부재 |
| 3 | 검증 명령 재실행 | `npm run check -w apps/web` → `FSD boundary check passed.` · `✔ No ESLint warnings or errors` · tsc 오류 0 · EXIT 0. `npm test -w apps/web` → `# tests 131 # suites 31 # pass 131 # fail 0` |
| 4 | 백로그 제거 | `git diff TASK_BACKLOG.md` = FEAT-40 블록 삭제만 |
| 5 | 상세 기록 실재 | `docs/agents/web-dev/FEAT-40.md` 존재(rename 6을 메인 루프 수행으로 표기·신규 2·편집 6·blob id 값·검증·못 덮은 범위). 보드 `결과` 131자 |

**구현 커밋** `d56bf93`: `git add`를 FEAT-40 경로로만 지정한 뒤 스테이징 집합에 FEAT-38 파일이 없는지 가드하고 커밋. `git show --stat -M` —
rename 6(불변 셋 100%, 임포트 편집 셋 98%) + 신규 2 + 수정 4 + 보고서.

### 문서 갱신 (계획서 「범위 밖 의존」 다섯 + 추가 발견)

- `apps/web/CLAUDE.md`: 테스트 표 두 행 경로 → `features/caption-style/model/...`, FSD 레이어 표 `features/` 행에 `caption-style` 추가. 테스트 개수 문장은 이동으로 불변이라 그대로.
- `TASK_BACKLOG.md`: FEAT-38 source의 `caption-preview.test.mjs` 경로 교정, FEAT-44 area에 `apps/web/src/fsd/features/caption-style` 추가 + 동시 진행 금지 문장에 "FEAT-40 완료, 대상 세 파일은 새 경로" 덧붙임. FEAT-42 source는 파일명·새 슬라이스명만 인용해 교정 불요.
- **FEAT-38 보류 변경의 `packages/db/prisma/schema.prisma` 주석**(라운드 1에서 발견)도 새 경로로 고치고 `npm run db:generate:client -w @repo/db`로 생성 클라이언트를 재생성했다 — FEAT-38은 커밋 전이라 여기서 맞춰 두면 FEAT-38 커밋이 옛 경로를 싣지 않는다. 그 편차는 FEAT-38 기록에 적었다.
- 치환은 스크립트로 했고 각 원문이 파일에 정확히 1회인지 단언한 뒤 바꿨다(줄끝 보존).

### 배포 확인 원장 등재

`docs/release-checks.md` 최상단에 FEAT-40 절 — 한 줄: 배포 후 검토 화면 캡션 스타일 다이얼로그(프리셋 칩·조절·미리보기·Apply·Apply to all·저장 뒤 칩 유지)가
이전과 똑같이 동작하는가. `〔auto〕` 없음.

### 커밋 절차

이동 뒤 문서 커밋은 **경로 지정 커밋**으로 한다 — FEAT-38 보류 변경이 워킹트리에 있고, 앞으로도 rename 스테이징이 남는 경우를 막는 규칙(게이트② 절)을 그대로 따른다.
