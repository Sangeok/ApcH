# Architecture Decision Records

이 디렉터리는 이 저장소에서 내려진 아키텍처적으로 중요한 결정을
[MADR](https://adr.github.io/madr/) 형식으로 기록합니다.

ADR은 결정이 *왜* 내려졌는지, 어떤 대안을 비교했는지, 어떤 trade-off를
받아들였는지 남기는 문서입니다. 현재 적용되는 규칙과 convention은 일반
문서나 코드에서 확인하고, ADR은 그런 규칙이 만들어진 배경과 이유를
설명합니다.

새 ADR의 구조는 [template.md](template.md)를 source of truth로 봅니다.
이 README는 그 템플릿을 언제, 어떻게 사용하는지 설명합니다.

## 언어 정책 (Language)

주요 독자가 한국어 사용자라면 ADR의 설명 본문은 한국어로 작성합니다.
다만 metadata key, status value, 파일명, ADR 번호, package/service/library
이름, code-level identifier는 영어를 유지합니다.

외부 기여자, 글로벌 협업, 또는 공개 cross-team 논의를 염두에 둔 ADR은
영어로 작성할 수 있습니다. 한 ADR 안에서는 하나의 언어를 중심으로
일관되게 작성하고, 필요한 기술 용어는 영어를 병기합니다.

`template.md`의 section heading은 MADR 구조와 자동화 호환성을 위해 영어로
유지합니다. 대신 각 section의 본문과 placeholder는 한국어로 작성할 수
있습니다.

## ADR 목록 (Index)

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-adopt-fsd-for-admin.md) | Admin 소스에 right-sized FSD를 적용한다 | accepted |

첫 번째 실제 아키텍처 결정은 `0001`부터 시작합니다. `0000`은 ADR 운영 방식
자체를 기록하는 메타 ADR이 필요할 때만 사용합니다.

## ADR 작성 기준 (When to write an ADR)

다음처럼 결정을 되돌리기 어렵거나, 여러 영역에 영향을 주거나, 나중에
이유를 다시 물어볼 가능성이 높은 경우 ADR을 작성합니다.

- framework, library, runtime을 도입하거나 제거하는 경우
- 모든 contributor가 따라야 하는 repository-wide pattern을 정하는 경우
- 변경 비용이 큰 data model 또는 API contract를 정하는 경우
- deployment, infrastructure, security, observability처럼 운영 영향이 큰
  기준을 정하는 경우
- 합리적인 대안들이 있고, 그중 하나를 선택한 이유를 남겨야 하는 경우

반대로 routine한 변경, 특정 영역에만 국한되는 변경, 쉽게 되돌릴 수 있는
변경에는 ADR을 작성하지 않아도 됩니다.

ADR은 작업 로그, 구현 계획, 회의록, 단순 기술 조사 문서가 아닙니다. 결정과
그 이유가 장기적으로 남아야 할 때 작성합니다.

## 템플릿 요약 (Template at a glance)

[template.md](template.md)를 ADR 구조의 source of truth로 사용합니다. 각 ADR은
일반적으로 다음 내용을 포함합니다.

- metadata: `status`, `date`, `applies-to`, `decision-makers`, `consulted`,
  `informed`, `supersedes`, `superseded-by`
- context and problem statement
- scope 또는 affected areas
- decision drivers
- considered options
- decision outcome and acceptance record
- consequences and accepted trade-offs
- confirmation method
- pros and cons of the options
- links or more information

## Metadata 값 형식

ADR 번호는 파일명이 아니라 zero-padded number만 기록합니다. 예를 들어
`0003-use-example.md`를 가리킬 때 metadata에는 `0003`만 씁니다.

- `supersedes`: 이 ADR이 대체하는 ADR 번호 목록입니다. 여러 ADR을 대체할 수
  있으므로 string array로 기록합니다. 예: `["0003", "0004"]`
- `superseded-by`: 이 ADR을 대체한 하나의 ADR 번호 또는 `null`입니다.
  예: `"0008"`

