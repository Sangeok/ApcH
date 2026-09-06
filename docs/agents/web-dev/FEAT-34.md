# FEAT-34 구현 보고 (web-dev)

## 2026-09-06 — 구현

### 개요

`docs/plans/FEAT-34.md`대로 apps/web FSD 경계 자동 검출을 도입했다. 계획서 「현재 동작」이
현재 코드와 일치함을 확인한 뒤(선행 정리 5건 대상 파일, 배럴 소스, stale-policy 순수성 전부 확인)
계획서 「고칠 파일」의 여덟 파일만 건드렸다. proposal 이동(아홉 번째 행)은 계획서 「범위 밖 의존」이
메인 루프로 담당을 확정했으므로 손대지 않았다.

### 고친 파일 (전수)

선행 정리(W6 위반 5건 → 0):

1. `apps/web/src/fsd/pages/pricing/ui/index.tsx` — `~/fsd/features/billing/config/plan-tiers` → `~/fsd/features/billing` 배럴.
2. `apps/web/src/fsd/pages/dashboard/ui/index.tsx` — `~/fsd/features/upload/model/query-options` → `~/fsd/features/upload` 배럴(두 심볼).
3. `apps/web/src/fsd/pages/dashboard/ui/_component/RecoverableUploadDrafts.tsx` — 훅 딥 임포트 둘(`use-delete-uploaded-file`·`use-resume-upload-draft`)을 `~/fsd/features/upload` 배럴 한 줄로 병합.
4. `apps/web/src/fsd/entities/uploaded-file/index.ts` — `export { PROCESSING_STALE_POLICY } from "./model/stale-policy";` 재수출 추가(attempt-prefix 블록 직후). stale-policy는 import 0 순수 상수라 클라이언트 배럴 안전.
5. `apps/web/src/fsd/features/upload/api/reconcile-stale-processing.ts` — `~/fsd/entities/uploaded-file/model/stale-policy` 딥 임포트를 같은 파일이 이미 쓰는 `~/fsd/entities/uploaded-file` 배럴 named 임포트 블록에 `PROCESSING_STALE_POLICY`로 병합.

신규:

6. `apps/web/scripts/verify-fsd-boundaries.mjs` — 계획서 「구현 스케치」 펜스 본문(`isTypeOnly` 가드 포함 판)을 그대로 이식. `analyzeFsdBoundaries({ files })` export + CLI(위반 시 `process.exitCode=1`, 없으면 `FSD boundary check passed.`). 규칙 W1~W8.
7. `apps/web/scripts/verify-fsd-boundaries.test.mjs` — 인메모리 음성/양성 픽스처 셀프테스트(`node --test`). W1~W8 각 음성 발화 + 양성 통과, W8 owner 등록이 장식이 아님(형제 non-owner 경로 발화), W8 type-only 가드, W5/W6/W4 두 감시 지점, CLI 신호(non-empty 반환).

배선:

8. `apps/web/package.json` — `check`를 `npm run verify:fsd:test && npm run verify:fsd && next lint && tsc --noEmit`로 교체, `verify:fsd`(`node scripts/verify-fsd-boundaries.mjs`)·`verify:fsd:test`(`node --test scripts/verify-fsd-boundaries.test.mjs`) 추가.

### 스케치 대비 차이

- **분석기 스크립트**: 계획서 「구현 스케치」 전문을 리터럴 그대로 옮겼다. 분기 순서·조건·리터럴 값·통과 문구 모두 무변경.
- **셀프테스트**: 계획서는 핵심 픽스처(두 감시 지점)의 형태만 명시하고 나머지 분기는 「테스트」 절의 "덮는 것" 목록으로 명세했다. 그 목록대로 W1~W8 전부를 픽스처로 작성했다. admin 셀프테스트와 달리 web 분석기 시그니처는 `mode` 인자가 없어(`--final` 모드 미도입) 테스트 헬퍼도 `mode`를 넘기지 않는다. 사용자에게 보이는 문구·리터럴 값 변경 없음(테스트 픽스처는 내부 문자열일 뿐).
- **재수출 위치**: 계획서가 지정한 "attempt-prefix 재수출 블록 근처"에 그대로 배치.

### 검증 (실제 출력)

1. `npm run verify:fsd` → **EXIT 0**
   ```
   FSD boundary check passed.
   EXIT=0
   ```

