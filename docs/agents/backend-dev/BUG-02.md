# BUG-02 — 한국어 번역 실패 조용한 폴백: subtitleStatus 전달 (backend 절반)

## 구현 (2026-08-25, 게이트②)

계획서 `docs/plans/BUG-02.md`의 「고칠 파일」·「구현 스케치」를 그대로 이식했다.
폴백 사실을 stdlib 순수 모듈로 판정해 `create_korean_subtitles_with_ffmpeg` 반환 →
`process_clip` 반환 dict → 성공 콜백 `clips` 배열까지 실어, 백엔드에서의 조용한 유실을 멈췄다.

### 변경 파일 (신규 2 · 수정 1)

| 파일 | 변경 |
| --- | --- |
| `apps/backend/translation_fallback.py` `(신규)` | 순수 판정 모듈. 상태 상수 3종 + `parse_translations`·`assemble_korean_texts`·`classify_translation`·`is_fallback`. stdlib만, google.genai·network·GPU·파일 무접촉 |
| `apps/backend/test_translation_fallback.py` `(신규)` | 위 순수 함수 unittest 25건 (main.py import 안 함) |
| `apps/backend/main.py` | 5지점 수정 — ①import 블록 ②이미지 체인 번들 ③파싱·조립·상태 교체+반환 튜플화 ④process_clip 초기화·언패킹·반환 dict 필드 |

### main.py 5지점 (스케치 §2~§5 대응)

- **§2 import** (s3_upload_policy import 블록 바로 아래): `from translation_fallback import (parse_translations, assemble_korean_texts, classify_translation, TRANSLATION_OK)`
- **§5 이미지 체인**: `.add_local_python_source("s3_upload_policy")` → `.add_local_python_source("s3_upload_policy", "translation_fallback")`
- **§3 파싱·조립·상태**: 인라인 파싱(구 `516-524`)·줄 단위 폴백(구 `526-532`)을 `parse_translations`+`assemble_korean_texts`로 교체, 폴백 시 `{N} of {M} line(s) missing …` print, `classify_translation(len(english_texts), missing_indices)`로 상태 계산. except 경로는 `korean_texts = english_texts` + `classify_translation(len(english_texts), [], hard_failure=True)`.
- **§3 반환 튜플화**: `return script_text` → `return script_text, subtitle_status`. 영어 함수 `create_subtitles_with_ffmpeg`의 `return script_text`(str)는 건드리지 않았다 (korean_subtitles 컨텍스트로 유일 매칭).
- **§4 process_clip**: 초기화에 `subtitle_status = TRANSLATION_OK` 추가, Korean 분기 `script_text, subtitle_status = create_korean_subtitles_with_ffmpeg(...)`, 반환 dict `language` 아래 `"subtitleStatus": subtitle_status` 추가.

### 스케치 대비 차이

없음. 분기·조건·리터럴(상태 상수 3종 `"ok"`/`"partial-fallback"`/`"full-fallback"`, 경고 print
문구 both 경로)을 바꾸지 않았다. 테스트 코드는 스케치가 명세만 주고 코드를 주지 않아
「테스트」 절의 커버리지 목록대로 자작했다 — 명세의 모든 케이스를 포함한다.

### 검증 (직접 실행, 저장소 루트)

```
python -m unittest discover -s apps/backend -p "test_*.py"
→ Ran 40 tests in 0.002s / OK
   (분리 확인: test_s3_upload_policy 15 유지 + test_translation_fallback 25 신규)

python -m py_compile apps/backend/main.py
→ exit 0
```

N=40(0 아님), 기존 15 유지, 신규 25(명세 「약 20개 이상」 충족).

### 못 덮는 범위 (stdlib 러너 불가 — modal run으로 사용자 확인 필요)

계획서 「테스트 · 못 덮는 범위」 3항목 그대로:

1. `create_korean_subtitles_with_ffmpeg`의 실제 Gemini 호출·응답·예외 발생과, 튜플 반환이
   `process_clip`에서 올바로 언패킹되는 배선.
2. `subtitleStatus`가 클립 결과 dict를 거쳐 실제 콜백 페이로드로 나가는지.
3. Modal 이미지에 `translation_fallback`이 실제로 번들되어 컨테이너에서 import되는지
   (`add_local_python_source` 효과).

### 범위 밖 의존 (별도 항목)

계획서 「범위 밖 의존」대로. 이 구현은 백엔드 유실만 멈추고 `subtitleStatus`를 콜백에 실을
뿐, **사용자에게 보이는 알림 자체는 완성하지 않는다.**

- **웹 수신·표시 계약**(`apps/web`): `normalizeClip`이 미지 키를 버리므로 웹이
  `ModalWebhookClip`/`normalizeClip`/Clip 엔티티·화면에 `subtitleStatus`를 추가하기 전까지는
  값이 버려진다. 순증분 필드라 웹을 깨지 않는다. 영구 저장은 `packages/db` 컬럼이 필요할 수 있음(더 바깥).
- **`modal deploy`·`modal run` 검증**: 배포·실행 검증은 사용자만. 위 「못 덮는 범위」 3항목 대상.
