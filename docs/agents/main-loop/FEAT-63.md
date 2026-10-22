# FEAT-63 — 메인 루프 기록

## 게이트① (2026-10-19)

같은 세션에서 소유자가 「instagram card 만드는거 구현된거 아니야?」라고 물었다. 조사해 보니 구현은 로컬 브랜치
`feat/card-news`의 `72bde11`에만 있었고, 소유자 지시(「둘 다 진행해」)로 두 가지를 했다 — `origin/feat/card-news`
백업 푸시, 백로그 등재(`e42dfd6`). 이어 다음 단계를 묻는 소유자에게 메인 루프가 게이트①을 열지, 쪼갤지,
실사용자가 아직 0명인지를 물었고 소유자가 **「진행해」**로 게이트①을 열었다.

- **담당·분할**: 메인 루프가 「하나로, main-loop 담당」을 권했고 소유자는 다른 지시 없이 「진행해」로 답했다 — 권고대로
  정한다. 이유: `packages/db`에는 담당 dev가 없다(`.claude/agents/pm.md:41`). 이미 함께 짜인 코드라 나누면
  크레딧 예약 ↔ 영상 정산 ↔ 카드뉴스 화면의 맞물림을 경계에서 놓친다(FEAT-54 전례 「쪼개지 않고 main-loop 하나」).
- **미결 질문**: 실사용자가 아직 0명인지는 답을 받지 못했다. 이 답은 배포 전환 절차의 길이(런북 7단계 vs 축약)만
  바꾸고 통합 계획의 코드 범위는 바꾸지 않는다. 그래서 계획서에는 두 갈래로 적고, 배포 승인 때 다시 묻는다.

## 계획 작성 — 시험 병합 (2026-10-19)

스크래치패드 worktree `wt63`(`9b8c022`에서 detached) + `git merge --no-commit --no-ff 72bde11`. node_modules는 FEAT-62 방식(항목별
junction 449개, `@repo/db`만 worktree 자기 `packages/db`로). 결과는 계획서 「현재 동작 — 시험 병합」 표. 로그는 스크래치패드 `logs63/`.

- 운영 DB: 읽기 전용 `migrate status`는 실행됨(미적용 = 카드뉴스 마이그레이션 하나). **`SELECT` 계수(음수 크레딧·진행 중 업로드·사용자 활동)는
  자동 모드 분류기가 「Production Reads」로 거부** — 우회하지 않고 계획서 「범위 밖 의존」 1번으로 넘겼다.
- 다른 세션의 10-14 대조 worktree(`C:/Users/hamso/AppData/Local/Temp/apch-card-news-reconciliation-20261014`, `feat/card-news` 체크아웃)에
  제안서 미커밋 편집(+101/−51, BLK-CN-03 신설)이 남아 있어 스크래치패드 `preserve63/`에 사본·diff를 떴다(sha256 `1072b776…`·`aa53bb66…`).
  그 worktree는 건드리지 않았다.

## 계획 작성 — 리뷰 (2026-10-19)

`feature-dev:code-reviewer` 넷을 병렬로(읽기 전용, 병합 전 `D/` ↔ 병합 후 `W/` 대조): ① 공통 크레딧 예약·영상 정산 ② 카드뉴스 수명주기(web)
③ backend CPU 앱 ④ 삭제·화면·공개 문구. 「구현 영향」 판정은 전부 메인 루프가 직접 재현·확인했다.

