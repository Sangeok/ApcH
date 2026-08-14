# BUG-06: pricing FAQ가 부분 생성 시 크레딧 미차감이라고 안내하지만 실제로는 생성분만큼 차감됨

agent: web-dev

## 현재 동작

크레딧 차감 로직(실제 동작):

- `inngest/functions.ts:659`는 `if (clipsFound === 0)`이면 `mark-no-clips-generated`로 실패 처리하고 `return`한다 — 이 경로에서는 차감이 없다.
- `clipsFound >= 1`이면 그 가드를 통과해 `inngest/functions.ts:675`의 `complete-processing-attempt` 스텝(`completeUploadedFileProcessingAttempt` 호출)으로 간다. 이 판정은 `clipsFound`가 요청 개수(`clipCount`)에 도달했는지를 보지 않는다.
- `entities/uploaded-file/api/index.ts:827`의 `completeUploadedFileProcessingAttempt`는 트랜잭션 안에서 `decrementUserCreditsFloorZero(args.userId, args.clipsFound, { tx })`를 부른다 — **생성된 클립 수만큼 차감**한다.
- 결과: 3개 요청 / 2개 생성이면 `clipsFound === 2`라 완료 경로로 가고 크레딧 2가 차감된다. 무료 3크레딧 중 2가 소진된다.

FAQ 문구(`src/fsd/pages/pricing/config/index.ts`):

- `:46` "How does the free trial work?"의 답: `"... one credit per generated clip in that completed run. If a run fails or only partially completes, no credit is consumed."` — **"partially completes, no credit is consumed"가 위 동작과 모순**이다. 부분 생성은 생성분만큼 차감된다.
- `:51` "When are credits deducted?"의 답: `"... Uploads that fail, produce no clip, or do not complete the requested clip count do not affect your credit balance."` — **"do not complete the requested clip count do not affect your credit balance"가 위 동작과 모순**이다.

이 두 문자열의 소비처는 둘이다 — 화면 렌더(`pricing/ui/index.tsx:148`의 `<FaqSection items={pricingFaq} />`)와 **검색엔진용 구조화 데이터**(`app/(public-marketing)/pricing/page.tsx:23`이 `generateFaqJsonLd(pricingFaq)`로 schema.org FAQPage JSON-LD에 답변 원문을 그대로 싣는다, `shared/lib/seo.ts:49`). 둘 다 같은 배열을 읽으므로 **이 파일 하나만 고치면 두 표면에 함께 반영된다.** 뒤집으면, 지금은 거짓 답변이 검색 결과 리치 스니펫 후보로도 나가고 있다는 뜻이다.

이미 올바른(=실제 동작과 일치하는) 문구들, 이번 수정 대상 아님:

- `app/terms/page.tsx:86` `"Credits are deducted only for clips that are successfully generated."` — 정확.
- `app/terms/page.tsx:202-203` `"Failed processing attempts may result in no credit deduction if no clip is successfully generated."` — 정확(`clipsFound === 0`이면 미차감).
- `pricing/ui/index.tsx:32` `"Credits are deducted after a successful processing run, one per generated clip ..."` — 정확.
- `product-tour/config/index.ts:74` `"... one credit per generated clip in that completed run, so a completed 3-clip result uses the full trial balance."` — 정확.
- 같은 파일 `pricing/config/index.ts:9`, `:15`, `:46`의 첫 문장(`"... one credit per generated clip in that completed run."`)도 정확 — 손대지 않는다.

## 문제

백로그(BUG-06 source)가 지목한 문제: BUG-05가 "부분 성공 수용"으로 동작을 바꿔 생성분만큼 차감하게 됐는데, pricing FAQ의 판매 문구는 옛 동작("부분 생성 시 미차감")으로 남았다. 그 결과 약관(`terms/page.tsx`)과 FAQ(`pricing/config`)가 서로 모순이고, FAQ는 실제로 소진되는 크레딧을 0이라고 안내한다.

코드 확인 결과 백로그와 일치한다: 차감량은 `entities/uploaded-file/api/index.ts:827`의 `clipsFound`이고, 완료 경로 진입 조건은 `functions.ts:659`의 `clipsFound !== 0`이다 — 요청 개수 도달 여부와 무관하다. 따라서 부분 생성은 차감된다. 수정 방향은 백로그가 정한 대로 **문구 쪽**이다(동작은 BUG-05에서 의도적으로 바뀐 것이므로 건드리지 않는다).

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/pages/pricing/config/index.ts` | `pricingFaq`의 두 답변 문자열(`:46` "How does the free trial work?", `:51` "When are credits deducted?")을 실제 차감 동작에 맞게 교체 |

새 파일 없음. 다른 파일은 손대지 않는다 — 위 「현재 동작」에서 확인한 나머지 문구(terms, pricing/ui, product-tour, 같은 파일의 정확한 문장들)는 이미 실제 동작과 일치한다.

## 구현 스케치

정적 카피 두 개의 교체다. 로직 변경 없음. 바뀌는 줄만 before/after로 적는다.

**`src/fsd/pages/pricing/config/index.ts:46`** — "How does the free trial work?"의 `answer`

before:
```ts
      "Every new account is provisioned with 3 free credits. Credits are deducted after a successful processing run, one credit per generated clip in that completed run. If a run fails or only partially completes, no credit is consumed.",
