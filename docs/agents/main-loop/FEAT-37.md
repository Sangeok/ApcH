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
