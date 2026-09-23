# BUG-15: 홈페이지가 만들지 못하는 화면비를 약속한다 — `square`·`landscape` 문구 철회

agent: web-dev

## 현재 동작

- `pages/home/config/index.ts:100` — `workflowSteps` 3단계 `Review & publish`의 `description`이
  `"Accept, tweak, or regenerate. Export vertical, square, and landscape ratios."`다. 세로에 더해
  `square`·`landscape` 두 화면비를 유저에게 약속한다.
- `pages/home/config/index.ts:51` — 같은 파일 `coreFeatures`의 `Auto Vertical Framing` 설명은
  `"Columbia face tracks steer 1080x1920 crops or blurred backgrounds, rendered via NVENC at 25 fps."`로
  **1080x1920 세로 한 종류만** 말한다. 한 파일 안에서 `:51`(세로만)과 `:100`(세 비율)이 어긋난다.
- 여집합 확인(내가 직접 grep — `apps/web/src` 전역, 대소문자 무시):
  - `\b(square|landscape)\b` → 유저 대면 카피는 `:100` 하나뿐. 나머지 유일 매치
    `shared/ui/atoms/avatar.tsx:31`은 `aspect-square` CSS 클래스다.
  - `\b(aspect|ratios?)\b` → 나머지 유저 대면 카피 두 곳은 **세로만** 약속한다:
    `pages/youtube-shorts-generator/config/index.ts:7-11`(`label: "Aspect ratio"` · `value: "1080 x 1920"`
    · `"Vertical 9:16 mp4 - the canonical YouTube Shorts shape, no extra crop required."`),
    `pages/ai-podcast-clipper/config/index.ts:69`(`"...the right aspect ratio for platforms like YouTube Shorts."` — 단수·세로 지향).
    그 외 매치(`uploaded-file-list/.../UploadedFileCard.tsx:65·71·74`,
    `clip-draft-review/ui/index.tsx:415`, `upload-detail/.../OriginalMediaCard.tsx:53`)는 전부
    `aspect-video` CSS 클래스이지 카피가 아니다.
- 산출물이 세로 1080x1920 한 종류라는 백엔드 근거는 백로그 `source`가 grep으로 확정했다
  (`apps/backend/main.py:214-215` `target_width = 1080` · `target_height = 1920`,
  `square|landscape|aspect` 경로 `apps/backend/*.py`·`apps/web/src/inngest/` 전역 0건).
  `apps/backend`는 내 검증 범위 밖이라 이 항목에서 재확인하지 않고 백로그 관측을 인용한다.

## 문제

홈페이지가 `square`·`landscape` 내보내기를 약속하지만(`:100`) 제품은 세로 1080x1920만 만든다.
유저 대면 거짓 카피이고, 같은 파일 `:51`과 자기모순이다. 요구사항의 원천은 백로그 `source`이며,
그것이 지목한 문제("만들지 못하는 화면비를 약속한다")를 위 「현재 동작」의 `:100`↔`:51` 대비와
여집합 grep으로 다시 세웠다 — 백로그가 짚은 문제와 코드에서 확인한 것이 일치한다.

**화면비 3종을 실제로 만드는 것은 이 항목이 아니다**(백로그 명시). 그것은 백엔드 합성부·ASS `PlayRes`·
크롭 로직·미리보기 9:16 전제를 건드리는 별개 기능이고 `apps/backend`가 필요하다. 이 항목은 **문구 철회**뿐이다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/pages/home/config/index.ts` | `workflowSteps` 3단계 `Review & publish`의 `description`(`:100`)에서 `square, and landscape`를 걷어내고 세로 산출물에 맞는 문구로 교체 |

여집합 grep이 다른 유저 대면 카피에는 같은 거짓 약속이 없음을 확인했으므로 고칠 파일은 이 하나뿐이다.

## 구현 스케치

`pages/home/config/index.ts` `:99-100`, 바뀌는 줄만.

before (적기 직전 재확인 — `:99-100`):
```ts
    description:
      "Accept, tweak, or regenerate. Export vertical, square, and landscape ratios.",
```

after:
```ts
    description:
      "Accept, tweak, or regenerate. Export vertical 9:16 clips ready for YouTube Shorts.",
```

- `square, and landscape` 삭제. `9:16`은 `youtube-shorts-generator/config:10`의 표기(`Vertical 9:16 mp4`)와
  맞추고, `:51`의 `1080x1920`과 어긋나지 않는다(9:16 = 1080x1920). `YouTube Shorts`는 제품·라우트명
  (`youtube-shorts-generator`)과 일치한다.
- "Accept, tweak, or regenerate." 앞 문장은 그대로 둔다 — 화면비와 무관하다.

## 테스트

- **덮는 것**: 없음. `:100`은 마케팅 config 객체 안의 정적 문자열 리터럴이지 순수 함수가 아니다.
  이 저장소의 `*.test.mjs`는 판정 로직·wire 계약을 지키지 정적 카피를 못박지 않는다
  (골든 문자열 테스트인 `review-language-notice`·`reference-translation`도 대상은 **함수**의 출력이다).
  `home/config`용 테스트 파일도 없다. 문자열 존재/부재를 단언하는 테스트를 새로 만들면 편집을 그대로
  되풀이할 뿐 가치가 낮다.
- **못 덮는 범위**: 홈페이지에 실제로 그려지는 문구 — 배포 후 육안 확인(백로그 `source`의 "문구는 배포 후 육안"과 동일).
  `npm run check`·`npm test`는 리터럴 문자열이 바뀌어도 회귀를 잡지 못한다(타입·로직 불변).

## 범위 밖 의존

없음. 이 항목의 변경은 `apps/web/src/fsd/pages/home/config/index.ts` 한 파일, 문자열 하나뿐이라 담당 범위 안이다.

(참고 — 막힘이 아니라 경계 표시: 백로그가 명시한 대로, 화면비 3종을 **실제로 만드는** 별개 기능은
`apps/backend`가 필요해 이 항목에 담기지 않는다. 이 항목은 문구 철회만 하므로 범위 밖에 닿지 않는다.)

## 대안

- **`square, and landscape`만 지우고 `"Export vertical ratios."`로 남기기**: `ratios`(복수)가 한 종류
  화면비에 대해 어색하게 읽혀 택하지 않았다. 문장을 다시 써 세로 한 종류를 자연스럽게 표현한다.
- **`1080x1920`을 그대로 쓰기**(`:51` 표기 재사용): 정확하지만 마케팅 3단계 문구에 픽셀 수치는 무겁고,
  `youtube-shorts-generator` 페이지가 이미 사람이 읽는 `9:16` 표기를 쓴다. 저장소 어휘와 일관되게 `9:16`을 택했다.
