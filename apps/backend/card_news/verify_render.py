"""Actual synthetic FFmpeg -> cover -> Pillow -> decode/hash/ZIP qualification."""
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone

from PIL import Image

from card_news.contract import ContractError, source_hash, validate_contract
from card_news.io import Deadline, extract_candidates, run_process
from card_news.layout import LayoutError
from card_news.render import ASSETS, font_coverage, render_cards, verify_dependencies


def fixture_cases():
    path = Path(os.environ.get("CARD_NEWS_FIXTURE_PATH", Path(__file__).resolve().parent / "fixtures"))
    return json.loads((path / "render-cases.json").read_text(encoding="utf-8"))


def fixture_source(case):
    return {"schemaVersion": 1, "clipId": "fixture-clip", "processingAttempt": 1,
            "uploadedFileId": "fixture-upload", "s3Key": "fixtures/source.mp4", "clipS3Key": "fixtures/clip.mp4",
            "startSeconds": 0, "endSeconds": 4, "scriptText": " ".join(case["sentences"]),
            "hook": None, "payoff": None, "language": case["language"], "subtitleStatus": None,
            "sourceSentenceCount": len(case["sentences"])}


def fixture_draft(case):
    count = case["cardCount"]
    cards = [{"id": "cover", "role": "cover", "title": case["title"],
              "body": "원문 핵심 정리" if case["language"] == "Korean" else "Key ideas from the source",
              "highlight": None, "sourceSentenceIds": [0], "provenance": "ai"}]
    for index in range(1, count - 1):
        cards.append({"id": f"body-{index}", "role": "body", "title": case["sentences"][index - 1],
                      "body": case.get("extraBody", case["sentences"][index]), "highlight": None,
                      "sourceSentenceIds": [index], "provenance": "ai"})
    cards.append({"id": "summary", "role": "summary", "title": "핵심 정리" if case["language"] == "Korean" else "Keep the key idea",
                  "body": case["sentences"][count - 1], "highlight": None,
                  "sourceSentenceIds": [count - 1], "provenance": "ai"})
    return {"schemaVersion": 1, "language": case["language"], "cards": cards, "theme": case["theme"],
            "accentColor": "#2563EB", "coverCandidateId": case["coverCandidateId"],
            "caption": " ".join(case["sentences"]), "hashtags": ["#기록" if case["language"] == "Korean" else "#notes"]}


def verify_fixture_suite(strict_runtime=True):
    dependency_manifest = verify_dependencies(strict_versions=strict_runtime)
    if strict_runtime and sys.version_info[:2] != (3, 12):
        raise RuntimeError("CPU Python version mismatch")
    ffmpeg_version = subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True, text=True).stdout.splitlines()[0]
    if strict_runtime and not ffmpeg_version.startswith(f"ffmpeg version {dependency_manifest['ffmpegMajor']}."):
        raise RuntimeError("FFmpeg major version mismatch")
    cases = fixture_cases()
    results = []
    files = {}
    deadline = Deadline((datetime.now(timezone.utc) + timedelta(minutes=8)).isoformat())
    with tempfile.TemporaryDirectory(prefix="card-news-fixtures-") as temporary:
        directory = Path(temporary)
        synthetic = directory / "source.mp4"
        run_process(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=10",
                     "-t", "4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", str(synthetic)], deadline)
        candidates = extract_candidates(synthetic, fixture_source(cases["cases"][0]), directory, deadline)
        for case in cases["cases"]:
            source = fixture_source(case)
            draft = fixture_draft(case)
            validate_contract("source", source)
            validate_contract("draft", draft)
            output = directory / case["id"]
            paths, zip_path = render_cards(draft, candidates, output)
            for path in paths + [zip_path]:
                files[case["id"] + "/" + path.name] = path.read_bytes()
            # Actual mobile-sized preview preserves the complete JPG for human review.
            with Image.open(paths[0]) as image:
                preview = image.resize((393, 491))
                preview_path = output / "mobile-preview.jpg"
                preview.save(preview_path, "JPEG", quality=94)
                files[case["id"] + "/mobile-preview.jpg"] = preview_path.read_bytes()
            results.append({"case": case["id"], "imageCount": len(paths), "sourceHash": source_hash(source),
                            "theme": case["theme"], "cover": case["coverCandidateId"], "decoded": True, "zipVerified": True})
        baseline = fixture_draft(cases["cases"][0])
        for rejection in cases["rejectionCases"]:
            draft = json.loads(json.dumps(baseline))
            draft["cards"][1][rejection["field"]] = rejection.get("text", rejection.get("textRepeat", "") * rejection.get("count", 1))
            try:
                render_cards(draft, candidates, directory / rejection["id"])
            except LayoutError as error:
                if error.code != rejection["expectedCode"]:
                    raise
                results.append({"case": rejection["id"], "rejected": error.code, "field": error.field})
            else:
                raise RuntimeError("Invalid text unexpectedly rendered successfully")
        for identifier, path in candidates.items():
            files["covers/" + identifier + ".jpg"] = path.read_bytes()
    runtime = {"python": sys.version, "packages": {distribution.metadata["Name"]: distribution.version for distribution in importlib.metadata.distributions()},
               "ffmpeg": ffmpeg_version, "fonts": dependency_manifest["fonts"]}
    report = {"schemaVersion": 1, "fixtureCases": results, "runtimeDependencies": runtime,
              "networkCalls": 0, "modelCalls": 0, "visualReview": "required", "runtimeVersionChecks": strict_runtime}
    files["qualification.json"] = json.dumps(report, ensure_ascii=False, indent=2).encode("utf-8")
    return {**report, "files": files}


