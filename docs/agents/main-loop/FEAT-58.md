# FEAT-58 — 메인 루프 기록

## 게이트① (2026-09-30)

소유자가 이 세션에서 「게이트① + 검증까지」를 골랐다. 계획서 `docs/plans/FEAT-58.md`는 **보드 행보다 먼저**
별도 세션(Codex SDD 스킬)에서 쓰였고, 그 계획서가 스스로 BLK-FRAMING-01(정식 파이프라인 연결)을 구현 차단으로
적어 두었다. 그래서 순서를 이렇게 잡았다.

- `0c3f4b9`: 백로그 등재 + 보드 행(`계획지시`, 담당 main-loop — db·backend·web이 배포 순서로 묶여 FEAT-54 전례)
- `e94a642`: 기존 계획서를 커밋하고 `검토대기`

## 필수 경로 확정 (2026-09-30)

| # | 경로 | 판정 | 이유 |
| --- | --- | --- | --- |
| 1 | 인용 전수 대조 | **채택** | 모든 항목 |
| 2 | 스케치 추출·실행 | **채택** | ts·tsx·python·sql·prisma 블록 다수 |
| 3 | before/after 기계 적용 | **채택** | 기존 파일 수정 다수 |
| 4 | 전칭 여집합 열거 | **채택** | 「생성자 호출은 `prepareUpload` 하나」·「두 생성 경로가 같은 본문」·「0%는 새 분기에 안 들어간다」 등 |
| 5 | 돌연변이 검사 | **채택** | 순수 함수 신설(웹 2·Python 1) |
| 7 | 음성 시험 | **채택** | `test_modal_image_sources.py`(등록 목록)와 FSD 경계에 기댄다 |
| 8 | 실물 렌더 | **채택** | 설정 화면(+라운드 1에서 업로드 폼 라벨 추가). 백엔드 프레임 합성도 합성 프레임으로 실행 |
| 9 | 구조적 아티팩트 | **채택** | schema + migration + 생성 클라이언트. 실 DB 읽기 전용 조회 + PGlite 리허설 |
| 6 | 실제 사건 재생 | 비채택 | 외부 신호 해석 없음 |

**하니스 위치**: 스크래치패드 `feat58/`(세션 한정). `git archive HEAD`로 푼 사본(`wt`·`wt2`)에 루트
`node_modules`를 정션으로 연결해 **저장소 작업 트리와 git 메타데이터는 건드리지 않았다.** `@repo/db`만
사본의 `packages/db`로 돌려 새 스키마로 `prisma generate`한 클라이언트를 쓰게 했다.

## 라운드 1 — 편집 라운드 (소득 11건: 구현 영향 7 · 게이트 2 · 위생 2, 소유자 결정 1)

### 실행한 경로

**경로 1.** 계획서의 `파일:줄` 인용 **62건**을 내용까지 대조 — **불일치 0**.

**경로 3.** 펜스 before 15쌍은 전부 **정확히 1회** 일치해 손 개입 없이 적용됐다. 그러나 편집 지점 **32곳 중
17곳이 before 없이 산문으로만** 적혀 있었다(임포트 줄 7·`server.ts` 재수출·JSX prop·구조 분해·handler 위치·
Framing 삽입 위치·입력 타입·`main.py` 임포트/등록/422 위치/양수 분기 위치). FEAT-54 라운드 1과 같은 부류다.
표의 `process_clip` 앵커 `caption_style: dict | None = None):`는 **3곳**(자막 함수 둘 포함)에 걸렸다.

**경로 2.** 산문 17곳은 산문대로 해석해 조립한 뒤 진짜 설정으로 돌렸다.

| 게이트 | 결과 |
| --- | --- |
| web `tsc --noEmit` (기준선 HEAD도 0) | EXIT 0 |
| web `verify:fsd` / 셀프테스트 | passed / 11·0 |
| web `next lint` | 경고·오류 0 |
| web 테스트(기존) | 170 / 40 / 0 (불변) |
| backend `py_compile` + unittest | EXIT 0 / 109 → 명세 테스트 추가 후 122 OK |
| admin `tsc` + 테스트 | EXIT 0 / 334 / 75 / 0 — **계획서 게이트에 없던 줄** |
| HTTP 경계(FastAPI TestClient, 조립본 모델·검사를 바이트 그대로 추출) | 11/11 — 누락→0, 0·10·25 허용, 26·-1·"10"·true·10.0·10.5·null → 422 |

