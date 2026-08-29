"""temp_cleanup_policy 순수 함수 검증 (stdlib unittest만).

main.py는 import하지 않는다 — torch/boto3가 필요해져 러너가 돌지 않는다.
BUG-04: 임시 디렉터리 정리 정책의 판단 로직을 stdlib-only로 검증한다.
"""

import unittest

from temp_cleanup_policy import parse_keep_on_failure, should_cleanup_temp_dir


class ParseKeepOnFailureTests(unittest.TestCase):
    def test_truthy_values_return_true(self):
        # 대소문자·앞뒤공백 무시하고 켜짐으로 판정하는 값들
        self.assertTrue(parse_keep_on_failure("1"))
        self.assertTrue(parse_keep_on_failure("true"))
        self.assertTrue(parse_keep_on_failure("yes"))
        self.assertTrue(parse_keep_on_failure("on"))
        self.assertTrue(parse_keep_on_failure("TRUE"))
        self.assertTrue(parse_keep_on_failure(" true "))

    def test_falsy_and_unknown_values_return_false(self):
        # 빈 문자열·명시적 off·미지 문자열은 전부 꺼짐
        self.assertFalse(parse_keep_on_failure(""))
        self.assertFalse(parse_keep_on_failure("0"))
        self.assertFalse(parse_keep_on_failure("false"))
        self.assertFalse(parse_keep_on_failure("no"))
        self.assertFalse(parse_keep_on_failure("maybe"))

    def test_non_string_returns_false(self):
        # None(미설정)·비문자열은 기본 '항상 정리' 동작으로 떨어진다
        self.assertFalse(parse_keep_on_failure(None))
        self.assertFalse(parse_keep_on_failure(1))
        self.assertFalse(parse_keep_on_failure(True))


class ShouldCleanupTempDirTests(unittest.TestCase):
    def test_success_always_cleans(self):
        # 성공은 스위치와 무관하게 항상 정리 (warm 컨테이너 /tmp 누적 방지)
        self.assertTrue(should_cleanup_temp_dir(True, False))
        self.assertTrue(should_cleanup_temp_dir(True, True))

    def test_failure_default_cleans(self):
        # 기본(보존 스위치 off): 실패도 정리 — 현 프로덕션 동작 보존
        self.assertTrue(should_cleanup_temp_dir(False, False))

    def test_failure_with_keep_preserves(self):
        # 보존 켜짐 + 실패 → 보존(정리 안 함)
        self.assertFalse(should_cleanup_temp_dir(False, True))


if __name__ == "__main__":
    unittest.main()
