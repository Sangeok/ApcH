# FEAT-36 — 메인 루프 기록

## 게이트① (2026-09-07)

소유자 발주("1 수행" → 백로그 등재 → "계획 지시"). 보드 `승인대기`→`계획지시`는 메인 루프가 기록했다(`c43911e`).
같은 커밋에 다른 세션의 FEAT-35 `검토대기` 전이가 섞여 들어갔다 — 두 세션이 **같은 워킹트리**를 쓰고 있고,
보드 파일 전체를 스테이징하는 사이에 그쪽 편집이 디스크에 있었다. 이후 이 세션은 자기 파일만 경로 지정으로
스테이징한다.

web-dev 디스패치는 정의상 `계획지시` 전부를 쓰게 되어 있어 FEAT-35까지 집을 수 있었다. 소유자가 "FEAT-35는
다른 세션"이라 알려 중간 메시지로 FEAT-36만 쓰게 했고, web-dev 보고와 `git diff`로 FEAT-35 무접촉을 확인했다
(계획서 파일 mtime 22:25:55는 디스패치 이전, 보드 변경은 FEAT-36 status 한 줄뿐).

## 필수 경로 확정 (2026-09-08)

| 경로 | 채택 | 근거 |
| --- | --- | --- |
| 1 인용 전수 대조 | ○ | 전 항목 필수 |
| 2 스케치 추출·실행 | ◎ | 코드 블록 13개 — 신규 2파일 전문 + 기존 6파일 before/after. 스크래치패드 워크트리에 바이트 그대로 적용해 `tsc`·`eslint`·`verify:fsd` |
| 3 before/after 기계 적용 | ○ | 기존 파일 6개 수정 — 앵커 23곳 |
| 4 전칭 여집합 | ○ | "새 import 불필요", "FEAT-35는 `ui/index.tsx` 무변경", "두 계획의 줄이 서로소", "웹에 Gemini 없음", "쉼 분할·하이라이트 없음" |
| 5 돌연변이 | ◎ | 순수 함수 5개 신설(`buildCaptionCues`·`pickActiveCue`·환산 3종) — 「테스트」 명세를 실행 가능하게 옮겨 18종 주입 |
| 6 실제 사건 재생 | ○ | 외부 신호 = 전사 JSON. 생산자 계약(`main.py:889-934`)을 따라 같은 형태의 입력 300건을 만들어 백엔드 묶기 함수의 Python 이식본과 **차등 비교** |
| 7 음성 시험 | × | 새 경계·화이트리스트 없음 |
| 8 실물 렌더 | ○ | 화면 변경 — `CaptionPreviewPlayer`·`CaptionStyleEditor`를 `renderToStaticMarkup` |
| 9 구조적 아티팩트 | ○ | next/font 폰트 메타데이터(`font-data.json`)를 파싱해 서브셋·굵기 확인 |

하니스 위치: 스크래치패드 `wt36/`(git worktree, `node_modules`는 정션), `h36/`(테스트·퍼즈·렌더·돌연변이 스크립트),
`oracle/group_words.py`(main.py:287-345 묶기 루프의 축자 이식), `fonts/`(설치 폰트 2종 + libass·FreeType 소스).
공유 워킹트리는 건드리지 않았다.

## 라운드 1 (편집) — 결함 3건 (구현 오류 유발 2 · 명세 구멍 1) + 문서 위생 3

### 결함 ① — Anton 폰트 환산 상수가 틀렸다 (`2048/3083` → `2048/3550`)

계획서는 "Anton은 USE_TYPO_METRICS가 켜져 FreeType가 sTypo(3083)를 쓴다"고 추론했다. FreeType 단독으로는 맞다
(`sfobjs.c:1424-1427`이 fsSelection bit7이면 sTypo를 root ascender/descender에 넣는다). 그러나 **libass가 그 값을
덮어쓴다**:

- libass master `ass_font.c:356-366` `set_font_metrics` — "Mimicking GDI's behavior": `face->ascender = usWinAscent`,
  `face->descender = -usWinDescent`(둘의 합이 0이 아닌 한). 0.15.2에도 같은 함수가 `:98-104`에 있고 `:262`에서 호출된다.
  Ubuntu 22.04의 apt ffmpeg가 링크하는 libass가 0.15.2다(`main.py:64-65` 이미지 정의).