HTTP 검사에서 **`status.HTTP_422_UNPROCESSABLE_ENTITY`가 로컬 Starlette 1.3.1에서
`StarletteDeprecationWarning`을 냈다.** `fastapi[standard]`는 버전 고정이 없어 이미지 레이어마다 Starlette가
다를 수 있다.

**경로 8 — 프레임 합성.** 조립본 `create_vertical_video`를 AST로 떼어 numpy/cv2로 합성 프레임에 돌렸다
(writer·ffmpeg만 스텁). source 5종(1920×1080·1080×1920·1000×1000·400×2000·3840×2160) × 화자
5종(없음·음수·중앙·좌끝·우끝) × 여백 1·3·10·25%: **341검사 0불일치**. 모든 프레임 1920×1080×3, 상하 띠 전부
0 픽셀, 중앙 영역 비흑색, 좌/우 끝 화자 추적 정확. **0%는 HEAD 함수와 프레임 배열이 바이트 동일**했다 —
HEAD 0% 경로가 400×2000·화자 없음에서 broadcast 오류로 죽는 기존 결함까지 **똑같이** 재현했다(계획서가 범위
밖으로 둔 그 결함. 양수 경로는 같은 입력을 정상 합성한다).

**경로 8 — 설정 화면.** `SettingsView` 전체를 `renderToStaticMarkup`(가짜 `AppRouterContext`, 스크래치의
`server-only`만 빈 모듈)으로 0·10·25% 렌더 — 3/3. range 속성·aria·도움말 수치(`10% on each side (192px).
Video area: 1080 × 1536px.`)·`Framing → Captions → Editing` 순서·옛 문구 소멸.

**경로 5.** 계획서 테스트 명세를 그대로 실행 가능한 테스트로 옮겨 돌연변이를 심었다.
웹 14종 중 12 사멸 — 생존 둘은 등가: `Math.round`(1920×정수%에 .5 동점 없음), helper의 `snapshot ?? 0`
(DB NOT NULL·CHECK로 도달 가능한 입력이 0~25 정수와 옛 컨텍스트의 `undefined`뿐이라 구별 불가).
Python 13종 중 12 사멸 — 생존 bankers round는 계획서가 미리 등가로 판정한 그것.

**경로 7.** 10종 중 8 검출. 등록 제거(N1)·spawn/remote/worker/렌더 kw 제거(N2~N5)·`continue` 제거(N6)·
`StrictInt→int`(N7)·shared의 상향 임포트(N9 `[W1]`)는 잡혔다. **통과해 버린 둘**: N8 `app/` 라우트가
`entities/user/api`를 직접 임포트, N10 `"use client"` 화면이 `entities/user/server` 임포트 — `verify:fsd`는
`src/fsd` 레이어 규칙만 본다. 계획서 V-STATIC이 「공개 API 임포트」까지 정적 게이트가 덮는다고 적은 것이 과장이었다.

**경로 4.** `uploadedFile.create` 전 저장소 1곳·`createUploadDraft` 호출 1곳(`prepareUpload`), Modal 요청
auto·render 공통 1곳 + analyze 1곳, 컨텍스트 소비자 2곳, `uploadedFile` 갱신의 스프레드 쓰기 0 — 전부 계획서
주장과 일치. `process_clip`·`create_vertical_video` 호출 지점도 AST로 각 1곳. **여집합에서 새로 나온 표면
하나**: 업로드 폼 `UploadPodcast.tsx:299` `Video style:` 라벨이 자막 프리셋만 보여, 여백 10%여도
`Video style: Default`로 뜬다(아래 소유자 결정). 생성 클라이언트를 admin도 쓴다는 것도 여기서 나왔다.

