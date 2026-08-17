---
status: "accepted"
date: "2026-08-17"
applies-to: ["apps/admin/src"]
decision-makers: ["user"]
consulted: ["admin-dev", "frontend architecture review"]
informed: ["repository contributors"]
supersedes: []
superseded-by: null
---

# Admin 소스에 right-sized FSD를 적용한다

## Context and Problem Statement

`apps/admin/src`는 화면이 둘뿐이던 초기에는 flat 구조를 사용했지만, 현재는 login, analytics, observability, pipeline과 인증·DB read·GitHub write·Sentry 경계를 함께 가진다. `ui`, `pipeline`, `lib` 같은 종류 중심 폴더에 서로 다른 변경 이유가 섞여 있어 수정 범위와 런타임 경계를 경로만으로 판단하기 어렵다.

## Scope

이 ADR이 적용되는 범위:

- `apps/admin/src`의 화면, 사용자 행위, 도메인 데이터, 공용 인프라 배치
- FSD 레이어 방향, slice public API, Next.js route wrapper와 Edge/Node auth 경계
- `Core: right-sized FSD migration`의 동작 보존 구조 이동

이 ADR이 다루지 않는 범위:

- `apps/web/src`의 기존 구조 부채 정리
- analytics, gate, board parser, observability의 의미 변경인 Full hardening
- FEAT-10 기능 구현 자체

## Decision Drivers

- 함께 바뀌는 코드를 한 slice에 두고 변경 누락을 줄여야 한다.
- `pages > widgets > features > entities > shared` 단방향 의존성을 자동 검증할 수 있어야 한다.
- Next.js App Router의 route, Server Action, client component, Edge/Node 경계를 보존해야 한다.
- 현재 인증, DB read-only, GitHub whitelist·stale/SHA, Sentry 동작을 구조 이동 중 바꾸지 않아야 한다.
- 실제 admin 규모에 필요하지 않은 레이어나 재사용 추상화를 만들지 않아야 한다.

## Considered Options

- 현재 flat 구조 유지
- `apps/web/src`의 실제 폴더 구조를 그대로 복제
- admin 도메인에 필요한 slice만 두는 right-sized FSD

## Decision Outcome

Chosen option: "admin 도메인에 필요한 slice만 두는 right-sized FSD", because 구조적 소유권과 의존 방향을 명확히 하면서도 web의 레거시 deep import, 파일명 혼용, 사용되지 않는 layer까지 복제하지 않는다.

### Acceptance

사용자가 2026-08-17 `admin-src-fsd-refactoring.md`의 `Core: right-sized FSD migration`, `fsd-first` 실행 순서와 ADR 0001 acceptance를 승인했다. 이 ADR과 해당 proposal front matter가 승인 기록이다.

### Consequences

Positive:

- analytics, pipeline entity, 외부 쓰기 feature, page composition, shared infrastructure의 소유자가 분리된다.
- slice public API와 자동 boundary 검사로 deep import와 상향/peer 의존을 차단한다.
- framework route와 auth runtime 경계가 도메인 구현과 구분된다.

Negative / trade-offs:

- 62개 기존 파일의 이동과 import 갱신으로 큰 diff가 발생한다.
- route group, public entry, boundary script와 운영 문서를 함께 유지해야 한다.
- Core는 의미 변경을 의도적으로 미루므로 발견된 Full hardening 항목은 후속 작업으로 남는다.

### Confirmation

`apps/admin/scripts/verify-fsd-boundaries.mjs`, runtime tests, production typecheck, safe build와 exact source path-set 검사를 완료 조건으로 사용한다. protected page/action의 auth-first 호출과 DB/GitHub/Sentry owner도 contract test와 boundary fixture로 확인한다.

## Pros and Cons of the Options

### 현재 flat 구조 유지

- Good, because 파일 이동 비용이 없다.
- Neutral, because 작은 화면 수만 보면 단순해 보인다.
- Bad, because 현재 여러 도메인·외부 효과의 소유권과 변경 범위를 표현하지 못한다.

### `apps/web/src`의 실제 폴더 구조를 그대로 복제

- Good, because 두 앱의 겉모양이 비슷해진다.
- Neutral, because web의 일부 convention은 참고할 수 있다.
- Bad, because web에 남은 deep import, casing 혼용과 admin에 불필요한 layer까지 복제한다.

### admin 도메인에 필요한 slice만 두는 right-sized FSD

- Good, because 실제 변경 이유를 기준으로 최소 slice를 만들고 의존 방향을 검사할 수 있다.
- Neutral, because Next.js framework 진입점과 auth infrastructure는 FSD 밖에 남는다.
- Bad, because 초기 migration과 public API·검사 도구 유지 비용을 받아들여야 한다.

## More Information

- 구현 제안: `apps/admin/docs/proposals/active/admin-src-fsd-refactoring.md`
- 구조 기준: `apps/web/docs/conventions/fsd-architecture-guidelines.md`
- 이 결정은 2026-08-02의 “화면 2개이므로 admin에는 FSD를 적용하지 않는다”는 당시 판단을 현재 범위에 한해 대체한다. 당시 완료 proposal의 역사 기록은 수정하지 않는다.

## Review Checklist

- [x] 모든 placeholder를 실제 내용으로 바꿨다.
- [x] 선택한 option과 선택하지 않은 option의 trade-off가 드러난다.
- [x] `status`, `date`, `applies-to`, 승인 기록이 현재 상태와 맞다.
- [x] 이 ADR이 적용되는 범위와 다루지 않는 범위가 명확하다.
- [x] 결정 준수 여부를 확인하는 방법이 적혀 있다.
- [x] `supersedes`, `superseded-by` 값은 ADR 번호 형식을 따른다.
