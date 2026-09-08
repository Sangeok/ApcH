# FEAT-37 — 메인 루프 기록

## 필수 경로 확정 (2026-09-09)

| 경로 | 채택 | 근거 |
| --- | --- | --- |
| 1 인용 전수 대조 | ○ | 전 항목 필수. 백로그 인용 8곳 + 계획서 30여 곳 |
| 2 스케치 추출·실행 | ○ | 신규 모듈 1(전문) + JSX 편집 4블록 |
| 3 before/after 기계 적용 | ○ | before 블록 1 + 앵커 3 |
| 4 전칭 여집합 | ○ | "language 사용처는 다이얼로그 하나뿐", "안내는 저장소 전체에서 한 줄뿐", "`SUPPORTED_LANGUAGES` 두 값", "고칠 파일 밖 무변경" |
| 5 돌연변이 | ◎ **본체** | 순수 함수 2개 신설 + 골든 문구 명세. "명세가 카피 회귀·조건 회귀를 잡는가" |
| 6 실제 사건 재생 | × | 외부 신호 해석 없음 |
| 7 음성 시험 | × | 새 규칙·등록 없음 |
| 8 실물 렌더 | ○ | 헤더 안내·카드 라벨이 조건부 JSX |
| 9 구조적 아티팩트 | × | 없음 |

## 라운드 1 (편집) — 위생 1건

- **경로 1**: 계획서 인용 전 항목 대조 — `ui/index.tsx` `:28 :31 :40 :231-232 :238 :243 :267 :271 :277-278 :285 :304 :433 :438 :448`,
  `ClipDraftCard.tsx` `:24 :92 :113 :472 :476 :498 :507`, `upload-detail/ui/index.tsx` `:42 :117-118 :124`, `constants.ts` `:12 :15`,
  `subtitle-status.ts:5`, `CaptionStyleEditor.tsx` `:307 :312`, `main.py` `:474 :535 :837 :840`(직전 세션 확인) — 일치.
  **드리프트 1**: 계획서 "`ClipDraftCard.tsx:54`에서 프롭으로 받아" — `:54`는 `transcriptWords: TranscriptWord[];`, `language: string;`은 **`:53`**.
  구현 지시(임포트 앵커 `:24`, `previewText :113`, before `:472-476`)와 무관한 서술 인용이라 **문서 위생**. 계획서 교정 후 재독.
- **경로 3**: 펜스 9블록 추출. before `#7`(Card `:472-476`)·앵커 `#3`(index `:277-278`) 각 **바이트 1회 일치**. 임포트 앵커 2(`:24` boundary-snap, `:28-31` use-clip-draft-review) 일치.
  `index.tsx`는 `use-clip-draft-review`를 두 번 임포트하지만(`:22` type, `:28-31` value) 계획서가 `:28-31`을 명시해 모호하지 않다 — 내 문자열 앵커 하니스가 모호했을 뿐.
- **경로 2**: 신규 모듈 + 4블록을 복제본(`dev 6f67739`)에 기계 적용 → `tsc --noEmit` **EXIT 0**, `eslint`(신규1·수정2) **EXIT 0**, `verify-fsd-boundaries` **EXIT 0**.
  계획서 「테스트」 명세를 `.test.mjs`로 옮겨 `tsx --test` 실행 → **14/14**(`.ts` 확장자 임포트, `subtitle-status.test.mjs` 형식).
- **경로 4**: `ClipDraftCard.tsx`의 `language` 사용처 `:53 :71 :507` — 소비는 `:507`(다이얼로그) 하나 ✓. `translated at render` 저장소(src) 전체 1파일(Editor) ✓. 신규 심볼 3개 선점 0 ✓.
- **경로 5**: 스케치 원문을 esbuild로 TS→JS 변환해 명세 검사기에 로드, 변이 10종 → **9 사멸, 1 생존**.
  생존 **M2**(`trimmed === "English"` → 대소문자 무시 비교): 명세에 `"english"` 같은 대소문자 변형 입력이 없다. 그러나 `language`는
  `SUPPORTED_LANGUAGES[].value`(`"English"`·`"Korean"` 정확값)만 DB에 저장되므로 **도달 가능한 입력에선 등가 변이**다 — 케이스 추가 안 함(FEAT-35 MB8과 같은 판정).
  M10(`== null`→`=== undefined`)은 `null.trim()` throw로 사멸(하니스가 처음엔 throw를 안 세어 중단 — 고쳐서 확인).
- **경로 8**: 패치본 `ClipDraftCard`를 `renderToStaticMarkup`(Korean/English) + 헤더 블록 JSX를 실제 모듈로 렌더 → **8/8**:
  Korean에서 `English transcript` 라벨·골든 문구·`bg-muted` 박스 존재, English에서 둘 다 부재, 본문 박스 클래스·previewText 유지.
  (헤더는 `ClipDraftReviewSection` 전체가 react-query 훅에 묶여 있어 블록 ①의 JSX만 실제 `reviewLanguageNotice`로 렌더 — 배치는 tsc+앵커 일치가 담보.)