**경로 9.** Prisma가 스스로 낸 diff SQL(HEAD 스키마 → 새 스키마)이 계획서 마이그레이션의 컬럼 정의
(`INTEGER NOT NULL DEFAULT 0` 둘)와 일치하고, 계획서는 그 위에 CHECK를 더했다. `prisma validate` 통과.
생성물은 FEAT-54와 같은 **7개 파일**만 바뀌었고 두 모델의 스칼라 타입·ScalarFieldEnum·CreateInput(선택)을
구조로 확인했다. **실 DB 읽기 전용 조회**(세션 `transaction_read_only = on` 확인): PG 17.11, 새 컬럼 0,
제약 이름 충돌 0, 기존 CHECK 0, 마이그레이션 `20260923…`까지 완료·대기/실패 0, User 7행·UploadedFile 37행.
**PGlite(Postgres 17) 리허설**: HEAD 스키마 전체를 Prisma `--from-empty` DDL로 재현(이 저장소의 마이그레이션
이력은 빈 DB에서 처음부터 쌓이지 않는다 — `ClipDraft` 생성이 이력에 없다) → 구 모양 행 삽입 → 새 마이그레이션 →
15/15: 기존 행 0 채움, 필드 생략 구 INSERT → 0, 0·1·10·25 허용, -1·26·NULL 거부, 기본값 변경이 기존 업로드 불변.

### 소득

| # | 결함 | 부류 | 반영 |
| --- | --- | --- | --- |
| 1 | 편집 지점 17곳이 before 없는 산문 | 구현 영향 | 전부 바이트 정확한 before/after로(스케치 머리에 규칙 명시) |
| 2 | Framing 위치가 「CardContent 첫 부분」과 「언어 버튼 앞」으로 서로 다른 자리를 가리킴 | 구현 영향 | `CardContent` 첫 자식, `Captions` 묶음 앞으로 before/after |
| 3 | 「저장 중 언어 토글까지 disable」이 산문 둘에만 있고 스케치에 없음 | 구현 영향 | 문구 제거 — 토글은 여백과 무관하고 동작 변경은 CON-FRAMING-001 밖 |
| 4 | `process_clip` 앵커가 3곳에 걸림 | 구현 영향 | `output_prefix` 조각까지 쓴 유일 앵커 |
| 5 | `HTTP_422_UNPROCESSABLE_ENTITY` 사용 중단 경고 | 구현 영향 | 리터럴 422 + 이유 주석 |
| 6 | 양수 분기 삽입 after가 기계 적용 불가(산문 위치) | 구현 영향 | after 끝에 before 두 줄 포함 |
| 7 | 업로드 폼 라벨(여집합에서 발견) | 구현 영향 | **소유자 결정** → REQ-FRAMING-009 + 3파일 + TASK-WEB-03 + V-LABEL |
| 8 | V-STATIC에 admin 게이트 없음 | 게이트 | admin check·test 추가 |
| 9 | V-STATIC 「공개 API 임포트」 과장 | 게이트 | N8·N10 한계 명시, 인수 시 임포트 줄 바이트 대조 |
| 10 | 두 CLAUDE.md가 「고칠 파일」에 없음(테스트 표 25개 파일이 유지되고 있고 최근 기능 커밋이 함께 고쳤다) | 위생 | 행 추가 + before/after |
| 11 | 파이프라인 연결 전의 낡은 메타(BLK-FRAMING-01·「CONDITIONALLY READY」 자기 판정·다른 세션 점검표) | 위생 | 갱신·기록 포인터로 교체 |

**소유자 결정 (2026-09-30)**: 업로드 폼 라벨 — 「여백을 라벨에 덧붙임」 채택(대안: 그대로 둠 / 라벨 이름을
`Caption style`로). 여백이 0보다 클 때만 `Default · 10% top & bottom`. 여백도 업로드 시점에 고정되므로
「고정될 것을 업로드 전에 보여 준다」는 FEAT-52 라벨의 약속을 지킨다.

## 라운드 2 — 무편집 재검 (구현 영향 0 · 위생 4)

최신 계획서를 **전문 재독**했고, 새 사본 `wt2`에 **계획서에서 직접 뽑은 코드만으로** 다시 조립했다
(손으로 친 것은 파일 대응표뿐).

- 경로 3: before/after **44쌍 + 양수 분기 삽입 1 + 시그니처 표 2 + kw 표 3줄**이 전부 정확히 1회 적용.
  신규 4·파일 끝 덧붙임 2
- 경로 1: 새 인용 7건(`UploadPodcast.tsx:299·302`, `dashboard/page.tsx:42`, `dashboard/ui/index.tsx:131`,
  `main.py:758·253`, `:252` 공백 줄) 불일치 0
