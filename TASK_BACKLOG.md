# TASK_BACKLOG

> 최초 부트스트랩: README.md의 Known Issues / Credit System 항목을 옮겨 담음.
> PM 에이전트는 이 파일과 PROJECT_BOARD.md만 읽고 우선순위를 판단한다.
> 보드에 올라가는 것만으로는 제거하지 않는다. 담당 에이전트가 보드에 `status: 완료`로 기록한 시점에, 그 에이전트가 여기서 해당 항목을 제거한다.
> `area`는 실제 코드 경로여야 한다. PM은 코드를 읽지 않으므로 이 값을 그대로 보드에 옮긴다 — 여기가 틀리면 보드도 틀린다.

## Backend / Pipeline

- [ ] **BUG-02**: 한국어 번역 API 실패 시 영어로 조용히 폴백됨 (사용자에게 알림 없음)
  - area: apps/backend
  - source: README Known Issues

- [ ] **BUG-03**: S3 업로드 실패에 대한 에러 핸들링 부재
  - area: apps/backend
  - source: README Known Issues

- [ ] **BUG-04**: 임시 디렉토리 정리가 파이프라인 성공/실패 여부와 무관하게 항상 실행됨
  - area: apps/backend
  - source: README Known Issues

## Credit / Billing

- [ ] **FEAT-01**: Credit System 마무리 (현재 개발 중 상태)
  - area: apps/web/src/fsd/features/billing + apps/web/src/fsd/entities/user + apps/web/src/inngest
  - source: README "Currently in Development"

## Web / 클립 검토

