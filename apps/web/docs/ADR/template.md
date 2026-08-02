---
# Metadata. key와 status value는 자동화, 검색, 문서 생성 호환성을 위해
# 영어로 유지합니다. 필요하지 않은 optional field는 제거할 수 있습니다.
#
# Status values:
# - proposed
# - rejected
# - accepted
# - deprecated
# - superseded
#
# date는 이 ADR이 proposed 또는 accepted 된 날짜를 사용합니다.
# 계속 갱신되는 "last updated" timestamp로 사용하지 않습니다.
#
# accepted 된 ADR의 historical reasoning은 다시 쓰지 않습니다.
# 결정이 바뀌면 새 ADR로 supersede하고, 기존 ADR은 status, superseded-by 같은
# metadata만 갱신합니다.
#
# supersedes는 이 ADR이 대체하는 ADR 번호 목록입니다. 파일명이 아니라
# zero-padded ADR 번호만 string array로 기록합니다. 예: ["0003", "0004"]
# superseded-by는 이 ADR을 대체한 하나의 ADR 번호 또는 null입니다. 예: "0008"
#
# Section heading은 MADR 구조와 tooling 호환성을 위해 영어로 유지합니다.
# 각 section의 본문은 한국어로 작성합니다.
status: "proposed"
date: "YYYY-MM-DD"
applies-to: ["area, package, service, or capability"]
decision-makers: ["name or team"]
consulted: ["name or team"]
informed: ["name or team"]
supersedes: []
superseded-by: null
---

# {문제와 선택한 해결책을 대표하는 짧은 제목}

## Context and Problem Statement

{현재 상황과 문제를 2~3문장으로 설명합니다. 문제를 질문 형태로 쓰면
도움이 됩니다. 관련 issue/PR이 있다면 링크합니다.}

## Scope

이 ADR이 적용되는 범위:

- {area, package, service, capability, API, 또는 team}

이 ADR이 다루지 않는 범위:

- {선택 사항: non-goal 또는 out-of-scope area}

## Decision Drivers

- {driver 1 — 반드시 만족해야 하는 요구사항, 제약, 우려, force}
- {driver 2}

## Considered Options

- {option 1}
- {option 2}
- {option 3}

## Decision Outcome

Chosen option: "{option N}", because {선택 이유 — must-have driver를 만족하거나,
핵심 force를 해소하거나, 아래 비교에서 가장 적절하다고 판단한 이유}.

### Acceptance

{누가 이 결정을 승인했는지, 그리고 어디에 승인 기록이 남아 있는지 적습니다.
예: PR approval, maintainer comment, architecture review note, owner sign-off.}

### Consequences

Positive:

- {긍정적 결과}

Negative / trade-offs:

- {부정적 결과 또는 받아들인 trade-off}

### Confirmation

{이 ADR이 지켜지는지 확인하는 방법을 적습니다. 예: review, test, lint rule,
sign-off. 자동화된 확인 방법이 없다면 review 과정에서 누가 확인하는지
명시합니다.}

## Pros and Cons of the Options

### {option 1}

- Good, because {장점}
- Neutral, because {중립적 고려사항}
- Bad, because {단점 또는 trade-off}

### {option 2}

- Good, because {장점}
- Neutral, because {중립적 고려사항}
- Bad, because {단점 또는 trade-off}

### {option 3}

- Good, because {장점}
- Neutral, because {중립적 고려사항}
- Bad, because {단점 또는 trade-off}

## More Information

{추가 근거, 팀 합의 내용, 재검토 trigger/date, 관련 issue/PR, 관련 ADR 링크를
작성합니다.}

## Review Checklist

- [ ] 모든 `{placeholder}`를 실제 내용으로 바꿨다.
- [ ] 선택한 option과 선택하지 않은 option의 trade-off가 드러난다.
- [ ] `status`, `date`, `applies-to`, 승인 기록이 현재 상태와 맞다.
- [ ] 이 ADR이 적용되는 범위와 다루지 않는 범위가 명확하다.
- [ ] 결정 준수 여부를 확인하는 방법이 적혀 있다.
- [ ] `supersedes`, `superseded-by` 값은 파일명이 아니라 ADR 번호만 사용한다.