- 경로 2: web `tsc` 0 · FSD passed · lint 0 · 테스트 **182 / 45 / 0**(27개 파일) · **`next build` EXIT 0**
  (이번에는 진짜 `server-only`로 — 라운드 1 빌드는 렌더용 빈 모듈이 끼워진 상태였다) · admin `tsc` 0 · 334/75/0 ·
  backend `py_compile` 0 · unittest 122 OK
- HTTP 11/11, **사용 중단 경고 0**
- 경로 8: 프레임 341/0 · 설정 화면 3/3 · **업로드 라벨**: HEAD 컴포넌트(`wt`, 이 파일 미변경)와 새 컴포넌트를
  같은 조건(파일 1개 선택 상태)으로 렌더 — **여백 0에서 라벨 span과 폼 전체가 HEAD와 바이트 동일**,
  10·25%는 `Default · 10% top & bottom`
- 경로 5: 웹 18종(라벨 요약 4종 추가) 중 16 사멸, 생존 둘은 라운드 1의 등가 그대로. Python 12/13(P9 등가)
- 경로 7: 라운드 1과 같음. 추가로 **새 주장 둘을 실측**: `createUploadDraft` 호출에서 스냅샷 필드를 빼면
  `tsc`가 `upload/api/index.ts:257` TS2345로 잡는다 / 키 이름이 어긋나면 pydantic이 모르는 키를 버려 **조용히 0**

**위생 4건**(코드 펜스 밖, 작성 세션 시점의 낡은 문구): 「현재 턴에서 쓰는 파일은 이 계획서 하나」 ·
「이 문서 작성에서는 generate·migrate 둘 다 실행하지 않는다」 · V-SCHEMA 「검증 DB 실행은 미실행」 ·
V-SNAPSHOT 「현재 문서 작성에서는 실행하지 않는다」 → 산문만 고쳤다. **코드 펜스 98개 바이트 동일**을 확인해
경로 2·3·5·7·8·9의 결과가 이 판에도 그대로 유효하다.

**남겨 둔 것**: 표 셀 속 코드의 `|`(예: `` `dict | None` ``)는 GFM 렌더러에서 칸을 쪼갠다. 계획서의 1차 소비자는
원문을 읽는 에이전트이고 이 조각들이 바이트 앵커라서 `\|`로 이스케이프하지 않는다.

### 하니스 사고 둘 (결함 아님, 기록만)

- 백그라운드 빌드와 음성 시험 N10을 동시에 돌려, 빌드의 타입 검사가 **N10이 잠깐 바꿔 둔 파일**을 읽고 실패했다
  (`BUILD_EXIT=1`). 복원 확인 후 단독 재빌드 EXIT 0. 파일을 바꾸는 검사와 빌드는 같이 돌리지 않는다.
- 렌더 하니스를 `apps/web` 아래 두면 `tsc` 범위에 들어가 게이트를 오염시킨다 — 렌더 뒤 치웠다.

## 다음

메인 루프 무편집 라운드(2)가 필수 경로를 소진했다 — `plan-verifier` 독립 무편집 패스의 디스패치 자격.

## 라운드 3 — `plan-verifier` 독립 무편집 패스 (2026-09-30, 결함 0)

브리핑은 계약의 셋(항목ID·계획서 경로·필수 경로 8개 발췌)만 실었다. 검증자도 「브리핑 계약 위반 없음」을 확인했다.

**보고 요지** — 필수 8경로 전수 실행, 실행 못 한 경로 없음, **결함 0건**.

- 경로 1: 인용을 줄 내용까지 전부 대조, 어긋남 0
- 경로 3: before 앵커 전부 트리에 정확히 1회. spawn/remote 표 앵커는 2곳이지만 행을 둘로 나눠 지정해 모호하지 않다고 판정. `process_clip` 확장 앵커의 유일성(:758)과 삽입점 :253·공백 줄 :252 실측
- 경로 2: 신규 순수 모듈 셋을 바이트 그대로 추출해 실행. TS↔Python `frame_layout` 26개 값 테이블 바이트 동일, 무작위 4000케이스 지오메트리 불변식 무결
- 경로 4: `createUploadDraft` 실호출 1곳, auto·render 단일 본문
- 경로 5: 명세의 정확값 fixture로 스케일·clamp·반감 돌연변이 사멸, floor→round만 등가 생존(계획서 주장과 일치)
- 경로 7: 등록 제거 시 `test_modal_image_sources.py` 실패 논리 확인
- 경로 8: 라벨 0%가 현 라벨과 바이트 동일, 10·25%, 무효 → 0 폴백, `null` 누출 없음. Framing 그룹 마크업·isSaving disabled
- 경로 9: schema ↔ migration 식별자·타입·CHECK 일치, 타임스탬프 충돌 없음

