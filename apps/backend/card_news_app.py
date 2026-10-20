"""Dedicated CPU Modal application. No GPU pipeline or video requirements imports."""
import hmac
import json
import os
from pathlib import Path
import tempfile
import time
import uuid

import modal
from grpclib.exceptions import GRPCError

ROOT = Path(__file__).resolve().parent
CONTRACTS = (ROOT.parents[1] / "packages/db/contracts" if modal.is_local()
             else Path("/root/card-news-contracts"))
image = (modal.Image.debian_slim(python_version="3.12")
         .apt_install("ffmpeg")
         .pip_install_from_requirements(str(ROOT / "requirements-card-news.txt"))
         .env({"CARD_NEWS_ASSET_PATH": "/root/card-news-assets", "CARD_NEWS_FIXTURE_PATH": "/root/card-news-fixtures"})
         .add_local_python_source("card_news")
         .add_local_dir(str(ROOT / "card_news/assets"), "/root/card-news-assets")
         .add_local_dir(str(ROOT / "card_news/fixtures"), "/root/card-news-fixtures")
         .add_local_dir(str(CONTRACTS), "/root/card-news-contracts"))
app = modal.App("apch-card-news", image=image)
secrets = [modal.Secret.from_name("ai-podcast-clipper-secret"),
           modal.Secret.from_name("apch-card-news-auth")]


def _callback(payload, invocation_id, call_id, outcome, sequence, stage, manifest_key=None, failure_code=None):
    return {"schemaVersion": 1, "jobId": payload["jobId"], "executionEpoch": payload["executionEpoch"],
            "revision": payload["revision"], "invocationId": invocation_id, "outcome": outcome,
            "modalCallId": call_id, "sequence": sequence, "stage": stage,
            "manifestKey": manifest_key, "failureCode": failure_code}