- 그 뒤 `ass_face_set_size`(0.15.2 `:307-316`, master `:580-589`)가 `FT_SIZE_REQUEST_TYPE_REAL_DIM`으로 ASS 크기를
  요청하고, FreeType `ftobjs.c:3281-3283`이 REAL_DIM을 `face->ascender - face->descender`에 맞춘다.

따라서 ASS fontsize 1 = winAscent+winDescent 픽셀이고, 분모는 Anton **3550**(2876+674), Noto **1448**(1160+288)이다.
독립 실측(설치 URL에서 받은 파일의 OS/2·hhea·head 표 파싱): Anton upem 2048·win 3550·hhea/typo 3083, Noto upem 1000·
win 1448·hhea 1448·typo 1000. Noto는 값이 같아 계획서 상수가 유지되고, Anton만 0.664→0.577로 바뀐다(현재 편집기 대비
실렌더 비율 1.51배→1.73배). 계획서 「현재 동작」·상수 블록 주석·「테스트」 기대값(13.50→11.73)·「대안」을 고쳤다.

### 결함 ② — 그림자 알파가 뒤집혀 있다 (`rgba(12,12,12,0.82)` → `0.18`)

`main.py:370` `pysubs2.Color(12, 12, 12, 210)`의 넷째 인자는 ASS 알파(0 = 불투명, 255 = 투명)다 — pysubs2 `Color`의
기본값이 `a=0`이고 그것이 불투명 기본색이라는 점, ASS `&HAABBGGRR`의 AA가 투명도라는 점이 근거. 210/255 = 0.82는
**투명도**이므로 CSS 불투명도는 0.18이다. 스케치 리터럴을 고치고 그 줄에 주석을 달았다.

### 결함 ③ — 「테스트」 명세의 구멍 2 (돌연변이 생존)

명세 12항목을 `.test.mjs`로 옮겨(12/12 통과) 18종 돌연변이를 심었다: 15 사멸, 3 생존.

| 생존 | 판정 |
| --- | --- |
| `w.end <= clipEnd` → `<` | **구멍**. `end === clipEnd` 단어가 명세에 없다. 항목 ③에 경계 포함 단언 추가 |
| flush 뒤 `curStart = startRel` 제거 | **구멍**. 항목 ①이 텍스트만 단언한다. 두 번째 큐 start 단언 추가 |
| `Math.max(0, w.start - clipStart)` 클램프 제거 | **등가 돌연변이**. 범위 필터가 `start >= clipStart`를 보장해 클램프가 죽은 코드다. `main.py:321`과의 대칭을 위해 남기되 명세 대상이 아니다 |

부수 발견: 명세 ④를 `100.4 − 100`으로 쓰면 부동소수(0.40000000000000568) 때문에 `deepEqual`이 실패한다. 구현자가
같은 함정에 걸려 "고치다" 로직을 건드릴 수 있어 「테스트」에 주의 줄을 넣었다.

### 결함 ④ — 스타일을 바꿀 때마다 재생이 처음으로 되돌아간다 (런타임)

`useEffect` 의존성이 `[playUrl, clipStart, clipEnd, cues]`라 줄당 단어·대문자 변경 → `cues` 재계산 → 이펙트 재실행 →
`readyState >= 1`이면 `seekToStart()`. 라이브 미리보기에서 슬라이더 클릭마다 클립 시작으로 튀는 동작이다. 큐를 ref로
읽고 재생 이펙트는 URL·구간에만 묶도록 스케치를 고쳤다(별도 이펙트가 ref를 갱신하고 현재 위치의 큐를 다시 고른다).
수정본을 워크트리에 적용해 `tsc`·`eslint`·렌더를 다시 통과시켰다.

### 문서 위생