def verify_model_smoke(all_cases=False):
    """Qualify model and real render, with at most one repair per synthetic case."""
    from google import genai
    from google.genai import types
    from card_news.prompt import build_prompt, normalize_model_output, provider_schema
    manifest = verify_dependencies()
    cases = fixture_cases()["cases"]
    selected = (cases if all_cases else
                [next(case for case in cases if case["language"] == language) for language in ("Korean", "English")])
    results, files = [], {}
    calls = 0
    with tempfile.TemporaryDirectory(prefix="card-news-model-") as temporary:
        directory = Path(temporary)
        candidates = {}
        for identifier in ("cover-25", "cover-50", "cover-75"):
            target = directory / (identifier + ".jpg")
            Image.new("RGB", (1280, 720), "#D0D0D0").save(target, "JPEG")
            candidates[identifier] = target
        for case in selected:
            source = fixture_source(case)
            result = {"case": case["id"], "source": source,
                      "requiredFacts": case["requiredFacts"], "forbiddenClaims": case["forbiddenClaims"],
                      "semanticReview": "required", "attempts": [], "schemaValid": False, "renderValid": False}
            repair = None
            for attempt in range(2):
                calls += 1
                prompt = build_prompt(source, repair) + "\nTarget card count: 5; fewer is allowed only when evidence requires it."
                with genai.Client(api_key=os.environ["GEMINI_API_KEY"],
                     http_options=types.HttpOptions(timeout=120000, retry_options=types.HttpRetryOptions(attempts=1))) as client:
                    response = client.models.generate_content(model=manifest["modelVersion"], contents=prompt,
                        config=types.GenerateContentConfig(response_mime_type="application/json",
                            response_json_schema=provider_schema(), temperature=0.2))
                try:
                    draft = normalize_model_output(response.text, source)
                    result.update({"draft": draft, "schemaValid": True, "renderValid": False})
                    paths, zip_path = render_cards(draft, candidates, directory / case["id"])
                    for artifact in paths + [zip_path]:
                        files[case["id"] + "/" + artifact.name] = artifact.read_bytes()
                    result["renderValid"] = True
                    result["attempts"].append({"attempt": attempt + 1, "passed": True})
                    break
                except (ContractError, LayoutError) as error:
                    result["attempts"].append({"attempt": attempt + 1, "passed": False,
                        "failureCode": error.code, "failureField": error.field})
                    result["providerOutput"] = response.text
                    if error.code == "insufficient_content":
                        break
                    repair = str(error)
            results.append(result)
    return {"schemaVersion": 1, "modelVersion": manifest["modelVersion"], "modelCalls": calls,
            "schemaValid": all(result["schemaValid"] for result in results),
            "renderValid": all(result["renderValid"] for result in results), "cases": results, "files": files}