@app.function(cpu=2, memory=4096, timeout=600, secrets=secrets)
def process_card_news(payload):
    from card_news.contract import ContractError, validate_contract
    from card_news.io import Deadline, download_object, create_s3_client, extract_candidates, find_completed_manifest, post_callback, timestamp, upload_object
    from card_news.layout import LayoutError
    from card_news.prompt import build_prompt, normalize_model_output, provider_schema
    from card_news.policy import model_timeout_ms
    from card_news.render import asset_record, render_cards, verify_dependencies
    from google import genai
    from google.genai import types

    started_at = time.monotonic()
    validate_contract("input", payload)
    dependencies = verify_dependencies()
    for field in ("templateVersion", "fontVersion", "promptVersion", "modelVersion"):
        if payload[field] != dependencies[field]:
            raise ContractError("unsupported_runtime_version", field)
    invocation_id = str(uuid.uuid4())
    call_id = modal.current_function_call_id()
    registration_deadline = Deadline(payload["writeDeadlineAt"])
    # Registration is the first external operation. No S3 client/read/write before server acceptance.
    acknowledgement = post_callback(payload["callbackUrl"],
        _callback(payload, invocation_id, call_id, "started", 0, "accepted"), registration_deadline)
    if acknowledgement.get("accepted") is not True or not acknowledgement.get("writeDeadlineAt"):
        return {"outcome": "registration_rejected"}
    permitted = acknowledgement["writeDeadlineAt"]
    if timestamp(permitted) > timestamp(payload["writeDeadlineAt"]):
        permitted = payload["writeDeadlineAt"]
    deadline = Deadline(permitted)
    sequence = 0
    metrics = {"modelInputTokens": 0, "modelOutputTokens": 0, "cpuMilliseconds": 0, "storageBytes": 0}
    manifest_committed = False
    manifest_key = None

    def progress(stage):
        nonlocal sequence
        sequence += 1
        try:
            post_callback(payload["callbackUrl"], _callback(payload, invocation_id, call_id,
                          "progress", sequence, stage), deadline)
        except Exception:
            # Progress is advisory; completion remains durable through the final manifest.
            pass

    try:
        s3 = create_s3_client()
        bucket = os.environ.get("CARD_NEWS_S3_BUCKET", "ai-podcast-clipper-hamsoo")
        if find_completed_manifest(s3, bucket, payload, deadline):
            # The original registered invocation owns that candidate; do not rebind it to this UUID.
            return {"outcome": "existing_manifest"}
        prefix = payload["outputPrefix"] + invocation_id + "/"
        with tempfile.TemporaryDirectory(prefix="card-news-") as temporary:
            directory = Path(temporary)
            if payload["mode"] == "generate":
                candidates = None
                covers = None
            else:
                covers = payload["coverCandidates"]
                candidates = {}
                for candidate in covers:
                    target = directory / f"{candidate['id']}.jpg"
                    download_object(s3, bucket, candidate["key"], target, deadline, 20 * 1024 ** 2,
                                    expected_sha256=candidate["sha256"])
                    actual = asset_record(target, candidate["key"], candidate["id"])
                    if actual != candidate:
                        raise ContractError("cover_snapshot_mismatch")
                    candidates[candidate["id"]] = target
            draft = payload["draft"]
            repair_reason = None
            for attempt in range(2 if payload["mode"] == "generate" else 1):
                validating_model = False
                try:
                    if payload["mode"] == "generate":
                        # A corrective model call after layout failure belongs to the existing
                        # rendering phase. Do not move the visible stage backwards.
                        if candidates is None:
                            progress("generating-text")
                        if not os.environ.get("GEMINI_API_KEY"):
                            raise RuntimeError("GEMINI_API_KEY is not configured")
                        prompt = build_prompt(payload["source"], repair_reason)
                        prompt += f"\nTarget card count: {payload['cardCount']}; fewer is allowed only when evidence requires it."
                        with genai.Client(api_key=os.environ["GEMINI_API_KEY"],
                             http_options=types.HttpOptions(timeout=model_timeout_ms(deadline),
                             retry_options=types.HttpRetryOptions(attempts=1))) as client:
                            response = client.models.generate_content(model=payload["modelVersion"], contents=prompt,
                                config=types.GenerateContentConfig(response_mime_type="application/json",
                                    response_json_schema=provider_schema(), temperature=0.2))
                        usage = response.usage_metadata
                        if usage:
                            metrics["modelInputTokens"] += usage.prompt_token_count or 0
                            metrics["modelOutputTokens"] += usage.candidates_token_count or 0
                        validating_model = True
                        draft = normalize_model_output(response.text, payload["source"], theme=payload["initialTheme"])
                        validating_model = False
                    if payload["mode"] == "generate" and candidates is None:
                        progress("extracting-cover")
                        source_file = directory / "source.mp4"
                        download_object(s3, bucket, payload["source"]["s3Key"], source_file, deadline)
                        candidates = extract_candidates(source_file, payload["source"], directory, deadline)
                        covers = [asset_record(path, prefix + path.name, identifier)
                                  for identifier, path in candidates.items()]
                    progress("rendering")
                    deadline.check()
                    paths, zip_path = render_cards(draft, candidates, directory / "output")
                    break
                except (ContractError, LayoutError, ValueError) as error:
                    if (payload["mode"] != "generate" or attempt == 1
                            or getattr(error, "code", None) == "insufficient_content"
                            or not (validating_model or isinstance(error, LayoutError))):
                        raise
                    repair_reason = str(error)
            progress("packaging")
            records = [asset_record(path, prefix + path.name, card["id"])
                       for path, card in zip(paths, draft["cards"])]
            zip_record = asset_record(zip_path, prefix + zip_path.name)
            if payload["mode"] == "generate":
                for cover in covers:
                    upload_object(s3, bucket, cover["key"], candidates[cover["id"]], "image/jpeg", deadline)
            for record, path in zip(records, paths):
                upload_object(s3, bucket, record["key"], path, "image/jpeg", deadline)
            upload_object(s3, bucket, zip_record["key"], zip_path, "application/zip", deadline)
            metrics["cpuMilliseconds"] = int((time.monotonic() - started_at) * 1000)
            metrics["storageBytes"] = sum(record["sizeBytes"] for record in records + [zip_record])
            if payload["mode"] == "generate":
                metrics["storageBytes"] += sum(record["sizeBytes"] for record in covers)
            manifest = {"schemaVersion": 1, "jobId": payload["jobId"], "executionEpoch": payload["executionEpoch"],
                        "revision": payload["revision"], "invocationId": invocation_id,
                        "sourceHash": payload["sourceHash"],
                        **{field: payload[field] for field in ("templateVersion", "fontVersion", "promptVersion", "modelVersion")},
                        "draftDocument": draft, "cards": records, "coverCandidates": covers, "zip": zip_record,
                        "caption": draft["caption"], "hashtags": draft["hashtags"],
                        "validation": {"imagesDecoded": True, "zipVerified": True, "textFits": True},
                        "usageMetrics": metrics}
            validate_contract("manifest", manifest)
            manifest_file = directory / "manifest.json"
            manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, allow_nan=False,
                                               separators=(",", ":")), encoding="utf-8")
            manifest_key = prefix + "manifest.json"
            # Commit marker is always last; no later output writes can mutate this revision.
            upload_object(s3, bucket, manifest_key, manifest_file, "application/json", deadline)
            manifest_committed = True
            sequence += 1
            try:
                post_callback(payload["callbackUrl"], _callback(payload, invocation_id, call_id,
                              "completed", sequence, "completed", manifest_key), deadline)
            except Exception:
                # Reconciliation scans immutable invocation manifests even when delivery is lost.
                return {"outcome": "completed", "callbackDelivered": False}
            return {"outcome": "completed", "callbackDelivered": True}
    except Exception as error:
        if manifest_committed:
            return {"outcome": "completed", "callbackDelivered": False}
        sequence += 1
        failure = getattr(error, "code", "cpu_job_failed")
        if isinstance(error, LayoutError):
            import re
            failure += "_" + re.sub(r"[^A-Za-z0-9_-]+", "_", error.field).strip("_")
        try:
            post_callback(payload["callbackUrl"], _callback(payload, invocation_id, call_id,
                          "failed", sequence, "failed", failure_code=failure), deadline)
        except Exception:
            pass
        # Only a sanitized status escapes. Worker recovery owns timeout/release semantics.
        return {"outcome": "failed", "failureCode": failure}