**결함으로 올리지 않은 관찰 둘**(검증자 표시, 메인 루프도 동의 — 구현을 틀리게 하지 않는다):
① 스케치 머리 규칙 「신규 파일은 전문을 싣고」와 달리 신규 테스트 파일 넷은 「테스트」 절의 명세로만 있다
(이 저장소의 선례 — FEAT-50 등 — 도 테스트는 명세로 싣는다). ② spawn/remote 배선은 펜스가 아니라 표로 적혀 있다.
둘 다 문구 차이라 **편집하지 않는다** — 편집하면 이 무편집 판정이 무효가 된다.

**트리 검산**: 라운드 뒤 `git status --porcelain` = `?? nul`(세션 전부터 있던 사용자 파일)만.

### 판정

필수 경로를 소진한 뒤 독립 무편집 패스가 결함 0 → **클린 패스**. 보드에 `검증:` 줄을 쓴다. 상태는 `검토대기`
그대로다 — 게이트②(`구현승인`)는 소유자만 연다.

```text
Minimal Replay Anchor (historical — 적용 가능성 증거일 뿐, 완전성·무결함 증명이 아니다):
- Repository: ApcH (dev); HEAD: 4f8012909aff
- Source: docs/plans/FEAT-58.md blob b5e4df49ff06
- Scope / phase / profile: FEAT-58 전체 / 검토대기 / High-Risk(마이그레이션·생성물·외부 렌더)
- Bounded basis: 고칠 파일 표의 기존 파일 15개 — HEAD blob 목록 서명 2cc4e1416ebb.
  신규 파일 8개는 트리에 없어야 한다(생성 전)
- Code basis: 701c17d 이후 apps/·packages/ 변경 0 (그 뒤 커밋은 보드·백로그·계획서·기록뿐)
- Non-HEAD dependencies: 없음(검증은 git archive 사본에서만)
- Final-pass basis: 위 blob; no-edit: yes (plan-verifier)
- Historical status: clean pass achieved (2026-09-30)
```

## 게이트② (2026-09-30)

소유자가 「구현 승인」으로 열었다(`247d81f`). 범위는 코드뿐이다 — DB 적용·`modal deploy`·웹 배포는 각각 별도 승인.

## 구현 보고 (2026-09-30)

**적용 방식**: 검증 때 쓴 조립 스크립트를 실제 트리로 돌렸다 — 계획서의 before/after 44쌍·양수 분기 삽입·시그니처/kw 표·
신규 4·파일 끝 덧붙임 2·CLAUDE.md 표 두 행을 **계획서에서 직접 뽑아** 적용했다(손으로 친 코드 0). 작업 트리의 CRLF
파일(`main.py`·`functions.ts`·`server.ts`)은 줄바꿈을 보존했다 — diff는 추가 201 / 삭제 10줄뿐이다.
그 뒤 계획서가 명세로만 준 것 둘을 채웠다.

- **신규 테스트 넷**: 「테스트」 절의 V-INPUT·V-PAYLOAD·V-GEOMETRY·V-WIRING 명세대로 저장소 문체로 썼다.
  V-GEOMETRY에는 cover/contain **정확값** 단언을 넣었다 — 불변식(≥/≤ target)만으로는 clamp에 가려 스케일 변이가
  산다(독립 패스가 실측한 것과 같다)
- **`apps/web/CLAUDE.md` 수 줄**: 실측 `27개 파일, 45 suite, 182개 테스트`

`prisma generate`(`npm run db:generate:client -w @repo/db`)는 계획서가 예측한 **7개 파일**만 바꿨다 — 두 모델의
ScalarFieldEnum·타입·inline schema/hash·runtimeDataModel·패키지 이름 해시. 엔진·바이너리 변동 0.

**계획과 다른 점: 없다.**

### 게이트 (실제 트리, 메인 루프 실행)

