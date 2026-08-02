# Proposals Documentation

이 폴더는 실제 코드 변경 전에 검토가 필요한 작업 제안서를 관리한다.

Proposal은 "무엇을 바꿀지", "왜 바꿔도 되는지", "어떤 파일과 동작에 영향을 주는지", "어떻게 검증할지"를 정리하는 실행 전 문서다. 단순 아이디어 메모가 아니라, 이후 PR이나 작업 지시의 근거로 사용할 수 있어야 한다.

## Directory Structure

```txt
proposals/
  README.md
  template.md
  active/
  completed/
```

- `active/`: 아직 결론나지 않은 제안서를 둔다. 승인 전, 승인 대기, 실행 대기, 차단 상태를 모두 포함한다.
- `completed/`: 제안된 작업이 실제로 수행되어 검증까지 끝났거나, 실행하지 않기로 결정되어 닫힌 기록을 둔다.

`planned/`, `in-progress/`, `blocked/`, `rejected/`, `archive/` 같은 추가 폴더는 현재 만들지 않는다. 실행 전 세부 상태는 front matter의 `stage`로 관리하고, 실행하지 않기로 한 이유는 `closed-*` metadata로 남긴다.

문서 목록은 README에 수동으로 복제하지 않고 파일 시스템을 기준으로 확인한다. 이렇게 해야 proposal 추가, 이동, 완료 처리 시 README가 stale해지는 일을 줄일 수 있다.

## Status

Proposal의 `status`는 문서의 생명주기만 표현한다.

| Status | 위치 | 의미 |
| --- | --- | --- |
| `pending` | `active/` | 아직 결론나지 않은 제안서. 승인 전, 승인 대기, 승인 후 실행 대기, 차단 상태를 모두 포함한다. |
| `completed` | `completed/` | 제안된 작업이 실제 코드 변경과 검증까지 완료된 기록. |
| `closed` | `completed/` | 실행하지 않기로 결정된 기록. 거절, 중복, 만료, 다른 proposal로 대체된 경우를 포함한다. |

`status`에 `draft`, `reviewed`, `approved`, `blocked`, `rejected`, `abandoned` 같은 값을 추가하지 않는다.

`pending` 문서의 실행 전 상태는 `stage`로만 관리한다.

| Stage | 의미 |
| --- | --- |
| `draft` | 아직 작성 중이며 승인 요청 전이다. |
| `awaiting-approval` | 검토와 승인 요청이 가능한 상태다. |
| `approved` | 승인 기록이 채워졌고 실행 대기 중이다. |
| `blocked` | 실행 전 해결해야 할 의존성이나 결정 사항이 있다. |

`stage`는 `pending` 문서에만 사용한다. `completed` 또는 `closed` 문서는 `stage: null`로 둔다.

`stage: "approved"`를 쓰려면 front matter의 `approved-by`, `approved-at`, `approval-scope`가 모두 채워져 있어야 한다.

실행하지 않기로 한 proposal은 `status: "closed"`로 바꾸고 아래 metadata를 채운 뒤 `completed/`로 이동한다.

```yaml
closed-at: "YYYY-MM-DD"
closed-by: "{name or team}"
closed-reason: "{rejected|superseded|wont-do|expired|duplicate}"
```

## Approval

Proposal은 실제 작업 전에 책임자 또는 요청자의 승인을 받아야 한다.

승인 여부는 `status`로 관리하지 않는다. 각 proposal의 front matter가 승인 기록의 단일 기준이다.

승인 전:

```yaml
approved-by: null
approved-at: null
approval-scope: null
```

승인 후:

```yaml
stage: "approved"
approved-by: "{name or team}"
approved-at: "YYYY-MM-DD"
approval-scope: "{approved work scope}"
```

본문의 `Approval` 섹션은 사람이 읽기 위한 승인 메모와 조건만 남기는 곳이다. 승인자, 승인일, 승인 범위는 front matter에만 기록하고 본문에는 같은 값을 다시 적지 않는다. 이렇게 해야 승인 기록이 두 곳에서 서로 달라지는 일을 막을 수 있다.

승인 후에도 실제 작업과 검증이 끝나기 전까지 문서는 `active/`에 남긴다. 작업이 완료되거나 실행하지 않기로 결정되면 `completed/`로 이동한다.

## Template

새 proposal은 [template.md](./template.md)를 복사해서 작성한다.

템플릿은 proposal 문서 구조의 기준이다. 작업 규모는 front matter의 `proposal-size`로 표시한다.

```yaml
proposal-size: "standard" # small | standard
```

`small` proposal은 영향 범위가 좁고 롤백이 단순한 작업에만 사용한다. 아래 조건 중 하나라도 해당하면 `standard`를 사용한다.

