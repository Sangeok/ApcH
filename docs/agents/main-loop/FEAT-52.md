# FEAT-52 — 캡션 스타일을 검토 화면에서 제거하고 설정 전용으로 (메인 루프 기록)

## 게이트① (2026-09-17)

소유자 직접 발주 — 세션 지시 "둘 다 진행"(FEAT-55 등재 + FEAT-52 착수). 미결 0건을 확인하고
보드에 `계획지시`로 올려 커밋·푸시(`3819c48`) 후 `web-dev` 디스패치 — 계획서만, 코드 무수정.

브리핑에 함정 셋을 질문으로 넣었다(답은 주지 않았다): ⑥ `Default` 칩이 `null`을 내야 하는데
`emit`이 낼 수 없는 문제, ② `captionStyle` select 셋 중 디스패치가 읽는 몫과 검토 화면이 쓰던
몫의 경계, ④ 계측 이벤트를 지우기 전 `apps/admin`까지 포함한 소비자 여집합.

web-dev가 `docs/plans/FEAT-52.md`(453줄)를 쓰고 `검토대기`로 전이. `git status`로 직접 검산:
코드 파일 수정 0건(보드 자기 행 + 계획서 신규뿐).

## 필수 경로 확정

FEAT-51과 달리 **화면 변경과 계측 제거가 있어 경로 7·8이 새로 걸린다.**

| # | 경로 | 판정 | 근거 |
| --- | --- | --- | --- |
| 1 | 인용 전수 대조 | **채택** | 모든 항목. 「현재 동작」이 인용 밀도가 매우 높고 교차 워크스페이스(`packages/db`) 인용까지 있다 |
| 2 | 스케치 추출·실행 | **채택** | TS/TSX 코드 블록 18개. 순수 함수 하나는 그대로 실행 가능하고, JSX는 식별자 가용성으로 받는다 |
| 3 | before/after 기계 적용 | **채택** | 수정 23파일. 명시적 before/after 블록 다수 |
| 4 | 전칭 여집합 열거 | **채택** | 전칭 주장 다수 — "소비자는 없다", "유일한 소비자", "참조 0으로 만든다", "여기 적히지 않은 파일은 안 고친다" |
| 5 | 돌연변이 검사 | **채택** | 순수 함수 `captionStyleLabel` **신설** + 3케이스 명세 |
| 6 | 실제 사건 재생 | 비해당 | 외부 신호(웹훅·API 응답) 해석이 없다 |
| 7 | 음성 시험 | **채택** | 계측 화이트리스트(`metadata.ts`의 `satisfies Record<AnalyticsEventName>`)에 **기댄다** — 죽은 키를 남기는 결정의 근거가 그 제약이다. FSD 경계 검사도 게이트에 든다 |
| 8 | 실물 렌더 | **채택** | 화면 변경이 대량이다 — `Default` 칩 신설·미리보기 언어 토글·카드 문구·업로드 폼 한 줄·다이얼로그 소멸 |
| 9 | 구조적 아티팩트 검사 | 비해당 | schema·config·생성 파일 변경이 없다(컬럼 drop은 FEAT-53) |

채택 7 / 비해당 2.

## 라운드 1 (메인 루프, 편집) — 2026-09-17

하니스는 스크래치패드(`f52_p1.py`·`f52_p1b.py`·`f52_p3.py`·`f52_mut.mjs`·`f52_mut2.mjs`).

**경로 1 — 인용 전수 대조.** 자동 추출로 해석된 19건 + 파일명만 적힌 9종을 인덱스로 유일 해석해
전부 내용 대조. **불일치 0.** 확인된 것 중: `apps/web/package.json:10`이 실제로
`"check": "npm run verify:fsd:test && npm run verify:fsd && next lint && tsc --noEmit"`이고,
`caption-presets.test.mjs:7`이 `captionStyleSchema`를 `clip-review/model/schemas` 경로로
임포트한다(계획서가 그 재수출을 유지하는 근거) — 둘 다 계획서 주장 그대로다.

