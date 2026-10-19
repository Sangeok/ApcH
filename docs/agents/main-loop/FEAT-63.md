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