- [ ] **FEAT-05**: 클립 검토 프리뷰에 캡션 스타일 실시간 오버레이 — 9:16 스테이지 + 전사 동기 자막
  - area: apps/web/src/fsd/widgets/clip-draft-review + apps/web/src/fsd/shared/config/constants.ts
  - source: 사용자 요구 (2026-08-15). 관측: 카드의 Preview는 원본 16:9 영상의 재생 위치만 옮기고 끝에서 멈춘다(`widgets/clip-draft-review/ui/index.tsx:201-208`) — 자막이 없다. 캡션 스타일은 영상과 분리된 정적 박스에서만 확인된다(`CaptionStyleEditor.tsx:298-319`: 180×320 그라디언트에 구간 첫 몇 단어를 한 줄로 정적 렌더). 즉 크레딧을 쓰기 직전까지 "이 스타일이 실제 영상 위에서 어떻게 보이는지"를 볼 수 없다. 요구: 새 영상을 렌더하지 않고(백엔드 호출·S3 쓰기·크레딧 소모 없음) 원본 영상 위에 DOM 오버레이로 설정한 캡션을 재생과 동기해 얹는다.
  - **가능한 근거** (이 셋이 무너지면 계획을 다시 짜야 한다)
    - 단어 단위 전사(`start`/`end`)를 클라이언트가 이미 보유한다 — `model/use-clip-draft-review.ts:61-80`
    - 백엔드 세로 크롭은 "높이를 1920에 맞춘 뒤 **가로만** 잘라내기"다(`apps/backend/main.py:245-252`). 위아래가 안 잘리므로 자막의 세로 좌표는 원본 높이와 1:1로 대응한다 — CSS로 그대로 재현된다
    - 자막 묶음 규칙이 결정적이다 — `main.py:291-324`
  - **1단계 — 캡션 스타일 다이얼로그** (가치의 대부분이 여기 있다. 스테이지·좌표·큐·폰트가 전부 여기서 만들어진다)
    - `CaptionStyleEditor`의 정적 박스를 9:16 실영상 스테이지로 교체. muted + 구간 루프. 슬라이더를 움직이면 실제 영상 위에서 즉시 바뀐다
    - 스테이지 기하: `aspect-ratio: 9/16` + `overflow:hidden`, `<video>`는 `height:100%; width:auto` 중앙 정렬 = 백엔드 crop 모드와 동일. canvas·프레임 루프 불필요
    - 좌표는 PlayResY 1920 기준 단일 스케일로 환산한다. 기존 `previewScale` 방식(`CaptionStyleEditor.tsx:90-95`)을 그대로 써도 된다
    - 세로 위치: `top`=marginv 200, `bottom`=marginv 260, `middle`=정중앙(ASS는 alignment 5에서 MarginV를 무시한다) — `main.py:112-122, 168`. **이 숫자들이 웹 `CAPTION_STYLE_OPTIONS`에 없다.** 추가해야 하고, 지금 에디터의 `pt-6`/`pb-6`는 실제 값이 아닌 임의 근사다
    - 좌우 인셋: marginl/r 44(EN) / 48(KR) ÷ 1080 = 스테이지 폭의 4.07% / 4.44% — `main.py:351-352, 555-556`. 이 값이 줄바꿈 폭을 결정한다
    - 자간: `spacing` 1.8(EN) / 1.2(KR) — `main.py:354, 558`. CSS `letter-spacing`으로 환산. 줄바꿈에 영향하므로 빠뜨리면 안 된다
    - 그림자: `borderstyle=1`이라 `backcolor`는 박스가 아니라 그림자색이고, `shadow=6.5` 오프셋에 알파 210(= 거의 투명) — `main.py:348-349, 552-553`. 현재 에디터의 `0 1px 4px rgba(0,0,0,0.9)`는 실제보다 훨씬 진하다
    - 큐 생성: `main.py:291-324`를 이식한 순수 함수 + `.test.mjs`(저장소가 `caption-presets`·`selection-budget`에 하는 방식). 규칙 — maxWords개씩 순차로 끊고, 표시 구간은 [첫 단어 start, 마지막 단어 end], 묶음 사이 빈틈에는 아무것도 표시하지 않는다
    - 동기화는 `requestAnimationFrame`. `timeupdate`는 약 4Hz라 1.5초짜리 큐에서 지연이 눈에 보인다(기존 프리뷰 종료 오버슛과 같은 원인 — `ui/index.tsx:210-211`)
    - 폰트: Anton(EN) / Noto Sans KR(KR) — `main.py:339, 545`. **폰트가 다르면 줄바꿈이 달라져 위 좌표 정확도가 통째로 무의미해진다.** 단 Noto Sans KR 한국어 서브셋이 무거우므로 대시보드 상시 로드가 아니라 다이얼로그를 열 때 동적 로드한다(첫 프레임 폰트 스왑 1회는 감수)
  - **2단계 — 왼쪽 sticky 패널** (사용자가 원래 지목한 지점. 1단계 컴포넌트를 재사용한다)
    - Preview 버튼이 구간 재생 + 자막 오버레이로 동작
    - **9:16 ⇄ 전체 프레임 토글을 둔다. 크롭 고정 금지** — 카드 Preview의 과제는 "이 순간이 쓸 만한가"인데, 중앙 고정 크롭은 2인 대화에서 두 사람 사이 벽만 보여줄 수 있다(실제 클립에는 화자가 잡히는데 프리뷰에서만 아무도 없는 상태). 다이얼로그는 9:16 고정
    - 부수 효과: 360px 컬럼 하단이 통째로 비는 문제(`ui/index.tsx:375-384` 주석이 길게 변명하는 그것)가 9:16(360×640)이면 자연 해소된다
  - **맞출 수 없는 것 — 프리뷰 라벨에 명시할 것** (현재 라벨 `ui/index.tsx:406-409`를 교체)
    - 좌우 프레이밍: 화자 추적(TalkNet)은 클립을 자른 뒤 GPU에서 계산된다(`main.py:719-747`). 검토 시점에 존재하지 않고, 미리 계산하면 "안 고른 후보에 GPU를 쓰지 않는다"는 검토 게이트의 목적이 무너진다. 구간이 편집되면 계산값도 무효가 된다
    - 한국어 문구: 최종 한글 자막은 렌더 시점에 Gemini가 영어 전사를 번역해 만든다(`main.py:453, 528-531`). 클라이언트에는 영어 전사뿐이므로 영어 원문으로 보여주고 "번역 전"임을 표기한다 — 스타일·크기·위치 판단에는 지장이 없다
    - `resize` 모드(발화자 미검출 시 블러 배경 + 레터박스, `main.py:224-243`)는 재현하지 않는다. 예외 구간이고 검토 시점에 판정할 방법이 없다
    - 외곽선: ASS는 글리프 바깥, CSS stroke는 글리프 중앙 기준이라 근사다(기존 주석과 동일)
  - **제약**
    - 백엔드 무변경. 새 영상 렌더·S3 쓰기·크레딧 소모 금지
    - canvas·libass-wasm·ffmpeg.wasm·브라우저 얼굴 검출 도입 금지. 단 **큐 생성 로직을 렌더러와 분리**해서, CSS 근사가 실제로 오해를 부를 때 렌더러만 libass-wasm으로 교체할 수 있게 남긴다
    - 카드마다 `<video>`를 두지 않는다 — 동시 재생은 최대 2개(패널 1 + 다이얼로그 1)
    - 저장 경로 변경 금지: 스타일은 지금처럼 다이얼로그 Apply만 저장한다(`ClipDraftCard.tsx:112-114, 226-235`의 경합 회피 근거 유지)
  - out of scope: 캡션 스타일을 클립별로 두는 데이터 모델 자체의 재검토(`applyStyleToAll`이 이미 있어 대부분 한 번 정하고 끝일 가능성). 별개 항목으로 다룬다