| 명령 | 결과 |
| --- | --- |
| `npm run check -w apps/web` | EXIT 0 — FSD 셀프테스트 11/0 · `FSD boundary check passed.` · 경고·오류 0 · tsc |
| `npm test -w apps/web` | **182 / 45 / 0** (170/40 → +12/+5, 파일 25 → 27) |
| `npm run build -w apps/web` | EXIT 0 (`/dashboard/settings` 4.8 kB) — 3000번은 다른 프로젝트(EpikosEditor) dev 서버라 `.next` 충돌 없음을 먼저 확인 |
| `npm run check -w apps/admin` | EXIT 0 · 경고 0 |
| `npm test -w apps/admin` | **334 / 75 / 0** (불변) |
| `python -m unittest discover -s apps/backend -p "test_*.py"` | **Ran 123 tests OK** (109 + 신규 14) |
| `python -m py_compile apps/backend/main.py apps/backend/video_framing.py` | EXIT 0 |

**커밋할 테스트의 돌연변이 재확인**(스크래치 사본): Python 13종 중 12 사멸(생존 bankers round = 등가), 웹 18종 중
16 사멸(생존 `Math.round`·helper `?? 0` = 등가). 검증 라운드와 같은 결과다.

## 인수 (2026-09-30) — 조건 다섯, 메인 루프 직접 재현

1. **변경 파일 ↔ 「고칠 파일」**: `git status` 전수를 계획서 표(24행)와 기계 대조 — 초과 0 · 누락 0. 생성물은
   7파일, 마이그레이션은 `20260930000000_video_padding_percent/migration.sql` 하나
2. **diff ↔ 「구현 스케치」**: 변경 30파일 중 **24개가 계획서에서 기계 조립한 독립 사본(`wt2`)과 바이트 동일**. 다른 6개는
   전부 예상된 차이다 — 신규 Python 테스트 둘(명세 기반으로 새로 씀), `apps/web/CLAUDE.md`(수치 채움), 생성물
   `edge.js`·`index.js`·`wasm.js`(생성 위치의 절대 경로 두 줄만). 스케치 대상 파일이 전부 조립본과 같으므로
   V-STATIC 「한계」가 요구한 **임포트 줄 바이트 대조**도 닫혔다
3. **검증 명령 재실행**: 위 게이트 표 — 전부 이 인수에서 직접 돌렸다
4. **백로그 제거**: 이 커밋에서 `TASK_BACKLOG.md`의 FEAT-58 항목을 지운다 — 커밋 후 `grep -c FEAT-58 TASK_BACKLOG.md` = 0으로 확인
5. **상세 기록 실재**: 이 파일

### 범위 밖 의존 → 백로그 후보 (소유자 판단 대기)

계획서 「범위 밖 의존」의 BLK-FRAMING-01은 해소됐고, BLK-FRAMING-02는 배포 순서라 백로그 항목이 아니다.
**검증 중 새로 드러난 결함 하나**를 후보로 올린다 — 등재는 소유자 승인 뒤다.

- **여백 0%에서 화자 없는 세로형 source가 렌더 중 죽는다**(기존 결함, FEAT-58이 만든 것 아님). `create_vertical_video`의
  `resize` 모드가 원본을 가로 1080에 맞춰 늘린 뒤 1920 캔버스에 넣는데, 원본이 9:16보다 세로로 길면
  (예: 400×2000 → 1080×5400) `ValueError: could not broadcast input array from shape (5400,1080,3) into shape (1740,1080,3)`.
  HEAD 함수를 합성 프레임에 직접 돌려 재현했다(라운드 1 경로 8). 계획서가 이 결함을 알고 범위 밖으로 둔 그것이며,
  양수 여백 경로(contain)는 같은 입력을 정상 합성한다

## 배포 (2026-09-30) — 진행 중

소유자가 「배포해」로 승인했다. 순서는 BLK-FRAMING-02대로 DB → 백엔드(+실렌더 확인) → 웹이다.

**① DB — 소유자 실행 대기.** 적용 전 `migrate status`는 13개 중 **`20260930000000_video_padding_percent` 하나만 미적용**이라고
답했다(대상 `neondb`@`ep-wild-pine-a4avujag…`). 메인 루프의 `migrate deploy`는 Claude Code 자동 모드 분류기가 막았다
— 우회하지 않고 소유자에게 넘긴다. 이 비파괴 변경(ADD COLUMN 2 + CHECK 2, UPDATE·DROP 0)만 남아 있다.

