# FEAT-44: 낡는 줄번호 인용을 함수명·코드 내용 앵커로 교체

agent: main-loop

> **담당이 main-loop인 이유**: 쓰기 범위가 `apps/web`·`apps/backend`·`.claude/agents/`·`docs/`
> 넷으로 갈린다. 어느 dev도 전부 쓰지 못한다(FEAT-19·26·38·47·57 전례).
>
> **백로그 대비 범위 변경(2026-09-22 소유자 승인)**: 두 `CLAUDE.md`를 **넣고**
> `TASK_BACKLOG.md` 17건은 **뺀다**. 근거는 「대안」.

## 현재 동작

**실측(2026-09-22, 메인 루프 직접 grep)**: `main\.py:\d+` 형태의 교차 파일 인용이
`docs/plans`·`docs/agents`·`docs/proposals`를 뺀 트리에 **66건** 있고, 그중 `TASK_BACKLOG.md`
17건을 제외한 **49건**이 이 항목의 대상이다. 여기에 백로그 추가 범위 ⑤의 **웹 내부 인용 3건**을
더해 **총 52개 편집 / 17파일**이다.

| 파일 | `main.py:N` | 웹 내부 |
| --- | --- | --- |
| `apps/backend/CLAUDE.md` | 11 | |
| `apps/web/src/fsd/features/caption-style/model/caption-preview.ts` | 10 | |
| `.claude/agents/feature-scout.md` | 5 | |
| `apps/web/src/fsd/shared/config/constants.ts` | 4 | |
| `apps/backend/test_moment_prompt.py` | 2 | |
| `apps/backend/test_reference_translation.py` | 2 | |
| `apps/backend/translation_fallback.py` | 2 | |
| `apps/web/src/app/layout.tsx` | 2 | |
| `apps/web/src/fsd/features/caption-style/model/caption-preview.test.mjs` | 2 | |
| `apps/web/src/fsd/features/caption-style/ui/CaptionPreviewPlayer.tsx` | 2 | |
| `apps/web/src/fsd/widgets/clip-draft-review/ui/index.tsx` | 2 | 1 |
| `.claude/agents/backend-dev.md` | 1 | |
| `apps/backend/moment_prompt.py` | 1 | |
| `apps/web/CLAUDE.md` | 1 | |
| `apps/web/src/fsd/widgets/clip-draft-review/model/review-language-notice.ts` | 1 | 1 |
| `docs/release-checks.md` | 1 | |
| `apps/web/src/fsd/widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx` | | 1 |
| **합** | **49** | **3** |

### 인용이 실제로 맞는지 — 표본 대조

`apps/backend/CLAUDE.md`의 11건은 **2026-09-21 FEAT-55 인수에서 메인 루프가 손으로 재앵커해
현재 정확하다.** 나머지를 찍어보면 이렇다.

| 인용 자리 | 무엇을 가리킨다고 말하는가 | `main.py`의 그 줄에 실제로 있는 것 |
| --- | --- | --- |
| `caption-preview.ts:10` | `create_subtitles_with_ffmpeg`(`:287-345`) | `:287` **빈 줄**. 함수는 `:300` |
| `caption-preview.ts:19` | 클립 범위 필터(`:300-305`) | `:300`은 **함수 def**. 필터는 `:313-318` |
| `caption-preview.ts:41` | `start_rel`(`:321`) | `current_words = []`. 실제 `:334` |
| `caption-preview.ts:106` | `marginv`(`:141-142`) | `validated.append(moment)` — **다른 함수** |
| `constants.ts:75` | `PlayResY`(`:354`) | `current_words.append(word)`. 실제 `:367` |
| `constants.ts:77` | `MARGINV`(`:141-142`) | `validated.append(moment)`. 실제 `:153-156` |
| `constants.ts:86` | 폰트 설치(`:70,74`) | `uploaded_file_id: str \| None = None`. 실제 `:83`·`:87` |
| `layout.tsx:71` | Anton(`:360`) | `# Create subtitles file`. 실제 `:373` |
| `feature-scout.md:122` | `ProcessVideoRequest`(`:26-41`) | `from boto3.exceptions import ...`. 실제 `:56` |
| `backend-dev.md:154` | `resolve_caption_style`(`:136`) | `print(f"Skipping moment ...")`. 실제 `:170` |
| `review-language-notice.ts:3` | `elif selected_language == "Korean"`(`:837`) | `print(f"Creating English subtitles ...")`. 실제 `:850` |
| `clip-draft-review/ui/index.tsx:291` | `"Return exactly TARGET_COUNT ..."`(`:904`) | `return [None for _ in sources]` — 그 문장은 **`main.py`에 없다**(`moment_prompt.py:74`) |

