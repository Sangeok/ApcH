"""Bounded network/process adapters. All object writes require a registered deadline."""
import hashlib
import os
from pathlib import Path
import subprocess
import time
from datetime import datetime, timezone

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, ConnectionClosedError, EndpointConnectionError, ReadTimeoutError
import requests

from card_news.contract import ContractError, parse_json, validate_manifest_binding
from card_news.layout import candidate_times
from card_news.policy import Deadline, timestamp


def post_callback(url, payload, deadline, session=None):
    secret = os.environ.get("CARD_NEWS_WEBHOOK_SECRET")
    if not secret:
        raise RuntimeError("CARD_NEWS_WEBHOOK_SECRET is not configured")
    session = session or requests.Session()
    last_error = None
    for attempt in range(3):
        try:
            response = session.post(url, json=payload, headers={"Authorization": f"Bearer {secret}"},
                                    timeout=(min(5, deadline.remaining()), min(15, deadline.remaining())),
                                    allow_redirects=False)
            if response.status_code in (408, 429) or response.status_code >= 500:
                raise requests.HTTPError("Transient callback failure", response=response)
            response.raise_for_status()
            if not 200 <= response.status_code < 300:
                raise ContractError("callback_rejected")
            return parse_json(response.text) if response.content else {}
        except (requests.ConnectionError, requests.Timeout, requests.HTTPError) as error:
            last_error = error
            status = error.response.status_code if getattr(error, "response", None) is not None else None
            if status is not None and status not in (408, 429) and status < 500:
                raise
            if attempt < 2:
                time.sleep(min(2 ** attempt, deadline.remaining()))
    raise RuntimeError("Callback delivery exhausted") from last_error


def create_s3_client():
    return boto3.client("s3", region_name=os.environ.get("AWS_DEFAULT_REGION", "ap-southeast-2"),
                        config=Config(connect_timeout=5, read_timeout=15,
                                      retries={"mode": "standard", "total_max_attempts": 1}))


def _retry_s3(operation, deadline):
    last_error = None
    for attempt in range(3):
        deadline.check()
        try:
            return operation()
        except ClientError as error:
            if error.response["Error"]["Code"] not in {"SlowDown", "RequestTimeout", "InternalError", "ServiceUnavailable", "500", "503"}:
                raise
            last_error = error
        except (ConnectionClosedError, EndpointConnectionError, ReadTimeoutError) as error:
            last_error = error
        if attempt < 2:
            time.sleep(min(2 ** attempt, deadline.remaining()))
    raise RuntimeError("S3 retry exhausted") from last_error


def download_object(s3, bucket, key, target, deadline, maximum_bytes=2 * 1024 ** 3, expected_sha256=None):
    def download():
        result = s3.get_object(Bucket=bucket, Key=key)
        stream = result["Body"]
        total = 0
        digest = hashlib.sha256()
        try:
            if result["ContentLength"] > maximum_bytes:
                raise ContractError("source_too_large")
            with Path(target).open("wb") as output:
                while True:
                    deadline.check()
                    block = stream.read(1024 * 1024)
                    if not block:
                        break
                    total += len(block)
                    if total > maximum_bytes:
                        raise ContractError("source_too_large")
                    digest.update(block)
                    output.write(block)
            if expected_sha256 and digest.hexdigest() != expected_sha256:
                raise ContractError("source_checksum_mismatch")
        finally:
            stream.close()
    _retry_s3(download, deadline)


def upload_object(s3, bucket, key, path, content_type, deadline):
    """UUID outputs are immutable; retries may only put the identical local bytes."""
    path = Path(path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    def upload():
        deadline.check()
        with path.open("rb") as body:
            s3.put_object(Bucket=bucket, Key=key, Body=body, ContentType=content_type,
                          ContentLength=path.stat().st_size, Metadata={"sha256": digest}, IfNoneMatch="*")
    try:
        _retry_s3(upload, deadline)
    except ClientError as error:
        if error.response["Error"]["Code"] not in {"PreconditionFailed", "412"}:
            raise
        existing = _retry_s3(lambda: s3.head_object(Bucket=bucket, Key=key), deadline)
        if (existing["ContentLength"] != path.stat().st_size or existing.get("ContentType") != content_type
                or existing.get("Metadata", {}).get("sha256") != digest):
            raise ContractError("immutable_output_conflict") from error
    return digest


def find_completed_manifest(s3, bucket, payload, deadline):
    """Avoid another paid model call when a previous immutable invocation already finished."""
    token = None
    pages = 0
    while True:
        arguments = {"Bucket": bucket, "Prefix": payload["outputPrefix"], "MaxKeys": 1000}
        if token:
            arguments["ContinuationToken"] = token
        page = _retry_s3(lambda: s3.list_objects_v2(**arguments), deadline)
        pages += 1
        for item in sorted(page.get("Contents", []), key=lambda item: item["Key"]):
            key = item["Key"]
            if not key.endswith("/manifest.json") or item["Size"] > 1024 * 1024:
                continue
            try:
                response = _retry_s3(lambda: s3.get_object(Bucket=bucket, Key=key), deadline)
                try:
                    manifest = parse_json(response["Body"].read(1024 * 1024 + 1).decode("utf-8"))
                finally:
                    response["Body"].close()
                validate_manifest_binding(manifest, payload)
                if key != payload["outputPrefix"] + manifest["invocationId"] + "/manifest.json":
                    continue
                complete = True
                for record in manifest["cards"] + manifest["coverCandidates"] + [manifest["zip"]]:
                    head = _retry_s3(lambda: s3.head_object(Bucket=bucket, Key=record["key"]), deadline)
                    if (head["ContentLength"] != record["sizeBytes"] or head.get("ContentType") != record["contentType"]
                            or head.get("Metadata", {}).get("sha256") != record["sha256"]):
                        complete = False
                        break
                if complete:
                    return key
            except (ContractError, ValueError, UnicodeError, KeyError):
                continue
            except ClientError as error:
                if error.response["Error"]["Code"] not in {"NoSuchKey", "NotFound", "404"}:
                    raise
        token = page.get("NextContinuationToken")
        if not page.get("IsTruncated"):
            return None
        if not token or pages >= 10:
            raise ContractError("output_inventory_limit")


def run_process(arguments, deadline, maximum_seconds=120):
    result = subprocess.run(arguments, capture_output=True, check=False,
                            timeout=deadline.remaining(maximum_seconds), shell=False)
    if result.returncode:
        # Do not propagate video paths/secret/source content through callbacks or logs.
        raise ContractError("media_process_failed")
    return result.stdout


def extract_candidates(source_path, source, output_dir, deadline):
    duration = float(run_process(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                  "-of", "default=noprint_wrappers=1:nokey=1", str(source_path)], deadline, 30))
    times = candidate_times(source["startSeconds"], source["endSeconds"], duration)
    output = {}
    for identifier, point in times:
        path = Path(output_dir) / f"{identifier}.jpg"
        run_process(["ffmpeg", "-nostdin", "-v", "error", "-ss", str(point), "-i", str(source_path),
                     "-frames:v", "1", "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease",
                     "-q:v", "2", "-y", str(path)], deadline, 90)
        if not path.exists() or not path.stat().st_size:
            raise ContractError("cover_extraction_failed")
        output[identifier] = path
    return output


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