| ID | 리뷰 | 내용 | 메인 루프 확인 | 처리 |
| --- | --- | --- | --- | --- |
| V1 | ① | 정산 HEAD 허용 목록에 S3 기본 `binary/octet-stream` 없음 → 성공 영상 0개 정산 + 24h 뒤 orphan 삭제 | `main.py:879,894` ContentType 없음, venv s3transfer·boto3에 `mimetypes` 0건, 통합 CLI의 가짜 S3가 주석 값 반환 | 보정 5·6·7 |
| V2 | ① | HEAD 예외 시 정산 전체 실패 | 경로 확인. 일시 오류는 매분 cron이 회복, HeadObject는 다운로드가 쓰는 GetObject 권한과 같음 | 후속 후보 |
| V3 | ① | 복구 cron이 `ended` 첫 관측 틱에 정산 → analyze 거짓 실패·영상 메타 소실 | `reconcile-video-reservations.ts:43-75`, `reconcile-published-metadata.ts:18` | 보정 8·9·10 |
| V4 | ① | Modal HTTP 거절 뒤 재시도가 POST 없이 1시간 대기 | `functions.ts:294-300`·`:699-705`, `claim-processing-attempt.ts:183-186`, D/는 재POST | 보정 11·12·13 |
| V5 | ① | 예약·스냅샷 없는 legacy processing 행 영구 정체 | 경로 확인. drain 절차(진행 중 0 확인)가 막는다 | 배포 1번 + 후속 후보 |
| V6 | ①④ | 영상 삭제 정리가 CPU `/status`·legacy receipt에 의존 | `cleanup.ts:232-255`·`:364-367`, `video-runtime-dependencies.ts:16-19` | 배포 3·6번 |
| V7 | ① | `decrementUserCreditsFloorZero` 죽은 코드 | 호출처 0 | 후속 후보 |
| C1 | ②④ | 플래그 꺼져도 Card news 링크 3곳 | `dashboard-header/ui/index.tsx:43-48`·`:80-82`, `pages/dashboard/ui/index.tsx:128-130` | 보정 16~18·25~28 |
| C2 | ② | CPU POST 15s > route 10s → step 재시도 중복 POST | `route.ts:18`, `runtime-dependencies.ts:49`, `callCardNewsCpu`는 abort를 잡음(`job-lifecycle.ts:455-476`). dev 영상 POST도 같은 10s 아래에서 돈다(`D/…/functions.ts:366` 타임아웃 없음) | 보정 14·15 |
| C3 | ② | status 10s = 한도 | 같은 파일 `:65`, `video-runtime-dependencies.ts:27` | 보정 14·15 |
| C4·C5 | ② | 복구 cron job별 격리 없음 · dispatch가 `nextDispatchAt` 무시 | 코드 확인, 과금·중복 생성 없음 | 후속 후보 |
| B1 | ③ | `.env()`가 `add_local_*` 뒤 → deploy InvalidError | venv `modal/image.py:458-475`·`:524-527`·`env()` `_from_args`. 로컬 import는 통과(실측) | 보정 2·4 |
| B2 | ③ | 컨테이너 `ROOT.parents[1]` IndexError | `PurePosixPath('/root').parents` = `['/']`, `parents[1]` → `IndexError: 1`(실측) | 보정 2·4 |
| B3 | 메인 루프 | OFL.txt CRLF → 해시 불일치 | backend unittest 실패 1(`e35ffdeb` vs `1c05c68c`), blob은 LF. 리뷰 ③이 같은 부류 전수 — 다른 파일 없음 | 보정 1 |
| B4 | ③ | Gemini `APIError.code`(int) → failed 콜백 거부 → 15분 대기 | `card_news_app.py:187`, venv `google/genai/errors.py:64`, 웹 `contract.ts:13-17`·`:297` | 보정 2·3·4 |
| B5·B6 | ③ | 등록 전 예외 무콜백 · 인증/콜백 하드닝(비ASCII 500, callback 호스트, Python/JS 공백) | 의도·저위험 | 후속 후보 |
| A1 | ④ | = V6 | — | 배포 6번 |
| A2 | ④ | 정리 패널에 완료 job 상주 · kind 필터가 take 뒤 · hook 미무효화 | `entities/card-news/api/index.ts:325-334`, `features/card-news/api/index.ts:330-338`, `asset-cleanup-status.tsx:8` | 보정 19~24 |
| A3·A4 | ④ | 새 삭제 거부 조건·원문 오류·토스트 용어·다이얼로그 문구 | 설계 의도(진행 중 삭제 금지) + 위생 | 후속 후보 |
| B3' | ④ | refetch 실패 시 유효 잔액을 「Balance unavailable」로 덮음 | `credit-balance/ui/index.tsx:37` | 보정 29 |
| 문구 | ④ | Pricing 헤드라인·Terms §3 한 불릿이 단서 없이 카드뉴스 약속 | 분류표 확인, 나머지 문구는 구현과 일치 | 보정 30·31 |