**경로 3 — before/after 기계 적용.** 코드 블록 18개를 추출해 before 성격 6개가 트리에
**바이트 그대로** 존재함을 확인(`CaptionStyleEditor` 2 · `functions.ts` 1 · `clip-draft-api` 1 ·
`settings` 1 · `metadata` 1). after/신규 12개는 트리에 부재(정상).

**경로 4 — 전칭 여집합 열거.** ① 계측 이벤트 소스 소비자 전수(빌드 산출물 제외): `metadata.ts`
키·주석, `metadata.test.mjs` 주석, 발신부 `use-clip-draft-review.ts:109`, `packages/db`의 이름
— **`apps/admin` 0건**, `ANALYTICS_FUNNELS.review`도 이 이벤트를 안 쓴다. ② `RenderCaptionStyle`
소비자 전수: `client.ts` 정의·사용 **그리고 `constants.ts:113`의 교차 파일 주석** — 계획서가
놓친 것이다(아래 소득 3). ③ `clip-draft/api`의 `Prisma.` 용례 전수: 제거 대상 둘(`:85`
`JsonNull`·`:152` `InputJsonValue`)을 빼면 남는 넷이 전부 타입 위치(`TransactionClient`·
`ClipDraftCreateManyInput`)라 **`import type { Prisma }` 전환이 성립한다** — 계획서 주장 확인.
④ `/dashboard/settings` 라우트 실재(`app/dashboard/settings/page.tsx`)하고 `<Link>` 전례가
`widgets/dashboard-header/ui/index.tsx:77`에 있다.

**경로 4(수치) — 게이트 기준선 실측.** 테스트 파일 26개, 삭제 대상 `caption-style-from-json.test.mjs`
7케이스, `caption-style-request.test.mjs` 3케이스, `npm test -w apps/web` →
**`tests 183 / suites 42 / pass 183 / fail 0`**. 계획서 산술(183 − 7 − 1 + 3 = 178, suites
42 − 1 + 1 = 42, 파일 25) **전부 일치**.

**경로 2 — 스케치 추출·실행 + 식별자 가용성.** 코드 블록을 추출해 각 스케치가 쓰는 식별자가
대상 파일에 실재하는지 대조. `settings`(`SUPPORTED_LANGUAGES`·`Button`)·`caption-presets`
(`CAPTION_STYLE_PRESETS`·`matchPresetId`)·`CaptionStyleEditor`(`EMPTY_STYLE`)는 OK.
**`UploadPodcast.tsx`는 `Link`·`captionStyleLabel`·`CaptionStyle` 셋 다 없다**(아래 소득 2).

**경로 5 — 돌연변이 검사.** 계획서 「테스트」의 3케이스를 실행 가능하게 옮겨 제안 구현에 돌려
기준선(3/3 통과)을 잡고 돌연변이 7종을 심었다 → **2마리 생존**(아래 소득 1).

