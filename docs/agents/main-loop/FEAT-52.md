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
