import ast
import hashlib
import json
import copy
import os
import tempfile
import time
import uuid
from pathlib import Path
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from card_news.contract import ContractError, validate_contract
from card_news.layout import LayoutError
from card_news.policy import Deadline, model_timeout_ms, timestamp
from card_news.prompt import build_prompt, normalize_model_output, provider_schema

ROOT = Path(__file__).resolve().parent


class CardNewsWiringTests(unittest.TestCase):
    def test_pure_modules_have_only_stdlib_and_local_pure_imports(self):
        forbidden = {"torch", "whisperx", "boto3", "PIL", "modal", "cv2", "requests", "google"}
        for name in ("contract", "prompt", "layout", "policy"):
            tree = ast.parse((ROOT / "card_news" / (name + ".py")).read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    modules = [item.name for item in node.names]
                elif isinstance(node, ast.ImportFrom):
                    modules = [node.module or ""]
                else:
                    continue
                self.assertFalse(any(module.split(".")[0] in forbidden for module in modules), (name, modules))

    def test_image_explicitly_includes_sources_schema_font_and_fixture_inputs(self):
        source = (ROOT / "card_news_app.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        methods = {node.func.attr for node in ast.walk(tree) if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)}
        self.assertTrue({"debian_slim", "pip_install_from_requirements", "apt_install", "add_local_python_source", "add_local_dir"} <= methods)
        for required in ("requirements-card-news.txt", "card_news/assets", "card_news/fixtures", "packages/db/contracts", '"card_news"'):
            self.assertIn(required, source)
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                self.assertNotIn((node.module or "").split(".")[0], {"main", "asd", "whisperx", "torch"})
            if isinstance(node, ast.Import):
                self.assertFalse(any(item.name.split(".")[0] in {"main", "asd", "whisperx", "torch"} for item in node.names))
        self.assertNotIn("gpu=", source)

    def test_font_hashes_license_and_pins_are_exact(self):
        assets = ROOT / "card_news/assets"
        manifest = json.loads((assets / "dependency-manifest.json").read_text(encoding="utf-8"))
        for filename, expected in manifest["fonts"].items():
            self.assertEqual(hashlib.sha256((assets / filename).read_bytes()).hexdigest(), expected)
        self.assertEqual(hashlib.sha256((assets / "OFL.txt").read_bytes()).hexdigest(), manifest["licenseSha256"])
        requirements = (ROOT / "requirements-card-news.txt").read_text(encoding="utf-8")
        for package, version in manifest["packages"].items():
            self.assertIn(f"{package}=={version}", requirements)

    def test_actual_status_adapter_does_not_turn_transport_errors_into_producer_end(self):
        tree = ast.parse((ROOT / "card_news_app.py").read_text(encoding="utf-8"))
        function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "_producer_status")
        class SdkError(Exception): pass
        class PollTimeout(SdkError): pass
        class FunctionTimeout(PollTimeout): pass
        class OutputExpired(PollTimeout): pass
        class RemoteFailure(SdkError): pass
        class TransportFailure(Exception): pass
        errors = SimpleNamespace(Error=SdkError, TimeoutError=PollTimeout, FunctionTimeoutError=FunctionTimeout,
                                 OutputExpiredError=OutputExpired, RemoteError=RemoteFailure)
        value = [None]
        def get(timeout):
            self.assertEqual(timeout, 0)
            if value[0] is not None:
                raise value[0]
            return {"privateResult": "must not escape"}
        namespace = {"modal": SimpleNamespace(exception=errors,
                     FunctionCall=SimpleNamespace(from_id=lambda call_id: SimpleNamespace(get=get))),
                     "GRPCError": TransportFailure}
        exec(compile(ast.Module(body=[function], type_ignores=[]), "actual-status-adapter", "exec"), namespace)
        for error, expected in ((None, "ended"), (PollTimeout(), "pending"), (FunctionTimeout(), "ended"),
                                (OutputExpired(), "unknown"), (RemoteFailure(), "ended"), (SdkError(), "unknown"),
                                (TransportFailure(), "unknown"), (ConnectionError(), "unknown"), (ValueError(), "ended")):
            value[0] = error
            with self.subTest(error=type(error).__name__):
                self.assertEqual(namespace["_producer_status"]("fc-fixture"), expected)

    def test_actual_orchestration_stages_repair_budget_and_free_render(self):
        """Adapter ordering only; actual JPEG/ZIP quality is qualified separately."""
        tree = ast.parse((ROOT / "card_news_app.py").read_text(encoding="utf-8"))
        function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "process_card_news")
        callback = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "_callback")
        function.decorator_list = []
        # Replace SDK boundaries without importing Modal/Pillow/boto3 into the stdlib runner.
        function.body = [node for node in function.body if not isinstance(node, (ast.Import, ast.ImportFrom))]
        cases = json.loads((ROOT.parents[1] / "packages/db/contracts/card-news-v1.fixtures.json").read_text(encoding="utf-8"))["cases"]
        initial = next(case["value"] for case in cases if case["definition"] == "input" and case["valid"] and case["value"]["mode"] == "generate")
        manifest = next(case["value"] for case in cases if case["definition"] == "manifest" and case["valid"])
        for scenario in ("normal", "layout-repair", "model-repair", "free-render", "free-overflow", "media-failure", "completed-reuse"):
            with self.subTest(scenario=scenario):
                payload = copy.deepcopy(initial)
                payload["writeDeadlineAt"] = "2099-01-01T00:00:00Z"
                if scenario in ("free-render", "free-overflow"):
                    payload.update(mode="render", draft=manifest["draftDocument"], coverCandidates=manifest["coverCandidates"])
                events = []
                model_calls = []
                renders = []
                def callback_adapter(url, notice, deadline):
                    validate_contract("callback", notice)
                    events.append(("callback", notice["stage"]))
                    return {"accepted": True, "writeDeadlineAt": payload["writeDeadlineAt"]}
                def s3_adapter():
                    self.assertEqual(events[0], ("callback", "accepted"))
                    return object()
                def model_adapter(**kwargs):
                    model_calls.append(kwargs)
                    events.append(("model", len(model_calls)))
                    draft = manifest["draftDocument"]
                    provider = {"outcome": "ready", "reason": "", "language": draft["language"],
                                "cards": [{key: value for key, value in card.items() if key != "provenance"} for card in draft["cards"]],
                                "caption": draft["caption"], "hashtags": draft["hashtags"]}
                    if scenario == "model-repair" and len(model_calls) == 1:
                        provider["cards"][0]["title"] = ""
                    return SimpleNamespace(text=json.dumps(provider), usage_metadata=None)
                class Client:
                    def __init__(self, **kwargs):
                        self.models = SimpleNamespace(generate_content=model_adapter)
                        self.options = kwargs
                    def __enter__(self): return self
                    def __exit__(self, *args): return False
                def download_adapter(s3, bucket, key, target, deadline, *args, **kwargs):
                    events.append(("download", key))
                    Path(target).write_bytes(b"unit-adapter-content")
                def extract_adapter(source_path, source, directory, deadline):
                    events.append(("extract", "covers"))
                    if scenario == "media-failure":
                        raise ContractError("media_process_failed")
                    output = {}
                    for point in (25, 50, 75):
                        path = Path(directory) / f"cover-{point}.jpg"
                        path.write_bytes(b"unit-adapter-content")
                        output[f"cover-{point}"] = path
                    return output
                def render_adapter(draft, candidates, directory):
                    renders.append(draft)
                    if scenario in ("layout-repair", "free-overflow") and len(renders) == 1:
                        raise LayoutError("cards[1].body")
                    directory.mkdir(parents=True, exist_ok=True)
                    paths = []
                    for index, card in enumerate(draft["cards"]):
                        path = directory / f"{index + 1:02d}-{card['role']}.jpg"
                        path.write_bytes(b"unit-adapter-content")
                        paths.append(path)
                    archive = directory / "card-news.zip"
                    archive.write_bytes(b"unit-adapter-content")
                    return paths, archive
                def record_adapter(path, key, identifier=None):
                    if scenario in ("free-render", "free-overflow") and identifier and identifier.startswith("cover-"):
                        return next(candidate for candidate in payload["coverCandidates"] if candidate["id"] == identifier)
                    data = path.read_bytes()
                    record = {"key": key, "sha256": hashlib.sha256(data).hexdigest(), "sizeBytes": len(data),
                              "contentType": "application/zip" if path.suffix == ".zip" else "image/jpeg"}
                    if identifier:
                        record.update(id=identifier, width=1280 if identifier.startswith("cover-") else 1080,
                                      height=720 if identifier.startswith("cover-") else 1350)
                    return record
                namespace = {"os": os, "json": json, "Path": Path, "tempfile": tempfile, "time": time, "uuid": uuid,
                    "ContractError": ContractError, "LayoutError": LayoutError, "validate_contract": validate_contract,
                    "Deadline": Deadline, "timestamp": timestamp, "model_timeout_ms": model_timeout_ms,
                    "build_prompt": build_prompt, "normalize_model_output": normalize_model_output, "provider_schema": provider_schema,
                    "post_callback": callback_adapter, "create_s3_client": s3_adapter, "download_object": download_adapter,
                    "extract_candidates": extract_adapter, "render_cards": render_adapter, "asset_record": record_adapter,
                    "upload_object": lambda *args: events.append(("upload", args[2])),
                    "find_completed_manifest": lambda *args: "previous-manifest.json" if scenario == "completed-reuse" else None,
                    "verify_dependencies": lambda: {key: payload[key] for key in ("templateVersion", "fontVersion", "promptVersion", "modelVersion")},
                    "modal": SimpleNamespace(current_function_call_id=lambda: "fc-unit-fixture"), "genai": SimpleNamespace(Client=Client),
                    "types": SimpleNamespace(HttpOptions=lambda **kwargs: kwargs, HttpRetryOptions=lambda **kwargs: kwargs,
                                             GenerateContentConfig=lambda **kwargs: kwargs)}
                exec(compile(ast.Module(body=[callback, function], type_ignores=[]), "actual-cpu-orchestration", "exec"), namespace)
                with patch.dict(os.environ, {"GEMINI_API_KEY": "unit-fixture-key"}):
                    outcome = namespace["process_card_news"](payload)
                stages = [value for kind, value in events if kind == "callback"]
                if scenario == "completed-reuse":
                    self.assertEqual(stages, ["accepted"])
                    self.assertEqual(model_calls, [])
                    self.assertEqual(outcome, {"outcome": "existing_manifest"})
                elif scenario == "media-failure":
                    self.assertEqual(stages, ["accepted", "generating-text", "extracting-cover", "failed"])
                    self.assertEqual(len(model_calls), 1)
                    self.assertEqual(outcome["failureCode"], "media_process_failed")
                elif scenario in ("free-render", "free-overflow"):
                    self.assertEqual(stages, ["accepted", "rendering", "packaging", "completed"] if scenario == "free-render"
                                     else ["accepted", "rendering", "failed"])
                    self.assertEqual(model_calls, [])
                    self.assertEqual([key for kind, key in events if kind == "download"], [candidate["key"] for candidate in payload["coverCandidates"]])
                else:
                    expected = ["accepted", "generating-text"]
                    if scenario == "model-repair": expected += ["generating-text"]
                    expected += ["extracting-cover", "rendering"]
                    if scenario == "layout-repair": expected += ["rendering"]
                    self.assertEqual(stages, expected + ["packaging", "completed"])
                    self.assertEqual(len(model_calls), 2 if scenario in ("layout-repair", "model-repair") else 1)
                    self.assertEqual(len([event for event in events if event[0] == "extract"]), 1)
                    self.assertLess(next(i for i, event in enumerate(events) if event[0] == "model"),
                                    next(i for i, event in enumerate(events) if event[0] == "extract"))


if __name__ == "__main__":
    unittest.main()
