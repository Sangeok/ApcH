# 카드뉴스 CPU 앱

기존 GPU `main.py`, `asd/`, `requirements.txt`와 분리된 Modal 앱이다. 입력·callback·manifest 정본은 `packages/db/contracts/card-news-v1.schema.json`이며 Python과 web이 `card-news-v1.fixtures.json`을 공유한다.

## 동작과 설정

인증된 `POST /`는 검증 후 비동기 작업을 spawn하고 `{schemaVersion:1,status:"accepted",call_id}`를 반환한다. `POST /status`는 카드뉴스·기존 영상의 서버 검증 참조를 받고 `pending | ended | unknown`만 반환한다. Modal 결과 원문·로그를 응답에 싣지 않는다.

기존 `ai-podcast-clipper-secret`은 Gemini·AWS 값을 제공한다. 별도 `apch-card-news-auth`에 카드뉴스 인증 값과 선택적 버킷을 둔다. 기존 GPU secret을 덮어쓰지 않는다. 실제 값은 저장소·로그에 기록하지 않는다.

- `CARD_NEWS_ENDPOINT_AUTH`: web → CPU Bearer 인증.
- `CARD_NEWS_WEBHOOK_SECRET`: CPU → web callback Bearer 인증. web의 같은 설정과 일치해야 한다.
- `GEMINI_API_KEY`: 최초 생성·AI 재생성에만 사용한다.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`: S3 접근.
- 선택적 `CARD_NEWS_S3_BUCKET`: 미설정 시 기존 `ai-podcast-clipper-hamsoo` 버킷.

각 invocation은 새 UUID를 사용한다. `started` callback의 DB 등록 승인 및 `writeDeadlineAt` 수신 전에 S3 client 생성·다운로드·업로드를 하지 않는다. 요청과 승인 deadline 중 더 이른 시각을 사용하며 매 S3 쓰기를 재검사한다. 진행·완료 전송과 S3 일시 오류만 최대 3회 재시도한다. 원고 구조·glyph·영역 검사 실패의 AI 수정은 최초 호출 후 최대 1회다. `insufficient_content`는 수정으로 채우지 않는다. CPU 작업 상한은 600초, 모델 요청은 120초이며 SDK 자동 재시도는 1 attempt로 고정한다.

진행 단계는 `accepted → generating-text → extracting-cover → rendering → packaging → completed` 순서다. 원고 검증 후 실제 후보를 추출하며 후보 추출은 한 번만 수행한다. 렌더 overflow 후 제한된 AI 축약은 rendering의 복구에 속하며 화면을 generating-text로 되돌리지 않는다. 원고 구조 오류만 생겼다면 generating-text에서 1회 수정하고 다음 단계로 이동한다. 원본·후보 다운로드/FFmpeg 실패는 AI 수정으로 재시도하지 않는다. 무료 render는 `accepted → rendering → packaging → completed`이고 AI를 호출하지 않는다.

원본 최대 다운로드는 2GiB, 재사용 후보는 파일당 20MiB로 제한한다. FFprobe는 30초, 각 FFmpeg 추출은 90초 상한을 가지며 전체 deadline도 적용한다. 지원하지 않는 glyph와 실제 폰트 overflow는 실패시킨다. 수동 문구 오류는 `text_overflow_cards_1_body`처럼 카드와 필드를 담은 code로 전달한다.

최초 생성은 원본 구간의 25/50/75% 후보를 추출한다. 무료 render는 불변 draft와 검증된 기존 후보 3장을 재사용하며 Gemini·원본 영상 다운로드를 호출하지 않는다. 등록 승인 후 기존 epoch manifest를 페이지네이션으로 대조하고, 동일 입력·버전·SHA·필수 객체가 이미 완성됐다면 원고를 다시 호출하지 않는다. 기존 manifest의 invocation 소유권은 바꾸지 않는다. 카드·ZIP·최초 후보를 invocation 전용 경로에 `IfNoneMatch="*"`로 저장하고 SHA-256 metadata를 기록한다. 같은 키의 재시도는 byte/hash/type/length가 같은 경우에만 성공한다. `manifest.json`은 마지막 commit marker이며 완료 전송 실패 후에도 worker가 이 파일로 복구한다.

글꼴은 공식 Google Fonts의 Noto Sans KR 2.004 variable font를 fontTools 4.56.0으로 `wght=400/700` 정적 인스턴스로 만든 번들이다. 원본 URL·SHA, 인스턴스 SHA, upstream version, OFL license SHA는 `assets/dependency-manifest.json`에 고정했다. 시스템 글꼴로 대체하지 않는다. CPU image는 Python 3.12·Debian FFmpeg 5·직접 pinned Python 의존성을 사용하며 schema·fixtures·폰트를 명시적으로 포함한다.

## 네트워크 없는 로컬 검증

저장소 루트에서 stdlib 테스트와 문법 검사를 수행한다. 테스트용 pip/venv 설치는 필요 없다.

```powershell
python -m unittest discover -s apps/backend -p "test_card_news_*.py"
python -m py_compile apps/backend/card_news_app.py apps/backend/card_news/contract.py apps/backend/card_news/prompt.py apps/backend/card_news/layout.py apps/backend/card_news/policy.py apps/backend/card_news/io.py apps/backend/card_news/render.py apps/backend/card_news/verify_render.py
```

로컬에 Pillow·FFmpeg와 CPU dependencies가 이미 있을 때 실제 합성 영상·이미지 검증을 실행할 수 있다. 아래 `strict_runtime=False`는 로컬 환경 차이를 허용할 뿐 Modal image 검증을 대체하지 않는다. 결과는 저장소 밖 임시 경로에 남는다. 모델·S3·callback 네트워크 호출은 0건이다.

```powershell
$env:PYTHONPATH = "apps/backend"
@'
from pathlib import Path
import json, tempfile
from card_news.verify_render import verify_fixture_suite
result = verify_fixture_suite(strict_runtime=False)
output = Path(tempfile.mkdtemp(prefix="apch-card-news-review-"))
for relative, content in result.pop("files").items():
    target = output / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