def _authenticate(authorization):
    secret = os.environ.get("CARD_NEWS_ENDPOINT_AUTH")
    return bool(secret and authorization and hmac.compare_digest(authorization, f"Bearer {secret}"))


def _producer_status(call_id):
    try:
        call = modal.FunctionCall.from_id(call_id)
    except Exception:
        return "unknown"
    try:
        call.get(timeout=0)
        return "ended"
    except modal.exception.FunctionTimeoutError:
        return "ended"
    except modal.exception.OutputExpiredError:
        return "unknown"
    except modal.exception.TimeoutError:
        return "pending"
    except modal.exception.RemoteError:
        # Pinned 1.2.1 raises this only for a received terminal GenericResult.
        return "ended"
    except (modal.exception.Error, GRPCError, OSError):
        # Transport/lookup/local decoding failures cannot prove producer termination.
        return "unknown"
    except Exception:
        # User-code exceptions are deserialized only after an output exists.
        return "ended"


@app.function(timeout=10, secrets=secrets)
@modal.asgi_app()
def api():
    from fastapi import FastAPI, HTTPException, Request
    from starlette.concurrency import run_in_threadpool
    from card_news.contract import ContractError, parse_json, validate_contract

    web = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    async def body(request):
        if not _authenticate(request.headers.get("authorization")):
            raise HTTPException(status_code=401, detail="Unauthorized")
        chunks = []
        total = 0
        async for chunk in request.stream():
            total += len(chunk)
            if total > 1024 * 1024:
                raise HTTPException(status_code=413, detail="Payload too large")
            chunks.append(chunk)
        raw = b"".join(chunks)
        try:
            return parse_json(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise HTTPException(status_code=422, detail="Invalid JSON") from None

    @web.post("/")
    async def accept(request: Request):
        payload = await body(request)
        try:
            validate_contract("input", payload)
            from card_news.policy import Deadline
            Deadline(payload["writeDeadlineAt"]).check()
        except (ContractError, KeyError, TypeError):
            raise HTTPException(status_code=422, detail="Invalid input") from None
        call = await process_card_news.spawn.aio(payload)
        return {"schemaVersion": 1, "status": "accepted", "call_id": call.object_id}

    @web.post("/status")
    async def status(request: Request):
        payload = await body(request)
        try:
            validate_contract("producerStatusRequest", payload)
        except (ContractError, KeyError, TypeError):
            raise HTTPException(status_code=422, detail="Invalid status reference") from None

        return {"schemaVersion": 1, "status": await run_in_threadpool(_producer_status, payload["modalCallId"])}

    return web


@app.function(cpu=2, memory=4096, timeout=600)
def verify_fixture_image():
    from card_news.verify_render import verify_fixture_suite
    result = verify_fixture_suite()
    result["executionEnvironment"] = "modal-cpu"
    return result


@app.function(cpu=2, memory=4096, timeout=2500, secrets=secrets)
def verify_model_projection(all_cases: bool = False):
    from card_news.verify_render import verify_model_smoke
    return verify_model_smoke(all_cases=all_cases)


@app.local_entrypoint()
def main(verify_fixtures: bool = False, verify_model: bool = False, all_model_cases: bool = False):
    if verify_fixtures == verify_model:
        raise ValueError("Choose exactly one of --verify-fixtures or --verify-model")
    if all_model_cases and not verify_model:
        raise ValueError("--all-model-cases requires --verify-model")
    if verify_fixtures:
        result = verify_fixture_image.remote()
        output = Path(tempfile.mkdtemp(prefix="card-news-qualification-"))
        for relative, content in result.pop("files").items():
            target = output / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        print(json.dumps({**result, "artifactDirectory": str(output)}, ensure_ascii=False))
    else:
        result = verify_model_projection.remote(all_cases=all_model_cases)
        output = Path(tempfile.mkdtemp(prefix="card-news-model-qualification-"))
        for relative, content in result.pop("files").items():
            target = output / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        (output / "qualification.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"schemaVersion": 1, "modelVersion": result["modelVersion"],
                          "modelCalls": result["modelCalls"], "semanticReview": "required",
                          "schemaValid": result["schemaValid"],
                          "renderValid": result["renderValid"],
                          "artifactDirectory": str(output)}, ensure_ascii=False))
        if not result["schemaValid"] or not result["renderValid"]:
            raise RuntimeError("Model contract verification failed; inspect the synthetic qualification artifact")
