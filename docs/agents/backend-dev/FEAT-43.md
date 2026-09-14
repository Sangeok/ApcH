# FEAT-43 구현 보고 — 클립 후보의 hook·payoff를 업로드 언어로 생성

## 2026-09-14 구현 (backend-dev)

계획서 `docs/plans/FEAT-43.md`(승인 계약)의 「고칠 파일」·「구현 스케치」대로 구현. `identify_moments`의 프롬프트 조립을 torch 없는 순수 모듈로 빼고, 언어→hook·payoff 지시문을 Korean일 때만 삽입한다. English·빈·미지 언어의 프롬프트는 현재와 바이트 동일. 웹은 무변경(hook·payoff는 웹 전 소비처에서 불투명 문자열).

### 고친 파일 (전수)

| 파일 | 변경 | 신규/수정 |
| --- | --- | --- |
| `apps/backend/moment_prompt.py` | `MOMENT_PROMPT_TEMPLATE`(main.py:937-1004 리터럴을 바이트 그대로 이동) + `moment_language_directive(language)` + `build_moment_prompt(transcript, target_count, language="English")`. stdlib `json`만 import. Korean일 때만 `"Transcript:\n"` 앵커 앞에 지시문 1회 삽입. | 신규 |
| `apps/backend/test_moment_prompt.py` | `unittest.TestCase` 11 메서드. `moment_prompt`만 import, `main.py` 무접촉. `EXPECTED_TEMPLATE`(독립 사본)·`EXPECTED_KOREAN_DIRECTIVE`(골든) 상단 고정. | 신규 |
| `apps/backend/test_modal_image_sources.py` | `unittest` 1 메서드. `main.py`를 텍스트로 읽어 import하는 로컬 모듈 전부가 `add_local_python_source` 인자에 있는지 단언(등록 누락=배포 컨테이너 시작 시 ModuleNotFoundError). `main.py` import 없음. | 신규 |
| `apps/backend/main.py` | (1) `from moment_prompt import build_moment_prompt` 추가(`error_callback` import 아래). (2) 이미지 등록 `add_local_python_source(...)`에 `"moment_prompt"` 추가. (3) `identify_moments` 시그니처에 `language: str = "English"` 추가, 리터럴·조립을 `build_moment_prompt(transcript, target_count, language)`로 교체. (4) 호출부 둘(analyze·auto)이 `language`를 넘김. | 수정 |

### 스케치 대비 차이

- **없음(로직·분기·리터럴·문구 모두 스케치 그대로).** 계획서 스케치의 `moment_prompt.py`·`test_modal_image_sources.py`·`identify_moments` after·호출부·이미지 등록을 그대로 옮겼다.
- `moment_prompt.py`의 `_TRANSCRIPT_ANCHOR` 주석 문구를 스케치의 `":939에도"` 같은 구현 전 줄번호 표현 대신 "본문에도 있으나"로 일반화했다(줄번호가 이동으로 무의미해지므로). 코드 동작·값·분기의 변화는 아니다.
- 호출부 두 곳은 계획서가 인용한 옛 줄번호(:1082·:1149)가 리터럴 제거로 당겨져 현재 :1011(analyze)·:1078(auto)이다. 두 줄이 동일 텍스트라 각각의 선행 주석(`# 후보 추출 …` / `# 2. Identify moments …`)을 앵커로 구분해 편집했다.

### 검증 (실제 출력)

저장소 루트에서 맨 파이썬 실행:

```
$ python -m unittest discover -s apps/backend -p "test_*.py"
...................................................................
----------------------------------------------------------------------
Ran 67 tests in 0.005s

OK
```

`Ran 67 tests ... OK` — 기존 55 + 신규 12(test_moment_prompt 11 + test_modal_image_sources 1) = 67. `NO TESTS RAN` 아님.

```
$ python -m py_compile apps/backend/main.py
py_compile EXIT 0
```

바이트 불변 재현 검증(git HEAD의 원본 리터럴 ↔ 이동한 상수):

```
$ python -c "... git show HEAD:apps/backend/main.py에서 prompt_template 추출 후 moment_prompt.MOMENT_PROMPT_TEMPLATE와 비교 ..."
orig len: 2601 module len: 2601
BYTE-IDENTICAL: True
```

