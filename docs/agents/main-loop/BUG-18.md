# BUG-18 — 메인 루프 기록

## 게이트① (2026-10-15)

소유자가 2026-10-14 세션에서 「`/dashboard/settings`에서 저장했는데 `/dashboard` 업로드 폼 Video style에 반영되지
않는다」를 가져왔다. 메인 루프가 소유자 계정을 읽기 전용으로 조회하고(DB 기본값·`settings_defaults_saved` 이벤트·최근
업로드) 코드를 대조했다. 자막 저장은 DB에 들어갔고(`marginV` 433) 여백은 0으로 남아 있었다. 소유자가 「`Save framing`을
안 눌러서 그런 것 같다」고 확인해 여백 미저장이 확정됐다. 자막 위치가 「안 됐다」는 인상의 원인은 미확인으로 남겼다
(백로그 진단 (a)·(b)).

분리 저장의 출처를 FEAT-58(`docs/plans/FEAT-58.md:34`·`:323`·`:1193`)과 FEAT-60 요구 ⑤로 짚어 보고했다. 소유자가
「그럼 어케하는게 좋다는거야」에 대한 권고 셋(저장 하나·원자적, 미저장 표시와 이탈 경고, 리셋은 로컬만)을 「진행하자」로
받았다. 이 답으로 「자막 저장은 여백을 건드리지 않는다」 불변식 폐기를 소유자 결정으로 기록했다.

- 백로그 등재와 pm 디스패치: `6ddc05c`. pm은 미결 0건 규칙으로 BUG-12를 함께 골랐다.
- 게이트①: 2026-10-15 소유자가 「계획지시」로 열었다. 두 행이 다 `승인대기`였고, BUG-12는 원치 않으면 행을 지우면
  된다고 안내한 뒤였는데 지워지지 않았다. 그래서 둘 다 연 것으로 기록한다(BUG-12 기록 참조).
- 담당: web-dev. 고칠 곳은 `apps/web/src/fsd/` 안이다.

web-dev가 계획서를 쓰고 `검토대기`로 바꿨다(`bcb646f`).

## 필수 경로 확정 (2026-10-15)

| # | 경로 | 판정 | 이유 |
| --- | --- | --- | --- |
| 1 | 인용 전수 대조 | 필수 | 전 항목 |
| 2 | 스케치 추출·실행 | 필수 | 신규 2·수정 4 스케치 |
| 3 | before/after 기계 적용 | 필수 | 기존 파일 4개 수정. 줄 범위 지시를 그대로 적용할 수 있는지 |
| 4 | 전칭 여집합 열거 | 필수 | 「호출부는 이 화면뿐」「소비자 0건」「불변식 근거 코드 테스트 없음」「`CaptionStyle` 전 필드」 |
| 5 | 돌연변이 검사 | 필수 | 순수 함수 `hasUnsavedVideoStyle` 신설 |
| 6 | 실제 사건 재생 | 필수 | DB에 저장된 JSON(옛 `marginV` 없는 값)을 해석. 실제 저장값을 새 검증·비교에 통과시킨다 |
| 7 | 음성 시험 | 필수 | 불변식 폐기와 「전 필드 비교」라는 새 불변식 |
| 8 | 실물 렌더 | 필수 | 버튼·문구가 바뀌는 화면 변경 |
| 9 | 구조적 아티팩트 | 제외 | schema·마이그레이션 없음 |

## 라운드 1 — 메인 루프 (2026-10-15, 편집 있음)

스케치를 트리에 기계 적용해 돌리고 되돌렸다(라운드 끝 `git status` 청결 확인). 하니스는 스크래치패드 `bug18/`(`apply.py`·`replay.mts`·명세 테스트).

- 경로 1: 다음 인용을 내용까지 대조했고 전부 일치했다.
  - `index.tsx`: `:3`·`:6-10`·`:72`·`:77-91`·`:80`·`:88-90`·`:131-145`·`:133`·`:141`·`:147-164`·`:266`·`:284`·`:290-291`·`:292-299`·`:296`·`:304`·`:337-348`·`:343`
  - `features/settings/api`: `:42-71`·`:57`·`:65`·`:69`·`:73-90`·`:79`·`:82-87`·`:83`·`:88`
  - `entities/user/api`: `:4`·`:6`·`:177-192`·`:187-190`·`:201-209`·`:206-207`
  - 그 밖: `server.ts:17-18`, `metadata.ts:58`, `analytics-contract.ts:38`, `CaptionStyleEditor.tsx:33`, FEAT-58 `:323`·`:1193`, FEAT-60 `:26`
