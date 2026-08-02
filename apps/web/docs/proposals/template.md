---
# Metadata. status value는 proposals/README.md의 세 상태만 사용합니다.
#
# Status values:
# - pending
# - completed
# - closed
#
# pending: active/에 있는 제안서입니다. 승인 전, 승인 대기, 실행 대기, 차단 상태를 모두 포함합니다.
# completed: completed/에 있는 수행 완료 기록입니다.
# closed: completed/에 있는 미실행 결정 기록입니다.
#
# pending 문서의 실행 전 상태는 stage에 기록합니다.
# stage values: draft, awaiting-approval, approved, blocked
# completed 또는 closed 문서는 stage: null로 둡니다.
#
# 승인 여부는 status를 늘리지 않고 아래 approval metadata에 기록합니다.
# completed로 이동할 때는 status, stage, completed-at, verification-summary를 함께 갱신합니다.
# closed로 이동할 때는 status, stage, closed-at, closed-by, closed-reason을 함께 갱신합니다.
status: "pending"
stage: "draft"
proposal-size: "standard"
created-at: "YYYY-MM-DD"
approved-by: null
approved-at: null
approval-scope: null
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related: []
---

<!--
Metadata rules:
- active/에 있는 문서는 status: "pending"을 사용합니다.
- completed/로 이동한 수행 완료 문서는 status: "completed", stage: null, completed-at, verification-summary를 갱신합니다.
- completed/로 이동한 미실행 결정 문서는 status: "closed", stage: null, closed-at, closed-by, closed-reason을 갱신합니다.
- proposal-size는 small 또는 standard만 사용합니다. 삭제, 라우팅, 인증, 결제, 개인정보, public 자산, dynamic import, barrel export, side effect, API 계약, 데이터 구조, 마이그레이션, 5개 이상 파일 변경, 복잡한 롤백은 standard를 사용합니다.
- 승인 기록의 단일 기준은 front matter의 approved-by, approved-at, approval-scope입니다.
-->

# {proposal title}

## Summary

{무엇을 제안하는지 2~4문장으로 요약합니다. 읽는 사람이 이 문서만 보고 변경 의도, 안전성 판단, 다음 행동을 파악할 수 있어야 합니다.}

## Goal

- {달성하려는 결과}
- {삭제, 이동, 통합, 리팩터링 등 작업 유형}

## Proposal Size

`proposal-size`: {small 또는 standard}

선택 근거:

- {small이면 영향 범위가 좁고 롤백이 단순한 이유를 적습니다. standard이면 위험 경계나 검토 범위가 넓은 이유를 적습니다.}

다음 조건 중 하나라도 해당하면 `standard`를 사용합니다.

- 삭제 작업
- 라우팅, 인증, 결제, 법적 동의, 개인정보 흐름 영향
- `public/` 자산 또는 정적 URL 영향
- dynamic import, barrel export, runtime side effect 가능성
- 5개 이상 파일 변경
- 마이그레이션, 데이터 구조, API 계약 변경
- 롤백이 단순 revert 이상인 작업

## Current State

{현재 코드/문서/자산/운영 상태를 설명합니다. 문제가 되는 지점, 중복, 미사용 근거, 유지 비용, 혼동 가능성을 구체적으로 적습니다.}

## Scope

포함 범위:

- {변경 또는 검토 대상 영역}

제외 범위:

- {이번 proposal에서 다루지 않는 영역}

## Proposal

{실제로 무엇을 변경할지 설명합니다. 여러 단계라면 실행 순서가 드러나게 작성합니다.}

## Affected Files

파일이 많으면 개별 파일 대신 영향 영역 단위로 묶어도 됩니다. 단, 실제 작업 대상 전체를 추적할 수 있는 상세 목록은 `Proposal` 또는 별도 후보 목록에 남깁니다.

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `{path-or-area}` | {delete/update/move/keep} | {참조 관계, 중복, 대체 경로, 사용 여부 등} | {none/low/medium/high + 이유} |

## Safety Analysis

{왜 안전하다고 판단하는지 근거를 적습니다. 단순 검색 결과만 쓰지 말고, 해당 변경에서 오탐이 생길 수 있는 경계를 확인합니다.}

확인한 항목:

- [ ] 앱 진입점과 라우팅 경계
- [ ] 정적 `import` / `export from`
- [ ] dynamic `import()` 또는 lazy loading
- [ ] barrel export(`index.ts`) 경유 참조
- [ ] 테스트와 스크립트 참조
- [ ] 정적 자산 URL 또는 `public` 직접 접근 가능성
- [ ] 타입 선언, 전역 선언, ambient module 영향
- [ ] 런타임 side effect 또는 초기화 코드
- [ ] API, localStorage/sessionStorage, analytics, 외부 SDK 영향

`proposal-size: "small"`인 문서에서는 관련 없는 항목을 제거해도 됩니다. 제거하지 않고 남기는 경우에는 확인하지 않은 항목을 체크하지 않은 상태로 둡니다. `proposal-size: "standard"`인 문서에서는 해당 작업과 무관한 항목만 제거합니다.

## Approval

승인 기록의 단일 기준은 front matter의 `approved-by`, `approved-at`, `approval-scope`입니다. 승인 후에는 `stage: "approved"`로 바꿉니다. 이 섹션에는 승인 조건, 맥락, 참고 메모만 적고 승인자, 승인일, 승인 범위 값을 다시 적지 않습니다.

승인 메모:

- {승인 전이면 "승인 전"으로 둡니다. 승인 후에는 승인 조건이나 참고 메모만 적습니다. 조건이 없으면 "추가 조건 없음"으로 둡니다.}

## Execution Plan

1. {작업 순서 1}
2. {작업 순서 2}
3. {작업 순서 3}

## Verification Plan

실행할 검증:

```bash
{command}
```

검증 기준:

- {성공 기준}
- {기존 실패와 신규 실패를 구분하는 방법}

## Verification Results

아직 실행 전이면 `Not run yet`으로 둡니다.

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `{command}` | Not run yet | {예상 결과 또는 실행 후 실제 결과} |

## Risks and Rollback

잔여 리스크:

- {남아 있는 불확실성. 없으면 "없음"이라고 적습니다.}

롤백 방법:

- {문제가 생겼을 때 되돌리는 방법. 단순 삭제 작업이면 복구할 파일/커밋 기준을 적습니다.}

## Completion or Closure Notes

완료 또는 닫힘 처리 후 `completed/`로 이동할 때 작성합니다.

완료 기록(`status: "completed"`일 때 작성):

- completed-at: TBD
- verification-summary: TBD
- implementation PR/commit: TBD
- changed files summary: TBD
- remaining follow-up: TBD

닫힘 기록(`status: "closed"`일 때 작성):

- closed-at: TBD
- closed-by: TBD
- closed-reason: TBD
- close summary: TBD
- remaining follow-up: TBD

## Review Checklist

- [ ] 모든 `{placeholder}`를 처리했고, pending 문서의 완료/닫힘 전용 `TBD` 외에는 현재 상태에 맞게 갱신했다.
- [ ] `status`는 `pending`, `completed`, `closed`만 사용했다.
- [ ] 문서 위치와 `status`가 일치한다. `active/`는 `pending`, `completed/`는 `completed` 또는 `closed`다.
- [ ] `stage`는 pending 문서에서만 사용했고, `completed` 또는 `closed` 문서에서는 `stage: null`로 갱신했다.
- [ ] `stage: "approved"`라면 `approved-by`, `approved-at`, `approval-scope`가 모두 채워져 있다.
- [ ] `proposal-size`는 `small` 또는 `standard`만 사용했고, standard 강제 조건에 해당하는 작업을 small로 낮추지 않았다.
- [ ] 승인 기록은 front matter를 단일 기준으로 사용하고, 본문 `Approval` 섹션에는 승인 조건과 참고 메모만 적었다.
- [ ] 변경 범위와 제외 범위가 명확하다.
- [ ] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [ ] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 필요한 만큼 확인했다.
- [ ] 검증 명령과 성공 기준이 적혀 있다.
- [ ] 검증 실패가 있다면 기존 실패와 신규 실패를 구분했다.
- [ ] 잔여 리스크를 명시했다. 없으면 "없음"이라고 적었다.
- [ ] 완료 문서라면 `completed-at`, `verification-summary`, Completion or Closure Notes가 실제 수행 결과로 갱신되어 있다.
- [ ] 닫힌 문서라면 `closed-at`, `closed-by`, `closed-reason`, Completion or Closure Notes가 닫힘 결정과 일치한다.
