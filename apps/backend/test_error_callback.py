"""error_callback 순수 모듈 테스트 (stdlib-only).

main.py는 import하지 않는다 — torch/whisperx가 필요해져 러너가 돌지 않는다.
BUG-08: 에러 콜백이 clips: []를 하드코딩해 부분 성공을 유실하던 회귀를 못박는다.
"""

import unittest

from error_callback import build_error_callback_payload, ERROR_STATUS


class BuildErrorCallbackPayloadTest(unittest.TestCase):
    def _sample_clips(self):
        return [
            {"index": 0, "s3Key": "out/0.mp4", "youtubeTitle": "첫 클립"},
            {"index": 1, "s3Key": "out/1.mp4", "youtubeTitle": "둘째 클립"},
        ]

    def test_partial_clips_preserved_in_order(self):
        # 부분 성공 유실 방지의 핵심 회귀: 완성된 앞쪽 클립이 순서대로 실린다.
        clips = self._sample_clips()
        payload = build_error_callback_payload(
            uploaded_file_id="uf-1",
            attempt=1,
            mode="auto",
            error="boom",
            clip_results=clips,
        )
        self.assertEqual(payload["clips"], clips)
        self.assertEqual([c["index"] for c in payload["clips"]], [0, 1])

    def test_empty_clip_results_yields_empty_list(self):
        # 기존 하드코딩 동작과 동치 (클립 루프 진입 전 실패).
        payload = build_error_callback_payload("uf-1", 1, "auto", "boom", [])
        self.assertEqual(payload["clips"], [])

    def test_none_clip_results_yields_empty_list(self):
        payload = build_error_callback_payload("uf-1", 1, "auto", "boom", None)
        self.assertEqual(payload["clips"], [])

    def test_clips_is_shallow_copy_not_same_object(self):
        # 반환 후 원본을 append해도 payload가 안 바뀐다 (얕은 복사).
        clips = self._sample_clips()
        payload = build_error_callback_payload("uf-1", 1, "auto", "boom", clips)
        self.assertIsNot(payload["clips"], clips)
        clips.append({"index": 2, "s3Key": "out/2.mp4"})
        self.assertEqual(len(payload["clips"]), 2)

    def test_status_is_error_literal(self):
        payload = build_error_callback_payload("uf-1", 1, "auto", "boom", None)
        self.assertEqual(payload["status"], "error")
        self.assertEqual(payload["status"], ERROR_STATUS)

    def test_phase_reflects_mode(self):
        for mode in ("auto", "render", "analyze"):
            payload = build_error_callback_payload("uf-1", 1, mode, "boom", None)
            self.assertEqual(payload["phase"], mode)

    def test_error_string_passed_through(self):
        payload = build_error_callback_payload("uf-1", 1, "auto", "S3 upload failed", None)
        self.assertEqual(payload["error"], "S3 upload failed")

    def test_uploaded_file_id_and_attempt_passed_through(self):
        payload = build_error_callback_payload("uf-42", 3, "auto", "boom", None)
        self.assertEqual(payload["uploadedFileId"], "uf-42")
        self.assertEqual(payload["attempt"], 3)

    def test_payload_key_set_is_exact(self):
        payload = build_error_callback_payload("uf-1", 1, "auto", "boom", None)
        self.assertEqual(
            set(payload.keys()),
            {"uploadedFileId", "attempt", "status", "phase", "error", "clips"},
        )


if __name__ == "__main__":
    unittest.main()