## ADR lifecycle

ADR front matter의 `status` 값은 다음 중 하나를 사용합니다.

| Status | 의미 |
| --- | --- |
| `proposed` | 논의 중인 결정입니다. 아직 active guidance가 아닙니다. |
| `accepted` | 승인되어 현재 저장소의 기준으로 적용되는 결정입니다. |
| `rejected` | 검토했지만 명시적으로 선택하지 않은 결정 또는 선택지입니다. |
| `deprecated` | 더 이상 권장하지 않지만, 특정 replacement ADR은 없는 결정입니다. |
| `superseded` | 이후 ADR에 의해 대체된 결정입니다. `superseded-by`에 대체 ADR을 기록합니다. |

일반적으로 ADR은 `proposed`에서 시작해 `accepted` 또는 `rejected`가 됩니다.
`accepted`된 ADR은 historical record입니다. 승인 이후에는 당시의 reasoning을
다시 쓰지 않습니다.

이미 `accepted`된 결정이 바뀌면 새 ADR을 만들고 기존 ADR의 `status`를
`superseded`로 변경합니다. ADR 목록에서는 가독성을 위해
`superseded by ADR-NNNN`처럼 표시할 수 있습니다.

`deprecated`는 더 이상 권장하지 않지만 하나의 명확한 replacement ADR이 없을
때만 사용합니다.

## 리뷰와 승인 (Review and acceptance)

ADR은 영향을 받는 영역의 maintainer 또는 owner가 리뷰하고 승인해야 합니다.
여러 영역에 걸친 결정이거나 명확한 owner가 없다면 repository maintainer가
승인 책임을 가집니다.

승인 사실은 ADR 본문과 PR에 남깁니다. 예를 들어 maintainer approval,
architecture-review note, responsible owner의 명시적 comment, 또는 sign-off로
기록할 수 있습니다.

결정이 승인되면 ADR front matter와 ADR 목록의 status를 `accepted`로
변경합니다.

## ADR 추가 방법 (How to add one)

1. [template.md](template.md)를 `NNNN-kebab-case-title.md`로 복사합니다.
   `NNNN`은 ADR 목록에서 다음 zero-padded number를 사용합니다. 첫 번째 실제
   아키텍처 결정은 `0001`부터 시작합니다.
2. 초기 `status`는 `proposed`로 설정하고, `date`, `applies-to`,
   `decision-makers`, `consulted`, `informed` 등 필요한 metadata를 채웁니다.
3. 본문을 작성합니다. context, drivers, options, outcome, consequences,
   accepted trade-offs를 중심으로 짧고 명확하게 작성합니다.
4. 이 ADR 목록에 새 row를 추가합니다. 승인 전까지 status는 `proposed`로
   둡니다.
5. 해당 결정을 구현하는 PR과 같은 PR에 포함하거나, 구현 직전 PR로 냅니다.
6. responsible maintainer 또는 owner가 승인하면 ADR status를 `accepted`로
   변경합니다.

여러 ADR을 동시에 추가하는 경우 PR에서 번호를 조율해 충돌을 피합니다.

## 결정 변경 방법 (Changing a decision)

`accepted`된 ADR은 immutable합니다. 결정을 변경해야 한다면 다음 절차를
따릅니다.

1. 새로운 context와 decision을 설명하는 새 ADR을 작성합니다.
2. 새 ADR의 `supersedes`에 대체하는 ADR 번호를 string array로 기록합니다.
3. 기존 ADR에서는 superseded 상태 표시를 위한 metadata만 변경합니다.
   `status`를 `superseded`로 바꾸고 `superseded-by`에 새 ADR 번호를 기록합니다.
4. ADR 목록에서 기존 ADR의 status를 `superseded by ADR-NNNN`으로 갱신합니다.

`accepted`된 ADR의 historical reasoning은 다시 쓰지 않습니다. 당시 알고 있던
정보는 그 시점의 결정을 보존하는 기록으로 남깁니다.
