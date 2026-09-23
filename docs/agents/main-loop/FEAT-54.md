# FEAT-54 — 메인 루프 기록

## 필수 경로 확정 (2026-09-23)

처음 **여덟**을 잡았다가 라운드 1 중에 **여섯**으로 좁혔다. 좁힌 이유를 함께 남긴다.

| # | 경로 | 판정 | 이유 |
| --- | --- | --- | --- |
| 1 | 인용 전수 대조 | **채택** | 모든 항목 |
| 2 | 스케치 추출·실행 | **채택** | 스케치에 prisma·sql·ts·tsx 블록 다수 |
| 3 | before/after 기계 적용 | **채택** | 기존 파일 수정 16지점 |
| 4 | 전칭 여집합 열거 | **채택** | 「전수 grep」·「하류 무변경」·「여집합이 빠짐없이」·실측 수치 셋 |
| 5 | 돌연변이 검사 | **채택** | 마이그레이션 `WHERE` 둘이 **판정 로직**이다 — 언어 도메인을 분할한다 |
| 9 | 구조적 아티팩트 검사 | **채택** | `schema.prisma` + `migration.sql` + 생성 클라이언트. **카탈로그 9번의 첫 실증이다**(그 행은 「이 저장소의 실증 사례 대기」로 비어 있었다) |
| 7 | 음성 시험 | **비채택으로 내림** | 계획이 「`tsc`가 진짜 게이트」라고 주장하는데, **그 주장은 구현 전에 정적으로 셀 수 있다**(아래 라운드 1에서 9곳을 셌다). 「규칙을 빼면 검사가 깨지는가」를 따로 돌릴 대상이 없다 |
| 8 | 실물 렌더 | **비채택으로 내림** | 화면이 바뀌지만 **분리 렌더할 조각이 없다** — 변경이 상태 배선(`captionStyles[editKey]`·prop 모양)이라 컴포넌트 트리 전체가 필요하다. FEAT-56은 JSX 삼항이라 조각을 뗄 수 있었다. 이 항목의 화면 결과는 **배포 확인 원장의 줄**이지 계획서가 판정할 아티팩트가 아니다 |
| 6 | 실제 사건 재생 | **비채택** | 외부 신호 해석 없음 |

## 라운드 1 — 여섯 경로 (소득 3건)

**경로 1.** 계획서의 `파일:줄` 인용 **19건**을 기계 대조 — **불일치 0**.

**경로 4.** `defaultCaptionStyle` 전역 **18건**을 세어 계획서 「현재 동작」 표(15행)와 대조.
16건은 표의 행에 귀속되는데 **둘이 남았다** — `schema.prisma:61`(컬럼 정의 자체, 산문에 있음)과
**`schema.prisma:93`**. 후자가 결함이다(아래).
하류 주장도 확인했다: `UploadedFile.captionStyle` 소비자는 `inngest/functions.ts`의
`context.captionStyle` 하나뿐 — **단일 값 그대로라 이 항목이 안 건드린다**가 참이다.

**경로 9 — 카탈로그 9번의 첫 실증.** 마이그레이션 SQL의 두 `WHERE`를 **실 DB에 읽기 전용으로
리허설**했다(`UPDATE`를 돌리지 않고 같은 술어로 계수):

```
styled=0  → KR=0  EN=0  중복=0  누락=0
defaultLanguage 분포: [{ null, 7 }]
```

**중복 0 · 누락 0** — 두 술어가 완전 분할이다. 7명 전원 `defaultLanguage = null`이라 (값이 있었다면)
전부 영어 쪽으로 갔을 것이다.

**경로 5.** 그 분할을 합성 도메인(`null`·`Korean`·`English`·`Japanese`·`""` × styled 2)에
돌연변이 4종으로 시험했다.

| 돌연변이 | 결과 |
| --- | --- |
| M1 EN을 `= 'English'`로 | **사멸** (누락 3) |
| M2 EN에서 `IS NULL` 빼기 | **사멸** (누락 1) |
| M3 KR을 `!= 'Korean'`으로 뒤집기 | **사멸** (중복 4 · 누락 1) |
| M4 EN에서 `styled` 가드 제거 | 생존 |

**M4는 등가 돌연변이다.** 가드를 빼면 `defaultCaptionStyle IS NULL`인 행에도
`SET ... = NULL`이 돌지만 **값이 바뀌지 않는다**(no-op 대입). 분할 성질은 그대로이므로
명세의 구멍이 아니다 — 가드가 지키는 것은 분할이 아니라 **UPDATE의 행 범위**이고,
내 돌연변이가 그 성질을 겨냥하지 않았다. 계획서는 가드를 유지한다.

**경로 7(내림 전 실행분).** 계획이 「`tsc`가 이 항목의 진짜 게이트」라고 주장한다. 정적으로 셌다 —
반환·인자·prop 모양이 바뀌면 **아홉 곳**이 깨진다: 구조분해 3(`dashboard/page.tsx:36` ·
`settings/page.tsx:19` · `upload/api:243`), prop 타입 3(`pages/dashboard/ui:46` ·
`UploadPodcast:68` · `settings/ui:45`), 호출 3(`settings/api:53` · `settings/ui:108` · `:125`).
**주장이 참이다** — 하나라도 빠뜨리면 컴파일이 깨진다.

