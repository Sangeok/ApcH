# BUG-03 — 메인 루프 기록 (게이트 결정·검증 라운드)

## 게이트① 개방 (2026-08-24)

사용자가 **대시보드 도장 버튼**으로 `승인대기` → `계획지시` 전이 — 원격 게이트 쓰기 경로의
첫 실사용이다(커밋 `f028537`, status 1줄 최소 diff). FEAT-08 원장 줄 셋이 이 실사용으로 마감됐다
(`docs/release-checks.md`).

## 계획서 접수 (2026-08-24)

backend-dev 디스패치(로컬) → `docs/plans/BUG-03.md` 작성, 보드 행 `검토대기`(커밋 `c5539a1`).
진단 요지: S3 업로드 세 곳(`main.py:773`·`:784`·`:1002-1007`)이 raw 호출이고, 실패는 `:1134`
포괄 except로 떨어져 `clips: []` 하드코딩과 함께 재던져진다. 계획은 순수 모듈
`s3_upload_policy.py`(재시도 판정·백오프·에러 포맷)로 정책을 빼 stdlib unittest로 잠근다.

## 검증 필수 경로 확정 (2026-08-24, 카탈로그 `docs/plans/verification-paths.md`)

| # | 경로 | 판정 | 근거 |
| --- | --- | --- | --- |
| 1 | 인용 전수 대조 | **필수** | 모든 항목 |
| 2 | 스케치 추출·실행 | **필수** | 순수 모듈·테스트 스케치 실재 — 실제 python(stdlib)으로 실행 |
| 3 | before/after 기계 적용 | **필수** | `main.py` 수정 조각 실재 |
| 4 | 전칭 여집합 열거 | **필수** | "업로드는 세 곳" 등 전칭 — `apps/backend` S3 호출 전수 열거로 검산 |
| 5 | 돌연변이 검사 | **필수** | 판정 로직 신설(`is_retriable_error`·`should_retry`·`next_backoff`) |
| 6 | 실제 사건 재생 | **필수(변형)** | 외부 신호(boto 예외) 해석 — 과거 실측 로그가 없어 실제 boto3 예외 클래스 인스턴스로 분류기를 통과시키는 변형으로 적용 |
| 7 | 음성 시험 | 제외 | 경계·화이트리스트 신설 없음 — 정책 잠금은 5가 덮는다 |
| 8 | 실물 렌더 | 제외 | 화면 변경 없음 |
| 9 | 구조적 아티팩트 | 제외 | schema·config 파일 변경 없음(Modal 이미지 체인은 main.py 코드라 3이 덮는다) |

계획서가 스스로 명시한 재확인 전제 넷(Modal 사이드 모듈 번들링 / boto 예외 구조 /
botocore 내장 재시도와의 관계 / 범위 경계 둘)은 위 경로 실행 중 함께 검증한다.
Modal 실배포 확인(`modal run`)은 사용자만 가능 — 검증 한계로 기록하고 구현 인수 조건에 넘긴다.

## 검증 1라운드 (2026-08-24, reconciling-proposals-with-codebase · High-Risk 프로파일) — 결함 2건, 편집 1회

하니스: 스크래치패드 `bug03/` (모듈·테스트 추출본, boto 재생, 돌연변이 러너).

**경로 실행 증거**

- **1 인용 전수**: `파일:줄` 인용 전부 내용까지 실측 일치 — `:1-23`(time :7·boto3 :14)·`:44-57`(이미지 체인 끝 `:57`)·`:690`·`:756`·`:773`·`:784`·`:973`·`:980`·`:981`·`:987`·`:1002-1007`·`:1104`·`:1122`·`:1134-1149`(`clips: []`는 `:1145`)·`:1151-1154`. before 조각 4개 들여쓰기까지 바이트 일치(기계 적용 가능 — 경로 3 겸).
- **4 여집합 열거**: `apps/backend` 전체 `s3_client.|boto3.` grep — 업로드는 `:773`·`:784`·`:1002` 정확히 셋뿐(전칭 성립). 나머지는 읽기(`:981` download·`:987` get) — 계획 범위 밖이 옳다.
- **2 스케치 추출·실행**: 순수 모듈+테스트를 맨 python 3.13.1로 실행 — 12/12(강화 후 13/13) `OK`. 검증 명령(`unittest discover`·`py_compile`)이 이 셸에서 실행 가능함도 확인. 신규 파일명 충돌 없음, 심볼 충돌 없음.
- **6 실사건 재생(변형)**: venv(`C:\Users\hamso\venvs\apch-backend`, boto3 1.43.62)의 **설치된 S3Transfer.upload_file 소스 실측** — ClientError를 잡아 `S3UploadFailedError`로 재던짐(`from` 없음 → `__cause__=None`, `__context__=ClientError`). 계획 §2 분류기를 그대로 통과시킨 재생: `upload_file+SlowDown → classified=(None,False) → 재시도 안 됨`.
- **5 돌연변이 10종**: 소진 off-by-one·transport 무시·멤버십 반전·cap 제거·**지수 클램프 제거**·and→or·음수 가드 제거·key 탈락·밑 2→3·SlowDown 제거 — 9 사멸, **M5(지수 클램프) 생존**(attempt=100 단언은 cap이 대신 막아 안 밟힘; 클램프의 실효 경계는 attempt≥약 1076의 float OverflowError).

**결함 → 편집 (일괄 1회)**

1. **[블로커] 분류기가 S3UploadFailedError를 안 푼다** — 주 경로(클립 업로드 2곳)에서 일시 오류가 한 번도 재시도되지 않아 계획이 자기 목적을 잃는다. §2 분류기를 원인 사슬(`__cause__ or __context__`) 풀기로 교체(양쪽을 보는 이유: boto3 무핀 — `from e` 판에서도 동작). 수정안 재생 결과 `retried=True`. 못 덮는 범위 문구도 배선 한정으로 정정.
2. **[명세 구멍] next_backoff 지수 클램프 무단언** — attempt=5000 → 30.0 단언 추가(클램프 제거 시 OverflowError). 단언 수 약 14→약 15.

강화 후 재검: 13/13 통과, 돌연변이 **10/10 사멸**.

**부수 확인**: 콜백 `error` 문자열은 web이 불투명 통과(`functions.ts:477` `args.error ?? …` — 내용 매칭 없음) → 메시지 형식 변경 안전. 업로드는 고유 키 전체-객체 PUT이라 재시도 멱등·동시성 무해(공유 집계 read-then-mutate 없음). `modal==1.2.1`에 `add_local_python_source` 실재. 검증 명령 셸 실행성 확인.

Pass State: editing pass · source changed=yes · blockers resolved=2 · remaining=0 · next=무편집 최종 패스.
