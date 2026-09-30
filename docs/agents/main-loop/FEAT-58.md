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