**경로 7 — 음성 시험.** 계획서 「범위 밖 의존」의 핵심 주장("`metadata.ts`에서 키를 지우면
`satisfies Record`가 깨진다")을 **실제로 깨뜨려** 확인했다. 그 줄을 지우고
`npx tsc --noEmit` → `metadata.ts(64,12): error TS1360 ... Property
'clip_review_caption_style_edited' is missing ... but required in type 'Record<...>'` +
`(88,23): error TS7053`. 파일은 `git checkout --`로 복원했고 `git status`로 무변경을 확인했다.
**주장이 추정이 아니라 실증이 됐다.**

**경로 8 — 실물 렌더.** 이 라운드에서는 돌리지 않았다. 변경 컴포넌트가 아직 존재하지 않고,
계획서 스케치는 JSX 조각이라 렌더 대상이 성립하려면 구현본이 필요하다. 대신 `Default` 칩의
점등 조건(`matchPresetId(null) === "default"`)을 `caption-presets.ts:14`에서 직접 확인했다.
**구현 인수 때 실물 렌더로 받는다** — 이 사실을 여기 남긴다.

### 라운드 1 소득 — 구현 영향 1 / 문서 위생 2

1. **【구현 영향】 `captionStyleLabel`에 잉여 분기가 있었다.** 처음 안은
   `if (match === "custom") return "Custom";`을 두었는데, 3케이스에 돌연변이 7종을 심으니
   **2마리가 살아남았다** — (a) 그 분기를 지워도 뒤의 `?? "Custom"`이 같은 값을 내고,
   (b) 그래서 `??` 폴백이 도달 불가라 `?? "Default"`로 바꿔도 아무 케이스가 안 죽었다.
   분기를 빼면 `custom`이 `??`로 흘러 폴백이 도달 가능해지고 같은 3케이스로 **7/7 사멸·생존 0**이
   된다. 명세를 늘리지 않고 구현의 잉여를 없앤 쪽이라 스케치를 단순화안으로 바꾸고 근거를 실었다.
2. **【위생】 `UploadPodcast.tsx` 행이 추가 임포트를 말하지 않았다.** 스케치가 `<Link>`·
   `captionStyleLabel`·`CaptionStyle`을 쓰는데 그 파일엔 셋 다 없다. 계획서의 다른 행은
   **제거할 임포트를 전부 열거**하는데(`ClipDraftCard`의 미사용 둘, `types.ts`의 `UploadedFile`,
   `clip-draft-api`의 `import type` 전환) 추가할 임포트만 빠졌다 — 자기 관용과 어긋난다.
   셋을 행에 명시하고 `<Link>`의 집안 전례도 적었다.
3. **【위생】 `constants.ts:113`이 삭제될 타입을 가리킨다.** `CaptionStyle` 독주석의
   `* 렌더 이벤트 페이로드(src/inngest/client.ts의 RenderCaptionStyle),`가 이 항목이 지우는
   타입을 가리킨다. `constants.ts`가 「고칠 파일」에 없어 그대로 두면 계약 주석이 없는 타입을
   가리키는 교차 파일 드리프트가 남는다 — FEAT-44가 잡으려는 바로 그 부류다. 주석 한 줄만
   고치는 행을 추가했다.

음성 시험 실증(경로 7)과 돌연변이 수치(경로 5)도 계획서 본문에 증거로 실었다 — 다음 검증자가
같은 지점에서 다시 멈추지 않게 한다(FEAT-51에서 값 집합을 안 적어 독립 패스가 수치를 재현 못 한
전례).

## 라운드 2 (메인 루프, 무편집) — 2026-09-17

라운드 1의 편집이 준비도를 초기화하므로 무편집 재대조를 돌렸다.

- 내가 주입한 인용 둘을 검산: `constants.ts:113`·`dashboard-header/ui/index.tsx:77` 둘 다
  내용까지 정확히 일치.
- **계획서에서 다시 추출한** `captionStyleLabel` 스케치가 단순화안(`custom` 분기 없음)임을
  확인 — 내가 손으로 친 버전이 아니라 문서에 실제로 들어간 것으로 검증했다.
- 경로 1·3 전체 재실행: before 블록 6개 BYTE-MATCH 유지, 인용 불일치 0.

**라운드 2 소득 0 — 무편집 무소득.** 보드 안내 블록대로 이는 판정이 아니라 **디스패치 자격**이다.
`plan-verifier`에 독립 무편집 패스를 요청한다. FEAT-51에서 내가 브리핑 계약(항목ID·계획서 경로·
필수 경로 목록, 그 셋뿐)을 어겨 한 사이클을 버렸으므로, 이번에는 그 셋만 보낸다.

## 독립 패스 (`plan-verifier`) — 2026-09-17 · **클린 패스**

브리핑은 계약대로 셋만 보냈고(항목ID·계획서 경로·필수 경로 목록), 검증자가 보고 첫머리에서
"계약 온전, 판정 자격 있음"을 확인했다. FEAT-51의 위반을 되풀이하지 않았다.

**결함 0건. 필수 7경로 전부 실행(실행하지 못한 경로 없음).**

독립적으로 재현·확장된 것:

- 경로 1 — 계획서 전 인용을 재독 대조, 낡은 줄번호·틀린 인용 0.
- 경로 2 — 순수 함수 스케치 둘(`captionStyleLabel`·`requestCaptionStyle`)을 바이트 추출해 실행.
- 경로 3 — before 블록 바이트 일치 확인. `persist-clip-drafts`의 `// ...` 축약이 **의도적
  외과 지시**임을 짚고 제거 대상 `:928`·`:948` 실측 일치로 받았다.
- 경로 4 — 내 여집합에 **하나를 더 했다**: `findUploadedFileReviewState`의 다른 호출자
  `upload/api:402`가 `captionStyle`이 아니라 `status`·`reviewAttempt`만 읽음을 실측해,
  그 select 제거가 안전함을 닫았다. 나는 소비자가 `clip-review/api:147` 하나임만 봤다.
- 경로 5 — 내 돌연변이 7종을 재현(**7/7 사멸**)하고 `requestCaptionStyle`에도 3종을 심어 전부
  사멸시켰다. 후자는 내가 안 한 것이다.
- 경로 7 — 음성 시험을 **격리 하니스로 다시 세워** 재현했다. 나는 실파일을 고쳤다가 복원했고,
  검증자는 스크래치패드에 `satisfies-keep.ts`/`satisfies-drop.ts`를 만들어 저장소 `tsc`로
  돌렸다 — 같은 `TS1360`을 얻으면서 트리를 아예 건드리지 않는 더 나은 방법이다.
- 경로 8 — **내가 못 돌린 경로를 돌렸다.** `renderToStaticMarkup`으로 변경 UI 조각 셋을 렌더:
  `value=null`이면 `Default` 칩이 활성이고 프리셋은 전부 outline, `value=bold-yellow`면
  Default가 outline·Bold Yellow가 활성 — **추가된 `Default` 칩이 프리셋의 활성 표시를 뺏지
  않음**을 실물로 확인했다. 미리보기 토글의 활성 분기와 업로드 폼 줄(`<a href="/dashboard/settings">`
  + 라벨 `"Default"`/`"Bold Yellow"`)도 렌더로 받았다.

**무수정 준수 — 직접 검산했다.** `git status --short`는 무관한 기존 2건뿐이고
`git diff --stat HEAD -- apps/web docs/plans packages`의 유일한 항목은 세션 시작 전부터
` M`이던 `apps/web/.claude/settings.local.json`(권한 한 줄 추가)이다 — 검증자 것이 아니다.

### 판정

보드에 `검증: 클린 패스`를 기록한다. 카운트는 이 독립 패스 하나(FEAT-51과 달리 재디스패치가
없었다). 앞선 메인 루프 라운드의 소득은 **구현 영향 1건 · 문서 위생 2건**이다.

정지 규칙에 걸리지 않는다. 카탈로그 갱신 규칙도 이번엔 신호를 내지 않는다 — 문서 위생만 나온
사이클이 이어지지 않았고(라운드 1에 구현 영향 1건), 경로 7·8을 새로 넣은 판단이 둘 다
소득으로 이어졌다(7은 범위 축소 주장의 실증, 8은 `Default` 칩이 프리셋 활성을 안 뺏는다는
확인). **경로 선정을 좁힐 이유가 없다.**

**다음은 게이트② — 소유자만 연다.**

## 인수 (2026-09-17)

인수 조건 다섯을 직접 재현했다.

① **변경 파일 ↔ 「고칠 파일」**: 삭제 3 + 수정 24 = 27, 표와 정확히 일치. 범위 밖 코드 0.
② **diff ↔ 구현 스케치**: 핵심 넷을 실물로 대조 — `captionStyleLabel`이 **단순화안 그대로**
   (`custom` 분기 없음, prettier 줄바꿈만 다름) · `requestCaptionStyle` 모듈이 스케치와 동일 ·
   `Default` 칩이 `onClick={() => onChange(null)}`로 `emit`을 거치지 않음 · `constants.ts`의
   `RenderCaptionStyle` 인용이 실제 참조로 교체됨.
③ **게이트 직접 재실행**: `npm test -w apps/web` → **`tests 178 / suites 42 / pass 178 / fail 0`**
   (계획 기대값 정확 일치) · `npm run check -w apps/web` **EXIT 0**(verify:fsd:test → verify:fsd
   "FSD boundary check passed" → next lint → tsc).
④ **백로그**: FEAT-52 항목 정의 0건, FEAT-53·54·55 보존.
⑤ **상세 기록**: `docs/agents/web-dev/FEAT-52.md` 94줄 실재, 보드 `결과`가 그것을 가리킨다.

### 인수에서 새로 나온 것 — 죽은 prop 하나

`npm run check`가 **새 경고 하나**를 냈다: `ClipDraftCard.tsx:54 'playUrl' is defined but never
used`. 다이얼로그가 미리보기 플레이어에 `playUrl`을 넘기던 유일한 소비자였는데, 계획서의
`ClipDraftCard` 행이 제거 목록에 `playUrl`을 넣지 않아 prop만 남았다. 죽은 사슬을 전수로 확인했다:
`ui/index.tsx:101`의 `readyPlayUrl` 산출 → `:454`의 `playUrl={readyPlayUrl}` 전달 →
`ClipDraftCard.tsx:38`(타입)·`:54`(구조분해). 위젯 본체 플레이어(`:403-414`)는 `playUrlState`를
직접 쓰므로 그쪽은 살아 있다. **네 줄짜리 잔재다.**

경고이지 오류가 아니라 게이트는 EXIT 0이고, 구현은 계획서를 정확히 따랐다(계획서가 놓친 것이다 —
내 검증 라운드도 놓쳤다. 나는 스케치가 **쓰는** 식별자만 대조했지, 삭제로 **죽는** 식별자는 열거하지
않았다). 인수를 막을 사유는 아니므로 **후속 항목의 후보로 사용자에게 제시**한다.

같은 성격의 잔재를 구현 보고가 함께 열거했다 — `use-clip-draft-review.ts`의 낡은 주석 3곳,
`features/clip-review/index.ts`의 `CaptionStyleInput` 재수출(소비자 0). 그리고 내가 갱신한
`constants.ts` 주석에도 "검토 UI가 전부 이 타입 하나를 참조한다"는 절이 남아 있는데, 검토 UI는
이제 `CaptionStyle`을 참조하지 않는다. 넷을 한 항목으로 묶는 게 맞다.

### 메인 루프 몫 둘

- **`apps/web/CLAUDE.md` 테스트 표 네 곳 갱신.** 구현 보고가 「범위 밖」으로 넘긴 것이다(web-dev는
  그 파일을 읽기 전용 지시 문서로 다룬다 — FEAT-51에서 `apps/backend/CLAUDE.md`를 같은 방식으로
  처리한 전례). ① 헤더 수치 `26개 파일/183개 테스트` → `25개/178개` ② `caption-presets` 행에
  `captionStyleLabel`과 **왜 `custom` 분기를 두면 안 되는지**(돌연변이 실측) 추가 ③
  `caption-style-request` 행을 뒤집힌 계약으로 재작성 — 이 행은 FEAT-41의 2026-09-14 결정을
  그대로 적고 있었는데 그 결정이 이번에 죽었다 ④ `caption-style-from-json` 행 제거(파일 삭제).
- **`docs/release-checks.md`**: FEAT-52 절 신설(육안 6줄, `〔auto〕` 태그 없음 — 전부 로그인 뒤
  화면이거나 렌더 산출물). 그리고 **FEAT-50 절의 다섯 줄을 전부 `대체(FEAT-52)`로 마감**했다 —
  그 다이얼로그가 통째로 사라져 확인할 화면이 없다. 네 번째 줄(커스텀 클립이 형제와 같은 스타일)만
  결과가 살아남되 경로가 드래프트 시드에서 백엔드 요청 스냅샷 폴백으로 바뀌었고, 그 확인은 FEAT-52
  절의 실렌더 줄이 받는다. **FEAT-50은 프로덕션에 배포되지 못한 채 대체됐다.**
