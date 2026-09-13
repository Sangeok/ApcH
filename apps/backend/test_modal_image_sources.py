"""Modal 이미지 등록 누락 방어 (stdlib unittest).

main.py는 import하지 않는다 — whisperx→torch 의존 때문에 맨 파이썬으로 돌지 않는다.
대신 텍스트로 읽어, import하는 로컬 모듈이 전부 add_local_python_source에 올라 있는지 본다.
등록이 빠진 모듈은 로컬 테스트는 통과하고 배포된 컨테이너만 시작 시 ModuleNotFoundError로 죽는다.
"""

import pathlib
import re
import unittest

BACKEND_DIR = pathlib.Path(__file__).resolve().parent


class ModalImageSourcesTest(unittest.TestCase):
    def test_every_local_module_imported_by_main_is_in_modal_image(self):
        src = (BACKEND_DIR / "main.py").read_text(encoding="utf-8")
        imported = set(re.findall(r"^\s*(?:from|import) (\w+)", src, re.M))
        local = {name for name in imported if (BACKEND_DIR / f"{name}.py").is_file()}
        self.assertTrue(local, "로컬 모듈 import가 하나도 안 잡히면 정규식이 깨진 것이다")
        match = re.search(r"add_local_python_source\(([^)]*)\)", src)
        self.assertIsNotNone(match, "add_local_python_source 호출을 찾지 못했다")
        registered = set(re.findall(r'"(\w+)"', match.group(1)))
        self.assertEqual(local - registered, set())


if __name__ == "__main__":
    unittest.main()
