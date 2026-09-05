# FEAT-33 — 메인 루프 기록

## 필수 경로 확정 (2026-09-05)

| 경로 | 채택 | 근거 |
| --- | --- | --- |
| 1 인용 전수 대조 | ○ | 전 항목 필수 |
| 2 스케치 추출·실행 | ◎ | 배럴 7개가 default를 named로 승격하는 형태 — 컴파일이 유일한 확인 |
| 3 before/after | ○ | 기존 파일 15개 수정(외부 9 + 자기참조 10이 파일 단위로 겹침) |
| 4 전칭 여집합 | ◎ **본체** | "참조 16 중 밖이 9", "밖에서 위젯 타입·모델을 쓰는 곳 0", "widgets에 `api/` 없음" |
| 5 돌연변이 | × | 판정 로직·순수 함수 신설 없음(임포트 경로 재배선) |
| 6 실제 사건 재생 | × | 외부 신호 해석 없음 |
| 7 음성 시험 | × | 이번엔 새 불변식·화이트리스트를 만들지 않는다 — 경계 강제는 FEAT-34 몫이라고 계획서가 명시 |
| 8 실물 렌더 | × | 컴포넌트 본문 무변경, 임포트 specifier만 바뀐다 |

## 라운드 1 (메인 루프) — 결함 0건

계획서의 모든 전칭·인용을 독립 열거로 대조했다. **어긋난 곳이 없었다.**

**경로 4 전칭 여집합(본체)**
- `~/fsd/widgets/` 참조 총 **16건**, 그중 슬라이스 밖 **9건** — 계획서 수치와 일치.
- widgets 7개 슬라이스에 `api/` 세그먼트 **0개** → FEAT-31식 `index.ts`/`server.ts` 이원화가
  불필요하다는 계획서 근거가 성립.
- `HeaderAuthMenu` 외부 참조 **0건** → site-header의 공개 대상이 `PublicHeader` 하나뿐이라는
  판단이 맞다.
- 슬라이스 밖에서 위젯의 타입·모델을 소비하는 곳 **0건**(참조 16이 전부 default 컴포넌트
  임포트이거나 clip-display 내부 자기참조) → 배럴이 컴포넌트 하나씩만 내보내면 충분.

**경로 1 인용 전수 대조**
- 6개 슬라이스의 `ui/index.tsx` default export와 **줄번호·컴포넌트명**이 전부 일치
  (clip-display:11 · clip-draft-review:90 · dashboard-header:24 · login-form:16 ·
  site-footer:47 · uploaded-file-list:8).
- site-header는 `ui/index.tsx`가 없고 `ui/public-header.tsx:24`에 default export — 확인.
- 선례 인용 `features/upload/index.ts:26` = `export { default as UploadedFileActions } from "./ui";` — 일치.
- `clip-draft-review/ui/index.tsx:46`의 `BlockKind` 타입 정의 — 일치.
- `ClipCard.tsx:9`가 이미 상대경로(`../../model/use-script-clipboard`)라 자기참조 목록에서
  제외된다는 서술 — 확인.

**경로 2 스케치 추출·실행** — 배럴 7개를 스케치 그대로 만들고 **소비처 파일까지 함께** 걸어
프로젝트 설정으로 컴파일: `npx tsc --noEmit` **EXIT 0**, `npx eslint` **EXIT 0**. (최근 세 항목의
반복 결함이 "원천만 격리 검사"였으므로 이번엔 처음부터 소비처를 붙였다.) 확인 후 배럴 7개와
임시 파일 삭제, `git status` 청결 검산.

**백로그 낡은 인용을 계획서가 정정한 것** — 내가 백로그에 적은 `upload-detail :20,21`과
`OrderHistory :16`이 각각 `:21,22`·`:17`로 밀려 있었다. 원인은 우리 자신의 작업이다 —
BUG-10이 두 파일에 `formatDate` 임포트를 추가하면서 아래 줄이 한 칸씩 내려갔다. 계획서가
실측으로 정정했고 내가 재확인했다. 대상·개수(외부 9·자기참조 10)는 그대로다.

**범위 밖으로 남긴 것 — 처리함**: 계획서가 `pages/pricing/ui/index.tsx:3`의
`~/fsd/features/billing/config/plan-tiers` 직접 참조(§5.3 위반)를 관측하고 범위 밖으로
남겼다. 판단에 동의한다 — 백로그가 FEAT-33에 준 범위에 없다. 다만 **경계 검사를 켜면 즉시
걸릴 줄**이라 `TASK_BACKLOG.md`의 FEAT-34 항목에 「선행 정리 대상」으로 기록했다.

**결과**: 편집 없음·소득 없음 → `plan-verifier` 독립 패스 디스패치.
