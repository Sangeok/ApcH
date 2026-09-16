# FEAT-50 — 검토 화면에서 캡션 기본값 캡처 (메인 루프 기록)

## 게이트① (2026-09-16)

소유자 직접 발주 — 세션 지시 "FEAT-50 수행해". pm 선정을 거치지 않았으므로 보드 `근거`는
메인 루프가 썼다(보드 안내 블록: "소유자 직접 발주면 메인 루프"). 보드 행을 `계획지시`로
만들어 커밋·푸시(`de19973`) 후 `web-dev` 디스패치 — 계획서만, 코드 무수정.

web-dev가 `docs/plans/FEAT-50.md`를 쓰고 `검토대기`로 전이. `git status`로 직접 검산:
코드 파일 수정 0건(`PROJECT_BOARD.md` 전이 + 계획서 신규뿐). 무관한 작업 트리 항목
두 개(`apps/web/.claude/settings.local.json`·루트 `nul`)는 이 사이클과 무관하므로 건드리지 않는다.

## 필수 경로 확정

카탈로그(`docs/plans/verification-paths.md`)의 트리거를 계획서 성격에 대조했다. 판단이
애매하면 넣는 쪽(카탈로그 사용법 3).

| # | 경로 | 판정 | 근거 |
| --- | --- | --- | --- |
| 1 | 인용 전수 대조 | **채택** | 모든 항목. 이 계획서는 인용 밀도가 높다(현재 동작 절이 사실상 인용으로만 구성) |
| 2 | 스케치 추출·실행 | **채택** | §1·2·8이 코드 블록 전문을 싣는다(`toCaptionStyle` 본문, `saveDefaultMutation`, `createCustomClipDraft`) |
| 3 | before/after 기계 적용 | **채택** | 기존 파일 9개 수정. §5는 명시적 before/after 블록, 나머지는 산문 지시 — 앵커 유일성이 쟁점 |
| 4 | 전칭 여집합 열거 | **채택** | 전칭 주장 다수: "props는 …뿐", "설정 화면에서만 호출된다", "그 유일한 호출부", "11개가 모두 apps/web/src 안", "이미 임포트돼 있다" |
| 5 | 돌연변이 검사 | **채택** | 순수 함수 `toCaptionStyle`을 추출·신설하고 테스트 파일을 새로 만든다. 명세 구멍이 곧 스냅샷/드래프트 거부로 나타난다 |
| 6 | 실제 사건 재생 | 비해당 | 외부 신호(웹훅·API 응답·코멘트) 해석이 없다. 다만 "저장된 행에 신규 키가 없다"는 실제 행 형태 주장이라 경로 4·5로 받는다 |
| 7 | 음성 시험 | **채택** | 계측 화이트리스트에 **기댄다** — `metadata.ts`의 허용 키 `["source","preset"]`와 `source` 값 집합. FSD 경계 규칙(위젯→features)도 기대는 불변식 |
| 8 | 실물 렌더 | **채택** | 다이얼로그 푸터가 넷→다섯으로 바뀌고 좌측 그룹이 생긴다. 컴파일 통과 ≠ 렌더 성공 |
| 9 | 구조적 아티팩트 검사 | 비해당 | 스키마·config·생성 파일 변경이 없다(계획서 「범위 밖 의존」: 컬럼은 양쪽에 이미 존재) |

채택 7 / 비해당 2.

## 라운드 1 (메인 루프, 편집)

경로 1·3·4·7을 소진하고 경로 2·5·8은 다음 라운드로 넘겼다. 하니스는
`<스크래치패드>/feat50/`(`cite50.mjs` 인용 전수, `anchors50.mjs` 앵커 유일성,
`extract50.mjs` 블록 추출, `apply50.mjs` 기계 적용, `mutate50.mjs` 돌연변이),
격리 트리는 `<스크래치패드>/wt50`(`git worktree add --detach HEAD` + node_modules 정션 3개,
`.env`가 없어 `SKIP_ENV_VALIDATION=1`로 돈다 — 실 비밀을 스크래치패드로 복사하지 않기 위해 고른 방식).