판정 원칙: 기존 영상 기능을 깨거나 CPU 앱 배포·기동을 막는 것은 전부 고친다(V1·V3·V4·B1~B4). 플래그가 꺼진 기본 상태에서 사용자 화면이 D/보다
나빠지는 것도 고친다(C1·A2·B3'·문구). 나머지는 과금·데이터 정확성에 닿지 않아 후속 후보로 넘긴다. 범위가 커서 쪼갤 수 있었지만, 고친 자리 대부분이
몇 줄짜리고 모두 「이 병합이 만든 퇴행」이라 이 항목 안에서 닫는다.

## 필수 경로 확정 (2026-10-19)

| # | 경로 | 판정 | 이유 |
| --- | --- | --- | --- |
| 1 | 인용 전수 대조 | 필수 | 모든 항목 |
| 2 | 스케치 추출·실행 | 필수 | 코드 블록 50여 개(py·ts·tsx·md·gitattributes) |
| 3 | before/after 기계 적용 | 필수 | 기존 파일 수정 30곳 |
| 4 | 전칭 여집합 | 필수 | 「진입점 3곳」·「호출처 하나뿐」·「다른 사용 0건」·「같은 부류 없음」·「문구는 전부 단서」·「dev와 겹치지 않음」 |
| 5 | 돌연변이 | 필수 | 순수 함수 신설 셋(`isStoredClipObject`·`canRecoverySettleVideoAttempt`/`producerEndObservedAt`·`callback_failure_code`) |
| 6 | 실제 사건 재생 | 부분 | 외부 신호(S3 HEAD·Modal status·Gemini 오류)를 해석한다. 실측 재생은 운영 읽기라 거부됨 → 신호의 **모양**은 설치된 SDK 소스(Modal 1.2.1 `image.py`, google-genai `errors.py`, s3transfer·boto3)로 확인, 실물은 배포 원장으로 |
| 7 | 음성 시험 | 필수 | 새 backend 테스트 둘, 실 DB 검사가 V1·V3을 지키는가 |
| 8 | 실물 렌더 | 필수 | 헤더·잔액 배지 변경 |
| 9 | 구조적 아티팩트 | 필수 | `.gitattributes`(체크아웃 바이트까지) |

## 라운드 1 — 메인 루프 편집 라운드 (2026-10-19, 구현 영향 3 + 위생 4)

하니스는 스크래치패드 `h63/`(블록 추출 `blocks.py`, 적용 `apply63.py`, 돌연변이 `mutate63.py`, 음성 `negative63.py`, 인용 `cite63.py`), 대상은
`wt63`의 병합 커밋 `d63d8e7`(로컬 전용) 위.

- **경로 3**: 블록 50 + 산문 지시 3을 적용 — **전부 정확히 1회 일치**, 손 개입 0. 줄 끝은 대상 파일 것(CRLF)을 따르고 `write_bytes`.
- **경로 2·구현 영향 R1-1**: backend `unittest`가 `NameError: name 'callback_failure_code' is not defined`(`free-overflow`·`media-failure`) —
  기존 오케스트레이션 테스트가 함수 본문을 import 없이 `namespace` dict로 실행한다(`test_card_news_wiring.py:166-178`). 계획에 dict 한 줄 블록 추가.
  반영 후 **164 OK**(161+3).
- **경로 2·구현 영향 R1-2**: 실 DB 검사 `verify-card-news-video-compatibility.mts:544` `0 !== 1` — 검사 자체가 V3의 옛 동작(첫 `ended` 틱에 즉시 정산)을
  단언했다. 계획 「고칠 파일」에 그 스크립트가 없었다 → 35행 신설(유예 단언 + 5분 경과 뒤 정산). 같은 행에서 가짜 S3 클립 기본 타입이 `video/mp4`라
  V1이 실 DB 검사에 한 번도 걸리지 않았음을 발견 → 기본값을 `binary/octet-stream`으로. 반영 후 **3종 EXIT 0**.
- **경로 5·구현 영향 R1-3**: 돌연변이 22 중 생존 2 — `trim` 제거(세미콜론 앞 공백 케이스 없음), **「마감 null = 경과」**(마감 null + 종료 없음
  케이스 없음). 후자는 마이그레이션 전 dispatch가 전부 `deadlineAt` null이라 옛 analyze 행을 즉시 실패시키는 돌연변이다. 명세에 케이스 3개 추가 →
  **22/22 사멸**, 원본 3파일 해시 복원 확인.
- **경로 4·위생 R1-4**: 「보정 delta 파일은 전부 dev와 안 겹친다」 — 여집합에 `apps/backend/CLAUDE.md`(FEAT-61). 코드 파일로 한정하고 문서 둘은 dev 최신본
  위라고 고쳐 적음. 진입점은 `/dashboard/card-news` href 전수 12건 — 무조건 노출은 3곳뿐(`ClipActions.tsx:167`은 `derivedSets.length > 0` 조건).
  `markProcessingSpawnUnknown` 호출 전수: `functions.ts` 둘 + DB CLI 둘(시그니처 불변). 다른 `AbortSignal.timeout`은 영상 POST 30s 둘(가드가 앞 단계라 중복 POST 없음).
- **경로 4·위생 R1-5**: 「나머지 카드뉴스 문구는 전부 단서」 — `card[- ]news|carousel` 전수 열거에서 `pricing/page.tsx:16` openGraph 설명이 단서 없음 → 30b행 추가,
  주장은 「같은 목록·문단의 단서 또는 처리·보관 고지」로 정확히 고침.
- **경로 8·위생 R1-6**: 헤더 `showCardNews` false → 링크 0, true → 1(드롭다운은 닫힌 상태라 정적 렌더에 없음 — 그 분기는 tsc·코드로만). 잔액 배지:
  **보정 전 코드로 대조 렌더하면 「갱신 실패 + 이전 data」가 `Balance unavailable`, 보정 후 `3 available · 2 reserved`** — 하니스가 결함을 구별함. 그 과정에서
  계획의 주석 「Unauthorized면 data가 사라진다」가 사실이 아님(TanStack이 다음 렌더에 `initialData`로 재생성 — 보정 전후 동일)을 확인 → 주석 교체.
- **경로 1·위생 R1-7**: 산문 인용 49건 중 불일치 2(여러 줄 식의 한 줄 인용, 동명 파일 3개라 모호한 짧은 경로) → 고친 뒤 **49/49**. 블록 머리 줄 번호 44곳 병합 트리와 **불일치 0**.
- **경로 7**: 되돌리면 실패하는가 — env 층 순서·`parents[1]` 무가드 → 새 backend 테스트 실패, `binary/octet-stream` 제거·유예 0 → **실 DB 검사 실패**. 4/4.
- **경로 9**: `git check-attr` `text: set`·`eol: lf`, 재체크아웃 OFL sha256 `1c05c68c…` = manifest, 인덱스 변경 없음.
- 그 밖: web `check` EXIT 0 · `test` **361/0**(테스트 케이스 추가 전) · `next build` EXIT 0 · admin check·337/0·fsd:final EXIT 0.

라운드 소득이 있었으므로(구현 영향 3) 같은 경로로 다시 돈다.

## 라운드 2 — 메인 루프 재적용 라운드 (2026-10-19, 무소득)

라운드 1 반영본 계획서를 **새 worktree `wt63b`**(같은 병합 커밋 `d63d8e7`)에 처음부터 다시 적용했다.

- 경로 3: 블록 53 + 산문 3 전부 1회 일치. 결과 트리가 라운드 1에서 검증한 `wt63`과 **34파일 바이트 동일**(`cmp`).
- 경로 2: 동일 트리의 최종 게이트 — web `check` EXIT 0 · `test` **362/0**(56 suite, 테스트 파일 43) · `next build` EXIT 0, backend **164 OK**, admin check·**337/0**·fsd:final EXIT 0,
  실 PostgreSQL 3종 EXIT 0.
- 경로 1: 인용 49/49, 블록 머리 줄 번호 불일치 0(라운드 1 말미에 최종본으로 실행).
- 경로 5: 22/22 사멸(최종 명세). 경로 7: 4/4. 경로 8·9: 라운드 1 결과 유지(이후 바뀐 것은 주석 한 줄과 테스트 케이스뿐 — 렌더·속성 무관).
- **경로 6 — 로컬 실물 재생으로 실행**: ① GPU와 같은 boto3 1.43.62로 `upload_file`(main.py:879 모양)을 로컬 가짜 S3에 보내 요청을 잡음 — PUT 헤더에
  **`Content-Type` 없음**(`h63/replay/boto_put.py`). ② 카드뉴스 이미지 고정본 google-genai **1.49.0** wheel을 받아(`dl-genai-1.49.0/`) `APIError.code: int`·
  `self.code = code if code else …`(`errors.py:31`·`:52`) 확인, 실제 `ServerError(503)`·`ClientError(429)` 객체 → `callback_failure_code` = `cpu_job_failed`.
  ③ 웹 `parseCardNewsCallback`에 `failureCode: 503` → `invalid_type … expected string, received number`로 거부, `"cpu_job_failed"` → 수락.
  운영 S3·Modal 실측은 여전히 배포 원장 몫.

필수 경로 소진 + 자기 라운드 무소득 → `plan-verifier` 디스패치 자격.

## 독립 패스 1 — `plan-verifier` (2026-10-19, 결함 2 · 전부 문서 위생)

브리핑: 항목ID·계획서 경로·필수 경로 표(카탈로그 발췌 1~9) 셋만. 검증자가 「환경이 자동 첨부한 git log에 직전 라운드 결함 요약이 있었다」고 밝혔다 —
메인 루프의 커밋 메시지(`9678d4b` 제목)가 라운드 소득을 요약하고 있었고, Claude Code가 그 log를 새 컨텍스트에 붙인다. 검증자는 그것으로 좁히지 않았다고
적었다. **앞으로 검증 라운드 커밋 제목에는 결함 내용을 쓰지 않는다**(브리핑 계약의 「넷째」가 환경을 통해 새는 경로).

- [결함 1] 위생 — V4의 짧은 인용 `:244-250`이 직전 이름 `claim-processing-attempt.ts`가 아니라 `functions.ts`의 줄. → `functions.ts:244-251`로.
- [결함 2] 위생 — C2의 `:65`가 직전 이름 `job-lifecycle.ts`가 아니라 `runtime-dependencies.ts`. → 경로 명시.
- 실행 못 한 것으로 보고: 경로 6의 운영 실측(접근 없음), 경로 8의 라이브 렌더(「대규모 mock 없이는 불가」로 판단).

메인 루프 처리:
- 같은 부류 전수 — 인용 하니스에 짧은 `:N` 인용을 「같은 문단의 직전 파일」로 푸는 검사(`h63/bare63.py`)를 더해 돌리자 **한 건 더**: B4의 `:194-195`
  (직전 이름 `contract.ts`, 실제 `card_news_app.py`). 검증자도 놓친 곳. 셋 다 고친 뒤 전체 경로 인용 53/53 · 짧은 인용 9/9.
- 재독 중 V1 문장 「통합 CLI는 가짜 S3가 주석의 값을 돌려줘 통과했다」가 **거짓**임을 발견 — 라운드 1 실측대로 가짜 S3 클립 기본값은 `video/mp4`(`:143`).
  리뷰 ①의 추정을 확인 없이 옮긴 문장. 고침.
- 경로 8: 라운드 1에서 실제로 렌더했으므로 불가능하지 않다 — 다만 방법(`jsx: react-jsx` tsconfig 덮기, `server-only` 대체 로더, 점 없는 하니스 경로,
  QueryClient 상태 주입)이 계획서에 없었다. 인수 때도 같은 확인이 필요하므로 「테스트 — 못 덮는 범위」에 방법과 기대 출력을 적었다.
- 경로 6: 라운드 2의 로컬 실물 재생(boto3 실제 PUT 헤더, google-genai 1.49.0 실제 오류 객체 → 웹 계약 거부)을 「현재 동작」 V1·B4의 근거로 옮겼다.
  운영 S3·Modal 실측은 계획서가 배포 원장으로 넘긴 범위 그대로다.
- 코드 블록은 바뀌지 않았다(블록 54개 본문 동일 — 재추출 대조). 경로 3의 적용 결과·게이트는 그대로 유효.

구현 영향 0 → 정지 규칙 계수 대상 아님. 계획서가 바뀌었으므로 독립 패스를 다시 받는다.

## 독립 패스 2 — `plan-verifier` (2026-10-19, 결함 0 · 경로 8 일부 미실행)

브리핑 계약 준수(검증자 확인). 경로 1~7·9 실행, 결함 0. **경로 8의 「실제 import 그래프 그대로」 렌더를 미실행으로 보고** — 계획서의 방법이 하니스를
「`apps/web` 바로 아래」에 두라고 적어, 저장소 쓰기가 금지된 검증자가 따를 수 없었다(분기 로직은 격리 렌더로 확인: 헤더 0/1, 잔액 배지 보정 전후). 계약상
실행 못 한 경로가 있는 보고는 무소득 보고가 아니다 → **클린 패스로 판정하지 않는다.**

메인 루프 처리:
- 렌더 방법을 「병합 후 트리의 **사본**(스크래치패드 worktree 또는 `git archive` 추출본)의 `apps/web` 바로 아래」로 고치고, 사본의 node_modules 연결법
  (항목별 junction + `@repo/db`만 사본의 `packages/db`)을 적었다. 보존 사본 경로를 줄임표 없는 전체 경로로.
- 그 경로를 고치다 **해시 오기 발견**: 계획서·이 기록 「계획 작성 — 시험 병합」이 사본 `.md`의 sha256을 `1072b776…`로 적었는데 그것은 `.diff`의 해시다
  (두 파일을 알파벳순으로 출력한 것을 거꾸로 읽음). 실제 사본 `.md` = **`aa53bb66d8c163cd…`**, 원본 worktree 파일과 동일. `.diff` = `1072b776…`.
  계획서 두 곳을 고쳤다(위 기록의 해당 문장은 append-only 규칙대로 그대로 두고 여기서 정정한다). 구현자가 해시로 대조하면 멈췄을 지시 오류다.
- 코드 블록은 그대로(54개 본문 동일), 인용 53/53 · 짧은 인용 9/9.

## 독립 패스 3 — `plan-verifier` (2026-10-19, 결함 1 · 위생, 경로 6·8 일부 미실행)

- [결함 1] 위생 — 18) 아래 주석의 열거 「`:22`·`:310-317`뿐」이 `env` 임포트 `:21`을 빠뜨림(구현 블록은 `:21-22`를 지워 정확). → 「임포트 `:21`·`:22`와 `:310-317`」.
- 미실행으로 보고: 경로 6의 실물 재생 재실행(재현 명령이 계획서에 없어 가짜 S3 서버·1.49.0 wheel을 준비하지 않음), 경로 8의 잔액 배지 마크업
  (`server-only`를 tsconfig `paths`로 돌린 하니스에서 react-query가 두 벌 로드돼 Provider 컨텍스트가 갈림). 헤더는 실제 그래프로 렌더됨(0/1).