2. `npm run verify:fsd:test` → **11/11 통과, EXIT 0**
   ```
   # tests 11
   # pass 11
   # fail 0
   ```

3. 감시 지점 음성 시험(임시 위반 주입 후 되돌림):

   W5 — `src/fsd/entities/user/index.ts`에 `export { getUserById } from "./api";` 임시 추가:
   ```
   src/fsd/entities/user/index.ts:5 [W5] entity client barrel must not re-export server-only ./api; use server.ts
   EXIT=1
   ```

   W6 — `src/fsd/pages/pricing/ui/index.tsx`에 `import { X } from "~/fsd/widgets/clip-display/ui";` 임시 추가:
   ```
   src/fsd/pages/pricing/ui/index.tsx:4 [W6] slice internals require a public entry: ~/fsd/widgets/clip-display/ui
   EXIT=1
   ```

   W4 — `src/app/dashboard/loading.tsx`에 `import { X } from "~/fsd/widgets/clip-display/ui";` 임시 추가:
   ```
   src/app/dashboard/loading.tsx:2 [W4] widget internals require the slice barrel: ~/fsd/widgets/clip-display/ui
   EXIT=1
   ```
   세 건 모두 확인 후 Edit로 원래대로 되돌렸다. 되돌린 뒤 `npm run check`가 EXIT 0(아래)이므로 잔재 없음이 증명된다. 이 세 출력이 `docs/release-checks.md`의 FEAT-31(W5)·FEAT-33(W4/W6) 감시 지점 두 줄을 `대체(FEAT-34)`로 닫는 증거다.

4. `npm run check` → **EXIT 0** (verify:fsd:test 11/11 → verify:fsd passed → next lint "No ESLint warnings or errors" → tsc --noEmit 무오류)

5. `npm test` → **77 유지, EXIT 0**
   ```
   # tests 77
   # suites 17
   # pass 77
   # fail 0
   ```
   `npm test`는 `tsx --test "src/**/*.test.mjs"`라 `scripts/` 밖만 잡으므로 셀프테스트는 여기 포함되지 않는다(count 불변). 셀프테스트는 `verify:fsd:test`가 별도로 돈다.

6. `npm run build` → **EXIT 0** (전 라우트 정상 산출). 빌드 후 `.next`를 삭제하고 `git status`로 트리 청결 확인 — 임시 주입 셋 전부 되돌려졌고 계획서 「고칠 파일」의 여덟 파일(7 수정 + `scripts/` 2 신규)만 변경 상태.

### 테스트로 못 덮은 범위

- **셀프테스트는 인메모리 픽스처만 본다.** 실제 트리에 대한 `verify:fsd` 1회 EXIT 0과 감시 지점 음성 시험 세 건은 위 검증 3·4로 명령 실증했다(단위 테스트가 아니라 CLI 실행).
- **`npm test`(tsx 러너)는 `scripts/**/*.test.mjs`를 잡지 않는다.** Node 내장 러너의 별도 실행(`verify:fsd:test`)이 필요하며 `check`가 이를 앞세운다 — admin과 동일 구조. `apps/web/CLAUDE.md`의 테스트 목록 표(`src/**` 대상)에는 이 셀프테스트가 들어가지 않는다(scripts/ 소속). 표 갱신은 필요 없다.
- **W8 owner 목록의 실측 정합**: 실제 트리 `verify:fsd` EXIT 0이 owner 목록이 현재 `db` 값 임포트 전수를 덮음을 실증한다. 향후 새 `db` 임포터가 생기면 CI가 W8로 잡고 owner 목록 갱신을 요구한다(설계 의도).
- **에디터 즉시 피드백**: 이 스크립트는 CI 게이트이지 ESLint처럼 편집 중 실시간 표시가 아니다. 계획서 「대안 (c)」가 `no-restricted-imports`로 W8을 ESLint 보완하는 후속을 열어뒀다(이 항목 범위 밖).

### 범위

- proposal 이동(`active/` → `completed/`, frontmatter 갱신, 「Completion or Closure Notes」 절 신설)은 web-dev 쓰기 범위 밖(`apps/web/docs/**`)이라 **손대지 않았다.** 계획서 「범위 밖 의존」이 메인 루프 담당으로 확정. 인수 시 처리 예정.
- `보류` 없음. 계획서와 코드 어긋남 없음.
