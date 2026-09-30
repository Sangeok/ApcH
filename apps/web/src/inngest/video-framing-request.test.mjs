import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { requestVideoFraming } from "./video-framing-request.ts";

// Modal 요청의 video_padding_percent — auto·render 공통(FEAT-58). 백엔드
// ProcessVideoRequest.video_padding_percent: StrictInt = 0과 묶인 wire 계약이다.
// 키 이름이 어긋나면 pydantic이 모르는 키를 버려 조용히 0으로 렌더된다.
describe("requestVideoFraming", () => {
  for (const [snapshot, expected] of [
    [0, 0],
    [10, 10],
    [25, 25],
  ]) {
    it(`serializes a ${snapshot} snapshot as video_padding_percent=${expected}`, () => {
      const body = JSON.parse(JSON.stringify({ ...requestVideoFraming(snapshot) }));
      assert.deepEqual(body, { video_padding_percent: expected });
    });
  }

  // 배포 전에 시작된 Inngest run은 새 필드가 없는 옛 컨텍스트를 재생한다.
  // 그때도 키를 생략하지 않고 명시적인 0을 보낸다.
  it("sends an explicit 0 when the snapshot is missing", () => {
    const body = JSON.parse(JSON.stringify({ ...requestVideoFraming(undefined) }));
    assert.deepEqual(body, { video_padding_percent: 0 });
  });
});
