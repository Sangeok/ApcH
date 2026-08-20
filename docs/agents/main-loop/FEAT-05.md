# FEAT-05 — 클립 검토 프리뷰에 캡션 스타일 실시간 오버레이

## 2026-08-19 — 폐기 (게이트① 앞에서)

**결정: 사용자.** "지금 할 필요가 없으면 앞으로도 안 하는걸로 취급해."
보드 안내 블록의 `승인대기` → **행 제거(폐기)** 경로로 처리했다. 되돌릴 수 없다.

- `PROJECT_BOARD.md` 2026-08-19 섹션 제거 (FEAT-05 한 행뿐이라 섹션째)
- `TASK_BACKLOG.md` `## Web / 클립 검토` 섹션 제거 (FEAT-05 한 항목뿐이라 섹션째)

기록을 남기는 이유는, 이 항목이 근거 없이 사라진 것이 아니라 **근거를 조사한 결과 사라졌기** 때문이다.
같은 제안이 다시 올라올 때 이 절이 중복 판단을 막는다.

### 폐기 근거 1 — 출처가 소유자 1회 세션이다

프로덕션 `AnalyticsEvent`를 직접 조회했다(읽기 전용).

```
clip_review_caption_style_edited   전체 기간 1건
  2026-08-14T15:40  {"preset":"custom","appliedToAll":true}
```

`TASK_BACKLOG.md`의 FEAT-05 `source`는 `사용자 요구 (2026-08-15)` — **그 다음 날**이다.
그리고 `clip_review_*` 이벤트 27건이 **전부 한 사용자**이며 그 세션의 `credits`가
581/577/573/565다(시드 잔고 = 소유자). **비-소유자의 캡션 스타일 편집은 0건.**

즉 관측은 "소유자가 한 번 만져보고 답답했다"인데 `source`는 "사용자 요구"로 적혀 있었다.
`TASK_BACKLOG.md:68`이 금지하는 관측·진단 혼합의 재발이다(FEAT-02와 같은 형태).

### 폐기 근거 2 — 같은 화면에 더 자주 터지는 문제가 있다

`clip_review_*` 세션 6개의 도달 단계 전수:

| 세션 | 경로 |
| --- | --- |
| 1 | opened → selection_changed → **confirmed** |
| 2 | opened → **generate_blocked** → selection_changed |
| 3 | opened → **generate_blocked** |
| 4 | opened → **generate_blocked** |
| 5 | opened |
| 6 | opened → caption_style_edited |

```
generate_blocked  reason:"empty"  selectedCount:0    4건 (07-30, 07-30, 08-01, 08-02)
clip_review_confirmed                                1건 (07-29) — 이후 20일간 0
uploadedFile: processed 25 / review_pending 2 / failed 2
```

캡션 편집(1건)보다 **주 동작 실패(4건)가 4배 잦다.** 그리고 검토를 끝까지 통과한 것은
2026-07-29 단 한 번이다. 캡션 프리뷰 정밀도는 아무도 도달하지 못하는 지점 뒤의 마감재였다.

### 폐기 근거 3 — 계획 자체도 진단의 무게 배분이 틀렸다

백로그가 나열한 「스테이지 정확도가 깨지는 원인」 다섯을 코드로 대조한 결과:

| 백로그 주장 | 대조 결과 |
| --- | --- |
| 세로 위치 marginv 200/260이 웹에 없다 | 실사용 스타일이 `position:"middle"` = ASS alignment 5 → **marginv 무시**. 무관 |
| 좌우 인셋 44/1080이 없다 | `px-2` = 164px vs 실제 165.3px → **0.8% 차이, 이미 맞다** |
| 그림자가 실제보다 진하다 | 시각만. 줄바꿈 무관 |
| 자간 spacing 1.8이 없다 | 0.3px/자 ≈ 2.7% |
| 폰트가 다르다 | **Geist(`apps/web/src/app/layout.tsx:4`) vs Anton(`apps/backend/main.py:339`) — 지배적** |

실제로 저장된 유일한 캡션 스타일(`clipDraft.captionStyle`, 6행 전부 동일):

```json
{"color":"#FFE45E","outlineColor":"#1D4ED8","position":"middle",
 "outlineWidth":1,"fontSize":null,"maxWordsPerLine":null}
```

반면 백로그가 「이 셋이 무너지면 계획을 다시 짜야 한다」고 명시한 가능 근거 셋은 **전부 사실이었다**:
클라이언트의 단어 단위 전사 보유(`model/use-clip-draft-review.ts:60-85`),
세로 크롭이 가로만 자름(`apps/backend/main.py:245-252`),
자막 묶음 규칙의 결정성(`main.py:291-324`). 문제는 근거가 아니라 우선순위였다.

### 남는 사실 — 항목으로 올리지 않았다

- 크레딧은 **클립 1개당 1개** 차감된다(`uploaded-file/api/index.ts:827`, `clipsFound` 만큼).
  Free 3/월, Pro 30/월. 스타일을 잘못 고르면 되돌리는 길은 재업로드·재과금뿐이다.
  유저가 생기면 이 경제성이 다시 근거가 될 수 있다 — 그때는 관측을 먼저 확보한다.
- `generate_blocked: empty` 4건은 별도 항목 후보로 사용자에게 보고했다. 백로그에 올리지 않았다.