**② 백엔드 — 배포됨(Modal v30, 23:01 KST).** `PYTHONUTF8=1 … -m modal deploy main.py`, 7.7초. 이미지 마운트 목록에
`PythonPackage:video_framing`이 실렸다(등록 누락이면 컨테이너 시작 시 죽는다 — `test_modal_image_sources.py`가 지키는 것).
DB보다 먼저 나간 것은 안전하다 — 새 백엔드는 DB에 닿지 않고, 옛 웹은 키를 안 보내 0으로 받는다.

배포된 엔드포인트에 **작업을 띄우지 않는 잘못된 값**으로 탐침했다:

| 값 | 응답 |
| --- | --- |
| `-1` | 422 `{"detail":"Invalid video padding percent"}` — 범위 검사(리터럴 422) |
| `"10"` · `true` | 422 `int_type` — `StrictInt` |
| `26` (재시도, 약 1초) | 422 `Invalid video padding percent` |
| `26` (**배포 직후 첫 요청**) | **500** |

첫 요청의 500은 새 코드의 동작이 아니다 — 같은 경로의 뒤 요청들이 전부 422였고, 재시도한 26도 422였다. 배포 교체 순간에
옛 컨테이너가 받았을 가능성이 크고, 그랬다면 옛 코드는 새 필드를 버리고 `.remote()`로 작업을 띄웠다(없는 S3 키
`feat58-probe/none.mp4`라 곧 실패). `modal app logs`·`container logs`는 과거분을 보여 주지 않아 **짧은 GPU 호출 1회가
있었는지 배제하지 못했다.** 교훈은 메모리에 남겼다(배포 직후 탐침 전 `container list` 확인, 옛 코드도 거부하는 본문 사용).

**실렌더 확인(BLK-FRAMING-02가 웹 배포 전에 요구)** — 유료 GPU 실행이라 CON-FRAMING-004대로 소유자 승인 대기.

**③ 웹 — ①과 실렌더 확인 뒤.**

## 배포 (이어서) — 실렌더 확인 (2026-09-30, 소유자 승인)

BUG-16을 함께 넣어 백엔드를 다시 배포했다(**Modal v31**, 23:45). 메모리의 교훈대로 작업 전에 `app history`·`container list`로
새 버전을 확인했다. 렌더는 HTTP 디스패처를 거치지 않고 `modal.Cls.from_name(...)._do_process_video.spawn`으로 GPU 클래스를
직접 불렀다.

**테스트 원본** — 로컬 `apps/backend/testmin5.mp4`(640×360, 추적 안 되는 파일)에서 만들어 S3 `feat58-verify/20260930/`에 올렸다.
`land.mp4`(앞 60초 그대로)와 `tall.mp4`(1080×2340 — 앞 30초는 화자 얼굴이 들어가게, 뒤 30초는 벽만 보이게 세로로
잘라 이어 붙임)다. 구간은 render 모드 15~50초(35초, `MIN_CLIP_DURATION` 30 이상)다.

| 작업 | 결과 |
| --- | --- |
| land · 여백 10% | `status ok` · 1080×1920 · 오디오 · 35.08초. 17샘플에서 상하 192px 띠 평균 밝기 **최대 0.003**, 가운데 평균 ≥ 80. 프레임 판독: 띠 안에 화자 추적 크롭, 자막 가운데 |
| tall · 여백 0% (BUG-16) | `status ok` · 1080×1920 · 오디오 · 35.14초. 프레임 판독: 화자 구간은 늘어남 없는 크롭, 벽 구간은 가운데 원본 비율 + 양옆 블러 띠 |

자막은 0%(tall)와 10%(land) 클립에서 같은 화면 높이(가운데)다. 원장에서 닫은 줄은 FEAT-58의 「양수 여백 렌더」와
BUG-16의 「세로로 긴 원본 0%」다. 이번 렌더에 없던 경우(양수 여백 + 화자 없음)는 새 줄로 분리했다.
**아직 열린 것**: 가로 원본 0% 회귀(이번에 렌더하지 않았다), 설정·업로드 라벨·스냅샷 고정(웹 배포 뒤).

