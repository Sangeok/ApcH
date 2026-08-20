# FEAT-16 — 메인 루프 기록

보드가 담지 않는 상세다. 게이트 결정과 계획서 검증 라운드가 여기 쌓인다.
보드에는 요약 판정 한 줄(`검증:`)만 간다 — 그것도 무편집 클린 패스가 나왔을 때만.

---

## 발주 경위 (2026-08-20)

pm 미경유 소유자 직접 발주다. 출처는 `feature-scout` 2차 정찰의 제안 B
(`docs/agents/feature-scout/정찰기록.md`, 2026-08-20 2차 절).

스카우트가 낸 6개 제안(1차 4 + 2차 2) 중 소유자가 이것을 골랐다. 나머지가 밀린 사유:

| 제안 | 사유 |
| --- | --- |
| 유튜브 발행/성과 연동 | **기술적 봉쇄.** 감사 전 `videos.insert`는 업로드 영상을 비공개로 잠근다(공식 문서). 감사는 시연 영상·정책 문서·수 주 심사 — 1인 규모 밖 |
| 업로드 시 자연어 지시 | **기각.** 자연어는 검증 불가, 프롬프트 인젝션 표면 |
| 크레딧 확정 전 프리뷰 | 리뷰가 옵트인 소수 경로(auto 14 : analyze 5). CSS 근사는 블러 배경·얼굴 크롭을 재현 못 해 실제와 어긋난다 |
| 채널 브랜드킷 | 근거가 전방 논증뿐인데 비용 최상(3표면 + Modal 재배포) |

## 메인 루프가 직접 확인한 관측

에이전트 보고를 그대로 받지 않고 대조했다.

- `apps/backend/main.py:1118-1120` — `clip_result["clipType"/"hook"/"payoff"]`를 세팅해 성공 콜백에 싣는다. **확인함**
- `apps/web/src/inngest/functions.ts:119-144` — `normalizeBackendClip`의 반환 객체 9개 필드에 셋이 **전부 없다**. **확인함**
- `packages/db/prisma/schema.prisma` `Clip` — 컬럼이 없었다. **확인함**(선행 작업으로 추가)
- `functions.ts:959` `persist-clip-drafts`가 **`analyzeVideo` 안에만** 있다 → auto 경로 클립에는 대응 `ClipDraft` 행이 없어 조인으로 대체 불가. **확인함**

## 선행 작업 (2026-08-20, 메인 루프 직접 실행)

`packages/db`는 담당 에이전트가 없고 `web-dev`의 금지 목록에 명시돼 있다
(`.claude/agents/web-dev.md:54`, 그리고 `:50` "승인은 범위 승인이지 예외 승인이 아니다").
한 항목으로 발주했으면 계획 단계에서 확정적으로 `보류`가 됐을 것이다. 그래서 쪼갰다.

소유자 승인 후 실행, 커밋 `544ac12`:

- `Clip.clipType` / `Clip.hook` / `Clip.payoff` — 전부 nullable text
- 마이그레이션 `20260820000000_clip_selection_rationale`

**부수 효과 — 소유자에게 사전 보고하고 승인받았다.** `prisma migrate deploy`는 미적용분을
골라서 적용할 수 없다. `20260630000000_one_processing_per_user_index`가 7주간 미적용이었고
(프로덕션 5 / 저장소 6), `pg_indexes` 직접 조회로 그 부분 유니크 인덱스가 **실재하지 않음**을
확인했다. 스키마 주석이 "enforces one processing run per user"라고 전제하던 안전장치다.
적용 시점에 `status='processing'` 행이 0건이라 충돌 없이 걸렸다.

프로덕션 검증: 컬럼 3개 nullable 확인, 인덱스 정의 확인
(`UNIQUE ("userId") WHERE (status = 'processing')`), 마이그레이션 7/7,
기존 `Clip` 102행 무손상(`hook` 전부 NULL).

## 게이트① (2026-08-21)

사용자가 `계획지시`로 전이했다. 메인 루프는 기록만 한다 — 전이 권한은 사용자에게만 있다.

이 시점 보드 미결 2건(FEAT-15 `계획지시` / FEAT-16 `계획지시`). 상한이 2건이라
더 얹을 수 없다. 두 항목은 담당(`admin-dev` / `web-dev`)·워크스페이스·검증 명령이
겹치지 않는다.

## 검증 라운드

(계획서 제출 후 기록)