## Admin / 파이프라인

- [ ] **FEAT-08**: `/pipeline` 결재함 게이트 버튼 — 원격 게이트 개방 (승인대기→계획지시, 검토대기→구현승인)
  - area: apps/admin/src/pipeline + apps/admin/src/ui
  - source: 사용자 요구 (2026-08-16). 관측: 결재함은 승인대기·검토대기 항목을 "결재" 라벨로 보여주지만 승인 수단이 없다 — 게이트 전이는 대시보드 밖(Claude 세션에 지시하거나 보드 파일 직접 수정)에서만 가능하다. FEAT-03의 의도된 잠금("원격 게이트 잠김")이었으나, 소유자가 실사용에서 마찰을 확인하고 개방을 결정했다(FEAT-01 13일 대기를 보다가).
  - **불변식 논거**: "게이트는 사용자만 연다"는 **누가**의 제약이지 **어디서**의 제약이 아니다. admin은 3중 인가(`ADMIN_EMAILS` 화이트리스트 — `auth/config.ts` signIn·`config.edge.ts` authorized·`guard.ts` requireAdmin)로 "로그인 세션 = 소유자"를 보장하므로, 인증된 대시보드 버튼은 불변식을 깨지 않는다. 이슈 #87 코멘트 채널의 게이트 거절(루틴 지침 "원격 게이트 전이는 잠겨 있다")은 **그대로 유지한다** — 새 경로는 이슈 경유가 아니라 GitHub contents API로 `PROJECT_BOARD.md`의 해당 항목 status 줄을 직접 고쳐 dev에 커밋하는 서버 액션이다.
  - **요구**
    - 결재함 카드에 전이 버튼: 승인대기 항목 → [계획지시], 검토대기 항목 → [구현승인]. `requireAdmin()` 뒤 서버 액션.
    - 전이 화이트리스트: 위 두 전이만 허용(순수 함수 + 테스트). 임의 status·임의 텍스트가 커밋될 수 있는 구조 금지 — 명령 화이트리스트(`commands.ts`)와 같은 원칙.
    - 스테일 가드: 화면이 읽었던 status와 커밋 직전 원격 status가 다르면 거부 + 실패 토스트(잃어버린 갱신 방지). 항목 못 찾음·형식 불일치도 거부 — 조용한 실패 금지.
    - `board.ts` 파서가 읽는 형식 그대로 status 줄만 바꾼다(파서 왕복 테스트).
    - 커밋 메시지에 대시보드 경유임을 남긴다(예: `docs(board): open FEAT-XX for planning via dashboard gate`).
  - **성격 변경 명시**: admin의 두 번째 외부 쓰기 경로(저장소 콘텐츠 쓰기)가 생긴다 — `apps/admin/CLAUDE.md`의 "외부 쓰기는 하나뿐" 주장 갱신 필요, PAT 권한도 Issues RW에 **Contents RW 추가** 필요(권한 확대는 계획서에서 명시 결정·사용자 재발급).
  - 선택 확장(게이트에서 결정): 전이 성공 직후 `pipeline-run` 코멘트 자동 게시 — 결재 탭 한 번으로 원격 세션 실행까지 이어진다.

## 비고

- 위 항목의 우선순위는 아직 정해지지 않음 — PM 에이전트가 매일 이 목록에서 오늘 처리할 1~2개를 골라 PROJECT_BOARD.md에 "승인대기"로 기록한다.
- 새 이슈가 생기면 이 파일 하단에 추가한다 (형식: ID, 설명, area, source).
- `source`를 쓸 때는 **관측과 진단을 분리한다.** 무엇을 봤는지(관측)와 왜 그렇다고 생각하는지(진단)를 한 문장에 섞지 않고, 진단은 추정임을 표시한다. FEAT-02가 실제로 이렇게 틀렸다 — 관측("10분 소스에 4개 요청 시 적게 생성됨")은 맞았는데 진단("유저가 무리한 개수를 골라서")이 틀렸고, 둘이 섞여 있어 담당 에이전트가 틀린 진단을 요구사항으로 받아 계획을 세 번 썼다. 반대로 BUG-06은 `파일:줄` 근거, 이미 맞는 곳, 수정 방향까지 적혀 있어 계획이 한 번에 끝났다.
