"""stdlib-only time budgets, independent of Modal and network SDKs."""
from datetime import datetime
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