**표본 12건 중 맞는 것 0건.** `apps/backend/CLAUDE.md` 11건을 뺀 38건은 전부 이 상태로 보아야 한다.

### 이미 정해진 규약

- **소유자 결정(2026-09-14, FEAT-43 인수)**: 「줄번호를 다시 맞추지 않는다 — 곧 또 낡는다.
  **함수명(+필요하면 그 줄의 짧은 코드 인용)으로 교체**한다.」
- `TASK_BACKLOG.md` 「비고」의 「줄 내용을 함께 인용한다」와 같은 원리다.
- `schema.prisma`의 `Clip` 주석 몫은 **FEAT-47이 2026-09-16 처리**했다(주석 한 줄에도 생성
  클라이언트 재생성이 따라붙어 스키마를 바꾸는 항목에 태웠다). 이제 함수명·모델명 앵커다.

## 문제

원천 파일이 **한 줄만** 바뀌어도 교차 파일 줄번호 인용은 전부 조용히 어긋나고, **어떤 게이트도
이를 잡지 않는다** — `tsc`도 lint도 테스트도 주석 속 숫자를 읽지 않는다.

이 주석들은 장식이 아니라 **계약의 연결선**이다. `caption-preview.ts:10`은 "백엔드 자막 로직의
**이 부분**을 웹으로 이식했다"고 말한다. 계획을 쓰는 에이전트가 그 인용을 따라가면 **엉뚱한
코드를 읽고 그 위에 계획을 쓴다.** `.claude/agents/*.md`의 6건은 에이전트가 **매 세션 읽는**
지시 문서에 있다.

비용이 실측된다. `doc-auditor` **13회차 중 네 회차가 줄번호 드리프트로 채워졌다**
(「어긋남 9건 — **전부** 줄번호 드리프트」 · 「어긋남 2건(둘 다 실질 주장은 참, **줄인용만 낡음**)」 ·
「어긋남 4건 — 전부 코드 주석의 낡은 줄번호 인용」 · 「어긋남 2건 — 둘 다 `TASK_BACKLOG.md` 자신의
교차 파일 인용」). 태그가 붙은 어긋남만 세도 **7건 중 3건(42%)**이 `[거짓·줄번호]`로 **단일 최대
범주**다. 감사는 매번 같은 교훈을 남겼다 — 「파일 상단 import 추가는 그 파일을 인용하는 문서
줄번호 **전부**를 밀어낸다」 — 그리고 시스템은 근본을 고치는 대신 **인수 절차를 덧대** 왔다.
그 덧댐이 인수마다 메인 루프의 손으로 들어간다(2026-09-21~22 이틀 사이 **세 번**:
FEAT-55에서 `apps/backend/CLAUDE.md` 11건, FEAT-56에서 FEAT-44 자신의 관측, FEAT-57에서 이벤트 수).

**낡은 인용이 코드 결함을 낸 사례는 아직 0건이다** — 전부 감사나 인수에서 잡혔다. 즉 이것은
사고가 아니라 **재발성 비용**이고, 이 항목은 그것을 일회성 고정비로 바꾼다.

## 고칠 파일

