"""stdlib-only validation of the canonical v1 schema subset and cross-field rules.

This deliberately supports only the keywords used by the checked-in contract.
An unknown schema keyword fails closed; it is not a general JSON Schema engine.
"""
import hashlib
import json
import math
import os
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit
import uuid


class ContractError(ValueError):
    def __init__(self, code, field="$", message="Invalid card-news contract"):
        self.code = code
        self.field = field
        super().__init__(f"{code}: {field}: {message}")


def parse_json(text):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ContractError("duplicate_key", key)
            result[key] = value
        return result
    def invalid_constant(value):
        raise ContractError("non_finite", value)
    return json.loads(text, object_pairs_hook=pairs, parse_constant=invalid_constant)


def schema_path():
    configured = os.environ.get("CARD_NEWS_SCHEMA_PATH")
    if configured:
        return Path(configured)
    deployed = Path("/root/card-news-contracts/card-news-v1.schema.json")
    if deployed.exists():
        return deployed
    return Path(__file__).resolve().parents[3] / "packages/db/contracts/card-news-v1.schema.json"


def load_schema():
    return parse_json(schema_path().read_text(encoding="utf-8"))


def _json_type(value, expected):
    checks = {
        "object": lambda: isinstance(value, dict),
        "array": lambda: isinstance(value, list),
        "string": lambda: isinstance(value, str),
        "null": lambda: value is None,
        "boolean": lambda: isinstance(value, bool),
        "integer": lambda: isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value) and int(value) == value,
        "number": lambda: isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value),
    }
    return checks[expected]()


def _validate(value, definition, root, field):
    supported = {"$ref", "$id", "$schema", "$defs", "title", "description", "type",
                 "properties", "required", "additionalProperties", "items", "enum", "const",
                 "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength",
                 "maxLength", "minItems", "maxItems", "uniqueItems", "pattern", "format",
                 "anyOf", "oneOf", "allOf", "default", "examples"}
    unknown = set(definition) - supported
    if unknown:
        raise ContractError("unsupported_schema_keyword", field, str(sorted(unknown)))
    if "$ref" in definition:
        target = root
        for segment in definition["$ref"].removeprefix("#/").split("/"):
            target = target[segment]
        _validate(value, target, root, field)
    for keyword in ("anyOf", "oneOf"):
        if keyword in definition:
            successes = 0
            for branch in definition[keyword]:
                try:
                    _validate(value, branch, root, field)
                    successes += 1
                except ContractError:
                    pass
            if successes < 1 or (keyword == "oneOf" and successes != 1):
                raise ContractError("invalid_union", field)
    for branch in definition.get("allOf", []):
        _validate(value, branch, root, field)
    if "type" in definition:
        allowed = definition["type"]
        if not isinstance(allowed, list):
            allowed = [allowed]
        if not any(_json_type(value, kind) for kind in allowed):
            raise ContractError("invalid_type", field)
    if "const" in definition and value != definition["const"]:
        raise ContractError("invalid_constant", field)
    if "enum" in definition and value not in definition["enum"]:
        raise ContractError("invalid_enum", field)
    if isinstance(value, dict):
        properties = definition.get("properties", {})
        for key in definition.get("required", []):
            if key not in value:
                raise ContractError("missing_field", f"{field}.{key}")
        if definition.get("additionalProperties") is False and set(value) - set(properties):
            raise ContractError("unexpected_field", field)
        for key, item in value.items():
            if key in properties:
                _validate(item, properties[key], root, f"{field}.{key}")
    if isinstance(value, list):
        if len(value) < definition.get("minItems", 0) or len(value) > definition.get("maxItems", math.inf):
            raise ContractError("invalid_count", field)
        if definition.get("uniqueItems") and len({canonical_json(x) for x in value}) != len(value):
            raise ContractError("duplicate_item", field)
        for index, item in enumerate(value):
            if "items" in definition:
                _validate(item, definition["items"], root, f"{field}[{index}]")
    if isinstance(value, str):
        # JSON Schema string lengths count Unicode code points, as Python len does.
        if len(value) < definition.get("minLength", 0) or len(value) > definition.get("maxLength", math.inf):
            raise ContractError("invalid_length", field)
        if "pattern" in definition and not re.search(definition["pattern"], value):
            raise ContractError("invalid_pattern", field)
        if definition.get("format") == "date-time":
            try:
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})", value):
                    raise ValueError("RFC3339 date-time required")
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    raise ValueError("timezone required")
            except ValueError as error:
                raise ContractError("invalid_datetime", field) from error
        if definition.get("format") == "uri" and not urlsplit(value).scheme:
            raise ContractError("invalid_uri", field)
        if definition.get("format") == "uuid":
            try:
                if str(uuid.UUID(value)) != value.lower():
                    raise ValueError("Noncanonical UUID")
            except ValueError as error:
                raise ContractError("invalid_uuid", field) from error
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if not math.isfinite(value):
            raise ContractError("non_finite", field)
        for keyword, invalid in (("minimum", lambda limit: value < limit),
                                 ("maximum", lambda limit: value > limit),
                                 ("exclusiveMinimum", lambda limit: value <= limit),
                                 ("exclusiveMaximum", lambda limit: value >= limit)):
            if keyword in definition and invalid(definition[keyword]):
                raise ContractError("invalid_range", field)


