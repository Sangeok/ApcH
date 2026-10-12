# FEAT-60 — 메인 루프 기록

## 게이트① (2026-10-13)

소유자가 이 세션에서 「`/dashboard/settings`에서 Framing을 하는데 기본 preview가 전부 검은색이라 framing이 적용된 게
안 보인다」고 관측을 가져왔다. 메인 루프가 코드를 대조해 원인을 두 겹으로 진단했다 — 미리보기가 여백 값을 받지 않고
(`CaptionStyleEditor`·`CaptionPreviewPlayer`에 여백 prop 없음), `sample`/`playUrl={null}`이라 검은 상자 위에 자막만
그린다. 결함이 아니라 FEAT-58이 범위 밖으로 둔 후속이다(`docs/plans/FEAT-58.md:552`).

대화에서 해결안이 세 번 다듬어졌다.

1. 업로드 폼 썸네일(FEAT-59)의 회색 장면 + 실비율 띠 패턴을 미리보기에 이식.
2. 소유자 제안 — 「preview 화면에 임시 화면을 아주 간단하게라도 있어야 좋겠다」 → 인라인 SVG 화자 실루엣. 백엔드
   cover 크롭(`video_framing.py` `cover_crop_geometry`)과 같은 동작이 되도록 가운데 영역을 `slice`로 채운다.
3. 소유자가 「가장 최적안이냐」를 두 번 물었다. 재검토에서 빠진 것 하나(슬라이더 조작 중 미리보기가 보여야 한다 —
   모바일에서 미리보기가 컨트롤 아래로 밀린다)를 더했고, 구현 조건 하나(여백 저장은 설정 페이지에 남긴다 —
   `docs/release-checks.md:93`의 「자막 저장이 여백을 건드리지 않는다」 보존)를 확정했다. 데스크톱 배치는 재지
   않았음을 소유자에게 밝혔다.

- 백로그 등재: 소유자 지시(「백로그에 등재해」)로 `TASK_BACKLOG.md` FEAT-60에 관측 5·요구 5·계획 단계 판단·
  뺀 대안·한계·못 덮는 범위를 옮겼다.
- 승인대기: 소유자 지시(「승인대기」)로 pm을 디스패치해 FEAT-60 한 건만 기록(`5fc004b`). pm이 보드 하단을 끝까지
  읽지 않았다고 보고해 메인 루프가 미결 0건을 직접 확인했다(남은 비완료 행은 `보류` FEAT-01뿐).
- 게이트①: 소유자가 「계획 지시」로 열었다. 게이트②는 계획 검증 뒤 소유자가 따로 연다.
- 담당: area 전부 `apps/web/src/**` 안이라 web-dev.

## 계획서 검증 (2026-10-13)

계획서 제출 `2e99002`(web-dev, 수정 3·신규 0). 검증 하니스는 스크래치패드의 **HEAD detached worktree**에서 돌렸다 —
작업 트리에 다른 세션의 커밋 안 된 card-news 변경이 있어서다. 주의: worktree의 `node_modules`를 통째로 junction하면
`@repo/db`가 워크스페이스 링크를 타고 **메인 트리의 WIP `packages/db`**로 해석돼 HEAD 기준선부터 `tsc`가 card-news
이벤트 누락으로 깨진다(실측). `node_modules` 항목별 junction + `@repo/db`만 worktree 자기 `packages/db`로 재연결해
해결했다(그 뒤 HEAD 기준선 `tsc` exit 0).

### 필수 경로

| # | 경로 | 판정 | 이유 |
| --- | --- | --- | --- |
| 1 | 인용 전수 대조 | 필수 | 모든 항목 |
| 2 | 스케치 추출·실행 | 필수 | 스케치에 코드(TSX) |
| 3 | before/after 기계 적용 | 필수 | 기존 파일 3개 수정 |
| 4 | 전칭 여집합 열거 | 필수 | 「실사용 소비자는 설정 한 곳뿐」·「사용자 문구는 한 글자도 바뀌지 않는다」·「새 파일 없음」 |
| 5 | 돌연변이 | 제외 | 판정 로직·순수 함수 신설 없음(계획도 테스트 추가 없음) |
| 6 | 실제 사건 재생 | 제외 | 외부 신호 해석 없음 |
| 7 | 음성 시험 | 제외 | 계획이 기대는 불변식(저장 분리)을 지키는 **자동 검사가 없다** — 빼서 실패를 볼 대상이 없다. 그 불변식은 release-checks:93 실물 관측과 스케치의 「상태·핸들러는 설정에 남는다」 구조로만 지켜진다 |
| 8 | 실물 렌더 | 필수 | 화면 변경 |
| 9 | 구조적 아티팩트 | 제외 | schema·config·생성물 변경 없음 |

