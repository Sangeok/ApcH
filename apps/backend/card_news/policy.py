"""stdlib-only time budgets, independent of Modal and network SDKs."""
from datetime import datetime
import re
import time

from card_news.contract import ContractError


def timestamp(value):
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("Deadline must have a timezone")
    return result.timestamp()


class Deadline:
    def __init__(self, deadline_at, clock=time.time):
        self.end = timestamp(deadline_at)
        self.clock = clock

    def remaining(self, maximum=120):
        remaining = self.end - self.clock()
        if remaining <= 0:
            raise ContractError("write_deadline_exceeded")
        return min(maximum, remaining)

    def check(self):
        self.remaining()


def model_timeout_ms(deadline):
    seconds = deadline.remaining(120)
    # Never round a nearly expired budget to the SDK's ambiguous timeout=0.
    if seconds < 1:
        raise ContractError("write_deadline_exceeded")
    return int(seconds * 1000)


def callback_failure_code(error):
    """failureCode for a failed callback.

    The web contract accepts only ^[A-Za-z0-9_-]{1,160}$ strings and rejects the whole callback
    otherwise. SDK errors carry non-string codes (google-genai APIError.code is the HTTP status
    int), and a rejected failed callback leaves the job waiting for its 15-minute deadline.
    """
    code = getattr(error, "code", None)
    if isinstance(code, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,160}", code):
        return code
    return "cpu_job_failed"