| # | 결함 | 등급 | 증거 |
| --- | --- | --- | --- |
| D1 | 「Save as my default」에 `working === null` 가드가 없다. `saveDefaultCaptionStyle(null)`은 저장이 아니라 **비우기**라(설정 화면 `handleResetCaption:117-131`이 그 용법) 버튼이 사용자 기본값을 삭제하면서 "Saved as your default caption style" 토스트를 띄운다. `working`은 정상 경로로 null이 된다 — `initialValue`가 null이면 시드부터(`CaptionStyleDialog.tsx:48`·`:54`), Reset을 누르면 그 뒤로도. 같은 다이얼로그의 `Apply to all clips`는 이미 `:104` `disabled`와 `:106` early return 이중 가드를 갖고 있다 | **구현 영향** | 소스 대조 |
| D2 | 「문제」1의 "`saveDefaultCaptionStyle`은 설정 화면(`:103`)에서만 호출된다" — 여집합 열거 결과 호출부는 **둘**이고, 빠진 `:120`이 바로 null=비우기 용법이다. D1의 원인 | **구현 영향** | 경로 4 |
| D3 | "props는 …뿐이다(`:18-31`)" — 실제 11개 중 `open`·`onOpenChange`·`language`가 빠졌다 | 위생 | 경로 4 |
| D4 | §2가 `~/fsd/features/settings/api`를 "딥 임포트"라 불렀다. W6 용어로 딥 임포트는 위반을 뜻하고, 실제로는 public entry다 | 위생 | 경로 1 |
| D5 | §9가 `type CaptionStyle`을 새로 임포트하라 했으나 그 파일엔 이미 동의어 `CaptionStyleInput`(`:20`)이 있다 | 위생 | 경로 1 |
| D6 | 모호 인용 5건(`ui/index.tsx:108`·`:36`, `types.ts:27` — 저장소에 각각 29개·13개). 내 편집이 2건을 더 늘려 총 7건이 됐고 같은 라운드에서 함께 고쳤다 | 위생 | 경로 1 |

통과한 검사(결함 아님으로 확인): §5 before 블록 **바이트 일치**, 푸터 버튼 넷의 줄 범위 5건, 두 `select`에 `captionStyle` 부재, `create` data에 부재, `Prisma`·`CaptionStyle` 임포트 실재, §2가 "이미 있다"고 한 여섯(`useMutation`·`toast`·`trackAnalyticsEvent`·`matchPresetId`·`REVIEW_ANALYTICS_PATH`·`CaptionStyleInput`) 전수, 위젯·카드·페이지 앵커 전부.

**해소한 의심 둘.** (가) §2의 임포트 경로가 W6 위반인가 → 아니다. 규칙 본문(`apps/web/scripts/verify-fsd-boundaries.mjs:210`)이 `!isPublicEntry`일 때만 위반이고 셀프테스트(`:111-119`)가 동형 임포트에 위반 0을 단언하며, `features/settings/index.ts`는 `export {};`뿐이라 배럴 경유가 불가능하다. (나) §6이 `UploadedFileDetail`에 필수 필드를 더하는데 생산자가 여럿인가 → 아니다. 생산자는 `getUploadedFileDetailsById` 하나(`api/index.ts:302`)이고 나머지 등장은 소비·재수출·`setQueryData` 제네릭이다.

**경로 7 음성 시험**: 계측 화이트리스트에서 `preset`을 빼니 `metadata.test.mjs`가 4중 1 실패 — 계획서가 기대는 방어선은 장식이 아니다. 워크트리 복원 확인.

**경로 3 앵커 유일성**: 16개 중 15개 유일. 중복 1건은 `where: { id: uploadedFileId, userId },` + `select: {`가 그 파일에 **8회**. 계획서가 대상을 함수명으로 지목해 구현자가 길을 잃지는 않으나, 줄번호는 곧 밀리므로 「앵커 주의」를 계획서에 넣고 고유 식별줄(각 1회)을 적었다.

라운드 1 편집 10건.

## 라운드 2 (메인 루프, 편집)

경로 2·5를 돌리고 경로 1을 **내 편집에 다시** 걸었다(편집자가 만든 인용이 드리프트가 들어오는 자리다).

