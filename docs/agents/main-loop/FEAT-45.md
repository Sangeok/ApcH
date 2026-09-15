# FEAT-45 — 메인 루프 기록

## 게이트① (2026-09-15)

소유자 직접 발주(pm 미경유) — 세션 지시 "feat 45 수행하자". FEAT-42 인수 직후 메인 루프가 다음 작업 1순위로 제안한 항목이다. `계획지시`로 보드에 기록했다.
발주 시점 보드 미결은 0건이다(`보류` FEAT-01 제외). `dev` = `origin/dev`.

담당은 `web-dev`다 — area가 전부 `apps/web` 안이다(백로그 「범위 밖 의존 없음」). 선행이 없고, FEAT-48(참고 번역 블록)·FEAT-49(Korean 샘플 미리보기)의 선행이다.

**발주 전 앵커 실측** — 백로그 인용 일부는 FEAT-42 뒤 낡았다. 계획서는 현재 트리로 다시 확인해 적는다.
- 헤더 안내: `widgets/clip-draft-review/model/review-language-notice.ts:19` `` return `Subtitles will be translated to ${trimmed} when you generate. This review shows the English transcript.`; `` — 일치.
- 카드 라벨: `widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx:482` `English transcript` — 일치. 조건은 `:118` `showsEnglishSourceForTranslation(language)`.
- 캡션 편집기 안내: 백로그는 `CaptionStyleEditor.tsx:310-311`이라 했지만, **FEAT-42가 이 문장을 `sample ? … : …` 삼항의 else 분기로 옮겨 지금은 `features/caption-style/ui/CaptionStyleEditor.tsx:318-323`**이다
  (`:321` `Korean clips are translated at render time — the words here are the` · `:322` `English source.`). 같은 삼항의 샘플 분기(`:313-316`, 설정 화면 전용)는 FEAT-42가 넣은 문구다.
- 골든 테스트: `review-language-notice.test.mjs:10-11` `KOREAN_NOTICE`, `:43` Spanish 문구 — 일치.
- 교차 인용 주석: `review-language-notice.ts:10`이 `CaptionStyleEditor.tsx:310-311의 기존 문구와도 일관된다`고 적는다 — 줄 번호가 이미 낡았고, 이번 항목이 그 문구 자체를 바꾼다.
  `widgets/clip-draft-review/ui/index.tsx:281`·`:425` 주석도 편집기 안내를 언급한다.
- 옛 문구를 인용하는 메인 루프 소유 문서(인수 때 메인 루프가 갱신):
  - `apps/web/CLAUDE.md:83` — 테스트 표 `review-language-notice.test.mjs` 행의 「English transcript」
  - `docs/release-checks.md:108` — FEAT-43 절의 열린 줄. 「English transcript」 라벨이 영어 그대로인 게 정상이라고 인용한다
  - `docs/release-checks.md:120`·`:121` — FEAT-37 절의 열린 줄. 옛 헤더 안내 골든 문구와 라벨을 인용한다

### 계획 단계에서 반드시 다룰 것

- **최종 카피 세 개를 정확히 정한다.** 헤더 안내, 카드 라벨, 캡션 편집기 라이브 안내 문장. 뜻은 "영상에서 실제로 들리는 말(영어)"이다 — 소유자가 "transcript가 의미하는 게 뭐냐"고 물었던 것이 발단이다.
  앱 UI는 영어이므로 문구도 영어로 쓴다(`widgets/clip-display/model/subtitle-status.ts` 머리 주석). 헤더 안내는 지금처럼 언어 값(`Korean`)을 문장에 넣는지 정한다. 사용자에게 보이는 문자열은 계획서에 글자 그대로 적는다.
- **표시 조건·레이아웃은 바꾸지 않는다.** `reviewLanguageNotice`의 판정(English·nullish·공백은 null, trim, "English 아님" 판정)과 `showsEnglishSourceForTranslation ≡ reviewLanguageNotice !== null` 계약은 그대로다.
  문구만 바뀐다는 것을 before/after로 보인다.
- **골든 테스트 갱신.** `KOREAN_NOTICE`와 Spanish 문구를 새 카피로 바꾼다. 기존 테스트가 지키던 것(trim 돌연변이를 문구로 잡는 것 등)이 새 문구에서도 성립하는지 확인한다.
  테스트 수는 그대로여야 한다(기준선 `npm test -w apps/web` **154**).
- **캡션 편집기 문장은 라이브 분기만 고친다.** 샘플 분기(`:313-316`)는 FEAT-42 설정 화면 문구다 — 바꿀 필요가 있는지 따로 판정하고 근거를 적는다(현재 "transcript/source" 표현을 쓰지 않는다).
  검토 다이얼로그 외의 편집기 소비자(설정 화면)가 영향받지 않음을 보인다.
- **다른 백로그 항목과의 결합.** FEAT-48이 카드 라벨 바로 아래에 "참고 번역" 블록을 붙인다 — 새 원문 라벨이 그 번역 라벨과 짝이 되게 정한다(두 라벨을 한 번에 맞추는 것이 FEAT-45가 먼저인 이유다).
  FEAT-49는 같은 편집기 문장을 이 항목 뒤에 동작에 맞게 다시 고친다 — 이 항목은 표현만 바꾸고 동작 서술을 늘리지 않는다.
- **교차 인용 주석.** `review-language-notice.ts:10`의 낡은 줄 번호 인용과 "기존 문구와도 일관" 서술을, 바뀐 문구 기준으로 고칠지 정한다.
  줄 번호 대신 내용 앵커로 쓴다(FEAT-44 결정: 교차 파일 줄번호 인용은 곧 낡는다). `ui/index.tsx:281`·`:425` 주석도 옛 문구를 인용하는지 확인한다.
- **못 덮는 범위.** 실제 검토 화면에서 새 문구가 보이는지는 배포 후 확인이다. 원장 FEAT-37 절의 옛 문구 인용 줄(`:120`·`:121`)은 인수 때 `대체(FEAT-45)`로 마감하고 새 문구 기준 확인 줄을 등재한다 — 계획서 「못 덮는 범위」에 그 대응을 적는다.