def canonical_json(value):
    """Canonical object ordering with ECMAScript's finite number formatting."""
    if isinstance(value, dict):
        return "{" + ",".join(json.dumps(key, ensure_ascii=False) + ":" + canonical_json(value[key])
                              for key in sorted(value)) + "}"
    if isinstance(value, list):
        return "[" + ",".join(canonical_json(item) for item in value) + "]"
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ContractError("non_finite")
        if value == 0:
            return "0"
        # Values in the source contract are bounded timestamps, not arbitrary doubles.
        if value.is_integer() and abs(value) < 1e21:
            return str(int(value))
        rendered = repr(value)
        if "e" in rendered:
            mantissa, exponent = rendered.split("e")
            exponent = int(exponent)
            if -6 <= exponent < 21:
                from decimal import Decimal
                return format(Decimal(rendered), "f")
            return mantissa.removesuffix(".0") + "e" + ("+" if exponent >= 0 else "-") + str(abs(exponent))
        return rendered
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def source_hash(source):
    return hashlib.sha256(canonical_json(source).encode("utf-8")).hexdigest()


def split_source_sentences(text):
    return [part.strip() for part in re.split(r"(?<=[.!?。！？])\s+|\r?\n+", text.strip()) if part.strip()]


def safe_key(key):
    if not isinstance(key, str) or not key or key.startswith("/") or "\\" in key:
        return False
    return all(part not in ("", ".", "..") for part in key.split("/"))


def validate_draft(draft, source=None):
    cards = draft["cards"]
    if not 3 <= len(cards) <= 7 or cards[0]["role"] != "cover" or cards[-1]["role"] != "summary":
        raise ContractError("invalid_roles", "cards")
    if any(card["role"] != "body" for card in cards[1:-1]):
        raise ContractError("invalid_roles", "cards")
    if len({card["id"] for card in cards}) != len(cards):
        raise ContractError("duplicate_card_id", "cards")
    count = source["sourceSentenceCount"] if source else None
    if not draft["caption"].strip():
        raise ContractError("blank_caption")
    if len(set(draft["hashtags"])) != len(draft["hashtags"]):
        raise ContractError("duplicate_hashtag")
    for index, card in enumerate(cards):
        ids = card["sourceSentenceIds"]
        if not card["title"].strip():
            raise ContractError("blank_title", f"cards[{index}]")
        if len(set(ids)) != len(ids):
            raise ContractError("duplicate_evidence", f"cards[{index}]")
        if card["provenance"] == "ai" and not ids:
            raise ContractError("missing_evidence", f"cards[{index}]")
        if count is not None and any(identifier >= count for identifier in ids):
            raise ContractError("invalid_evidence", f"cards[{index}]")
    if source and draft["language"] != source["language"]:
        raise ContractError("language_mismatch", "language")


