# BUG-15 — 홈페이지가 만들지 못하는 화면비를 약속한다 (`square`·`landscape` 문구 철회)

## 2026-09-22 구현 (web-dev)

### 계획서 대조

`docs/plans/BUG-15.md`를 파일에서 다시 읽고 구현했다. 「현재 동작」이 현재 코드와
일치함을 편집 전 확인:
- `pages/home/config/index.ts` `workflowSteps` 3단계 `Review & publish`의 `description`이
  `"Accept, tweak, or regenerate. Export vertical, square, and landscape ratios."`(계획서 `:100` 표기와 동일).
- 같은 파일 `coreFeatures` `Auto Vertical Framing`은 `"Columbia face tracks steer 1080x1920 ..."`로
  세로 한 종류만 말한다(계획서 `:51`) — 파일 내 자기모순 확인.

### 고친 파일 (1개)

| 파일 | 변경 |
| --- | --- |
| `apps/web/src/fsd/pages/home/config/index.ts` | `workflowSteps` `Review & publish` `description` 문자열 한 줄 교체 |

before:
```
      "Accept, tweak, or regenerate. Export vertical, square, and landscape ratios.",
```
after:
```
      "Accept, tweak, or regenerate. Export vertical 9:16 clips ready for YouTube Shorts.",
```

### 스케치 대비 차이

없음. 계획서 「구현 스케치」의 after 문자열을 그대로 썼다 — 분기·조건·리터럴 값·유저 대면 문구
모두 스케치와 동일하다. `9:16`은 `youtube-shorts-generator/config`의 `Vertical 9:16 mp4` 표기와
맞추고 `:51`의 `1080x1920`(=9:16)과 어긋나지 않는다.

### 검증

작업 트리에 병행 항목 FEAT-44(agent: main-loop, 구현승인)의 미완 변경 17개 파일이 함께 있었다.
BUG-15의 대상 파일은 그와 겹치지 않는다(보드 근거가 명시한 병행 조건). 아래 게이트는 그 상태에서
전부 통과했고, `git diff apps/web/src/fsd/pages/home/config/index.ts`는 위 한 줄 교체만 보인다.

- `npm run check -w apps/web` → EXIT 0 (ESLint 무경고, verify:fsd 통과, FSD 경계 셀프테스트 11/11)
- `npm test -w apps/web` → 170 tests / 40 suites / 0 fail

### 테스트로 못 덮은 범위

- 새 테스트 없음. `:100`은 마케팅 config 객체 안의 정적 문자열 리터럴이지 순수 함수가 아니라,
  이 저장소의 `*.test.mjs` 관례(판정 로직·wire 계약을 지킴)로 덮을 대상이 아니다. `home/config`용
  테스트 파일도 없다.
- `npm run check`·`npm test`는 리터럴 문자열이 바뀌어도 회귀를 잡지 못한다(타입·로직 불변).
- 홈페이지에 실제로 그려지는 문구 정정은 배포 후 육안 확인이 필요하다(백로그 `source`의
  "문구는 배포 후 육안"과 동일).
