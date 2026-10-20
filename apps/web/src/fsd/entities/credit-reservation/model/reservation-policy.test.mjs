import assert from "node:assert/strict";
import test from "node:test";
import {
  planReservationTransition,
  reservationOperationKey,
  videoReservationCharge,
} from "./reservation-policy.ts";

const held = {
  kind: "video",
  status: "held",
  reservedAmount: 3,
  chargedAmount: 0,
};
test("video partial success charges stored clips and releases the whole reservation", () => {
  assert.deepEqual(
    planReservationTransition(held, {
      status: "settled",
      chargedAmount: videoReservationCharge(3, 2),
    }),
    { changed: true, status: "settled", releaseAmount: 3, chargeAmount: 2 },
  );
});
test("duplicate or late terminal delivery cannot change a settled reservation", () => {
  for (const status of ["released", "settled"]) {
    assert.deepEqual(
      planReservationTransition({ ...held, status }, { status: "released" }),
      { changed: false, status },
    );
  }
});
test("failed card news returns the entire hold without charging", () => {
  assert.deepEqual(
    planReservationTransition(
      { ...held, kind: "card-news", reservedAmount: 1 },
      { status: "released" },
    ),
    { changed: true, status: "released", releaseAmount: 1, chargeAmount: 0 },
  );
});
test("invalid counts and partial card-news success are rejected", () => {
  assert.throws(() => videoReservationCharge(3, 4));
  assert.throws(() =>
    planReservationTransition(
      { ...held, kind: "card-news", reservedAmount: 1 },
      { status: "settled", chargedAmount: 0 },
    ),
  );
  assert.throws(() =>
    planReservationTransition(held, { status: "settled", chargedAmount: -1 }),
  );
  assert.throws(() =>
    planReservationTransition(
      { ...held, kind: "card-news" },
      { status: "settled", chargedAmount: 1 },
    ),
  );
  assert.throws(() =>
    planReservationTransition(
      { ...held, chargedAmount: 1 },
      { status: "released" },
    ),
  );
});
test("operation keys remain stable for a restarted worker", () => {
  assert.equal(
    reservationOperationKey({
      kind: "video",
      uploadedFileId: "source",
      attempt: 2,
    }),
    "video:source:2",
  );
  assert.equal(
    reservationOperationKey({ kind: "card-news", jobId: "job" }),
    "card-news:job",
  );
});
