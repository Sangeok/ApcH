# FEAT-39 — 메인 루프 기록

## 게이트① (2026-09-14)

소유자 직접 발주(pm 미경유) — 세션 지시 "FEAt-39 수행". FEAT-38이 같은 날 완료(프로덕션 마이그레이션 적용, 커밋 `d93095b`)되어 선행이 풀린 직후
지목했다. `계획지시`로 보드에 기록. 보드 미결 0건이었다.

담당은 `web-dev` — area가 전부 `apps/web` 안이다(백로그 "범위 밖 의존 없음"). 필요한 DB 컬럼(`User.defaultLanguage`·`defaultClipCount`·
`defaultReviewBeforeGenerate`)과 이벤트 이름(`settings_viewed`·`settings_defaults_saved`)·허용 키(`["source", "preset"]`)는 FEAT-38이 이미 만들었다.

### 계획 단계에서 반드시 다룰 것

- **서버 액션의 인가와 검증.** `apps/web/CLAUDE.md` 「서버 액션」대로 인가는 액션 본문 최상단에서 강제한다(Server Action은 직접 POST 가능한 독립
  엔드포인트). 사용자는 **자기** `User` 행의 기본값만 읽고 쓴다. 값은 서버에서 검증한다 — 언어는 `SUPPORTED_LANGUAGES`의 값, 클립 수는
  `CLIP_COUNT_OPTIONS`의 값, 생성 모드는 boolean, 그리고 **`null`은 "설정 안 함 = 시스템 기본"으로 비우기**(백로그 요구 ②). 범위 밖 값이 DB에
  들어가면 업로드 폼 초기값이 깨지므로 거부 방식(에러 반환 vs 무시)을 정하고 근거를 적는다.
- **라우트 보호.** `/dashboard/settings`가 미들웨어 보호 경로에 실제로 포섭되는지 확인한다 — `middleware.test.mjs`가 지키는 "목록에 있어도 matcher가
  통과시켜야 보호된다" 계약(`apps/web/CLAUDE.md` 테스트 표). 새 경로를 목록에 더해야 하는지, 기존 패턴이 이미 덮는지 실측으로 적는다.
- **사용자가 설정 화면에 도달하는 길.** 백로그는 라우트·슬라이스 신설만 적고 진입점(대시보드 헤더·메뉴의 링크 등)은 적지 않았다. 링크 없이는
  가치가 나지 않으므로 어디에 두는지 정한다. 기존 대시보드 네비게이션 구조를 따르고, 새 UI 요소가 사용자에게 보이는 문구를 정확히 적는다.
- **업로드 폼 초기값의 데이터 흐름.** `UploadPodcast.tsx`는 클라이언트 컴포넌트다. 사용자 기본값을 서버에서 어떻게 읽어 초기 state로 넘기는지
  (페이지 서버 컴포넌트 → props 등), 로딩·실패 시 `?? DEFAULT_LANGUAGE` 등 시스템 기본으로 떨어지는지, 그리고 클립 수가 영상 길이 상한에 걸리면
  기존 `getMaxFeasibleClipCount` 하향 클램프가 기본값에도 그대로 적용되는지를 적는다. **업로드 폼에 "기본으로 저장" 버튼은 붙이지 않는다**(백로그).
- **계측.** `settings_viewed`(기존 `*_viewed` 발신 패턴을 따름)와 `settings_defaults_saved`(`source: "settings_page"`). `preset` 키는 캡션 기본값(FEAT-42)
  몫이라 이 항목에서는 싣지 않는다. 계측 실패가 저장을 막지 않게 한다.
- **캡션 섹션.** 백로그는 "캡션 섹션 자리는 비워두고 FEAT-42가 채운다"고 했다. 사용자에게 빈 섹션을 보여줄지, 아예 렌더하지 않을지 정한다
  (빈 제목만 있는 섹션은 사용자에게 의미가 없다는 점을 고려).
- **FSD 경계.** 새 `pages/settings` 슬라이스, `entities/user`의 서버 전용 API는 `server.ts` barrel 경유(루트 barrel 분할 규약,
  `apps/web/CLAUDE.md` 「Feature-Sliced Design」). `npm run check -w apps/web`의 `verify:fsd`로 확인한다.
- **테스트.** 판단 로직(값 검증, 기본값 → 폼 초기값 해석 등)은 순수 함수로 빼 `*.test.mjs`로 덮는다. 새 테스트 파일이 생기면 `apps/web/CLAUDE.md` 테스트 표
  행은 메인 루프가 인수 때 추가한다(web-dev는 그 파일을 못 쓴다). 현재 기준선: `npm test -w apps/web` **131**.
- **못 덮는 범위.** 실제 화면 렌더·저장 후 업로드 폼 반영·계측 행 생성은 배포 후 확인 — `docs/release-checks.md` FEAT-38 절의 "(FEAT-39 배포 후) 새 컬럼
  실사용" 줄이 이 항목에서 함께 닫힌다.
