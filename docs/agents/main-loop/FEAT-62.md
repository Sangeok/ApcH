# FEAT-62 — 메인 루프 기록

## 게이트① (2026-10-14)

FEAT-61과 같은 대화·같은 게이트다(`docs/agents/main-loop/FEAT-61.md` 「게이트①」 — 요청, 가로 제외 근거, 공유 계약,
libass 실측). 소유자가 「둘 다 계획지시로 진행」으로 열었다(`61edf2c`). 담당: area가 `apps/web/src/fsd/features/caption-style`
이라 web-dev. 구현·배포는 FEAT-61 배포 뒤가 전제다(웹이 먼저 나가면 끌어 놓은 위치가 프리셋으로 조용히 렌더된다).

## 계획서 검증 (2026-10-14)

계획서 제출: web-dev(수정 12·신규 2, 열린 질문 없음). 위험 1(옛 저장값의 키 누락)은 읽기 경로 전수 확인 뒤 쓰기 한 곳에서
흡수하는 설계였다.

하니스: 스크래치패드의 **HEAD detached worktree**(`wt62`). FEAT-60 기록의 함정을 그대로 겪었다 — 루트 `node_modules`를 통째로
junction하자 `@repo/db`가 메인 트리 WIP `packages/db`로 풀려 HEAD 기준선 `tsc`가 card-news 이벤트 누락으로 깨졌다. 항목별
junction(449개) + `@repo/db`만 worktree 자기 `packages/db`로 재연결해 기준선 `tsc` exit 0 · `npm test` 198/198. 고칠 파일
12개는 전부 HEAD와 작업 트리가 같다(WIP와 겹치지 않음). `next lint`는 env 검증에서 먼저 죽어 `SKIP_ENV_VALIDATION=1`로 돌렸다.

### 필수 경로

| # | 경로 | 판정 | 이유 |
| --- | --- | --- | --- |
| 1 | 인용 전수 대조 | 필수 | 모든 항목. WIP 파일 인용(`inngest/functions.ts:272`·`app/dashboard/page.tsx:56-57`·`features/upload/api/index.ts:298-310`·untracked `claim-processing-attempt.ts:27-45`)은 메인 작업 트리에서 대조 |
| 2 | 스케치 추출·실행 | 필수 | TS/TSX 스케치 |
| 3 | before/after 기계 적용 | 필수 | 기존 파일 11개 수정 |
| 4 | 전칭 여집합 열거 | 필수 | 「zod 읽기 경로 0」·「`CAPTION_RENDER.MARGINV` 읽기는 둘뿐」·「편집기 소비자는 설정 하나」 |
| 5 | 돌연변이 | 필수 | 지오메트리 순수 함수 신설·`getPreviewVerticalInset` 변경 |
| 6 | 실제 사건 재생 | 제외 | 외부 신호 해석 없음. 옛 저장값 모양(7필드)은 경로 9에서 zod로 직접 통과시켰다 |
| 7 | 음성 시험 | 필수 | FSD 경계 검사·저장 정규화에 기댄다 |
| 8 | 실물 렌더 | 필수 | 화면 변경 |
| 9 | 구조적 아티팩트 | 필수 | zod 스키마 필드 추가 |

### 라운드 1 — 편집 라운드 (구현 영향 6 + 위생 2)

- 경로 3: 계획서 블록을 그대로 적용 — 정확한 before가 있는 조각은 전부 1회 일치. `CaptionPreviewPlayer` 본문은 부분 스케치라
  손 조립이 필요했다(그 사실이 기록 대상).
- **B1 — `EMPTY_STYLE` 누락(TS2741).** 「고칠 파일」에 없었다(백로그 `source` ③은 지목). `CaptionStyle` 리터럴 전수
  (`uppercase:`를 가진 TS 객체) 열거로 남은 것은 프리셋(타입 `Omit` 갱신으로 해결)뿐임을 확인.
- **B2 — 저장 정규화가 컴파일되지 않는다(TS2783).** `{ marginV: null, ...value }`는 `value: CaptionStyle`에 `marginV`가
  필수라 TS가 거부한다. 해소: `{ ...value, marginV: value.marginV ?? null }`. 옛 7필드 실모양을 zod에 직접 넣어 정규화 있음
  → 통과(`marginV: null`) · 없음 → 거부, 범위 0·960 허용 · 961·−1·12.5·true 거부를 확인.
- **B3 — 돌연변이 17마리 중 6마리 생존(경로 5).** `??`→`||` 다섯(marginV 0 → 프리셋, 0은 가장자리에 붙이면 나오는 값),
  그리고 유효 스타일이 marginV를 항상 null로 내는 구현(저장한 위치가 새로고침 뒤 프리셋으로 돌아가도 전 케이스 통과).
  해소: 명세에 0 케이스(inset·center 각 top/bottom)와 저장값 300·0 패스스루를 추가.