- `:22`만 지우면 `:21`의 주석(`// 미리보기 컨테이너의 높이…`)이 고아가 된다 → `:21-22`.
- `Noto_Sans_KR({ subsets: ["latin"] })` 거부 가능성을 "빌드 타임 확인"으로 남겨 두었는데, next 15.5.7의
  `font-data.json`을 파싱하니 Noto Sans KR 서브셋은 `cyrillic·latin·latin-ext·vietnamese`, 굵기는 `100~900·variable`,
  Anton은 `["400"]`·`latin·latin-ext·vietnamese`다. 불확실성을 확인된 사실로 교체.
- FEAT-35 겹침 표기가 검토대기 초판 줄번호였다. FEAT-35 계획서 `f7e6e57` 기준으로 갱신 — 서로소 판정은 유지
  (FEAT-35는 import 블록·`:62-79`·`:124-138`·`:323-330`·`:359-374`, FEAT-36은 `:45-56`·`:81-92`·`:479-488`).

### 통과한 것

- **경로 1**: 인용 전수를 스크립트로 덤프해 대조 — 웹 8파일·`main.py`·`layout.tsx`·`constants.ts` 전부 내용 일치(줄 밀림 0).
- **경로 2·3**: 코드 블록 13개를 바이트 그대로 추출, 앵커 23곳 전부 1회 일치로 워크트리에 적용. `npx tsc --noEmit` EXIT 0,
  `eslint`(변경 8파일) EXIT 0, `npm run verify:fsd` "FSD boundary check passed" EXIT 0. `import type`만으로 feature 배럴을
  가리키는 `caption-preview.ts`가 `tsx --test`에서 Prisma를 깨우지 않는 것도 실행으로 확인.
- **경로 6**: 생산자 계약(`{start,end,word}`, null 토큰은 생산 시 제거)대로 무작위 단어열 300건(공백 단어·빈 문자열·
  길이 0 단어·1~8 maxWords 포함)을 Python 오라클과 차등 비교 — **불일치 0**.
- **경로 8**: `CaptionPreviewPlayer` top/middle/bottom 렌더 — `top:33.33px`·`bottom:43.33px`·middle `inset-y-0 items-center`,
  `playUrl=null`이면 `<video>` 부재. `CaptionStyleEditor`(Korean)는 `<video>` 포함·안내 문구 바이트 일치. `CaptionStyleDialog`는
  Radix Portal이라 SSR 마크업이 비는데(길이 0) 이는 하니스 한계이며 기존 다이얼로그도 같다.
- **경로 4**: `ClipDraftCard`에 import 추가 없이 컴파일 통과(새 import 불필요 ✓). FEAT-35 「고칠 파일」에 `ui/index.tsx` 없음 ✓.
  `apps/web/package.json`·`src`에 Gemini 의존성 0 ✓. 묶기 알고리즘에 쉼 분할·하이라이트 없음은 경로 6 차등 비교가 증명.
- **경로 9**: `font-data.json` 파싱(위 문서 위생 항목).

### 확인한 비차단 사항

- `playUrl === null`(presign 로딩·실패)이면 검은 상자만 남고 안내 문구는 "Live preview on your video"라고 말한다. 메인
  플레이어는 같은 상황에 실패 문구를 낸다. 문구 선택은 제품 판단이라 계획서를 고치지 않았다 — 게이트②에서 볼 것.
- Korean 클립의 backcolor는 `(8,8,8,210)`(`main.py:563`)인데 스케치는 English 값 `(12,12,12)`로 고정한다. 회색 8 vs 12는
  식별 불가 수준이라 분기하지 않는다.
- ASS `spacing`(자간 1.8/1.2)은 스케치에 없다. 1/6 축소에서 0.3px라 생략이 타당하다.

**결과**: 편집 라운드. 다음은 무편집 패스 — 편집된 계획서에서 블록을 다시 추출해 깨끗한 워크트리에 재적용하고 같은 하니스를
다시 돌린다.

## 라운드 2 (무편집) — 무소득

편집된 계획서에서 코드 블록 13개를 **다시 추출**해(회상이 아니라 파일에서) 깨끗한 워크트리에 재적용했다.