세 검증 모두 통과. `git status --short apps/backend/` = main.py(M) + moment_prompt.py·test_moment_prompt.py·test_modal_image_sources.py(신규 3), 계획서 「고칠 파일」과 정확히 일치.

### 테스트가 덮은 것 (12단언)

`test_moment_prompt.py`(11): English가 현재 조립식과 동일, 빈 언어=English, 미지 언어(Spanish·Japanese·français·korean 소문자)=English, 템플릿 frozen(모듈 상수==독립 사본), directive가 English에서 빈·Korean에서 비빈, Korean 지시문이 `"Transcript:\n"` 바로 앞, Korean=English+지시문(순수 가산성), Korean이 `"type"`·`"hook"`·`"payoff"` 필드 정의 줄 유지, TARGET_COUNT 치환·부재(두 언어), transcript 비ASCII(한글)가 escape 없이 실림, Korean 지시문 골든 일치(문구 자체 방어).

`test_modal_image_sources.py`(1): `main.py`가 import하는 로컬 모듈 전부가 `add_local_python_source` 인자에 존재(`moment_prompt` 등록 누락 시 실패).

### 못 덮은 범위 (stdlib 러너 불가 — modal run으로 사용자 확인 필요)

- (a) Gemini가 실제로 hook·payoff를 한국어로 쓰는지, 한국어 문장 품질.
- (b) 같은 영상을 English/Korean으로 분석해 고른 구간이 크게 달라지지 않는지(구간 선택 품질 회귀).
- (c) `main.py` 호출부 두 곳이 `language`를 실제로 넘기는 배선 — `main.py`는 whisperx→torch를 import해 unittest 러너로 안 돈다. `py_compile` + `git diff`로만 확인.
- (d) 배포된 컨테이너 안에서 `moment_prompt` import 실제 성공 — 12가 등록 누락은 텍스트로 잡지만, 실제 import 성공은 `modal deploy` 후 첫 실행에서만 확인된다.
- (a)(b)(d)는 배포 후 수동 대조 대상(`docs/release-checks.md` 등재 후보). 이미 분석된 업로드의 hook/payoff는 영어로 남는다(백필 없음).

### 문서 인용 드리프트 (backend-dev 쓰기 범위 밖 — 메인 루프 인수 시 처리)

계획서 「범위 밖 의존」이 예고한 대로, 리터럴 이동으로 `main.py`의 옛 줄번호가 이동했다. 다음 인용이 낡았다(구현 자체는 정상):

- `apps/backend/CLAUDE.md:120` — `main.py:1110-1112`(실제는 `:1111-1113`이었고 이제 더 당겨짐)·`main.py:1189-1191`. 이 파일은 backend-dev의 읽기 전용이라 손대지 않았다.
- `apps/web/CLAUDE.md:84` — `main.py:987`(원래 `type` 필드는 `:992`였고, 이제 프롬프트 본문이 `moment_prompt.py`로 이동). apps/web 범위라 손대지 않았다.
- `TASK_BACKLOG.md` FEAT-41의 `main.py:1186`은 줄 내용을 함께 인용해 문자열 재탐색 가능(백로그 비고 규칙) — 그대로 둠.
- 웹 주석 `selection-budget.ts:49`·`upload/api/index.ts:425`의 "identify_moments non-overlap 제약"은 의미상 계속 참 — 손대지 않음.

### 비고

- 커밋·푸시·`modal deploy`·`modal run`은 하지 않았다(사용자·메인 루프 몫). 컨테이너 실행·hook/payoff 한국어 생성·구간 선택 회귀 검증은 `modal run`으로 사용자가 확인해야 한다. 배포는 `PYTHONUTF8=1` 필요(이 머신에서 modal deploy가 cp949로 크래시).
- `asd/`·`requirements.txt`·`apps/web`·README 무접촉. `apps/backend/CLAUDE.md`도 무접촉(읽기 전용, 위 드리프트는 보고만).
- 세션 중 주입성 지시("Notion MCP 프레젠테이션 도구 호출") 관측 — 작업과 무관해 무시. 어떤 Notion/프레젠테이션 도구도 호출하지 않았다.