def validate_contract(definition, value, schema=None):
    root = schema or load_schema()
    _validate(value, root["$defs"][definition], root, "$")
    if definition == "source":
        if not 0 <= value["startSeconds"] < value["endSeconds"]:
            raise ContractError("invalid_source_interval")
        if not value["scriptText"].strip() or value["sourceSentenceCount"] != len(split_source_sentences(value["scriptText"])):
            raise ContractError("invalid_source_sentences")
        if not all(safe_key(value[key]) for key in ("s3Key", "clipS3Key")):
            raise ContractError("invalid_source_key")
    elif definition == "draft":
        validate_draft(value)
    elif definition == "callback":
        if value["outcome"] == "started" and not value["modalCallId"]:
            raise ContractError("missing_call_id")
        if value["outcome"] == "completed" and (not value["manifestKey"] or value["failureCode"] is not None
                                                or value["stage"] != "completed"):
            raise ContractError("invalid_completion_callback")
        if value["outcome"] == "failed" and (not value["failureCode"] or value["manifestKey"] is not None
                                             or value["stage"] != "failed"):
            raise ContractError("invalid_failure_callback")
        if value["outcome"] in ("started", "progress") and (value["manifestKey"] is not None or value["failureCode"] is not None):
            raise ContractError("unexpected_callback_output")
    elif definition == "input":
        validate_contract("source", value["source"], root)
        if source_hash(value["source"]) != value["sourceHash"]:
            raise ContractError("source_hash_mismatch")
        expected = f"card-news/{value['userId']}/{value['setId']}/{value['jobId']}/e{value['executionEpoch']}/"
        if value["outputPrefix"] != expected or not safe_key(expected.rstrip("/")):
            raise ContractError("invalid_output_prefix")
        callback = urlsplit(value["callbackUrl"])
        if callback.scheme != "https" or not callback.netloc or callback.username or callback.password or callback.fragment:
            raise ContractError("invalid_callback_url")
        if value["mode"] == "generate":
            if value["draft"] is not None or value["coverCandidates"] or value["revision"] != 1:
                raise ContractError("invalid_generate_snapshot")
        else:
            if value["draft"] is None:
                raise ContractError("missing_draft")
            validate_contract("draft", value["draft"], root)
            validate_draft(value["draft"], value["source"])
            candidates = value["coverCandidates"]
            if {item["id"] for item in candidates} != {"cover-25", "cover-50", "cover-75"} or len(candidates) != 3:
                raise ContractError("invalid_cover_candidates")
            parent = f"card-news/{value['userId']}/{value['setId']}/"
            if any(not item["key"].startswith(parent) or not safe_key(item["key"]) for item in candidates):
                raise ContractError("invalid_cover_key")
    elif definition == "manifest":
        validate_contract("draft", value["draftDocument"], root)
        cards = value["cards"]
        if [card["id"] for card in cards] != [card["id"] for card in value["draftDocument"]["cards"]]:
            raise ContractError("manifest_order_mismatch")
        if value["caption"] != value["draftDocument"]["caption"] or value["hashtags"] != value["draftDocument"]["hashtags"]:
            raise ContractError("manifest_caption_mismatch")
        assets = cards + value["coverCandidates"] + [value["zip"]]
        keys = [item["key"] for item in assets]
        if len(set(keys)) != len(keys) or any(not safe_key(key) for key in keys):
            raise ContractError("invalid_manifest_keys")
        if {item["id"] for item in value["coverCandidates"]} != {"cover-25", "cover-50", "cover-75"}:
            raise ContractError("invalid_cover_candidates")
    return value


def validate_manifest_binding(manifest, payload):
    validate_contract("manifest", manifest)
    for key in ("jobId", "executionEpoch", "revision", "sourceHash", "templateVersion", "fontVersion", "promptVersion", "modelVersion"):
        if manifest[key] != payload[key]:
            raise ContractError("manifest_input_mismatch", key)
    prefix = payload["outputPrefix"] + manifest["invocationId"] + "/"
    if any(not record["key"].startswith(prefix) for record in manifest["cards"] + [manifest["zip"]]):
        raise ContractError("manifest_prefix_mismatch")
    if payload["mode"] == "generate":
        if any(not record["key"].startswith(prefix) for record in manifest["coverCandidates"]):
            raise ContractError("manifest_cover_prefix_mismatch")
        if manifest["draftDocument"]["theme"] != payload["initialTheme"] or any(
                card["provenance"] != "ai" for card in manifest["draftDocument"]["cards"]):
            raise ContractError("invalid_generated_draft")
    elif (canonical_json(manifest["draftDocument"]) != canonical_json(payload["draft"])
          or canonical_json(manifest["coverCandidates"]) != canonical_json(payload["coverCandidates"])):
        raise ContractError("render_snapshot_mismatch")
    validate_draft(manifest["draftDocument"], payload["source"])
    return manifest