**라운드 1 결론**: 위생 1건 교정. 보드 정지 규칙상 메인 루프 라운드는 판정이 아니라 디스패치 자격 — `plan-verifier` 독립 패스를 계약(3항목)대로 요청.

## 독립 패스 1차 (실패) — 세션 한도

경로 2·5·8 하니스 조립 직전에 API 한도(HTTP 429)로 종료. 저장소 트리 무변경. 판정 없음 — 사이클에 세지 않는다.
재디스패치 전 스캔에서 다른 세션(`0d71e88d`)이 `wt36`·`pv36`에 남긴 실제 `node_modules` 정션 3개를 걷어냈다(내 실패 실행이 남긴 건 없음).

## 독립 패스 2차 — 클린 패스 (결함 0)

브리핑 계약(3항목) 준수 — 검증자가 「위반 없음」으로 확인. 필수 6경로 전부 실행.

- 경로 1: 계획서 인용 전 항목 재독 일치 — 라운드 1이 교정한 `ClipDraftCard.tsx:53`(`language: string;`)도 실측 일치.
- 경로 2: 신규 모듈 바이트 추출 → 프로젝트 옵션 복제 `tsc` exit 0, typescript-eslint `recommendedTypeChecked`+`stylisticTypeChecked` exit 0,
  명세 `tsx --test` **14/14**(라운드 1과 동일 결과, 독립 재현).
- 경로 3: before 블록·앵커 각 정확히 1회, 조립본 괄호 균형 확인.
- 경로 4: `language` 사용처 `:53 :71 :507`(라운드 1과 일치), 헤더·카드 본문에 언어 문구 없음, "렌더 때 번역" 안내는 검토 흐름 안에서
  `CaptionStyleEditor:310-311` 하나 — **여집합을 랜딩 카피·코드 주석·폴백 안내까지 열거해 문맥이 다름을 확인**(라운드 1보다 넓은 열거).
- 경로 5: 변이 8종 **8/8 사멸**. 라운드 1의 M2(대소문자 무시)는 이 배터리에 없었고, 있었어도 도달 가능 입력에선 등가라는 판정은 유지.
- 경로 8: ①·② JSX를 실 순수함수로 배선해 Korean/English/**null** 3분기 렌더 — 두 표시가 lockstep으로 켜지고 꺼짐, `mt-2` 이동·본문 박스 스타일 유지 확인(라운드 1의 8/8에 null 분기가 추가된 셈).

**트리 청결 검산(메인 루프 직접)**: `git status --porcelain` → 세션 이전부터 있던 둘뿐, `git diff HEAD` 추적 파일 변경 0.

**판정**: 보드 정지 규칙 「`plan-verifier`(새 컨텍스트)의 무편집 무소득 패스 1회」 충족. `검증:` 줄 기록. 게이트②는 사용자만 연다.

## 구현 인수 (2026-09-09)

다른 세션 활동 없음(트리 청결·`origin/dev` = 로컬·`구현승인` 1건)을 확인하고 주 트리에서 구현.

| # | 조건 | 결과 |
| --- | --- | --- |
| ① | 변경 파일 ↔ 「고칠 파일」 | 신규 2(모듈·테스트) + 수정 2(`index.tsx`·`ClipDraftCard.tsx`) + 문서 3. 범위 밖 0. `CaptionStyleEditor` 무변경 ✓ |
| ② | diff ↔ 「구현 스케치」 | **신규 모듈이 계획서 블록 #0과 바이트 동일.** index/Card의 after 블록·임포트·파생값 전부 포함 |
| ③ | 검증 명령 직접 재실행 | `test` **130/0**(31 suite), `check` EXIT 0 |
| ④ | 백로그 제거 | FEAT-37 0건 |
| ⑤ | 상세 기록 실재 | `docs/agents/web-dev/FEAT-37.md` 5,188바이트 |

**출하된 테스트에 변이 10종**(trim 제거·English 가드 제거·`||`→`&&`·골든 변조·언어값 누락·nullish 가드 약화·공백 가드 제거·shows 상수 true/false·null→빈문자) → **10/10 사멸.**
구현 보고가 신고한 스케치 대비 차이(대응 루프의 항진명제를 막는 명시 단언 2줄 추가)는 명세 강화이지 분기·문구 변경이 아니다 — 변이 결과가 그것을 뒷받침한다.

`apps/web/CLAUDE.md`는 web-dev 읽기 전용이라 메인 루프가 반영: 수치 19/29/123 → 20/31/130, 표 +1행(그 테스트가 존재하는 이유까지).

### 8단계 — 배포 확인 원장

`docs/release-checks.md`에 FEAT-37 절 신설(BUG-13 절 위), 열린 줄 3. `〔auto〕` 없음(로그인 뒤 검토 화면).
프로덕션 업로드 `cmtsreci…`(Korean, `review_pending`, 클립 0)가 그대로 첫째 줄의 확인 대상이다.