- 경로 3: 앵커 23/23 1회 일치.
- 경로 2: `tsc --noEmit` EXIT 0 · `eslint`(8파일) EXIT 0 · `verify:fsd` passed.
- 경로 5: 갱신된 명세(두 단언 추가)로 12/12 통과, 돌연변이 18종 중 **17 사멸** — 생존은 등가 돌연변이(클램프)뿐.
- 경로 6: 차등 퍼즈 300건 불일치 0.
- 경로 8: top/middle/bottom·`playUrl=null`·Editor(Korean) 렌더 동일, 안내 문구 바이트 일치.
- 상수 실물: `constants.ts` `English: 2048 / 3550`, 플레이어 `rgba(12,12,12,0.18)` — 편집이 코드 블록에 실제로 들어갔다.

공유 워킹트리 `git status`: 이 세션 이전부터 있던 `apps/web/.claude/settings.local.json`·`nul` 외 변경 없음.

**결과**: 자기 라운드 무소득. 보드 정지 규칙대로 `plan-verifier` 독립 무편집 패스를 디스패치한다(브리핑: 항목ID·계획서 경로·
필수 경로 목록만).

## 라운드 3 (plan-verifier 독립 패스 1사이클, 2026-09-08) — 결함 1건, 문서 위생

첫 디스패치는 브리핑에 정의가 이미 요구하는 것("저장소에 쓰지 말 것")을 반복해 **계약 위반 소지**가 있어 시작 직후
중단하고, 항목ID·계획서 경로·필수 경로 목록만으로 다시 디스패치했다. 재디스패치의 보고는 계약 위반 없음을 명시했고,
`git status`로 무수정 준수를 직접 확인했다(트리에 세션 시작 시점의 둘 외 변화 없음, 워크트리는 내 `wt36`뿐).

**결함 1 (문서 위생, 상호참조)**: `CAPTION_RENDER.SHADOW` 주석 `main.py:369 / :562 new_style.shadow` — `:562`는
`korean_style.shadow`다. 값 6.5는 두 줄 모두 맞고 상수도 하나라 구현 영향 없음. → 주석을 `:369 new_style.shadow /
:562 korean_style.shadow`로 고쳤다.

**독립 패스가 통과시킨 것**: 인용 전수(웹 8파일·`main.py`·`layout.tsx`·`constants.ts`·feature 배럴) 결함 0. 스케치
①②③을 프로젝트 tsconfig 미러(strict·noUncheckedIndexedAccess·verbatimModuleSyntax·isolatedModules·Bundler)로 `tsc` PASS.
before 앵커 전부 바이트 일치, 삭제 후 잔존 참조 0. 전칭 넷 여집합 성립(FEAT-35.md 재독 포함). 명세→테스트 13건 PASS,
계획이 사멸을 명시한 두 돌연변이 + 추가 3종 사멸(시작 경계 `>=`→`>` 생존은 계획이 커버를 주장하지 않았고 코드가
백엔드와 일치). 실데이터 형태 재생 통과, `167.9-100===67.9` 확인. 렌더 4분기(URL 유무·top/bottom/middle) 일치.
`font-data.json` 파싱 일치 + 설치 URL에서 폰트를 **독립으로** 받아 OS/2·head 표를 파싱 → `EM_SCALE` 리터럴
(2048/3550, 1000/1448)과 방주 전부 일치. 실행 못 한 경로 없음.

## 라운드 4 — 메인 루프 무편집 확인 패스 (2026-09-08)

3라운드 편집(주석 한 곳)을 받은 뒤의 확인 패스. **자기 검토이지 독립 패스가 아니다.** 편집이 코드 블록 안 주석이므로
블록 13개를 다시 추출해 워크트리에 재적용하고 `tsc --noEmit`를 다시 돌렸다(결과는 아래 커밋 메시지에). `main.py:562`
`korean_style.shadow = 6.5` 재확인.

**결과: 무편집 클린 패스.** FEAT-32 선례(독립 패스가 위생만 냈을 때 반영 + 확인 패스로 마감)와 보드 안내
("문서 위생만 나온 사이클은 계수에 넣지 않는다", "같은 컨텍스트의 무편집 반복은 역대 소득 0건")를 따라 재디스패치하지
않는다. 보드에 `검증:` 줄을 쓴다.