| 파일 | 편집 | 성격 |
| --- | --- | --- |
| `apps/backend/CLAUDE.md` | 11 | 숫자가 지금 맞으므로 **대상을 찾는 일이 없다** — 표기만 바꾼다 |
| `apps/web/src/fsd/features/caption-style/model/caption-preview.ts` | 10 | 이식 계약의 연결선 — 이 파일이 값이 가장 크다 |
| `.claude/agents/feature-scout.md` | 5 | 에이전트가 매 세션 읽는 문서 |
| `apps/web/src/fsd/shared/config/constants.ts` | 4 | |
| `apps/backend/test_moment_prompt.py` | 2 | **독스트링만** |
| `apps/backend/test_reference_translation.py` | 2 | **독스트링만** |
| `apps/backend/translation_fallback.py` | 2 | **역사적 서술** — 줄마다 판정(요구 ②) |
| `apps/web/src/app/layout.tsx` | 2 | |
| `apps/web/src/fsd/features/caption-style/model/caption-preview.test.mjs` | 2 | |
| `apps/web/src/fsd/features/caption-style/ui/CaptionPreviewPlayer.tsx` | 2 | |
| `apps/web/src/fsd/widgets/clip-draft-review/ui/index.tsx` | 3 | 웹 내부 1건은 **재앵커로 안 끝난다** |
| `.claude/agents/backend-dev.md` | 1 | |
| `apps/backend/moment_prompt.py` | 1 | |
| `apps/web/CLAUDE.md` | 1 | |
| `apps/web/src/fsd/widgets/clip-draft-review/model/review-language-notice.ts` | 2 | |
| `docs/release-checks.md` | 1 | |
| `apps/web/src/fsd/widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx` | 1 | 자기 인용 |

여기 없는 파일은 구현 단계에서 고치지 않는다. **코드 동작은 한 줄도 바뀌지 않는다** —
전부 주석·문서 문장이다.

## 구현 스케치

### 앵커 형식

줄번호를 **쓰지 않는다.** 함수명으로 파일 안 위치를 잡고, 함수 안에서 더 좁혀야 하면
**그 줄의 코드를 짧게 인용**한다(`start_rel = max(0.0, ...)`처럼). 코드 인용은 파일이 밀려도
`grep`으로 찾힌다.

### `caption-preview.ts` (10)

| 줄 | before → after |
| --- | --- |
| `:10` | `apps/backend/main.py:287-345 create_subtitles_with_ffmpeg 의 묶기` → `apps/backend/main.py create_subtitles_with_ffmpeg 의 큐 묶기` |
| `:19` | `main.py:300-305 — 클립 범위 안 세그먼트만` → `main.py create_subtitles_with_ffmpeg의 clip_segments 필터 — 클립 범위 안 세그먼트만` |
| `:35` | `main.py:384-385` → `main.py resolved["uppercase"] → text.upper()` |
| `:41` | `main.py:321` → `main.py start_rel = max(0.0, seg_start - clip_start)` |
| `:42` | `main.py:322` → `main.py end_rel = max(0.0, seg_end - clip_start)` |
| `:43` | `main.py:317,324-326` → `main.py 단어 공백 검사 + if end_rel <= 0: continue` |
| `:50` | `main.py:334-338` → `main.py elif len(current_words) >= max_word: 의 flush` |
| `:55` | `main.py:340-342` → `main.py current_words.append(word)` |
| `:59` | `main.py:344-345` → `main.py 루프 뒤 if current_words: 마지막 flush` |
| `:106` | `marginv(main.py:141-142)` → `marginv(main.py CAPTION_POSITION_MARGINV)` |

### `constants.ts` (4)

| 줄 | before → after |
| --- | --- |
| `:75` | `main.py:354 subs.info["PlayResY"]` → `main.py create_subtitles_with_ffmpeg의 subs.info["PlayResY"]` |
| `:77` | `main.py:141-142` → `main.py CAPTION_POSITION_MARGINV` |
| `:78` | `main.py:369 new_style.shadow / :562 korean_style.shadow` → `main.py new_style.shadow / korean_style.shadow` |
| `:86` | `main.py:70,74가 설치하는 실제 폰트 파일` → `main.py 이미지 빌드의 wget(Anton-Regular.ttf · NotoSansKR-Bold.otf)이 설치하는 실제 폰트 파일` |

### `layout.tsx` (2)

| 줄 | before → after |
| --- | --- |
| `:71` | `main.py:360 Anton-Regular` → `main.py 이미지 빌드의 Anton-Regular.ttf` |
| `:79` | `main.py:74 NotoSansKR-Bold` → `main.py 이미지 빌드의 NotoSansKR-Bold.otf` |

### `CaptionPreviewPlayer.tsx` (2)

| 줄 | before → after |
| --- | --- |
| `:120` | `백엔드 resize 모드(main.py:245-262) 재현` → `백엔드 resize 모드(main.py create_vertical_video의 mode == "resize" 갈래) 재현` |
| `:122` | `(crop 모드, main.py:265-275)` → `(crop 모드, main.py create_vertical_video의 mode == "crop" 갈래)` |

