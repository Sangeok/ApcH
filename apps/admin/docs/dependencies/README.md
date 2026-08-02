# Dependencies Documentation

이 디렉터리는 저장소의 의존성 변경과 관련된 실행 문서를 관리한다.

의존성 변경에는 패키지 설치, 제거, 업그레이드, 다운그레이드, 교체,
lockfile 갱신, 관련 설정 정리, 빌드와 테스트 영향 확인, 보안 점검 대응이
포함된다. 단순한 아이디어 메모가 아니라 실제 변경을 진행하거나 검증한
근거로 사용할 수 있는 문서를 둔다.

## Directory Structure

```txt
dependencies/
  README.md
  active/
    <action>-<package-or-topic>.md
  completed/
    YYYY-MM-DD-<action>-<package-or-topic>.md
```

- `active/`: 아직 완료되지 않은 의존성 작업 문서를 둔다.
- `completed/`: 실제 변경과 검증이 끝난 의존성 작업 기록을 둔다.

작업 생명주기는 기본적으로 `active`와 `completed`만 사용한다.
`archive/`, `planned/`, `in-progress/`, `blocked/` 같은 추가 디렉터리는
문서 수가 많아져 실제 관리 이점이 생길 때만 도입한다. 세부 상태는 문서
본문이나 README의 인덱스에서 관리한다.

## Document Index

현재 작업 문서는 아래 형식으로 관리한다. 문서가 없다면 해당 section에
`현재 문서 없음.`이라고 적는다.

```md
### Active

| 문서 | 상태 | 비고 |
| --- | --- | --- |
| [example.md](./active/example.md) | `planned` | 작업 요약 |
```

권장 상태 값:

- `planned`: 변경 범위와 절차를 준비 중인 문서
- `in-progress`: 실제 코드 또는 의존성 변경을 진행 중인 문서
- `blocked`: 외부 결정, 실패 원인 분석, 승인 대기 등으로 멈춘 문서
- `ready-to-complete`: 변경과 검증이 끝났고 완료 기록 정리만 남은 문서

```md
### Completed

| 문서 | 완료일 | 비고 |
| --- | --- | --- |
| [2026-06-25-example.md](./completed/2026-06-25-example.md) | `2026-06-25` | 작업 요약 |
```

## When to Write a Dependency Document

다음처럼 패키지 변경 자체가 작업의 중심이면 이 디렉터리에 문서를 둔다.

- 특정 패키지를 설치하거나 제거하는 작업
- 특정 패키지를 업그레이드하거나 다운그레이드하는 작업
- 기존 패키지를 다른 패키지로 교체하는 작업
- `dependencies`와 `devDependencies`를 재분류하거나 정리하는 작업
- lockfile을 갱신하고 설치 결과를 확인해야 하는 작업
- 패키지 제거 후 import, 설정, 테스트 코드, 빌드 설정을 정리하는 작업
- 패키지가 development 또는 production build에 주는 영향을 분석하는 작업
- `npm audit` 등 보안 점검 결과에 대응하는 작업

의존성이 일부 언급되더라도 문서의 중심이 패키지 설치, 제거, 업그레이드,
교체, 검증이 아니라면 다른 위치에서 관리한다.

## What Does Not Belong Here

다음 문서는 이 디렉터리에 넣지 않는다.

- 의존성 변경과 무관한 일반 리팩터링 계획
- 화면, 라우팅, 상태관리, API 구조 개편 문서
- 배포 절차 자체를 설명하는 문서
- 단순 기능 명세 또는 제품 요구사항 문서
- 기술 선택 이유와 trade-off만 기록하는 의사결정 문서

기술 선택의 이유를 장기 기록으로 남겨야 한다면 ADR을 작성하고, 실제 패키지
변경 절차와 검증 기록은 이 디렉터리의 의존성 문서에서 관리한다.

## File Naming

파일명은 작업과 대상을 함께 드러내는 kebab-case를 사용한다.

권장 형식:

```txt
<action>-<package-or-topic>.md
```

예시:

```txt
add-sentry.md
remove-unused-package.md
upgrade-vite.md
replace-moment-with-dayjs.md
audit-npm-vulnerabilities.md
```

여러 패키지가 하나의 목적을 위해 함께 변경되는 경우에는 패키지명보다 작업
주제를 우선한다.

```txt
replace-date-library.md
update-testing-dependencies.md
```

완료된 문서는 완료일을 앞에 붙여 `completed/`로 이동한다.

```txt
completed/YYYY-MM-DD-<action>-<package-or-topic>.md
```

예시:

```txt
completed/2026-06-25-remove-unused-package.md
```

## Document Standards

각 작업 문서는 가능한 한 다음 내용을 포함한다.

- 목적
- 현재 사용 위치
- 변경 범위
- 설치, 제거, 업그레이드, 교체 절차
- 수정해야 하는 파일 목록
- development 환경 영향
- production 환경 영향
- 검증 명령
- 알려진 기존 실패와 신규 실패의 구분
- 예상 부작용
- 필요 시 롤백 방법

작업이 작다면 모든 항목을 억지로 채우지 않아도 된다. 다만 변경 범위,
검증 방법, 남은 리스크는 반드시 독자가 확인할 수 있어야 한다.

## Lifecycle

1. `active/`에 `<action>-<package-or-topic>.md` 형식의 문서를 만든다.
2. 변경 목적, 범위, 절차, 검증 방법을 작성한다.
3. 실제 코드와 의존성 변경을 진행한다.
4. 실행한 명령, 실패 여부, 남은 리스크를 문서에 반영한다.
5. 완료 기준을 만족하면 문서를 `completed/`로 이동하고 완료일을 파일명에
   붙인다.
6. README의 `Document Index`를 갱신한다.

## Move Criteria

문서를 `completed/`로 이동하려면 아래 기준을 모두 만족해야 한다.

- 실제 코드 또는 의존성 변경이 완료됨
- package manifest, lockfile, 관련 import/config 정리가 끝남
- 필요한 검증 명령이 실행됨
- 검증 실패가 있다면 원인과 잔여 리스크가 문서에 기록됨
- 문서가 더 이상 실행 가이드가 아니라 수행 기록으로 읽힘

완료 기준을 일부 만족하지 못했다면 `active/`에 남기고, 현재 상태와 막힌
이유를 문서에 명확히 기록한다.