메인 루프 처리: 결함을 고치고, 두 미실행이 모두 「계획서에 재현 방법이 없다」에서 왔으므로 「테스트」 절에 **재현 명령**을 넣었다 — boto3 PUT 캡처 스크립트(코드
블록, 계획서에서 뽑아 그대로 돌려 `Content-Type: None` 확인), 1.49.0 wheel 확인 명령, 웹 계약 거부 확인 호출, 렌더 실행 명령과 `server-only` 로더 훅·쿼리 상태
주입 방법(라운드 1에서 실제로 성공한 방식). 인수 때도 같은 확인이 필요하다.

사고 하나: 재현 스크립트를 Bash heredoc 속 파이썬으로 계획서에 넣다가 **NUL 바이트가 들어갔다** — 이 셸 도구가 따옴표 heredoc 안의 `\`도 `\`로 바꿔,
파이썬 문자열 `"\0"`이 `"\0"`(NUL)이 됐다. 바이트 값(`bytes([92, 48])`)으로 바로잡고, 계획서 전체의 백슬래시(의도한 1곳뿐)·제어 문자(0)와
시험 트리 두 벌의 변경 파일 제어 바이트(0)를 확인했다. **앞으로 백슬래시가 든 텍스트는 heredoc 파이썬이 아니라 Write/Edit 도구로 넣는다.**

세 패스 모두 구현 영향 0. 기존 코드 블록 54개 본문 불변(새 블록 1개 추가). 인용 53/53 · 짧은 인용 9/9.

## 독립 패스 4 — `plan-verifier` (2026-10-19, 결함 0 · 미실행 0) → 클린 패스

브리핑 계약 준수. 필수 9경로 전부 실행, 결함 0, 「실행하지 못한 경로: 없음」. 요지:
- 경로 1: 「현재 동작」·결함 절·보정 before 블록 전 인용 바이트 일치. 경로 3: 이미지 블록·헤더 3블록·잔액 블록을 사본에 기계 적용(손 개입 0).
- 경로 2: 신규 TS 둘을 `apps/web/tsconfig.json` 그대로 `tsc --noEmit` EXIT 0, B2 식 eval(`/root` 무예외), backend 미보정 트리 161/1(=B3).
- 경로 5: `callback_failure_code` 4 · `isStoredClipObject` 3 · `recovery-settle-policy` 5 변이 전부 사멸, 각 케이스가 계획이 지목한 변이를 죽임.
- 경로 6: 계획서의 캡처 스크립트를 boto3 1.43.62로 실행 → PUT에 `Content-Type` 없음. google-genai 1.49.0 wheel `errors.py:31`·`:52`·`:178`. 웹 계약이
  `failureCode: 503` 거부·`"cpu_job_failed"` 수락.
- 경로 7: OFL CRLF/LF 해시 대조, `test_image_env_precedes_local_mounts` 미보정 FAIL·보정 PASS. 경로 8: 사본 트리에서 잔액 배지 보정 전
  `Balance unavailable` → 보정 후 `3 available · 2 reserved`, 헤더 0/1. 경로 9: CHECK·zod `id`·query key·manifest·Prisma `AssetCleanupJobWhereInput`.
- 검증자의 시험 병합 재현에서 web 348 중 1 실패 — 검증자가 직접 추적: node_modules를 통째로 junction해 `@repo/db`가 메인 dev 트리로 풀린 하니스 아티팩트
  (`event-catalog.test.mjs`의 `card_news_requested`는 병합 트리 `packages/db/src/analytics-contract.ts:33`에만 있음). 계획서가 경고한 FEAT-62 함정과 같다.
  메인 루프 라운드(항목별 junction + `@repo/db` 재연결)는 348/0. → 계획 결함 아님.
- 돌리지 않은 것으로 밝힌 둘(실 DB CLI 보정 후 재실행, admin 게이트)은 카탈로그 경로가 아니라 구현 단계 명령 — 메인 루프 라운드 1·2에서 실행됨(3종 EXIT 0, admin 337/0).

트리 검산(직접): `git status --porcelain` 0줄, HEAD `218bb44` 불변.

**판정: 클린 패스** — 독립 무편집 1라운드(4회차). 사이클 계수: 독립 1·3회차는 위생만, 2회차는 결함 0이나 미실행(재현 방법 부재)으로 판정 불가.
구현 영향 결함을 낸 독립 사이클 0 → 정지 규칙 무관. 「위생만 2사이클 연속」 신호(1·3회차, 2회차가 사이에 끼어 엄밀히는 비연속)의 교훈: 이 항목의 소득은
경로 선정이 아니라 **재현 방법이 계획서에 없던 것**에서 나왔다 — 외부 신호 재생·복합 렌더가 필요한 항목은 계획서에 재현 명령을 처음부터 싣는다.

## 반려 → `계획지시` · 사후 인수로 재범위 (2026-10-22)

2026-10-21 BUG-19 조사(Inngest 사용량 급증) 중에 확인한 사실: `origin/main`이 dev보다 50커밋 앞서 있었다.
`72bde11`의 구현은 `fix/card-news-*` 브랜치의 수정과 함께 PR #134(`75797b4`)·#135(`54d74df`)·#136(`d836dc7`)으로
`main`에 합류해 운영에 배포됐다. 운영 DB 마이그레이션도 함께 적용됐다. 이 경로는 이 보드를 거치지 않았다.
그 결과 이 항목의 전제(「dev 밖의 미검토 구현을 통합」)가 사라졌다. 2026-10-22 소유자 지시 「머지 진행해」로
`origin/main`을 dev에 머지했다(`745439f`). 메인 루프는 처리 방향으로 두 안을 냈다 — 사후 인수로 다시 쓰기(권고),
보류 또는 닫기. 소유자가 **「사후 인수로 다시 쓰기」**를 택했다.

- **전이**: `검토대기` → `계획지시`(반려 — 계획 재작성, 사용자 결정). 안내 블록 규칙에 따라 `검증:` 줄을 지웠다.
  2026-10-19 클린 패스는 통합 계획에 대한 판정이라 새 계획서에 붙지 않는다.
- **근거 줄**: 규칙(「행을 만드는 주체가 쓰고 이후 바꾸지 않는다」)에 따라 그대로 두었다. 재범위 내용은 제목 줄과
  백로그의 「재범위」 하위 항목에 적었다.
- **옛 계획서의 쓰임**: `docs/plans/FEAT-63.md`(통합 계획)가 찾은 결함과 고칠 파일 35개는 새 계획서에서 대조
  체크리스트가 된다. 각 항목을 배포본 `d836dc7`에 대조해 「이미 고쳐짐 / 남음 / 바뀜」으로 판정한다.
- **BUG-19와의 경계**: 매분 cron 4개의 스케줄은 BUG-19가 맡는다. 복구 헬퍼의 의미는 이 항목이 인수한다.

## 필수 경로 확정 (2026-10-22, 사후 인수 계획)

카탈로그(`docs/plans/verification-paths.md`) 기준. 대상은 `c448b93`의 사후 인수 계획서(보정 27행, 코드 블록 43개).

| # | 경로 | 판정 | 이유 |
| --- | --- | --- | --- |
| 1 | 인용 전수 대조 | 필수 | 모든 항목. 산문 인용 100여 건, 블록 머리 줄 번호 34곳 |
| 2 | 스케치 추출·실행 | 필수 | py·ts·tsx·md 블록. web check·test·build, backend unittest, admin, 실 PostgreSQL CLI 3종 |
| 3 | before/after 기계 적용 | 필수 | 기존 파일 수정 22곳 + 새 파일 4 + 산문 임포트 지시 1 |
| 4 | 전칭 여집합 | 필수 | 「진입점 3곳」, 「호출처 하나뿐」, 「`env.`는 여기뿐」, 「`object(...)` 타입 인자는 하나뿐」, 「표에 없는 테스트 12개」, 「단서 없는 공개 문구는 이 다섯뿐」, 「BUG-19와 함께 고치는 파일은 없다」, 「코드가 `d836dc7`과 바이트 동일」 |
| 5 | 돌연변이 | 필수 | 순수 함수 신설 셋(`isStoredClipObject`·`canRecoverySettleVideoAttempt`/`producerEndObservedAt`·`callback_failure_code`) |
| 6 | 실제 사건 재생 | 필수(로컬 재생) | S3 HEAD ContentType·Gemini 오류 코드·Modal 종료 신호를 해석한다. 운영 실측은 계획 단계에서 하지 않으므로 신호의 모양을 로컬에서 다시 재생한다. 근거 버전이 배포본에서 그대로인지가 요점이다 |
| 7 | 음성 시험 | 필수 | 각 보정을 되돌리면 그것을 지키는 검사가 실패하는가. 실 DB 검사가 V1·V3을 지키는가 |
| 8 | 실물 렌더 | 필수 | 헤더·대시보드 탭·잔액 배지 변경 |
| 9 | 구조적 아티팩트 | **제외** | 이번 보정 27행에 schema·config·JSON·생성 파일·`.gitattributes` 변경이 없다(`.gitattributes`의 B3은 배포본이 이미 고쳤다 — 옛 1번 「고쳐짐」) |

## 라운드 1 — 메인 루프 편집 라운드 (2026-10-22, 사후 인수 · 구현 영향 1 · 위생 4)

worktree는 스크래치패드 `f63r1/wt`(`8916909`에서 detached — 코드는 `d836dc7`과 동일)에 만들고, node_modules는 junction 셋으로 연결했다.
하니스는 `f63r1/h/`에 있다: `blocks.py`, `apply.py`·`apply2.py`, `cite.py`, `heads.py`, `mutate.py`, `negative.py`·`negative_v3.py`, `b4guard.py`.
로그는 `f63r1/logs/`에 있다. 렌더 하니스는 `f63r1/h/render/`(`render63.tsx`·`register63.mjs`·`loader63.mjs`·`tsconfig.render63.json` — 실행 시 사본의 `apps/web` 바로 아래에 둔다, 10-19 하니스 설정과 같음)다.

- **경로 3**: 블록 43개와 산문 지시 1개가 **전부 정확히 1회 일치**했다. 손 개입은 0이다.
- **경로 2**(모두 worktree, `SKIP_ENV_VALIDATION=1` — worktree에 `.env`가 없다):
  - web: `check` EXIT 0, `test` **365/0**(359 + 신규 두 파일 6), `next build` EXIT 0.
  - backend: **163 OK**, `py_compile` OK.
  - admin: check EXIT 0 · **337/0** · fsd:final EXIT 0.
  - 실 PostgreSQL 3종 EXIT 0, client 회귀 6/0, surfaces EXIT 0.
  - surfaces는 메인 트리에서 `SKIP_ENV_VALIDATION` 없이도 EXIT 0이다. 계획서 명령 그대로 돈다.
- **경로 5**: 돌연변이 **22/22 사멸**(10-19와 같은 집합). 원본 3파일 해시를 복원했다.
- **경로 7 · 구현 영향 R1-1**: **B4 호출부(`card_news_app.py:190`)를 옛 `getattr(error, "code", …)`로 되돌려도 backend 163개가 전부 통과**한다. 새 테스트는 순수 함수만 보기 때문이다.
  - 해소: 기존 오케스트레이션 시험에 `sdk-failure` 시나리오를 넣는 블록 셋을 3번에 추가했다(`:118`·`:134-136`·`:215`). 정수 `code` 429 오류를 넣으면 단계는 `failed`까지 가고 `failureCode`는 `cpu_job_failed`여야 한다.
  - 넣은 뒤 다시 확인: 호출부를 되돌리면 `['accepted', 'generating-text'] != [..., 'failed']`로 실패하고, 고친 상태에서는 163 OK다.
  - 나머지 음성 시험 4건은 모두 「실패함(정상)」이다.
    - V1 `binary/octet-stream` 제거, V1 호출부 되돌림: 실 DB `balance` `:154`.
    - V3 유예 0, V3 호출부 되돌림(첫 관측을 epoch로): 패치된 CLI `:552` `1 !== 0`. 이 둘은 node_modules 사고 뒤 재실행으로 실패 지점을 확정했다.
- **경로 6**(로컬 재생, 근거 버전 대조):
  - `requirements-card-news.txt`·`requirements.txt`는 `72bde11..` 사이에 바뀌지 않았다. `main.py:879`·`:894`의 `upload_file` 모양도 같다.
  - boto3 1.43.62 가짜 S3 재생(10-19 하니스 `h63/replay/boto_put.py`): **PUT에 `Content-Type` 없음**.
  - google-genai 1.49.0 wheel `errors.py` 31·39행 `code: int`, 52행 `self.code = code if code else …`.
- **경로 8**: 헤더·대시보드 탭 `showCardNews=false` → `/dashboard/card-news` 링크 0개, `true` → 1개(대시보드 탭은 `AppRouterContext`를 주고 렌더했다).
  - 잔액 배지 「갱신 실패 + 이전 data」: 보정 후 `3 available · 2 reserved`, 보정 전 조건으로 되돌리면 `Balance unavailable`. 하니스가 결함을 구별한다.
- **경로 1**:
  - 블록 머리 줄 번호: 편집 전 34곳, 편집 후 37곳 모두 불일치 0.
  - 산문 인용 100여 건: 기계 대조의 불일치 표시는 표 안 `\|` 이스케이프 2, 의도적 생략 `.env({...})` 1, 한 줄에 두 파일이 섞인 스캐너 오탐 1뿐이다.
  - 같은 줄에 기준 경로가 없는 `:N` 39건은 손으로 전부 대조했다(릴리스 기록·CLI·wiring·settle·functions·pricing·CLAUDE.md) — 불일치 0.
- **경로 4 · 위생 R1-2**: 「BUG-19와 **함께 고치는 파일은 없다**」는 거짓이었다.
  - `app/dashboard/page.tsx`·`entities/card-news/api/index.ts`·`features/card-news/api/index.ts`를 둘 다 고친다. 처음 BUG-19 계획(`7d913e8`)부터 그랬다.
  - 고치는 자리는 서로 겹치지 않는다(이 계획 before `:15`·`:59` / `:325-334` / `:21-22`·`:318-328`·`:338-346`, BUG-19 page 임포트·`:27` 뒤 / entities 끝 / features `:96`·`:111`). 그래서 위생으로 분류한다.
  - 「나중 구현 쪽이 before와 줄 번호를 다시 확인」을 명시했다.
- **위생 R1-3**: BUG-19 결합 서술을 그 계획 라운드 1(`8916909`, 라운드 3 `9cfb1a7`도 같음)로 갱신했다.
  - N2는 해소됐다.
  - V3 유예 틱: BUG-19는 영상 후보를 `deadlineAt`에만 깨운다. 틀리지는 않고 늦다. 유예 기한을 다음 깨움에 더하는 것은 후속이다.
  - 후속 후보 「`nextDispatchAt`·heartbeat 재배차」는 BUG-19 `cardNewsJobDueAt`이 다루므로 해소 목록으로 옮겼다.
  - BUG-19가 먼저면 surfaces 스크립트가 바뀌어 있다는 것도 적었다.
- **위생 R1-4**: 25번 테스트 표에 「BUG-19가 먼저면 그 4행도 함께, `card-news-functions.test.mjs` 행은 드레인 루틴으로」를 추가했다.
- **위생 R1-5**: 모호한 경로 두 곳을 풀어 적었다. `migration.sql:77`(같은 이름 14개) → 전체 경로. 저장소 밖 `errors.py` → wheel 경로와 고정 버전 출처.
- 그 밖에 확인한 전칭(여집합 열거 — 결함 없음):
  - 무조건 노출 진입점은 헤더 2·탭 1뿐이다. `ClipActions.tsx:170`은 `derivedSets.length > 0`, 편집기·에러 페이지는 카드뉴스 라우트 안이다.
  - `listUserAssetCleanupJobs` 호출처는 하나, CLI의 `reconcileVideoReservations` 호출은 둘, 타입 인자 `object(...)`는 하나다.
  - 표에 없는 테스트 12개(44개와 대조)는 계획과 일치한다.
  - 공개 문구 중 단서가 없는 것은 계획이 고치는 다섯뿐이다(`how-it-works`·`terms:51-55`·`pricing/page.tsx:11`·config `:15`·`:32`는 단서 있음).
  - `d836dc7..HEAD` 코드 차이는 0줄이다.

**환경 사고 (같은 시각, BUG-19 라운드 2 포크)**: 20:08:54~56에 그 포크가 `git worktree remove --force`로 worktree를 정리했고, 이 명령이 junction을 따라 메인 트리 `node_modules` 일부와 `apps/web/node_modules` 전체를 지웠다(`npm ls` missing: `@auth/prisma-adapter`·`@aws-sdk/client-s3` 등).
- 이 라운드의 게이트는 모두 20:04 이전에 끝나 영향이 없다.
- 영향을 받은 것은 렌더 1회(`ERR_MODULE_NOT_FOUND`)와 V3 음성 시험의 실패 지점 기록 둘이다. 메인 루프가 `npm ci`로 복구한 뒤 다시 실행했다(위 경로 7·8).
- worktree 정리는 junction을 링크만 끊은 뒤에 했다.

이 라운드는 계획서를 고쳤다(구현 영향 1). 다음은 편집본의 무편집 재확인이다. 편집본은 새 worktree `f63r1/wt2`(`b35c6c9`)에 처음부터 다시 적용해 보았다.
- 블록 46개와 산문 1개가 전부 1회 일치했다.
- 결과 트리는 라운드 1 트리와 **26파일 바이트 동일**하다(`cmp`).
- backend 163 OK, 블록 머리 37곳 불일치 0이다.

## 라운드 2 — 메인 루프 무편집 라운드 (2026-10-22, 사후 인수, 결함 0)

라운드 1 편집 뒤에 포크가 새 worktree(`wt2`)에서 계획서를 처음부터 다시 적용했다. 블록 46개와 산문 지시 1개가 모두 일치했고, 라운드 1 트리와 26파일이 바이트 동일했으며, backend는 163 OK였다. 그 재적용 뒤에 산문 두 줄이 더 바뀌었으므로, 메인 루프가 그 두 줄을 직접 대조했다.

- `google/genai/errors.py` 인용: 로컬에 설치된 `google-genai` 1.49.0(`requirements-card-news.txt:2`와 같은 버전)의 `errors.py`에서 31행 `code: int`와 52행 `self.code = code if code else self._get_code(response_json)`이 일치했다.
- BUG-19 버전 머리말(`8916909`·`9cfb1a7`)은 두 커밋 모두 실재하고, 결합 지점 서술이 두 판에서 같다.

편집 없음. 다음은 `plan-verifier` 독립 무편집 패스(필수 경로 1~8)다.

## 독립 패스 1 — `plan-verifier` (2026-10-22, 사후 인수, 결함 0 · 경로 2·8 일부 미실행)

- 브리핑 계약 위반: 없음. 트리 청결: 빈 출력.
- 경로 1·3·4·5·7: 전부 실행했다. 돌연변이는 신규 순수 함수 4개에 심었고 모두 사멸했다(try/except를 동반한 등가 돌연변이 하나만 생존).
- 경로 6: 실제 `validate_contract`에 int `failureCode` 429를 넣으면 거부되고, 문자열 코드는 수락된다 — 실측으로 확인했다.
- 미실행:
  - 경로 2의 「스케치 적용본 전체 `check`·`test`」와 경로 8의 「실제 모듈 그래프 DOM 렌더」. 검증자가 정의의 junction 경고를 worktree 금지로 읽었다.
  - 경로 6의 실제 S3 HEAD는 자격증명이 없다. google-genai 1.49.0의 줄 번호는 로컬에 2.16.0이 설치돼 있어 대조하지 못했다(메인 루프가 1.49.0 설치본으로 라운드 2에서 대조함).
- 판정: 미실행 경로가 있으므로 무소득 보고가 아니다. 정의의 문구를 「적용본 worktree는 표준 방법, 지킬 것은 정리 순서」로 고친 뒤(`.claude/agents/plan-verifier.md`) 같은 브리핑으로 다시 디스패치한다. 계획서는 바뀌지 않았다.

## 독립 패스 2 — `plan-verifier` (2026-10-22, 사후 인수, 결함 0 · 미실행 0) → 클린 패스

- 브리핑 계약 위반: 없음. 트리 청결과 `node_modules`(루트·web·db) 온전을 검증자가 확인했고, 메인 루프도 직접 확인했다.
- 검증한 트리: 디스패치 시점 HEAD는 `c8ca547`이었다. 그 사이 dev가 문서 커밋만으로 전진했다. `git diff --stat d836dc7 c8ca547 -- apps packages .env.example .gitattributes`가 0줄이라 코드는 같다.
- **경로 2(적용본 전체)**: 스케치 23개를 worktree에 적용했다.
  - backend: `py_compile` OK, unittest 163 OK.
  - web: `npm run check` EXIT 0(fsd·lint 0·tsc), `npm test` 359/0.
  - 실 PostgreSQL 통합 CLI: EXIT 0.
  - 새 테스트 파일 2개는 계획서에 코드 블록이 아니라 산문 명세(`:1104-1106`)로만 있다. 이 명세는 경로 5 하니스로 실행됐다.
- **경로 3**: before 앵커 23개가 각각 정확히 1회 매치됐다.
- **경로 4**: 전칭 6건을 열거했다.
- **경로 5**: 신규 순수 함수 3개에 심은 돌연변이 14개가 모두 사멸했다(계획서가 짚은 경계 — 세미콜론 앞 공백·정확히 5:00·마감 null·161자 — 가 전부 load-bearing).
- **경로 6**: PyPI의 google-genai 1.49.0 wheel에서 `errors.py:31`·`:52`를 대조해 일치했다.
- **경로 7**: 호출부 `:190`만 되돌리면 sdk-failure 시나리오가 `['accepted', 'generating-text'] != [..., 'failed']`로 실패했다.
- **경로 8**: `renderToStaticMarkup`로 확인했다.
  - 헤더의 카드뉴스 링크는 `showCardNews` false일 때 0개, true일 때 1개다.
  - 잔액 배지는 보정 뒤 `3 available · 2 reserved`다.
- 실제 S3 ContentType 캡처는 계획서가 「못 덮는 범위(배포 후)」로 지정한 항목이다.

**판정: 클린 패스.** 무편집 독립 패스 1회에서 결함 0, 미실행 경로 0이다. 사이클 계수: 독립 1회차는 결함 0이었으나 경로가 미실행이라 판정할 수 없었고(정의 문구 탓), 구현 영향 결함을 낸 독립 사이클은 0이다. 보드 `검증:` 줄을 쓴다. 다음은 게이트②(소유자)다.