- **B4 — 미리보기 줄 상자 ≠ libass 줄 상자(경로 8).** 미리보기 DOM 복제본을 headless Chrome 6배(1080×1920)로, 같은 값을
  로컬 libass로 렌더해 흰 글자 경계 상자 비교: `leading-tight`로 한 줄 top −26 · bottom +8 ASS px, 두 줄 top 아래끝 −67.
  line-height를 fontsize × scale(libass 줄 상자)로 바꾸면 한 줄 위·아래 모두 −9, 두 줄 −9/−16. 남는 −9는 Chrome의 hhea
  메트릭(2409) vs libass win(2876) — 0.114em로 계산값과 일치. 해소: `getPreviewLineHeightPx` 신설, `<p>`에 적용.
- **B5 — 슬라이더 값 결함(경로 8, `renderToStaticMarkup`).** `aria-valuenow = marginV`는 프리셋(null)에서 빠져
  `role="slider"`가 값 없이 렌더됐고, 같은 숫자가 top·bottom에서 반대 방향이다. 해소: `captionHeightPercent`(한 줄 블록
  중심이 아래에서 몇 %, 0~100) + `aria-valuetext`. 미리보기 중앙을 지나는 동안 값이 증가하지 않음을 테스트로 고정.
- **B6 — 설정 문구 교체가 뜻과 자리를 잃는다.** `:290` 「Captions keep their current position.」은 Framing 슬라이더의
  `aria-describedby` 설명이고 뜻(여백을 바꿔도 자막 불변, FEAT-58)이 여전히 참. 드래그 안내를 넣으면 화면 낭독기가 여백
  슬라이더에서 그걸 읽는다. 해소: 문구 보존, 안내는 Position 아래 한 줄(`sample`일 때).
- 위생: FEAT-61 전파 — 웹 주석 둘(`constants.ts:77`·`caption-preview.ts:106`)과 `MARGIN_V_RANGE`·스키마 머리 주석이
  `caption_position.py`를 가리키게. 잡은 지점 보정(드래그 시작 시 중심이 포인터로 튀는 것) 추가. 폴백을
  `getPreviewVerticalInset` 한 곳으로 모아 `verticalDropToCenterPx`가 위임하게 해 「대안」의 「소유자 하나」 주장을 참으로.
- 고친 스케치를 먼저 하니스에서 돌린 뒤 계획서에 옮겼다: `tsc` 0 · lint 0 · FSD 통과 · `npm test` 218/218 · 돌연변이
  적용 가능 19/19 사멸 · 렌더(프리셋에서도 `aria-valuenow`, line-height 20.33px).
- 후속 후보(계획 밖): 미리보기에 libass 자간(EN 1.8·KR 1.2)이 없어 한 줄 폭이 6% 좁다(782 vs 831) — `letter-spacing:
  0.3px`로 829 vs 831. 여러 줄 줄바꿈 방식 차이는 남는다. 인수 때 백로그 후보로 소유자에게 제시한다.

### 라운드 2 — 무편집 재적용·재독 (위생 1)

worktree를 HEAD로 되돌리고 **고친 계획서의 블록만으로** 다시 조립 — before 전부 1회 일치, `tsc` 0 · lint 0 · FSD 통과 ·
218/218 · 돌연변이 19/19(3마리는 폴백 이동으로 대상 코드 없음). 전문 재독에서 「22마리 전부 사멸」이 부정확(적용 가능 19)
→ 문장 수정. 전칭 재확인: `CaptionStyleEditor` 소비자 설정 1곳(나머지 언급은 주석), `CAPTION_RENDER.MARGINV` 읽기 둘.

트리 검산: `git status`상 변경은 계획서 둘과 dev 에이전트의 보드 전이뿐. 검토대기 전이 커밋 `26fb99a`. 독립 패스(경로
1·2·3·4·5·7·8·9) 디스패치.

비차단 위험(구현 단계): 작업 트리에 다른 세션의 card-news WIP가 있어 구현 시 `npm run check`가 그 코드까지 검사한다. 계획
검증은 HEAD worktree 기준으로 통과했다.

### 독립 패스 — plan-verifier 1사이클 (위생 1)

브리핑 계약 셋(경로 1·2·3·4·5·7·8·9) — 검증자가 위반 없음을 확인. 보고: **문서 위생 1** — 「현재 동작」 44행 「7필드 전부
`.nullable()`」의 여집합 `position`이 반례(`caption-style-schema.ts:14` 비-nullable enum, `constants.ts:118` 타입도 `| null`
없음). 구현 영향 0(구현자가 고치는 실제 스키마·타입이 그대로 보여 준다). 이 문장은 web-dev 원문이고 메인 루프 라운드가 놓쳤다.
나머지: 경로 2 추출 스케치 `tsc` 0(프로젝트와 같은 플래그), 경로 3 before 전부 바이트 일치 + 음성 컴파일 TS2741·TS2783 재현,
경로 4 전칭 다섯 중 넷 참·하나가 위 결함, 경로 5 돌연변이 18마리 전부 사멸, 경로 7 0 케이스를 빼면 effective `??`→`||`가
생존(장식 아님), 경로 8 프리셋에서도 `aria-valuenow`(top 86·middle 50)·`bottom:0` 보존·`lineHeight:20.333px`, 경로 9 zod
`safeParse`로 키 누락 → `invalid_type` 거부(정규화 근거 실증). 미실행 경로 없음.