- 경로 2·3: 블록 9개를 추출했다. 줄 범위 지시대로 네 파일에 기계 적용했다. 각 파일의 CRLF/LF 줄끝은 보존했다. 명세 1~10을 실행 가능한 테스트로 옮겼다. 결과:
  - `npm test` 226/226
  - `tsc --noEmit` EXIT 0, `next lint` 무경고
  - `verify:fsd` 통과, `verify:fsd:test` 11/11
  - 새 세그먼트 `pages/settings/model/`과 같은 슬라이스 별칭 임포트도 경계 검사를 통과했다.
- 경로 4: `git grep`으로 옛 심볼 넷의 코드 참조를 확인했다. 정의·barrel·액션·이 화면뿐이고 테스트 mock도 없다. 새 심볼 셋은 충돌 0이다. 옛 심볼을 언급하는 `.md`는 이력 문서뿐이다(`CLAUDE.md`류·원장 0). `CaptionStyle` 필드 8개는 `constants.ts:120-133`과 일치한다.
- 경로 5: 돌연변이 16개를 심었고 11개가 사멸했다. **비교 목록에서 `position`·`maxWordsPerLine`·`outlineColor`·`outlineWidth`·`uppercase`를 하나씩 빼도 명세 1~10이 전부 통과했다(생존 5).** 그런 구현에서는 그 필드만 바꾼 편집이 미저장으로 안 잡혀 저장 버튼이 켜지지 않는다. BUG-18이 없애려는 「경고 없이 버려짐」이 다시 생기는 것이다. `satisfies`는 빠진 키를 못 잡는다 → **구현 영향 결함**.
  - 고침: 목록을 `Record<keyof CaptionStyle, true>`로 바꾸고 명세 11(필드 전수)을 추가했다.
  - 재실행: 여덟 키 제거가 전부 사멸했고 원본은 11/11 통과다.
- 경로 6: 실제 DB를 읽기 전용으로 재생했다.
  - 사용자 8명, 저장 캡션 2개(1개는 `marginV` 키 없는 옛 형태). 합친 검증 실패 0, 불러온 값 복제본의 거짓 미저장 0.
  - 여백 분포: 0이 7명, 15가 1명.
  - 여백 저장이 캡션 검증에 묶인다는 새 결합과 두 탭 동시 저장의 덮어쓰기가 계획서에 없었다 → 「합친 저장이 만드는 결합」 절 추가.
- 경로 7:
  - 고친 목록에서 키 하나를 빼면 tsc가 `TS2741 Property 'marginV' is missing`으로 깨진다.
  - 명세 11을 빼면 다섯 키 제거가 산다(위 생존 5).
  - 폐기된 불변식에 기대는 코드 테스트는 0이다(경로 4).
- 경로 8: `SettingsView`를 `renderToStaticMarkup`으로 렌더했다(`next/navigation`·액션 모듈 mock). 처음 열 때 다음과 같았다.
  - 버튼은 `Save defaults`·`Reset to system defaults`·`Reset framing`·`Save video style`(**disabled**)·`Reset both languages`
  - `Unsaved changes` 없음, `Each language has its own caption style.` 있음
  - 옛 문구(`Save framing`·`Save caption style`·`saved separately`)는 0
  - Framing 도움말은 유지
  - dirty 분기는 상호작용이 있어야 해서 정적 렌더로 못 본다(못 덮는 범위).
- 결함 4건: 구현 영향 1(위 경로 5), 문서 위생 3.
  - 옛 `marginV` 주석의 「불러오자마자」 서술이 틀렸다. 불러온 직후에는 같은 참조라 거짓 미저장이 없다. 실제 경로는 옛 값 위에서 Position 버튼을 누르는 경우다.
  - 합친 `validate`가 옛 `marginV` 정규화 이유 주석을 잃었다.
  - 결합 둘(여백 저장이 캡션 검증에 묶임, 두 탭 덮어쓰기)이 누락됐다.
- 인수 때 할 일(메인 루프): `apps/web/CLAUDE.md` 테스트 목록에 `video-style-dirty.test.mjs` 행을 추가한다(web-dev 비고 (1)). `CaptionStyleEditor.tsx:33`의 「(요구 ⑤)」 꼬리표는 문서 위생으로 남긴다(비고 (2)).

## 독립 패스 — plan-verifier 1회차 (2026-10-15, 판정 불가 · 문서 위생 1)

**메인 루프의 브리핑 계약 위반.** 결함 분류 표시와 경로별 증거 요구를 실었다(BUG-12와 같은 브리핑 형태). 둘 다 `plan-verifier.md`에 이미 계약된 요구다. 검증자는 직전 결함이나 클린 예상 같은 「답」이 실리지 않아 실질 오염 위험은 낮았다고 적었다. 그래도 판정 자격은 없다.

