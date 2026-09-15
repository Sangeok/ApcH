# FEAT-46 — Korean 분석(analyze) 후보별 참고 번역을 콜백에 싣는다

작성: backend-dev · 2026-09-15 · status 완료

## 무엇을 했나

Korean 업로드의 analyze 경로가 후보마다 AI 구간 원문(영어 전사)의 **참고 번역**을
별도 Gemini 호출로 만들어 콜백 moment에 `referenceTranslation` 필드로 싣게 했다.
검토 화면(FEAT-48)이 영어 원문 옆에 한국어 뜻을 보여줄 수 있게 된다.
English 업로드는 호출도 필드도 더하지 않아 페이로드가 바이트 그대로 유지된다.

## 고친 파일 (전수)

| 파일 | 상태 | 변경 |
| --- | --- | --- |
| `apps/backend/reference_translation.py` | 신규 | 참고 번역의 순수 판단 전부 — 언어 판정·원문 조립·프롬프트 조립·코드펜스 제거·인덱스 매칭·필드 부착. stdlib + `translation_fallback.parse_translations`만 import |
| `apps/backend/test_reference_translation.py` | 신규 | 위 6개 순수 함수의 `unittest.TestCase` — 테스트 메서드 38개 |
| `apps/backend/main.py` | 수정 | ① import 블록(`reference_translation`에서 6개 함수) ② `add_local_python_source`에 `"reference_translation"` 추가 ③ 모듈 레벨 I/O 래퍼 `build_reference_translations`(Gemini 호출·타임아웃·전예외 흡수) 신설 ④ analyze 페이로드를 `base_moments` + `attach_reference_translations`로 교체 |

계획서 「고칠 파일」 4행과 정확히 일치한다. 그 밖의 파일(렌더 경로·`translation_fallback.py`·web·db)은 건드리지 않았다.

## 스케치 대비 차이

없음. 계획서 「구현 스케치」의 순수 모듈 본문·`main.py` 4개 변경(import·등록·I/O 래퍼·페이로드 교체)을
분기 순서·조건·리터럴 값·프롬프트 문구까지 그대로 옮겼다.

- I/O 래퍼는 `process_clip` 반환 dict(`main.py` 878행 부근)와 서비스 클래스 주석
  `# GPU/타임아웃/시크릿/볼륨 설정이 적용된 서비스 클래스` 사이에 신설했다 — 그 주석과 `@app.cls(...)`는
  붙여 두었다(스케치 지시).
- 타임아웃은 `genai.types.HttpOptions(timeout=REFERENCE_TRANSLATION_TIMEOUT_MS)`, 값 120000ms, 온도 0.3.
- 페이로드 교체 후 콜백(`**analyze_payload` 스프레드)과 동기 응답(`**(analyze_payload or {...})`)은 무수정 —
  English는 `attach_reference_translations`가 `base_moments`를 그대로 반환하므로 before와 바이트 동일.

## 테스트

`test_reference_translation.py` 38개 메서드, `main.py`를 import하지 않는다(`from reference_translation import ...`):

- `should_translate_references` 8개 — `"Korean"`만 True; `"English"`·`""`·`"korean"`·`"KOREAN"`·`" Korean "`·`"Spanish"`·`None` False (moment_prompt와 같은 정확 일치).
- `build_reference_sources` 9개 — 경계 포함(`==`), 앞/뒤 넘침 제외, `" "` join, index==위치, 빈 구간→`""`, int start/end→`float()`, 시각·텍스트 없는 단어 skip, 길이==moment 수.
- `build_reference_translation_prompt` 5개 — `count` 리터럴, 원문 포함, `ensure_ascii=False`(비-ASCII 미이스케이프), 인덱스 유지 지시, `"translation"` 키 지시.
- `strip_code_fences` 5개 — 순수 JSON 무변경, ` ```json `·` ``` ` 제거, 앞뒤 공백, **main.py:1019-1025 인라인 복제 재현식과 골든 비교**.
- `assemble_reference_translations` 6개 — 완전 맵→전부 번역, 부분 누락→None, 비-list/빈 리스트→전부 None, 빈 원문→맵에 있어도 None, 길이==sources.
- `attach_reference_translations` 5개 — None→같은 리스트(`assertIs`)·`referenceTranslation` 키 없음(English 불변 요구 ①), 리스트→aligned 부착·원본 미변형·길이 보존.

### 못 덮은 범위 (torch/whisperx로 `main.py` import 불가 — modal run 사용자 확인 필요)

- I/O 래퍼 `build_reference_translations`의 배선(언어 게이트→sources→translatable 필터→Gemini 호출→타임아웃→펜스 제거→assemble)과 페이로드 부착 호출부 — `py_compile`로 문법만 확인, 동작은 배포 후 확인.
- 배포 이미지의 `google-genai`(requirements.txt 미고정 최신)가 `http_options=HttpOptions(timeout=...)`를 여전히 받는지 — 로컬 venv 2.16.0은 받음(계획서 ③ 확인). 안 받으면 `try/except`가 전부 null로 조용히 강등하고 로그에 `Reference translation error:`가 남는다.
- `referenceTranslation`이 실제로 채워지는지·번역 품질·인덱스 준수·문장 단위 자연스러움·Korean analyze 지연 증가량 — 배포 후 Korean 업로드의 Modal 로그·콜백 본문으로만 확인.
- 이 필드는 FEAT-47(컬럼)·FEAT-48(표시) 전까지 화면에 안 나온다.

## 검증

저장소 루트, 맨 파이썬(venv·GPU 없이):

```
python -m unittest discover -s apps/backend -p "test_*.py"
  → Ran 117 tests in 0.004s / OK   (79 baseline + 38 신규)
python -m py_compile apps/backend/main.py
  → EXIT 0
```

`git status --porcelain`로 backend 3파일(main.py·reference_translation.py·test_reference_translation.py)만
변경됨을 확인. 동시 진행 중인 FEAT-49(apps/web, web-dev)의 변경·`nul`·web-dev/FEAT-49.md는 건드리지 않았다.

## 남은 일 (메인 루프 인수 시)

- `apps/backend/CLAUDE.md`가 인용하는 analyze 소비 위치(`main.py:1046-1048`)·이미지 등록 줄(`main.py:85`)과
  web 쪽 `main.py:\d+` 인용이 이 구현으로 아래로 밀렸다 — dev 쓰기 범위 밖이라 인수 때 메인 루프가 갱신한다(계획서 명시).
- 배포·`modal run` 실행 검증은 사용자 몫. Korean 업로드로 `referenceTranslation` 채움·`google-genai` timeout 필드 수용을 확인해야 한다.