print(json.dumps({"artifactDirectory": str(output), "cases": result["fixtureCases"]}, ensure_ascii=False))
'@ | python -
```

## 실제 Modal 검증

아래 명령은 외부 CPU·모델 실행 비용이 발생한다. 기존 GPU call ID도 조회할 수 있는 같은 workspace/environment를 사용한다. 현재 운영 environment 이름은 `main`이다.

```powershell
modal run --env main apps/backend/card_news_app.py --verify-fixtures
modal run --env main apps/backend/card_news_app.py --verify-model --all-model-cases
```

`--verify-fixtures`는 CPU image의 실제 pinned package/font/FFmpeg 버전을 검사하고 합성 MP4 → 후보 → 실제 JPG·ZIP을 검증한다. 출력 이미지·393px preview·ZIP·`qualification.json`을 로컬 임시 폴더로 가져온다. 실제 설치된 전체 package versions도 qualification artifact에 기록한다.

`--verify-model`은 기본적으로 합성 한국어·영어 원문 각각 1개를 검사한다. `--all-model-cases`를 추가하면 각각 5개, 총 10개를 실제 Gemini → 계약 검증 → JPG·ZIP 렌더까지 검사한다. 각 원문은 최초 호출 후 최대 1회만 수정하므로 전체 호출 상한은 20회다. 원문·필수 사실·금지 주장·모델 원고·각 시도 결과와 실제 이미지가 임시 artifact에 저장된다. schema 또는 렌더 실패 시 CLI가 실패한다. 자동 schema 통과는 사실성 평가 통과가 아니며 원문과 사람이 대조해야 한다. 운영 대본을 무단 복제하지 않는다.

2026-10-20 실제 Modal Python 3.12.10/Debian FFmpeg 5.1.9에서 fixture 10개와 거부 사례 3개를 통과했다. 실제 모델 10개는 총 11회 호출로 계약·렌더를 모두 통과했다(영어 회의 사례의 highlight 1회 수정). 고정 수치와 필수 사실은 확인했으나 일부 일반적인 효율·생산성 표현이 남아 있어 보편적 의미 품질을 보증하지 않는다. 배포 전환·인증 화면·실제 S3/callback/다운로드 검증은 별도다. 자세한 실행 근거는 [출시 검증 기록](../../../docs/card-news-release-verification-20261020.md)을 참고한다.

## 구현 시 로컬 결과와 남은 증거

2026-10-11 로컬 Python 3.13.1, Pillow 11.1.0, FFmpeg N-118776 빌드에서 다음을 실제 실행했다.

- stdlib 카드뉴스 테스트 19개 통과, 기존 backend 전체 146개 통과, 공유 fixture 92개 verdict 일치. 실제 status adapter 본문을 9개 종료/대기/불명 경로로 실행해 transport 오류의 종료 오판을 검사했다. 실제 CPU orchestration 본문도 정상·원고 수정·영역 수정·무료 렌더·무료 overflow·미디어 실패·완성 결과 재사용의 7개 scenario로 실행해 단계 순서·수정 호출 상한·무료 AI 0회를 검사했다. 이 adapter 검사는 실제 이미지 품질 검증을 대신하지 않는다.
- 합성 MP4 후보 추출, 한국어·영어 각 5개 case의 총 48개 1080×1350 RGB JPEG와 10개 ZIP의 decode/hash/order 검사 통과.
- 3/5/7장, 두 theme, 세 cover 후보, 혼합 숫자·줄바꿈·긴 영단어 확인. emoji와 500자 한글/영문 overflow 3건은 해당 필드 오류로 거부.
- 실제 한국어 표지·영어 본문·393px 한국어 preview를 열어 glyph·clipping을 검토했다.
- pinned SDK의 로컬 import·FastAPI handler offline smoke에서 Bearer 거부, strict input, accepted call ID, video status 6개 경로, 원문 결과 비노출, env 원복을 확인했다. 실제 Modal 조회는 호출하지 않았다.
- 실제 JPG·ZIP에서 만든 manifest와 source/input/callback을 Python에서 검사한 뒤 web의 실제 TypeScript parser·`validateManifestBinding`·무료 render input parser로 다시 검사했다. 양쪽 계약이 일치했다.

마지막 이미지 artifact: `C:/Users/hamso/AppData/Local/Temp/apch-card-news-review-7lowie_x`.

로컬 결과는 Modal Python 3.12/Debian FFmpeg 5 image의 qualification 증거가 아니다. 실제 image·Gemini 비용/가용성·10개 대본 의미 평가·사용자 presigned 다운로드 bytes·live S3/callback·producer 종료·Instagram 업로드는 미실행이다. proposal의 BLK-CN-01은 실제 image 검증과 배포 결과까지 확보하기 전 계속 열려 있다. CPU 상태 조회는 종료를 확증하지 못하는 서비스/lookup/expired 오류에서 `unknown`을 유지한다.