- 결과: 필수 8경로를 전부 실행했다.
  - 경로 5는 명세 11케이스로 돌연변이 13종이 전부 사멸했다. 1~10만이면 다섯 필드 제거가 산다는 계획서 주장도 재현했다.
  - 경로 6은 읽기 전용 DB 재생이다. 8명, 저장 캡션 2, 실패 0, 옛 형태 1로 계획서와 일치했다.
  - 경로 7에서 `Record` 키 제거는 TS2741로 잡혔다.
  - 경로 8은 실제 `Button`과 `hasUnsavedVideoStyle`로 dirty·clean·saving 세 분기를 렌더했다.
- **문서 위생 1**: 「문제」 절이 「아래 「비고」로 보고한다」고 했는데 「비고」 절이 없었다. 「비고」 절을 추가했다. `CaptionStyleEditor.tsx:33` 꼬리표와 `apps/web/CLAUDE.md` 테스트 목록 행을 담았다.
- 검증자 주석: 경로 2의 tsc는 순수 함수와 서버·엔티티 스케치만 컴파일했다. `index.tsx` UI 핸들러 본문은 경로 8 렌더로만 간접 확인했다. 메인 루프 라운드 1에서는 네 파일을 트리에 기계 적용한 전체를 `tsc` 0·`next lint` 무경고로 확인했다.
- 트리: 검증자의 저장소 쓰기는 0이다. 검증자가 본 ` M docs/agents/main-loop/BUG-12.md`는 메인 루프가 쓰던 기록이다.
- 계획서가 바뀌었으므로 계약 셋(+실행 환경 worktree)으로 새 컨텍스트에 재디스패치한다. 이 사이클은 문서 위생뿐이라 정지 규칙 계수에 넣지 않는다.

## 독립 패스 — plan-verifier 2회차 (2026-10-15, 결함 0 · 클린 패스)

브리핑은 계약 셋과 실행 환경(worktree·DB 접근)만 담았다. 검증자가 위반 없음을 확인했다. 필수 8경로를 전부 실행했고 미실행은 없다. 결함은 0이다.

- 경로 2: worktree 목표 경로에 `video-style-dirty.ts`를 두고 `tsc`·`eslint`·FSD 검사를 돌렸다. 서버·엔티티 스케치는 실제 의존성을 임포트하는 파일로 `tsc`·`eslint`에서 0건이었다.
- 경로 5: 18단언으로 돌연변이 전부 사멸했다. 명세 11이 다섯 필드 제거를 잡는다는 계획서 주장을 재현했다.
- 경로 6: 읽기 전용 DB 재생 결과 8명, 저장 캡션 2, 실패 0, 옛 형태 1이었다.
- 경로 7: `Record`에서 `marginV`를 빼면 TS2741(종료 2)이다.
- 경로 8: clean·dirty(여백)·dirty(캡션) 세 분기를 실제 `hasUnsavedVideoStyle`로 렌더했다.
- 관찰(검증자가 결함 아님으로 판정): `entities/user/api:206-207` 중 `:206`은 `where` 줄이다. 함수째 삭제 대상이라 오독 소지가 없다.
- 트리: 메인 트리와 worktree 모두 `git status` 공백. 메인 루프가 직접 확인했다.

**판정: 클린 패스.** 필수 경로를 소진했고, 계약에 맞는 독립 무편집 패스 1회가 결함 0, 미실행 0으로 나왔다. 정지 규칙 계수는 0이다(독립 1회차는 문서 위생뿐이었다).

## 게이트② (2026-10-15)

메인 루프가 권고를 제시했다. 둘 다 승인하고 병렬로 진행하며, 하나만 고른다면 BUG-18이라는 내용이다. 함께 알린 것:
- 이 구현이 고치는 것은 여백 미저장이다. 자막 위치 인상의 원인은 미확인이라, 배포 뒤 위치와 여백을 함께 바꿔 한 번 저장해 확인한다.
- 합친 저장의 결합 둘이 있다. 캡션 검증 실패가 여백 저장도 막는다(실제 DB 재생에서 해당 0명). 두 탭에서 동시에 저장하면 나중 쪽이 이긴다.

소유자가 「구현 승인」으로 게이트②를 열었다. BUG-12도 함께 열었다. 계획서는 클린 패스본(`c6cad10` 시점) 그대로다.
BUG-12와 워크스페이스·파일이 겹치지 않아 병렬로 구현한다. `apps/` 트리는 청결하다(`git status` 공백).

## 인수 (2026-10-15)

web-dev가 `완료`로 보고했다. 인수 조건 다섯은 메인 루프가 직접 봤다.