### 라운드 1 — 편집 라운드 (결함 2 + 위생 2)

- 경로 1: 인용 전수(설정 13·편집기 8·플레이어 8·썸네일·video-framing·constants·backend·clip-draft-review·UploadPodcast)
  내용까지 일치.
- 경로 4: `features/caption-style|CaptionStyleEditor|CaptionPreviewPlayer`를 web·admin src·scripts **와 다른 세션 untracked
  파일까지** grep — `CaptionStyleEditor` 소비자 설정 1곳, `CaptionPreviewPlayer` 소비자 편집기 1곳, untracked 0건. 새
  필수 prop(`paddingPercent`)이 깨뜨릴 호출부 없음.
- 경로 3: 계획서의 tsx 블록 8개를 바이트 그대로 추출해 적용 — before 전부 정확히 1회 일치, 옮긴 Framing 블록 32줄이
  원본과 들여쓰기 외 동일. 구조분해는 산문뿐이라 하니스가 추정 적용했다(→ 위생 W2).
- 경로 2: 패치 worktree에서 `tsc` exit 0 · typed ESLint(규칙 149개 로드 확인) 세 파일 exit 0 · `verify-fsd-boundaries`
  통과 · `tsx --test` **198/49/0**.
- 경로 8: `renderToStaticMarkup`(react-jsx tsconfig 오버라이드)로 3케이스(EN 0% middle·EN 10% bottom·KR 25% top) — 슬롯이
  왼쪽 칸 첫 자식, 장면 div가 상자 안 `top:N%;bottom:N%`, SVG `slice`, 자막 레이어가 장면 뒤, `<video>` 없음, 자막 인셋
  bottom 43.33px(=260/6)·top 33.33px(=200/6) 불변. 이어 정적 HTML + headless chromium(1217) 스크린샷 1280·390px —
  공유 Playwright MCP 브라우저는 다른 세션이 점유 중이라 쓰지 않았다.
- **결함 B1(구현을 틀리게 함) — 9:16 장면은 줄지 않고 잘린다.** 스크린샷에서 0%와 25%의 머리 크기가 같았다. 계산
  하니스: `viewBox 180×320` + `slice`는 가운데 영역(180×256·180×160)보다 좁아 `max(폭비, 높이비)`가 폭 쪽(=1.0)으로
  고정 — 0~25% 내내 ×1.00, 25%에선 머리만 남는다. 백엔드는 16:9 원본에서 ×0.80/×0.72/×0.50(10/14/25%). 백로그 요구 ②
  (「여백 10%면 화자가 0.8배로 줄어드는 실렌더 동작」)와 계획서 자신의 「cover 크롭과 같은 계열」 주장을 어긴다.
  해소: 장면을 가로 `viewBox 320×180`로 다시 그림(화자·마이크는 0%에서 보이는 가운데 101단위 안, 좌우 패널은 여백을
  키우면 드러남). 16:9 `slice` 배율 ×0.80/×0.72/×0.50 — 백엔드와 일치. 「대안」에 9:16 기각 사유, 「못 덮는 범위」에
  화자 축소 확인 추가.
  메모: 게이트① 대화에서 메인 루프가 소유자에게 「SVG를 `slice`로 그리면 같은 동작」이라고 말한 것은 **장면이 가운데
  영역보다 넓을 때만** 참이었다 — 그 조건을 빠뜨린 진술이 그대로 계획에 들어왔다.
- **결함 B2(구현을 틀리게 함) — Framing이 언어별 캡션 영역 아래로 내려간다.** 계획대로면 카드가 「`Captions` 제목
  (`Caption styles are saved separately for each language.`) → 편집 언어 토글 → 편집기(맨 위 Framing)」가 되어 두 언어
  공통 설정이 언어 토글 아래에 놓인다. 해소: 슬롯에 `:262-319`(Framing + 캡션 영역 머리)를 순서 그대로 담아 왼쪽 칸
  안에서 「Framing → Captions」를 보존. prop 이름 `framingSlot` → `leadingControls`. 요구 ④는 그대로 충족.