- 삭제 작업
- 라우팅, 인증, 결제, 법적 동의, 개인정보 흐름 영향
- `public/` 자산 또는 정적 URL 영향
- dynamic import, barrel export, runtime side effect 가능성
- 5개 이상 파일 변경
- 마이그레이션, 데이터 구조, API 계약 변경
- 롤백이 단순 revert 이상인 작업

작업 규모에 따라 필요 없는 섹션은 줄일 수 있지만, proposal이 실행 근거로 쓰이려면 아래 정보는 남긴다.

필수 정보:

- front matter의 상태, 생성일, 승인 기록
- `stage`와 `proposal-size`
- 목적과 제안 요약
- 변경 범위와 제외 범위
- 영향 파일 또는 영향 영역
- 안전하다고 판단한 근거
- 검증 계획
- 잔여 리스크와 롤백 방법

완료 문서에는 추가로 실제 검증 결과와 완료 기록을 남긴다.


## Migrated Documents (2026-08-02)

이 폴더 구조를 도입하기 전에 작성된 문서들은 2026-08-02에 일괄 이동했다.
읽을 때 아래 두 가지를 감안한다.

**파일명과 `completed-at`의 날짜는 완료일이 아니다.** 이 문서들이 작성될
당시에는 완료일을 기록하는 자리가 없었고, 나중에 복원할 방법도 없었다.
날짜는 마이그레이션 시점의 파일 최종 수정일(루트 `docs/`는 마지막 커밋일)에서
가져왔다. 시간 순서는 신뢰할 수 있지만 특정 날짜를 "이날 완료됐다"로 읽으면
안 된다.

**`status`는 코드 대조로 판정했다.** 문서 49개 중 상태를 명시한 것은 4개뿐이라,
나머지는 문서가 제안한 기능이 실제 코드에 존재하는지 확인해 `completed`와
`pending`을 나눴다. 근거를 찾지 못한 것은 `active/`에 두었으므로, `active/`에
있다고 해서 반드시 미완료인 것은 아니다. 확인되는 대로 옮긴다.

`verification-summary`가 "마이그레이션 전 문서"인 항목은 개별 검증 기록이
없다는 뜻이다. 이후 새로 작성하는 문서에는 해당되지 않는다.

## Document Inventory

현재 proposal 목록은 저장소 루트에서 아래 명령으로 확인한다.

PowerShell:

```powershell
Get-ChildItem -LiteralPath .\proposals\active, .\proposals\completed -Filter *.md -File |
  Sort-Object FullName |
  ForEach-Object { $_.FullName }
```

POSIX shell:

```bash
find proposals/active proposals/completed -type f -name '*.md' | sort
```

문서별 상태는 각 파일의 front matter `status`와 파일 위치가 일치해야 한다. `active/` 문서는 `pending`, `completed/` 문서는 `completed` 또는 `closed`를 사용한다.

상태와 위치 불일치는 저장소 루트에서 아래 명령으로 빠르게 확인한다. 출력이 없으면 명확한 불일치가 없다는 뜻이다.

PowerShell:

```powershell
Select-String -Path .\proposals\active\*.md -Pattern '^status:\s*"completed"'
Select-String -Path .\proposals\active\*.md -Pattern '^status:\s*"closed"'
Select-String -Path .\proposals\completed\*.md -Pattern '^status:\s*"pending"'
```

POSIX shell:

```bash
find proposals/active -type f -name '*.md' -exec grep -Hn '^status: "completed"' {} +
find proposals/active -type f -name '*.md' -exec grep -Hn '^status: "closed"' {} +
find proposals/completed -type f -name '*.md' -exec grep -Hn '^status: "pending"' {} +
```

## Included Documents

다음 성격의 문서를 이 폴더에서 관리한다.

- dead code, 미사용 자산, 오래된 기능 제거 제안
- 리팩터링 또는 코드 구조 정리 제안
- 여러 파일에 걸친 변경 범위와 검증 계획
- 삭제, 이동, 통합처럼 실제 수행 전 영향 검토가 필요한 작업
- 기존 동작을 유지하면서 내부 구현을 정리하는 작업 계획
- 변경 전후 검증 기준과 알려진 리스크를 남겨야 하는 작업

## Excluded Documents

다음 문서는 이 폴더에 넣지 않는다.

- 장기적으로 남겨야 하는 아키텍처 의사결정 문서: `ADR/`
- npm 패키지 설치, 제거, 업그레이드, 교체 전용 문서: `dependencies/`
- 단순 회의록, 조사 메모, 임시 작업 로그
- 제품 요구사항 또는 화면 기획 문서
- 이미 코드 변경으로 명확히 표현되는 작은 수정 사항

## File Naming

