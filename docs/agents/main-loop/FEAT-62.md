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