### `caption-preview.test.mjs` (2)

| 줄 | before → after |
| --- | --- |
| `:18` | `(main.py:344-345 잔여 flush)` → `(main.py 루프 뒤 if current_words: 잔여 flush)` |
| `:54` | `main.py:300-305 — start >= clipStart && end <= clipEnd` → `main.py create_subtitles_with_ffmpeg의 clip_segments 필터 — start >= clipStart && end <= clipEnd` |

### `clip-draft-review/ui/index.tsx` (2 + 웹 내부 1)

| 줄 | before → after |
| --- | --- |
| `:278` | `(apps/backend/main.py:837/840)` → `(apps/backend/main.py process_clip의 elif selected_language == "Korean" → create_korean_subtitles_with_ffmpeg)` |
| `:291` | `(main.py:904 "Return exactly TARGET_COUNT moments if possible")` → `(moment_prompt.py "Return exactly TARGET_COUNT moments if possible")` — **파일이 틀렸다.** FEAT-43이 그 문장을 `moment_prompt.py`로 옮겼고 `main.py`엔 없다 |
| `:279-282` | **재앵커로 안 끝난다.** `유일한 기존 안내(CaptionStyleEditor :310-311)는 기본 닫힘 다이얼로그 안 11px라 소유자조차 못 봤다` — 그 안내와 다이얼로그를 **FEAT-52가 삭제했다.** 존재하지 않는 것을 「유일한 기존 안내」로 현재형 서술한다. 과거형으로 다시 쓴다: `그 전까지 유일한 안내는 검토 화면 캡션 다이얼로그 안 11px 문구였고 소유자조차 못 봤다(그 다이얼로그는 FEAT-52가 없앴다)` |

### `review-language-notice.ts` (1 + 웹 내부 1)

before (`:1-6`):

```ts
// 검토 화면은 언어 선택과 무관하게 영어 전사를 보여준다 — previewText는 wordsInRange의
// 영어 단어들이고(ClipDraftCard.tsx:113), 한국어 번역은 렌더 단계에서만 만들어진다
// (apps/backend/main.py:837 elif selected_language == "Korean" → :840
// create_korean_subtitles_with_ffmpeg, :474 Gemini 번역, 실패 시 :535
// korean_texts = english_texts 영어 폴백). 그래서 "Korean을 골랐는데 화면이 영어"라는
// 오독을 막는 안내는 English가 아닌 언어에서만 필요하다.
```

after:

```ts
// 검토 화면은 언어 선택과 무관하게 영어 전사를 보여준다 — previewText는 wordsInRange의
// 영어 단어들이고(ClipDraftCard.tsx의 const previewText 선언), 한국어 번역은 렌더 단계에서만
// 만들어진다 (apps/backend/main.py process_clip의 elif selected_language == "Korean" →
// create_korean_subtitles_with_ffmpeg, 그 안에서 Gemini 번역, 실패 시
// korean_texts = english_texts 영어 폴백). 그래서 "Korean을 골랐는데 화면이 영어"라는
// 오독을 막는 안내는 English가 아닌 언어에서만 필요하다.
```

### `ClipDraftCard.tsx` (웹 내부 1)

`:435` before: `previewText는 영어 원문이다(:113).`
after: `previewText는 영어 원문이다(위 const previewText 선언).`

### `apps/backend/*.py` (7)

| 자리 | before → after |
| --- | --- |
| `moment_prompt.py:12` | `main.py:937-1004의 prompt_template` → `main.py identify_moments의 prompt_template` |
| `test_moment_prompt.py:5` | `main.py:937-1004의 prompt_template` → `main.py identify_moments의 prompt_template` |
| `test_moment_prompt.py:103` | `구현 전 main.py:1006-1009의 조립식 재현` → `구현 전 main.py identify_moments 호출부의 조립식 재현` |
| `test_reference_translation.py:21` | `main.py:1019-1025 analyze 인라인 코드 펜스 제거의 재현식` → `구현 전 main.py analyze 경로 인라인 코드 펜스 제거의 재현식` |
| `test_reference_translation.py:204` | `main.py:1019-1025 인라인 복제와 동일 동작` → `구현 전 main.py analyze 인라인 복제와 동일 동작` |
| `translation_fallback.py:21` | `기존 main.py:516-524와 동치` → `기존 main.py create_korean_subtitles_with_ffmpeg의 인라인 번역 맵 조립과 동치` |
| `translation_fallback.py:45` | `기존 main.py:526-532의 줄 단위 폴백과 동치` → `기존 main.py create_korean_subtitles_with_ffmpeg의 줄 단위 폴백과 동치` |