- 위생 W1: 현재 동작 15행의 중첩 백틱 인용이 렌더에서 깨짐 → 이중 백틱. W2: 구조분해 스니펫 명시.
- 비차단 위험: `SampleScene`의 그라데이션 id가 고정 문자열(`caption-preview-scene-bg`) — 편집기 인스턴스가 페이지에
  하나뿐이라 지금은 충돌 없음. 두 번째 인스턴스가 생기면 `useId`로 바꿀 자리.
- 편집: 계획서 3절은 실제 `:262-319`를 +6칸 들여 생성(손으로 옮겨 적지 않음).

### 라운드 2 — 무편집 라운드 (소득 0)

편집된 계획서를 디스크에서 전문 재독하고 경로를 다시 돌렸다. 새 인용(`:297`·`:302`·`:317`·편집기 `:60`·CardContent
`:344` 종료) 일치. 경로 3: tsx 블록 9개 재추출·새 checkout에 적용 — before 전부 1회 일치, 옮긴 `:262-319` 58줄
들여쓰기 외 동일. 경로 2: `tsc` exit 0(하니스 파일 제거 후) · ESLint exit 0 · FSD 통과 · 198/49/0. 경로 8: 3케이스
구조 단언 전부 참, 왼쪽 칸 슬롯 < Preset, SVG `viewBox 0 0 320 180`. 스크린샷: 화자가 10%·25%에서 줄고 25%에 좌우
패널 노출, 데스크톱 왼쪽 칸 Framing → Captions → Editing → Preset, 모바일은 미리보기 맨 위·그 아래 Framing.
트리 검산: `git status`상 이 라운드들의 변경은 `docs/plans/FEAT-60.md`뿐, area 세 파일은 HEAD와 동일(빈 diff).

자기 라운드가 무소득이 됐으므로 `plan-verifier` 독립 무편집 패스를 디스패치한다.

### 독립 패스 — plan-verifier 1사이클 (결함 0)

브리핑은 계약 셋(항목ID·계획서 경로·필수 경로 1·2·3·4·8)만. 첫 보고는 결함 0이었지만 **경로 2의 eslint 측면을
「실행하지 못한 경로」로 유보**했다 — 저장소 밖 스크래치패드 파일을 eslint가 "outside of base path"로 거부했고, 저장소
트리에는 쓸 수 없어서다. 정의상 미실행 경로가 있는 보고는 무소득이 아니므로 판정에 쓰지 않았다.

보충: 메인 루프가 스크래치패드 worktree를 HEAD `9f0dc71`의 깨끗한 checkout으로 되돌려(`git status` 공백, `@repo/db`
자기 해석, `tsc` exit 0) **경로만** 제공하고 같은 에이전트에게 유보 경로를 마저 실행하게 했다(결함·초점 정보 없음).
보충 결과: 추출 스케치를 그 checkout에 적용 → eslint 세 파일 0 problems, 음성 시험(`any` 프로브 → `no-explicit-any`·
`no-unsafe-return` 검출, exit 1)으로 타입인지 lint가 실제로 도는 것 확인, `tsc` exit 0, FSD 통과. 경로 1·3·4·8은 첫
보고에서 결함 0(경로 1에서 `:114-118`이 실제 115-117의 세 줄을 감싸는 서술적 범위임을 비결함으로 기록).
미실행 경로 없음 → **무편집 무소득 1사이클 = 클린 패스.**

트리 검산(보고가 아니라 직접): area 세 파일 HEAD와 빈 diff, 메인 트리 `docs/` 변경은 다른 세션 untracked 둘뿐,
worktree `git status` 공백. 이어서 worktree의 junction 451개를 `rmdir`(비재귀)로 먼저 끊고 `git worktree remove` —
메인 `node_modules`·`packages/db` 무사 확인. `git worktree list`의 다른 항목(wt36·47·48·49·50·57)은 다른 세션 것이라
건드리지 않았다.

## 게이트② (2026-10-13)

소유자가 「구현 승인」으로 게이트②를 열었다. 계획서는 클린 패스본(`9f0dc71` 시점) 그대로다. 계획서에 게이트② 판단 사항은
없다. 소유자에게 보낸 검증용 렌더 두 장(데스크톱 0·10·14·25%, 모바일)에 대한 수정 지시도 없었다 — 계획서대로 간다.
