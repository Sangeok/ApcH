# BUG-07 — main-loop 기록

## 계획서 검증 라운드 (2026-08-26, 1라운드)

**필수 경로 확정**(카탈로그 `docs/plans/verification-paths.md`): 항목 성격(단일 파일 UI 크기
버그, 기존 파일 수정, 판정 로직·외부 신호 없음)에 따라 1(인용 전수 대조)·2(스케치 추출·실행)·
3(before/after 기계 적용)·8(실물 렌더)을 필수로, 4(여집합 열거)는 저강도로 확인. 5·6·7·9는
트리거 없음(신규/변경 순수 함수 없음, 외부 신호 해석 없음, 화이트리스트 불변식 없음, 생성
파일 없음).

**참고**: 런북이 지정한 `reconciling-proposals-with-codebase` 스킬이 이 세션에 설치돼 있지
않다(FEAT-09 검증 때와 같은 공백). 아래는 그 스킬 없이 카탈로그 경로를 직접 수행한 기록이다.

- **경로 1 (인용 전수 대조)**: 계획서가 인용한 `owner-banner.tsx:3,25,29,67-76,77-85`,
  `index.tsx:37,143`, `sprites.ts:3`를 전부 다시 읽어 내용까지 대조 — 전부 일치. 불일치 0건.
- **경로 2 (스케치 추출·실행)**: 계획서의 「구현 스케치」 before/after를 실제
  `owner-banner.tsx`에 바이트 그대로 적용한 뒤(실제 파일 편집, 검증 후 원복) 실제 프로젝트
  설정으로 실행:
  - `npm install`(이 컨테이너에 `node_modules` 부재 — 최초 1회 설치, 루트 lockfile·prisma
    생성물 변경분은 검증 종료 후 `git checkout`으로 원복)
  - 검증용 `.env`(더미 값, gitignore 대상, 검증 종료 후 삭제) 생성 — `env.js`의 Zod 스키마가
    없으면 `next lint`/`tsc`가 아예 기동하지 않음
  - `npm run check -w apps/admin` → **EXIT 0**(verify:fsd:test 13/13 · verify:fsd migration
    통과 · ESLint 0경고 · `tsc --noEmit` 0)
  - `npm test -w apps/admin` → **281 pass / 0 fail**(27파일·60suite, 패치 전과 동일 — 이
    항목은 새 테스트를 추가하지 않는 순수 UI 변경이므로 수치 불변이 곧 회귀 없음의 증거)
  - `npm run verify:fsd:final -w apps/admin` → **EXIT 0**
- **경로 3 (before/after 기계 적용)**: 위 패치가 손 개입 없이 정확히 적용됐다 — before
  블록이 현재 트리와 바이트 일치했다는 뜻(2와 같은 실행으로 겸함).
- **경로 8 (실물 렌더)**: `apps/admin` 워크스페이스 안에서 `tsx`로 `OwnerBanner`를
  `renderToStaticMarkup`으로 렌더(`jsx: preserve` 때문에 tsx 기본 설정으로는
  `React is not defined`가 나 `jsx: react-jsx`로 override한 임시 tsconfig 사용 — FEAT-10
  FSD 9라운드가 남긴 것과 같은 하니스 사정, Next 파이프라인과 무관). `pendingCount=2`로
  렌더한 결과: `<div class="relative"><svg ... aria-hidden="true" ...>`(텍스트 없이 배경
  도형만) 뒤에 `<div class="pointer-events-none absolute inset-0 flex flex-col justify-center
  gap-1 pl-[30.3%] pr-3"><p class="text-sm leading-tight font-bold"
  style="...color:#2b2420">당신의 책상</p><p class="text-xs leading-snug"
  style="...color:#976014">결재 2건이 도장을 기다립니다</p></div>` — 계획서 스케치와
  분기·클래스·색상·문구 전부 바이트 일치. 임포트(`gridToRects`) 해석·컴파일·렌더 모두 성공.
- **경로 4 (여집합 열거, 저강도)**: `owner-banner.tsx`를 참조하는 파일은
  `index.tsx:18,143` 하나뿐(grep 확인, 테스트 파일 0건) — "다른 파일은 고치지 않는다" 주장과
  일치.

**결함 0건 — 무편집 클린 패스 1라운드.** 계획서 「고칠 파일」이 파일 하나(`owner-banner.tsx`)
뿐이고 판정 로직·외부 신호·화이트리스트가 없는 낮은 위험도 항목이라, 보드 정지 규칙상
`plan-verifier` 독립 패스 디스패치 자격(메인 루프 자기 라운드가 무소득일 때)이 아니라
**메인 루프 1라운드 자체가 이미 스케치를 실제 실행·렌더까지 확인한 클린 패스**다.

**패치는 검증 후 원복했다** — 이 항목은 아직 `구현승인` 전이라 코드 변경을 남기지 않는다.
`git status`로 트리 청결 확인: 검증 라운드 종료 시 작업 트리에는 `PROJECT_BOARD.md`(status
갱신)와 신규 `docs/plans/BUG-07.md`만 남았다(`owner-banner.tsx`는 원본으로 복구, `npm
install`이 건드린 lockfile·prisma 생성물도 `git checkout`으로 원복).

**검증:** 클린 패스 (2026-08-26, 무편집 1라운드)