1. **변경 파일 ↔ 「고칠 파일」**: `apps/web`에서 바뀐 파일은 수정 4(`entities/user/api/index.ts`·`entities/user/server.ts`·`features/settings/api/index.ts`·`pages/settings/ui/index.tsx`)와 신규 2(`pages/settings/model/video-style-dirty.ts`·`.test.mjs`)다. 계획서 표 6행과 같고 넘치는 파일은 없다.
2. **diff ↔ 스케치**: 스크래치패드에 HEAD(`628bf03`) detached worktree를 만들었다. 현재 계획서에서 코드 블록 9개를 다시 추출해 라운드 1 하니스(`apply.py`)로 기계 적용하고, 결과를 구현과 비교했다. 블록 0·2는 라운드 1 뒤 계획서 수정으로 바뀐 것이 반영돼 있었다.
   - `server.ts`·`features/settings/api/index.ts`는 바이트가 같다.
   - `video-style-dirty.ts`는 `Object.keys(...)` 한 줄이 세 줄로 접혔을 뿐이다(포매터).
   - `entities/user/api/index.ts`는 지우지 않는 리더 `getUserDefaultVideoPaddingPercent`의 위치만 다르다(구현 보고에 적힌 재배치).
   - `pages/settings/ui/index.tsx`는 `hasUnsavedVideoStyle` 임포트 위치와 `const framing` 선언 위치가 다르다. `framing`은 순수 계산이라 훅 순서가 바뀌지 않는다.
   - 분기·조건·리터럴·사용자 문구의 차이는 0이다.
3. **검증 명령 재실행**: `npm run check -w apps/web` EXIT 0(`verify:fsd:test`, `verify:fsd`, `next lint` 경고 0, `tsc --noEmit`). `npm test -w apps/web`는 tests 227, suites 56, fail 0이다. 커밋할 테스트를 복사본에 돌려 돌연변이를 확인했다.
   - 원본은 11/0이다.
   - `CAPTION_STYLE_FIELDS`에서 필드 하나를 지운 돌연변이는 7종(`position`·`maxWordsPerLine`·`outlineColor`·`outlineWidth`·`uppercase`·`marginV`·`fontSize`) 모두 사멸했다. 계획 검증에서 생존 5였던 구멍이 커밋된 테스트에서 닫혀 있다.
4. **백로그 제거**: `TASK_BACKLOG.md`에서 `BUG-18` 매치가 0이고, diff는 그 항목 줄 삭제뿐이다. 「Web / 프론트엔드 구조」 절은 빈 절로 남는다(「Admin / Dashboard」와 같은 형태).
5. **상세 기록 실재**: `docs/agents/web-dev/BUG-18.md`가 있다(73줄). 고친 파일, 스케치 대비 차이, 검증, 못 덮은 범위, 비고 절이 들어 있다.

삭제한 심볼(`saveDefaultCaptionStyle` 등 4개와 `persistVideoPadding`)과 옛 버튼 문구(`Save framing`·`Save caption style`)를 `apps/`·`packages/` 소스에서 찾았다. 남은 것은 `features/settings/api/index.ts:53`의 주석 「기존 saveDefaultCaptionStyle과 같은 관용」 하나다. 검증된 스케치에 들어 있던 문장이고 「기존」이라 적어 옛 함수를 가리킨다고 밝히므로 그대로 둔다. `.next/` 빌드 산출물의 매치는 옛 빌드라 무관하다.

후속 처리:
- **CLAUDE.md**: `apps/web/CLAUDE.md` 테스트 목록을 31/55/216에서 32/56/227로 고치고 `pages/settings/model/video-style-dirty.test.mjs` 행을 추가했다. 실제 `*.test.mjs` 32개와 표의 32행이 집합으로 같다.
- **범위 밖 의존**: 없음. 백로그 후보도 없다.
- **원장**:
  - BUG-18 절을 신설하고 4줄(①~④)을 등재했다. ①에는 소유자 원래 보고 경로(`/dashboard` 업로드 폼 썸네일)와, 미확인 진단 (a)·(b)가 재현되면 별도 항목으로 만든다는 분기를 넣었다.
  - FEAT-60 「저장 분리가 그대로인가」를 `대체(BUG-18)`로 닫았다.
  - FEAT-62 「스냅·프리셋·저장」과 FEAT-42 「설정 화면에 캡션 기본 스타일 카드가…」의 버튼 이름을 `Save video style`로 재앵커했다. 배포 전 이름도 함께 적었다.
  - FEAT-58 확인 이력 줄은 손대지 않았다.
- **남긴 문서 위생**: `CaptionStyleEditor.tsx:33`의 「(요구 ⑤)」 꼬리표는 계획서 「비고」대로 고치지 않았다.