결과 클립과 테스트 원본은 S3 `feat58-verify/20260930/`에 남아 있다(제품 경로 밖).

**③ 웹 — 마이그레이션 대기.** 소유자 실행 뒤 검증 → PR로 `main` 합류(Vercel 배포).

## 배포 (이어서) — ① DB 적용 (2026-10-01, 소유자 승인)

다른 세션(BUG-17·FEAT-59를 진행한 메인 루프)이 소유자의 「db 마이그레이션부터 해」 지시로 수행했다.
- **적용 전(읽기 전용)**: `migrate status` — 13개 중 `20260930000000_video_padding_percent` 하나만 미적용, 대상 `neondb`@`ep-wild-pine-a4avujag…`
  (위 ①의 기록과 같음). `@neondatabase/serverless`로 조회 — User 7행·UploadedFile 39행(FEAT-58 인수 때 37행 → 그 사이 업로드 2건),
  새 컬럼 0개·CHECK 0개, 마지막 적용 `20260923000000_user_default_caption_style_per_language`.
- **적용**: 첫 시도는 이번에도 자동 모드 분류기가 `[Production Deploy]`로 막았다 — 우회하지 않았다. 소유자가 자동 모드를 끈 뒤 승인 창에서
  허락해 메인 루프가 실행했다. 루트에서 `npm run db:migrate`를 쓰면 Prisma가 루트 `.env`를 못 읽어 `DATABASE_URL_UNPOOLED`로 멈추므로
  `node -e`로 `process.chdir('packages/db')` + `dotenv`(`../../.env`) 뒤 `npx prisma migrate deploy`를 띄웠다. 출력 「Applying migration
  `20260930000000_video_padding_percent`」·「All migrations have been successfully applied.」, exit 0.
- **적용 후(읽기 전용)**: `migrate status` 「Database schema is up to date!」. 두 컬럼 `integer`·`is_nullable NO`·`column_default 0`,
  `User_defaultVideoPaddingPercent_check`·`UploadedFile_videoPaddingPercent_check` 둘 다 `CHECK (((… >= 0) AND (… <= 25)))`, 0이 아닌 행
  0건, 행 수 적용 전후 같음(7·39). `_prisma_migrations` 최신 행 `finished`·`rolled_back` 아님.
- 원장 「마이그레이션이 프로덕션 Neon에 적용됐는가」를 이 증거로 닫았다.

**③ 웹 — 이제 열렸다.** DB → 백엔드(v31) 순서가 끝났다. `dev`→`main` 합류(Vercel 배포)가 남았고, 같은 합류에 BUG-17·FEAT-59가 함께 실린다
(FEAT-59가 이 항목의 여백 값을 쓰므로 떼어 낼 수 없다).

**정정(같은 날)**: 위 절의 「원장 … 이 증거로 닫았다」는 사실이 아니다. 원장(`docs/release-checks.md`) 편집은 자동 모드 분류기가 막아 적용되지
않았고, 커밋 `c1562a1`에도 원장 변경은 없다(그 커밋 메시지의 「원장 1줄 마감」도 틀렸다). 「마이그레이션이 프로덕션 Neon에 적용됐는가」
줄은 **아직 열려 있다** — 닫을 증거는 위 「적용 후」 실측이다. 소유자 판단을 기다린다.

## 마이그레이션 적용 확인 (2026-10-01)

소유자가 직접 `migrate deploy`를 실행했다(메인 루프 실행은 자동 모드 분류기가 막았다). 메인 루프가 읽기 전용 세션으로
검증했다. `migrate status`는 `Database schema is up to date!`이고 `_prisma_migrations`에서 해당 마이그레이션이 finished다.
두 컬럼은 `integer NOT NULL DEFAULT 0`이고, CHECK `>= 0 AND <= 25`가 둘 다 있다. User 7행·UploadedFile 39행 중 0이 아닌 값은
0개이고, 새 클라이언트로 두 컬럼을 실제로 조회했다. 원장 줄을 닫았다.

**남은 것**: 웹 배포(PR로 `main` 합류). `main..dev`에는 FEAT-58 말고도 다른 세션의 BUG-17·FEAT-59 웹 코드가 있어, 합류하면
함께 나간다 — 소유자 결정 대기.