**요구 ② 판정(줄마다)**: 일곱 중 넷(`test_*` 둘씩)은 **「구현 전」 스냅샷**을 가리키므로 숫자를
지우고 「구현 전」을 문장에 명시해 **역사적 서술임을 문면에 남긴다.** `translation_fallback.py`
둘은 이미 「기존」을 달고 있으니 함수명 앵커로만 바꾼다. `moment_prompt.py:12`와
`test_moment_prompt.py:5`는 **현재도 참인 대응**(바이트 동일 사본)이라 순수 재앵커다.

### `.claude/agents/*.md` (6) · `apps/web/CLAUDE.md` (1) · `docs/release-checks.md` (1)

| 자리 | before → after |
| --- | --- |
| `backend-dev.md:154` | `(main.py:136)` → `(main.py의 resolve_caption_style())` |
| `feature-scout.md:64` | `main.py:519-521` · `main.py:524-...` → `create_korean_subtitles_with_ffmpeg의 줄 단위 폴백` · `같은 함수의 클립 전체 폴백` |
| `feature-scout.md:122` | `ProcessVideoRequest(main.py:26-41)` → `ProcessVideoRequest(main.py의 class ProcessVideoRequest(BaseModel))` |
| `feature-scout.md:166` | `main.py:585, 호출 :792` → `main.py의 한국어 번역 프롬프트, 호출은 create_korean_subtitles_with_ffmpeg` |
| `feature-scout.md:174` | `프롬프트(main.py:585)` → `프롬프트(main.py의 한국어 번역 프롬프트)` |
| `apps/web/CLAUDE.md:77` | `apps/backend/main.py:302-360 이식` → `apps/backend/main.py create_subtitles_with_ffmpeg 이식` |
| `docs/release-checks.md:355` | `자막 넣기 직전의 세로 영상(apps/backend/main.py:762)` → `자막 넣기 직전의 세로 영상(apps/backend/main.py process_clip의 vertical_mp4_path)` |

### `apps/backend/CLAUDE.md` (11)

| before | after |
| --- | --- |
| `main.py:91` | `main.py`의 `add_local_python_source` 호출 |
| `main.py:122-123` | `MAX_CLIP_DURATION` / `MIN_CLIP_DURATION` |
| `main.py:146-150` | `CAPTION_POSITION_ALIGNMENT` |
| `main.py:153-156` | `CAPTION_POSITION_MARGINV` |
| `main.py:170` | `resolve_caption_style()` |
| `main.py:304-310` | `create_subtitles_with_ffmpeg`의 `resolve_caption_style(...)` 호출 |
| `main.py:373` | `create_subtitles_with_ffmpeg`의 `new_style.fontname = "Anton"` |
| `main.py:420-426` | `create_korean_subtitles_with_ffmpeg`의 `resolve_caption_style(...)` 호출 |
| `main.py:568` | `create_korean_subtitles_with_ffmpeg`의 `korean_style.fontname` |
| `main.py:1086-1088` | `_do_process_video` analyze의 `base_moments` 조립 |
| `main.py:1169-1171` | `_do_process_video` 클립 루프의 `clip_result["clipType"/"hook"/"payoff"]` |

기본값 표의 헤더 `| English (main.py:304-310) | Korean (main.py:420-426) |`는
`| English (create_subtitles_with_ffmpeg) | Korean (create_korean_subtitles_with_ffmpeg) |`가 된다.

## 테스트

