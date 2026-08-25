"""s3_upload_policy 순수 함수 단위 테스트 (stdlib unittest, torch·boto3 불필요).

main.py는 import하지 않는다 — whisperx→torch 의존 때문에 맨 파이썬으로 돌지 않는다.
"""

import unittest

from s3_upload_policy import (
    RETRIABLE_ERROR_CODES,
    DEFAULT_MAX_ATTEMPTS,
    is_retriable_error,
    should_retry,
    next_backoff,
    format_upload_error,
)


class IsRetriableErrorTests(unittest.TestCase):
    def test_transport_error_is_always_retriable(self):
        # transport_error면 코드와 무관하게 재시도 대상 (코드 None·영구코드에서도)
        self.assertTrue(is_retriable_error(None, transport_error=True))
        self.assertTrue(is_retriable_error("AccessDenied", transport_error=True))

    def test_known_transient_codes_are_retriable(self):
        self.assertTrue(is_retriable_error("SlowDown"))
        self.assertTrue(is_retriable_error("503"))
        self.assertTrue(is_retriable_error("ServiceUnavailable"))

    def test_permanent_codes_are_not_retriable(self):
        self.assertFalse(is_retriable_error("AccessDenied"))
        self.assertFalse(is_retriable_error("NoSuchBucket"))

    def test_none_code_without_transport_is_not_retriable(self):
        self.assertFalse(is_retriable_error(None, transport_error=False))


class ShouldRetryTests(unittest.TestCase):
    def test_retriable_with_attempts_left(self):
        self.assertTrue(should_retry(1, True, max_attempts=3))

    def test_retriable_but_attempts_exhausted(self):
        self.assertFalse(should_retry(3, True, max_attempts=3))

    def test_retriable_but_attempt_over_max(self):
        self.assertFalse(should_retry(4, True, max_attempts=3))

    def test_not_retriable_never_retries(self):
        self.assertFalse(should_retry(1, False, max_attempts=3))

    def test_default_max_attempts_is_three(self):
        # 기본 max_attempts로 3번째 시도는 소진
        self.assertTrue(should_retry(2, True))
        self.assertFalse(should_retry(DEFAULT_MAX_ATTEMPTS, True))


class NextBackoffTests(unittest.TestCase):
    def test_exponential_growth(self):
        self.assertEqual(next_backoff(1), 1.0)
        self.assertEqual(next_backoff(2), 2.0)
        self.assertEqual(next_backoff(3), 4.0)

    def test_large_attempt_clamped_to_cap(self):
        self.assertEqual(next_backoff(100), 30.0)

    def test_huge_attempt_does_not_overflow(self):
        # 클램프가 없으면 2**4999의 float 변환이 OverflowError를 던진다 (돌연변이 M5 방어).
        self.assertEqual(next_backoff(5000), 30.0)

    def test_non_positive_attempt_is_zero(self):
        self.assertEqual(next_backoff(0), 0.0)
        self.assertEqual(next_backoff(-1), 0.0)


class FormatUploadErrorTests(unittest.TestCase):
    def test_message_contains_all_fields(self):
        msg = format_upload_error("upload", "clips/clip_0_kr.mp4", 3, "SlowDown boom")
        self.assertIn("upload", msg)
        self.assertIn("clips/clip_0_kr.mp4", msg)
        self.assertIn("3", msg)
        self.assertIn("SlowDown boom", msg)


class RetriableSetSanityTests(unittest.TestCase):
    def test_permanent_codes_absent_from_set(self):
        self.assertNotIn("AccessDenied", RETRIABLE_ERROR_CODES)
        self.assertNotIn("NoSuchBucket", RETRIABLE_ERROR_CODES)


if __name__ == "__main__":
    unittest.main()
