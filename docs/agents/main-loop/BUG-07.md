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

## plan-verifier 독립 패스 1사이클 (2026-08-26)

브리핑: 항목ID·계획서 경로·필수 경로(1·2·3·4·8) 목록만 전달, 직전 라운드 결과는 주지 않음.

**결함 1건(문서 위생)** — 「구현 스케치 › 왜 이렇게 되는지」의 세로 정렬 설명이 "제목·부제
박스 y 23~59"를 인용했는데, 실측 결과 그 좌표는 텍스트가 아니라 **책상 프레임 장식
rect**(`x=57 y=23 width=60 height=36`, `owner-banner.tsx:49-52`)의 것이었다 — 계획서
자신이 132행 근처에서 같은 rect를 "책상 프레임 x=57~117"로 이미 올바르게 인용하면서도,
세로 정렬 설명에서는 그 rect의 y범위를 텍스트 박스인 것처럼 잘못 재사용했다. 실제 텍스트
베이스라인(제목 y=38·부제 y=54)에서 폰트 메트릭으로 역산한 시각 범위는 대략 27~57(중심
≈43.8%)로, 결론("50%와 차이 없음")은 우연히 유지되지만 인용 수치의 출처가 틀렸다.
**구현 스케치 코드(`justify-center`) 자체는 무관해 구현 오류는 아니다.**

경로 1(인용 전수 재대조, 라인·스케일 계산 독립 재계산)·2(스크래치패드에 `apps/admin`
통째 복사 후 스케치 적용, tsc/lint/boundary test 13/13/테스트 281/281/verify:fsd:final
전부 실행 통과, 종료 후 저장소 청결 확인)·3(before 블록 정확히 1회 일치 확인 후 기계
치환)·4(저장소 전체 `OwnerBanner` 참조 19곳 열거 — 코드 관련 3곳만 실제 무관 확인)·
8(스크래치패드 tsconfig override로 `renderToStaticMarkup` 렌더, pendingCount 0·3 두
분기 모두 after 스케치와 구조 일치 확인)을 전부 실행 — 실행하지 못한 경로 없음.

**메인 루프 반영**: 「왜 이렇게 되는지」 문단을 정확한 인용(베이스라인 y=38·y=54,
`owner-banner.tsx:69,79`)과 역산한 시각 범위(27~57, ≈43.8%)로 교체. 스케치 코드는
무변경(코드 오류가 아니었으므로).

## plan-verifier 독립 패스 2사이클 (2026-08-26)

브리핑: 1사이클과 동일(항목ID·계획서 경로·필수 경로 1·2·3·4·8), 직전 결함이나 판단은 주지 않음.

**결함 0건.** 다섯 경로 전부 재실행(스크래치패드 통째 복사·`.env` 더미·check EXIT0·test
281/281·verify:fsd:final EXIT0·before/after 기계 치환 1/1·`OwnerBanner` 참조 여집합
열거·`renderToStaticMarkup` 실물 렌더 pendingCount 0·2 두 분기 모두 after 스케치와 바이트
일치). 실행하지 못한 경로 없음.

투명성 메모: 검증자가 경로 4 수행 중 이 파일(`docs/agents/main-loop/BUG-07.md`)을 grep으로
우연히 마주쳐 1사이클 결함과 "2사이클 진행 예정" 문구를 봤다고 스스로 밝혔다 — 브리핑이
준 것이 아니라 저장소를 뒤지다 마주친 것이며, 그 결론을 가져오지 않고 모든 경로를 계획서·
코드 원문에 대해 처음부터 다시 실행해 독립적으로 결함 0건을 확인했다고 명시했다.

**독립 무편집 패스 확보 — 클린 패스 확정.** `plan-verifier` 2사이클째(1사이클 결함 1건은
문서 위생, 메인 루프가 반영 후 재디스패치 → 2사이클째 무소득). 라운드 종료 `git status
--porcelain` 무출력으로 트리 청결 확인.

**검증: 클린 패스 (2026-08-26, 독립 무편집 1라운드 — plan-verifier 2사이클째)**
