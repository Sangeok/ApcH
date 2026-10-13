import copy
import json
from pathlib import Path
import unittest

from card_news.contract import ContractError, canonical_json, load_schema, parse_json, source_hash, validate_contract, validate_manifest_binding
from card_news.policy import Deadline, model_timeout_ms


class CardNewsContractTests(unittest.TestCase):
    def test_all_shared_verdicts(self):
        directory = Path(__file__).resolve().parents[2] / "packages/db/contracts"
        fixture = json.loads((directory / "card-news-v1.fixtures.json").read_text(encoding="utf-8"))
        self.assertGreater(len(fixture["cases"]), 0)
        for case in fixture["cases"]:
            with self.subTest(case=case["name"]):
                if case["valid"]:
                    validate_contract(case["definition"], case["value"])
                else:
                    with self.assertRaises(ContractError):
                        validate_contract(case["definition"], case["value"])

    def test_duplicate_keys_and_non_finite_json_fail_closed(self):
        for document in ('{"a":1,"a":2}', '{"a":NaN}', '{"a":Infinity}'):
            with self.assertRaises(ContractError):
                parse_json(document)

    def test_astral_script_length_uses_json_schema_code_points(self):
        directory = Path(__file__).resolve().parents[2] / "packages/db/contracts"
        cases = json.loads((directory / "card-news-v1.fixtures.json").read_text(encoding="utf-8"))["cases"]
        source = copy.deepcopy(next(case["value"] for case in cases if case["name"] == "source-valid"))
        source["scriptText"] = "\U0001f600" * 100000
        source["sourceSentenceCount"] = 1
        self.assertEqual(len(source["scriptText"]), 100000)
        validate_contract("source", source)
        source["scriptText"] += "\U0001f600"
        with self.assertRaises(ContractError):
            validate_contract("source", source)

    def test_canonical_hash_orders_nested_keys_and_ecmascript_numbers(self):
        self.assertEqual(canonical_json({"z": 1.0, "a": {"b": 0.000001, "a": -0.0}}),
                         '{"a":{"a":0,"b":0.000001},"z":1}')
        self.assertEqual(canonical_json(1e-7), "1e-7")
        self.assertEqual(canonical_json(1e21), "1e+21")
        self.assertEqual(source_hash({"a": 1, "b": "한글"}), source_hash({"b": "한글", "a": 1.0}))

    def test_unknown_schema_keyword_is_not_silently_ignored(self):
        with self.assertRaises(ContractError):
            validate_contract("value", {}, {"$defs": {"value": {"type": "object", "madeUpKeyword": True}}})

    def test_injected_clock_limits_model_and_rejects_expired_writes(self):
        deadline = Deadline("2030-01-01T00:00:00Z", clock=lambda: 1893455800)
        self.assertEqual(model_timeout_ms(deadline), 120000)
        deadline.clock = lambda: 1893455990
        self.assertEqual(model_timeout_ms(deadline), 10000)
        deadline.clock = lambda: 1893455999.9
        with self.assertRaises(ContractError):
            model_timeout_ms(deadline)
        deadline.clock = lambda: 1893456000
        with self.assertRaises(ContractError):
            deadline.check()

    def test_candidate_reuse_requires_same_revision_source_prefix_and_draft(self):
        directory = Path(__file__).resolve().parents[2] / "packages/db/contracts"
        cases = json.loads((directory / "card-news-v1.fixtures.json").read_text(encoding="utf-8"))["cases"]
        payload = next(case["value"] for case in cases if case["definition"] == "input" and case["valid"] and case["value"]["mode"] == "generate")
        manifest = next(case["value"] for case in cases if case["definition"] == "manifest" and case["valid"])
        validate_manifest_binding(manifest, payload)
        for key, value in (("revision", 2), ("sourceHash", "b" * 64), ("fontVersion", "another-font")):
            with self.subTest(key=key), self.assertRaises(ContractError):
                validate_manifest_binding({**manifest, key: value}, payload)
        changed = copy.deepcopy(manifest)
        changed["cards"][0]["key"] = "card-news/another-user/output.jpg"
        with self.assertRaises(ContractError):
            validate_manifest_binding(changed, payload)
        render = {**payload, "mode": "render", "draft": manifest["draftDocument"], "coverCandidates": manifest["coverCandidates"]}
        validate_manifest_binding(manifest, render)
        changed = copy.deepcopy(manifest)
        changed["draftDocument"]["cards"][1]["body"] = "Manual change after this render started"
        with self.assertRaises(ContractError):
            validate_manifest_binding(changed, render)


if __name__ == "__main__":
    unittest.main()