### 소득 3건 — 전부 구현 영향

| # | 결함 | 근거 |
| --- | --- | --- |
| 1 | `schema.prisma`의 `UploadedFile.captionStyle` 위 주석이 「업로드 시점에 **`User.defaultCaptionStyle`**을 복사한 스냅샷」이라 말하는데 **계획서가 0번 언급** | 그냥 두면 거짓이 된다. 경로 4가 18건 중 2건 미귀속으로 잡았다 |
| 2 | 편집 지점 **16 중 before를 준 곳이 2**뿐 | **경로 3을 대부분 못 돌린다.** FEAT-53·55·56은 전 지점 before/after라 인수가 바이트 대조로 닫혔는데, 이 계획서가 그 기준에서 퇴보했다 |
| 3 | 그 2개 중 `upload/api` before에 **생략 부호 `...`**가 들어가 트리와 **0회 일치** | 생략된 before는 기계 적용이 불가능하다. 「있다」고 셌지만 실은 없는 것과 같다 |

**셋 다 내가 쓴 계획서의 결함이고, 셋 다 경로 3·4가 잡았다.**

**적용한 편집(일괄 1회)**: 「구현 스케치」를 **전면 재작성**했다 — 14절, **28개 before 조각**
(펜스 15 + 표·인라인 13)을 전부 바이트 정확·생략 없이 실었다. `schema.prisma:93`을 ②로
추가했고, 「고칠 파일」 표에 그 줄과 `CaptionStyleDefaults` 타입 별칭 신설을 더했다.
스케치 머리에 **「생략 부호를 쓰지 않는다」**를 규칙으로 박았다.

> **타입 별칭을 새로 둔 이유**: `{ english, korean }` 모양이 `SettingsView`·`DashboardView`·
> `UploadPodcast`·`updateUserDefaultCaptionStyle`·`saveDefaultCaptionStyle` **다섯 곳**에 나온다.
> 인라인으로 두면 한 곳을 고칠 때 나머지가 조용히 어긋난다 — 경로 7이 센 아홉 곳 중 여섯이
> 이 모양이다.

## 라운드 2 — 무소득

재작성한 스케치의 before를 전수 재검사했다.

- 펜스 before **15개** — 각각 트리의 **정확히 한 파일에 바이트 일치**(1:1 불일치 0)
- 표·인라인 before **13개** — 각각 해당 파일에 **정확히 1회**(유일하지 않은 것 0)

**28/28.** 경로 3이 이제 이 계획서 전체에 돌아간다.

**소득 0 → `plan-verifier` 독립 패스 디스패치 자격.**

## 라운드 3 — 독립 무편집 패스 (2026-09-23) — 클린

**결함 0건. 무편집**(직접 검산: `git status`에 `?? nul`뿐, `git diff HEAD` 공란).
필수 6경로 전수 실행.

### 독립 패스가 보탠 것 — 내가 안 한 것들

- **경로 2를 훨씬 세게 돌렸다.** 신규 로직 중 가장 위험한 §⑤ 판별합 검증기와 §⑪ `editKey`
  인덱싱을 스텁 타입으로 추출해 **프로젝트와 같은 엄격 플래그**(`strict` + `noUncheckedIndexedAccess`
  + `verbatimModuleSyntax`)로 `tsc` → **EXIT 0**. 이어 **음성 대조**로 `!english.ok || !korean.ok`
  가드를 빼니 **TS2339 2건으로 실패** — 하니스가 진짜 판별함을 보였다.
  나는 이 절을 정적으로만 읽었다.
- **`entities/user/server.ts`의 재수출**을 여집합에서 찾았다(`:10`·`:16`). 내 18건 grep은
  `defaultCaptionStyle` 문자열만 봤는데, 이건 **함수명**으로 재수출한다. **함수명이 안 바뀌므로
  무편집**이라는 판정까지 붙였다 — 확인했고 맞다.
- `schema.prisma:59`의 `captionStyleSchema(features/clip-review/model/schemas.ts)` 인용이
  정본 이동 뒤의 것이나 `schemas.ts`의 re-export로 해소된다는 관측. **계획서가 그 줄을
  before/after 모두 그대로 보존하므로 계획 도입 결함이 아니라는 판단**까지 붙였다 — 동의한다.
- 구 마이그레이션(`20260909…`)은 **불변 이력**이라 대상이 아님을 명시했다.

### 카탈로그 갱신 — 9번 행의 첫 실증

`docs/plans/verification-paths.md`의 9번(구조적 아티팩트 검사)은 「이 저장소의 실증 사례 대기」로
비어 있었다. 규칙이 「사례 없는 행은 **첫 실증에서 채운다**」이므로 이 항목의 라운드 1 결과를
넣었다 — 실 DB 읽기 전용 리허설로 `WHERE` 분할 확인, 합성 도메인 돌연변이, `Json?` ↔ `JSONB`
형태 일치.