해소: 44행을 「7필드이고 `position`을 뺀 6필드가 `.nullable()`」로 고치고 두 근거 줄을 내용과 함께 인용. 문서 위생만 나온
사이클이라 정지 규칙 계수에 넣지 않는다. 트리 검산(직접): 저장소 변경은 메인 루프 편집뿐 — 검증자가 본 `card-news-verification-
runtime.*` 미추적 파일은 세션 시작 때부터 있던 다른 세션의 WIP다. 2사이클 디스패치(같은 경로 목록).

### 독립 패스 — plan-verifier 2사이클 (결함 0)

브리핑 계약 셋(같은 목록) — 검증자가 위반 없음을 확인. 보고: 결함 0, 미실행 경로 없음.
- 경로 1: 모든 인용 내용 일치(고친 44행의 `:14`·`constants.ts:118` 포함).
- 경로 2: 추출 스케치를 프로젝트 tsconfig 미러로 `tsc --noEmit` EXIT 0, `satisfies z.ZodType<CaptionStyle>`가 marginV 추가 뒤에도 성립.
- 경로 3: 모든 before 앵커 바이트 일치, TS2741·TS2783 음성 컴파일 재현.
- 경로 4: 전칭 넷(MARGINV 읽기 둘·inset 소비자 둘·zod 읽기 0·`CaptionStyle` 리터럴은 EMPTY_STYLE과 프리셋 Omit뿐) 참.
- 경로 5: 명세 29검사 이식, 돌연변이 13종 전부 사멸(종전 생존자 `??`→`||` 포함).
- 경로 7: 무수정 `withPosition`이 새 스키마를 통과하지 못함(테스트 갱신이 장식 아님). 스키마 범위 제거는 계획의 어떤 테스트도 잡지 못하지만 outlineWidth 전례와 등가인 관행이라 결함 아님으로 판정.
- 경로 8: 프리셋 top `aria-valuenow="86"`·middle `"50"`, 비드래그는 슬라이더 속성 없음, line-height px 방출.
- 경로 9: zod 구조 파싱으로 0·960 통과 / 961·−1·10.5 거부, 옛 값 거부 → §7 정규화로 복구.

**무편집 무소득 1사이클 = 클린 패스.** 트리 검산(직접): 저장소 변경은 메인 루프의 계획서·기록 편집뿐, `caption-vertical-drag*` 미존재.
`apps/web/src/fsd/shared/config/product-copy.ts`의 diff(+6, card news 문구)는 2026-10-11 수정분이라 다른 세션의 WIP다.
하니스 worktree `wt62`는 junction을 먼저 끊고(비재귀) 제거했다.

## 게이트② 준비 — dev 작업 트리 정리 (2026-10-14)

FEAT-61 배포 뒤, 구현 검사에 card-news WIP가 섞이지 않게 정리할지 소유자에게 물었다(선택지: 브랜치로 옮김 · dev에 커밋 · 그대로).
조사 결과 `feat/card-news`에 이미 `72bde11 wip(card-news): Instagram 카드뉴스 구현 보존 — 미검토·배포 금지`(바탕 `b2b5504`)가 있었고,
작업 트리 WIP 158파일이 그 커밋과 **전부 내용 동일**(CRLF 무시, 파일별 바이트 대조 — 브랜치에만·트리에만 있는 파일 0)이었다. 마지막
수정 2026-10-11 20:37. 「미검토·배포 금지」라 dev 커밋은 배포 경로에 미검토 코드를 올린다 → 메인 루프가 「트리의 사본만 정리」를
권했고 소유자가 「진행해」로 승인했다.

- 실행: 첫 시도(`git restore` + `git clean`)는 자동 모드 분류기가 「되돌릴 수 없는 로컬 삭제」로 거부 → **되돌릴 수 있는 방법**으로
  바꿔 `git stash push -u -- . ':(exclude)nul'`. `stash@{0}`에 158파일(「card-news WIP 사본 — feat/card-news 72bde11과 동일…」).
  `nul`(Windows 예약 이름 찌꺼기, git이 담지 못함)만 미추적으로 남았다. `feat/card-news`는 `72bde11` 그대로.
- 기준선: 정리 직후 web `check`가 `.next/types`의 낡은 생성 타입(옛 card-news 라우트 참조, TS2307)으로 실패 → `.next`는 gitignore된
  빌드 산출물이라 `.next/types.stale-2026-10-14`로 이름만 바꿔 비켰다(다음 dev/build가 재생성). 그 뒤 web `check` EXIT 0 · `test` 198/198.

## 게이트② (2026-10-14)

소유자가 「구현 승인」으로 게이트②를 열었다. 전제였던 FEAT-61 배포는 같은 날 09:49 KST 완료·컨테이너 기동 확인(`ff558ea`). 계획서는
클린 패스본(`d19f814` 시점) 그대로다. 작업 트리는 위 정리로 깨끗하다(`nul`만 미추적).