```

after:
```ts
      "Every new account is provisioned with 3 free credits. Credits are deducted after a processing run completes, one credit per generated clip. A run that produces no clips consumes no credits; a run that generates some but not all of the requested clips deducts one credit for each clip that was generated.",
```

**`src/fsd/pages/pricing/config/index.ts:51`** — "When are credits deducted?"의 `answer`

before:
```ts
      "Credits are deducted only after the requested clips are successfully processed and stored. Uploads that fail, produce no clip, or do not complete the requested clip count do not affect your credit balance.",
```

after:
```ts
      "Credits are deducted after processing completes, one credit for each clip that is successfully generated and stored. A run that produces no clips does not affect your credit balance; a run that generates fewer clips than requested — even one that ends in an error — still deducts one credit per generated clip.",
```

**`:51`의 조건을 실패/성공이 아니라 클립 수에 거는 이유**: BUG-05가 도입한 `partial_clips_after_backend_error` 경로에서는 실행이 에러로 끝나도 생성분만큼 차감된다(`clipsFound >= 1`이면 완료 경로 — `functions.ts:659` 가드 통과). "Uploads that fail do not affect your balance" 같은 문장은 그 경우에 거짓이 된다 — 옛 FAQ가 낡은 것과 같은 부류의 결함을 새 문구에 심는 셈이다. 차감 조건은 오직 하나, 생성된 클립 수다.

두 문구 모두 실제 동작과 일치한다: `clipsFound === 0` → 미차감, `clipsFound >= 1` → 생성분(`clipsFound`)만큼 차감. 표현은 이미 정확한 이웃 문구(terms `:86`, pricing/ui `:32`, product-tour `:74`)와 같은 "one credit per generated clip" 어법을 따른다.

## 테스트

- **덮는 것**: 없음. 이 변경은 순수 정적 문자열 교체라 뽑아낼 순수 함수가 없다. `pricingFaq`는 로직이 아니라 카피 데이터다.
- **못 덮는 범위**: FAQ 문구가 실제 차감 동작(`functions.ts` + `entities/uploaded-file/api`)과 일치하는지의 정합성. 자동 검증하려면 테스트가 카피를 그대로 다시 적어야 해 회귀 가치가 없고, Node 러너로 "문구 ↔ 차감 로직 일치"를 의미 있게 단언할 방법이 없다. 검증은 사람이 문구와 위 「현재 동작」의 차감 경로를 대조하는 것으로 한다. `npm run check`(lint + typecheck)로 문자열 리터럴 교체가 타입/문법을 깨지 않는지만 확인한다.

## 범위 밖 의존

이 FAQ 수정 자체는 담당 범위(`apps/web/src/**`) 밖 의존이 없다 — 대상 파일 `pricing/config/index.ts`가 범위 안이다.

다만 같은 부류의 낡은 문장이 루트에 둘 있다. 둘 다 web-dev 범위(`apps/web/src/**`) 밖이라 이 항목에서 고치지 않는다 — 별도 처리가 필요하다.

- `README.md:198-199` — "A failed or partial run consumes nothing." 이 계획이 고치는 FAQ와 같은 거짓 주장.
- `README.ko.md:345` — 「알려진 이슈」 절의 "파이프라인 중간 실패 시 크레딧이 차감되지 않을 수 있음". 이쪽은 거짓 약속이 아니라 **오진의 잔재**다 — BUG-05가 "원장은 정합적이고 되돌릴 차감이 없다"고 판명한 옛 진단이 결함 목록에 남은 것. 영어 README와 번역 쌍이므로 한쪽만 고치면 어긋난다.

이 FAQ 수정을 막지는 않지만, 수정 후에도 루트 두 파일에 옛 문구가 남는다는 사실을 미리 알린다.

## 대안

- **문구 대신 동작을 바꾼다(부분 생성 시 차감 안 함/환불)**: BUG-05가 "부분 성공을 수용하고 생성분만큼 과금"을 의도적으로 도입했으므로, 이를 되돌리면 그 결정을 뒤집는 것이다. 백로그도 "수정 방향은 문구 쪽"이라고 못박았다. 채택하지 않는다.
- **FAQ 항목 삭제**: 유저가 크레딧 차감 시점을 궁금해하는 실제 질문이라 삭제보다 정정이 낫다. 채택하지 않는다.