## 구현 (2026-09-23)

게이트②가 열려 직접 구현했다. 계획서를 파일에서 다시 읽고 **14행 전부**를 적용했다 —
모든 치환은 before가 그 파일에 **정확히 1회**임을 단언한 뒤 수행했다.

| 묶음 | 파일 |
| --- | --- |
| DB | `schema.prisma`(②포함) · 신규 `20260923000000_user_default_caption_style_per_language/migration.sql` · 생성 클라이언트 7 |
| 서버 | `entities/user/api` · `features/settings/api` · `features/upload/api` |
| 페이지 | `app/dashboard/page.tsx` · `app/dashboard/settings/page.tsx` |
| 화면 | `pages/settings/ui` · `pages/dashboard/ui` · `UploadPodcast.tsx` |
| 공용 | `shared/config/constants.ts`(`CaptionStyleDefaults` 신설) · `caption-style-schema.ts` · `entities/uploaded-file/api` |

`git status`의 변경이 계획서 「고칠 파일」과 **정확히 일치**하고 **초과 0**이다.

### 구현 중 걸린 것 — 부분문자열 오매치

`  initialCaptionStyle,`(2칸)로 치환하려는데 **2회** 잡혔다. `:59`의
`    initialCaptionStyle,`(4칸)이 그 패턴을 **부분문자열로 포함**했기 때문이다.
앵커를 앞뒤 줄까지 넓혀 다시 했다. **계획서 결함이 아니라 내 치환 방식의 문제**이고,
`assert count==1`이 잡았다 — 그 단언이 없었으면 엉뚱한 줄이 바뀌었을 것이다.

### 게이트 — 전부 직접 실행

| | 결과 |
| --- | --- |
| `npx tsc --noEmit` | **EXIT 0** — 이 항목의 진짜 게이트 |
| `npm run check -w apps/web` | **EXIT 0 · `✔ No ESLint warnings or errors`** |
| `npm test -w apps/web` | **170 / suites 40 / fail 0** — 착수 기준선 그대로 |

**`tsc` 통과가 「아홉 곳을 다 고쳤다」의 기계 판정이다.** 검증 라운드 1에서 센 아홉 곳
(구조분해 3 · prop 타입 3 · 호출 3) 중 하나라도 빠뜨렸으면 EXIT 0이 안 나온다.

### 구조 확인

생성 클라이언트에 `defaultCaptionStyle` · `defaultCaptionStyleEnglish` ·
`defaultCaptionStyleKorean` **셋 다** 있다 — 새 둘이 생겼고 구 하나가 남았다(계획대로).

### 아직 하지 않은 것 — 마이그레이션 적용

**적용하지 않았다.** 이 항목은 **DB 먼저**다(ADD라 FEAT-53과 반대):

```
① 마이그레이션 적용  ← 별도 승인, 아직
② 코드 main 합류 → Vercel 배포
```

②를 먼저 하면 새 클라이언트가 **없는 컬럼을 SELECT해** 설정·대시보드·업로드가 동시에 깨진다.
적용 직전에 `migrate status`와 영향 행 수를 보고한다(현재 실측: `defaultCaptionStyle`
non-null **0행**이라 두 `UPDATE`는 0행을 건드린다).

## 마이그레이션 적용 (2026-09-23)

소유자 승인 후 `packages/db`에서 적용했다. **적용 전 `migrate status`가 이 하나만 미적용이라고
답했고**(12개 중), 되돌릴 수 없는 삭제가 없다는 것(ADD 둘 + UPDATE 둘, DROP 0)을 먼저 보고했다.

```
Applying migration `20260923000000_user_default_caption_style_per_language`
All migrations have been successfully applied.
```

### 검산 셋

| 검사 | 결과 |
| --- | --- |
| `migrate status` | **`Database schema is up to date!`** |
| `db pull --print`(실 DB 인트로스펙션) | `model User`에 `defaultCaptionStyle` · `defaultCaptionStyleEnglish` · `defaultCaptionStyleKorean` **셋 다** |
| 행 계수 + 새 클라이언트 실 조회 | `total 7 / en 0 / kr 0 / old 0` — **이동 0행이 예측대로**. `findFirst`로 두 새 컬럼을 실제로 읽어 `{"defaultCaptionStyleEnglish":null,"defaultCaptionStyleKorean":null}` |

셋째가 이 항목의 진짜 사후 게이트다. **컬럼이 생겼다는 것과 클라이언트가 그것을 읽는다는 것은
다른 주장**이고, 후자를 실 DB에 대고 확인했다.

**구 컬럼은 그대로 있다** — 계획대로다. 제거는 새 클라이언트 배포 뒤 후속이다.

### 다음

이제 **②(코드 배포)** 차례다. DB가 먼저 섰으므로 지금 배포해도 새 클라이언트가 읽을 컬럼이
이미 있다. 옛 클라이언트도 새 컬럼을 모른 채 계속 돈다(Prisma는 자기 스키마 컬럼만 SELECT한다).

