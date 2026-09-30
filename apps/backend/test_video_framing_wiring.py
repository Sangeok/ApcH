"""여백 전달 경로 배선 unittest (stdlib only).

main.py는 import하지 않는다 — whisperx→torch 의존 때문에 맨 파이썬으로 돌지 않는다.
대신 ast로 읽어 FEAT-58의 전달 경로가 끊기지 않았는지 본다: HTTP 필드 →
spawn/remote → _do_process_video → process_clip → create_vertical_video, 그리고
중앙 합성 분기(양수 여백, 또는 9:16보다 세로로 긴 source의 0% — BUG-16)가 기존 모드 선택보다
앞에서 continue로 끝나는지(그 밖의 0%는 기존 경로 그대로).
어느 keyword 하나가 빠져도 로컬 게이트는 통과하고 운영에서만 조용히 0으로 렌더된다.
"""

import ast
import pathlib
import unittest

SOURCE = (pathlib.Path(__file__).resolve().parent / "main.py").read_text(encoding="utf-8")
TREE = ast.parse(SOURCE)


def calls_named(name):
    found = []
    for node in ast.walk(TREE):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if (isinstance(func, ast.Attribute) and func.attr == name) or (isinstance(func, ast.Name) and func.id == name):
            found.append(node)
    return found


def keyword_source(call, name):
    return next((ast.unparse(k.value) for k in call.keywords if k.arg == name), None)


def function(name):
    return next(n for n in ast.walk(TREE) if isinstance(n, ast.FunctionDef) and n.name == name)


class VideoFramingWiringTest(unittest.TestCase):
    def test_http_field_is_strict_int_defaulting_to_zero(self):
        model = next(n for n in TREE.body if isinstance(n, ast.ClassDef) and n.name == "ProcessVideoRequest")
        field = next(
            s for s in model.body
            if isinstance(s, ast.AnnAssign) and s.target.id == "video_padding_percent"
        )
        self.assertEqual(ast.unparse(field.annotation), "StrictInt")
        self.assertEqual(ast.unparse(field.value), "0")

    def test_spawn_and_remote_forward_the_request_value(self):
        for method in ("spawn", "remote"):
            with self.subTest(method=method):
                (call,) = calls_named(method)
                self.assertEqual(keyword_source(call, "video_padding_percent"), "request.video_padding_percent")

    def test_worker_forwards_to_process_clip(self):
        self.assertEqual(function("_do_process_video").args.args[-1].arg, "video_padding_percent")
        (call,) = calls_named("process_clip")
        self.assertEqual(
            keyword_source(call, "video_padding_percent"),
            "resolve_video_padding_percent(video_padding_percent)",
        )

    def test_process_clip_forwards_to_the_renderer(self):
        self.assertEqual(function("process_clip").args.args[-1].arg, "video_padding_percent")
        (call,) = calls_named("create_vertical_video")
        self.assertEqual(keyword_source(call, "video_padding_percent"), "video_padding_percent")

    def test_positive_branch_precedes_mode_selection_and_continues(self):
        frame_loop = next(
            n for n in ast.walk(function("create_vertical_video"))
            if isinstance(n, ast.For) and "flist" in ast.unparse(n.iter)
        )
        tests = [ast.unparse(s.test) if isinstance(s, ast.If) else None for s in frame_loop.body]
        positive = tests.index(
            "needs_centered_composition(padding_percent, source_width, source_height)"
        )
        mode_selection = tests.index("max_score_face")
        self.assertLess(positive, mode_selection)
        self.assertIsInstance(frame_loop.body[positive].body[-1], ast.Continue)


if __name__ == "__main__":
    unittest.main()