**경로 2 — 스케치 기계 적용 후 계획서 자신의 게이트 실행.** `apply50.mjs`가 27개 편집을
전부 유일 앵커에 적용(손 개입 0, §5는 before/after 바이트 치환). 1차 실행에서
`npm run check`가 **EXIT 1**로 깨졌다:

| | lint 오류 | 판정 |
| --- | --- | --- |
| E1 | `caption-style-from-json.ts` `no-duplicate-type-constituents` — 입력 타입을 `ClipDraft["captionStyle"] \| UploadedFile["captionStyle"]`로 넓혔는데 둘 다 `Json?`(`schema.prisma:194`·`:98`)이라 생성 클라이언트에서 같은 `JsonValue \| null`(`index.d.ts:5801`·`:8465`)이다. 넓힐 것이 없다 | **구현 영향** |
| E2 | `clip-review/api/index.ts` `no-unsafe-assignment`·`CaptionStyle is an 'error' type` — **내 D5 교정이 만든 결함이다.** 임포트를 없애라고만 적고 스케치의 `as CaptionStyle`을 그대로 뒀다 | **구현 영향(내 편집)** |
| E3 | `ClipDraftCard.tsx` `no-unused-vars` — 지역 함수를 들어내면 `CAPTION_STYLE_OPTIONS`의 이 파일 안 유일한 사용처(`:42`)가 사라지는데 임포트 정리를 지시하지 않았다 | **구현 영향** |

셋을 계획서에 반영하고 「검증 게이트」 절을 신설해 세 함정을 미리 적었다. 재적용 후
**`npm run check` EXIT 0**(verify:fsd:test 11/11 · verify:fsd PASS · ESLint 경고 0 · tsc 무출력),
**`npm test` EXIT 0, 176/176 · 41 suites**.

> E3이 1차에 남은 경고는 하니스 미구현이었다 — 계획서는 산문으로 지시했고 `apply50.mjs`가
> 산문을 읽지 않았다. 하니스에 그 삭제를 넣어 경고가 실제로 사라지는 것을 보고서야
> "계획서 결함이 아니다"로 판정했다. 도구의 한계를 계획서 결함으로 세지 않는다.

**경로 5 — 돌연변이 검사.** 계획서 「테스트」의 케이스 목록을 실행 가능한 형태로 옮기고
변이 9개를 심었다. 1차: **M9(`??` → `||`)가 생존** — 계획서가 지정한 네 케이스군을 전부
통과했다. 도달 가능성을 먼저 확인했다(FEAT-48에서 부동소수 등가 변이를 구멍으로 오판했다가
뒤집은 전례 때문): `CaptionStyle.uppercase`는 `boolean | null`이고(`constants.ts:126`)
저장되는 프리셋 `clean-white`·`mint-pop`이 `uppercase: false`를 싣는다(`:145`·`:181`) —
칩 한 번으로 만들어지는 값이다. `||`는 그 `false`를 `null`로 갈아치워 언어 기본값으로
렌더되게 하고, 화면에는 "기본값이 적용된 모습"으로 보여 사용자는 크레딧을 쓴 뒤에야 안다.
등가 변이가 아니라 **명세의 구멍**이다. 계획서에 falsy 보존 케이스를 추가하니
**M9 사멸, 생존 0/9**. `outlineWidth: 0`은 `.int()`와 프리셋 범위(1~5)상 UI로 도달하지
않으므로 케이스로 두지 않는다고 계획서에 근거를 남겼다.

**경로 1 재실행(내 편집 검산)**: 완전 인용 28 → 35건, 미해결 0. 내 편집이 들여온 인용은
전부 실물과 일치(`schema.prisma:194` `captionStyle   Json?`, `index.d.ts:5801`
`JsonValue | null`, `constants.ts:126` `uppercase: boolean | null;`, `caption-style-schema.ts:44`,
`features/settings/index.ts:1-3`). 모호는 7 → 2건이고 남은 둘은 `metadata.ts:59`가
`format-metadata.ts`에 접미사로 걸리는 **도구 아티팩트**라 실제 모호가 아니다.

라운드 2 편집 7건. 누계 17건.