- **덮는 것**: 새 테스트를 만들지 않는다. **코드 동작이 한 줄도 바뀌지 않으므로** 기존 게이트가
  「아무것도 깨지 않았다」만 확인한다. 착수 시점 기준선을 실측해 그 숫자가 **그대로**여야 한다.

  | 게이트 | 기대 |
  | --- | --- |
  | `npm run check -w apps/web` | EXIT 0 · 경고 0 |
  | `npm test -w apps/web` | 착수 기준선 그대로(2026-09-22 기준 `tests 170 / suites 40`) |
  | `PYTHONUTF8=1 python -m unittest discover -s apps/backend -p "test_*.py"` | 착수 기준선 그대로(2026-09-22 기준 `Ran 109 tests`) |
  | `python -m py_compile apps/backend/main.py` | EXIT 0 |

  **주의**: `test_moment_prompt.py`·`test_reference_translation.py`는 **독스트링만** 바뀐다.
  독스트링은 실행에 영향이 없으니 테스트 수가 달라지면 잘못 지운 것이다.

- **요구 ④ — 완료 판정**: `main\.py:\d+` 전역 grep을 다시 돌려 **대상 17파일에서 0건**임을 보인다
  (`TASK_BACKLOG.md`·`docs/plans`·`docs/agents`·`docs/proposals`는 범위 밖이라 남는다).
  웹 내부 3건도 원문(`ClipDraftCard.tsx:113` · `(:113)` · `CaptionStyleEditor` 뒤 `:310-311`)이
  0건임을 보인다.

- **못 덮는 범위**: 없다. 주석·문서 문장만 바뀌고 렌더·응답·저장값에 닿지 않는다.
  **배포 확인 원장에 등재하지 않는다** — 확인할 실물이 없다.

## 범위 밖 의존

- **`TASK_BACKLOG.md` 17건은 범위 밖이다**(소유자 결정 — 「대안」 참조). 그중 FEAT-44 자신의
  관측이 낡았다는 경고는 2026-09-21에 이미 달아 뒀다.
- **`docs/plans`·`docs/agents`·`docs/proposals`는 영구 제외**다 — 작성 시점 기록이라
  감사 대상이 아니다(`docs/agents/README.md` 「감사 대상이 아니다」와 같은 이유).
- **이 항목은 재발을 막지 못한다.** 새로 쓰는 주석이 다시 줄번호를 쓰면 같은 일이 반복된다.
  규약을 어디에 박을지(두 `CLAUDE.md`? 에이전트 정의?)는 **별도 후속**이며 여기서 하지 않는다.

## 대안

- **두 `CLAUDE.md`를 범위에 넣는다 — 채택(2026-09-22 소유자 승인).** 백로그 원문은
  「메인 루프 소유 문서는 인수 때 이미 교정했다」며 제외했다. **그 제외가 병이다** — 교정은
  그때뿐이고 다음 `main.py` 수정에서 또 밀린다. 실제로 FEAT-43 인수에서 한 번, FEAT-55
  인수에서 또 한 번 손으로 고쳤고 그 사이 FEAT-41·46·51이 각각 밀었다. 12건을 앵커로 바꾸면
  그 손 교정이 영구히 사라진다.
- **`TASK_BACKLOG.md` 17건을 뺀다 — 채택(같은 승인).** 백로그의 숫자는 「그때 이랬다」는
  **시점 관측**이고 항목이 완료되면 항목과 함께 사라진다. 앵커로 바꿔도 다음 항목이 또 숫자를
  적으면 그만이다. 근본 해법은 백로그 「비고」의 기존 규약(「줄 내용을 함께 인용한다」)을 지키는
  것이고, 내용을 함께 인용한 관측은 숫자가 밀려도 `grep`으로 찾혀 **자가 치유된다**.
- **줄번호를 실측해 다시 맞춘다 — 기각.** 2026-09-14 소유자 결정이 정확히 이것을 기각했고,
  그 뒤 세 번(FEAT-43·55 인수, 이 계획 작성) 다시 낡는 것을 실측했다. 네 번째로 같은 일을
  하는 셈이다.
- **`main.py` 인용을 아예 지운다 — 기각.** 이 주석들이 나르는 것은 「어디를 이식했나」라는
  **계약**이다. 지우면 `caption-preview.ts`가 무엇의 사본인지 아무 데도 적히지 않게 되고,
  그 사본이 어긋났을 때 대조할 기준이 사라진다.
- **`main\.py:\d+`를 금지하는 게이트를 만든다 — 이 항목 아님.** 재발 방지책이지 현재 52건을
  고치지 않는다. FEAT-27(계획서 검증 하니스)이 다룰 영역에 가깝다.
