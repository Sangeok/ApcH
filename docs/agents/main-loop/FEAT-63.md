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