파일명은 작업 주제를 드러내는 kebab-case를 사용한다.

권장 형식:

```txt
<topic>.md
```

예시:

```txt
dead-code-removal-candidates.md
remove-unused-routes.md
cleanup-public-assets.md
refactor-payment-flow.md
consolidate-modal-components.md
```

완료 문서명은 완료일을 앞에 붙인다.

```txt
completed/YYYY-MM-DD-<topic>.md
```

예시:

```txt
completed/2026-06-29-dead-code-removal-candidates.md
```

실행하지 않기로 닫은 문서는 닫은 날짜와 `closed`를 앞에 붙인다.

```txt
completed/YYYY-MM-DD-closed-<topic>.md
```

예시:

```txt
completed/2026-06-29-closed-remove-unused-routes.md
```

## How to Add a Proposal

1. [template.md](./template.md)를 `active/<topic>.md`로 복사한다.
2. front matter의 `status`는 `pending`, `stage`는 `draft`, `created-at`은 작성일로 둔다.
3. 목적, 변경 범위, 영향 파일, 안전성 판단, 검증 계획을 작성한다.
4. 검토 가능한 상태가 되면 `stage`를 `awaiting-approval`로 바꾼다.
5. 승인되면 `stage`를 `approved`로 바꾸고 front matter의 `approved-by`, `approved-at`, `approval-scope`를 갱신한다. 필요한 승인 조건이나 참고 메모만 본문 `Approval` 섹션에 남긴다.
6. 작업과 검증이 완료되면 `status`를 `completed`, `stage`를 `null`로 바꾸고 `completed-at`, `verification-summary`, `Completion or Closure Notes`를 갱신한다.
7. 실행하지 않기로 결정되면 `status`를 `closed`, `stage`를 `null`로 바꾸고 `closed-at`, `closed-by`, `closed-reason`, `Completion or Closure Notes`를 갱신한다.
8. 문서를 `completed/YYYY-MM-DD-<topic>.md` 또는 `completed/YYYY-MM-DD-closed-<topic>.md`로 이동한다.

기존 proposal이 템플릿과 다르게 작성되어 있다면, 큰 수정이나 완료 이동 전에 front matter와 핵심 섹션을 현재 템플릿 기준으로 먼저 맞춘다.

## Document Standards

각 proposal은 가능한 한 다음 내용을 포함한다.

- front matter metadata
- `status`, `stage`, `proposal-size`의 일관성
- 목적
- 현재 상태와 문제
- 변경 또는 삭제 후보 목록
- 후보별 판단 근거
- 영향 범위
- 안전하다고 판단한 이유
- 검증 방법과 실행 결과
- 알려진 기존 실패와 신규 실패의 구분
- 잔여 리스크
- 권장 실행 순서
- 롤백 또는 복구 방법

특히 삭제 제안서는 "참조가 적어 보인다" 수준에서 끝내지 않는다. 라우팅, dynamic import, barrel export, 정적 자산 URL, 테스트/스크립트 참조, 타입 선언처럼 오탐이 생길 수 있는 경계를 확인하고 근거를 남긴다.

작은 proposal은 [template.md](./template.md)의 모든 체크 항목을 기계적으로 유지하지 않아도 된다. 다만 생략한 항목이 왜 해당 작업과 무관한지 문서 흐름에서 명확해야 한다.

## Move Criteria

완료된 실행 기록으로 문서를 `completed/`로 이동하려면 아래 기준을 모두 만족해야 한다.

- proposal이 승인됨
- proposal에 적힌 실제 코드 변경이 완료됨
- 삭제/수정 대상 파일과 후속 정리가 모두 반영됨
- 필요한 검증 명령이 실행됨
- 검증 실패가 있다면 기존 실패인지 신규 실패인지 문서에 기록됨
- 잔여 리스크와 후속 작업이 정리됨
- front matter의 `status`, `stage`, `completed-at`, `verification-summary`가 완료 상태와 일치함
- 문서가 더 이상 실행 전 제안서가 아니라 수행 기록으로 읽힘

완료 후에도 proposal의 판단 근거는 보존한다. 단, 실제 수행 중 달라진 범위나 검증 결과는 completed 문서에 반영한다.

실행하지 않기로 결정된 proposal을 `closed`로 이동하려면 아래 기준을 모두 만족해야 한다.

- 실행하지 않기로 한 이유가 명확함
- `closed-at`, `closed-by`, `closed-reason`이 채워짐
- 대체 proposal이나 관련 문서가 있으면 `related` 또는 본문에 연결됨
- 이미 일부 작업이 진행되었다면 남은 리스크와 정리 필요 사항이 기록됨
- 문서가 더 이상 실행 대기 제안서가 아니라 닫힌 결정 기록으로 읽힘
