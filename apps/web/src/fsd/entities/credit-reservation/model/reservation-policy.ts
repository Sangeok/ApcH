export type ReservationKind = "video" | "card-news";
export type ReservationStatus = "held" | "settled" | "released";
export type ReservationSnapshot = Readonly<{
  kind: ReservationKind;
  status: ReservationStatus;
  reservedAmount: number;
  chargedAmount: number;
}>;

export type ReservationTransition =
  | { changed: false; status: "settled" | "released" }
  | {
      changed: true;
      status: "settled" | "released";
      releaseAmount: number;
      chargeAmount: number;
    };

export function reservationOperationKey(
  input:
    | { kind: "video"; uploadedFileId: string; attempt: number }
    | { kind: "card-news"; jobId: string },
): string {
  if (input.kind === "card-news") {
    if (!input.jobId) throw new Error("Missing card-news job ID");
    return `card-news:${input.jobId}`;
  }
  if (
    !input.uploadedFileId ||
    !Number.isSafeInteger(input.attempt) ||
    input.attempt < 1
  ) {
    throw new Error("Invalid video reservation identity");
  }
  return `video:${input.uploadedFileId}:${input.attempt}`;
}

export function planReservationTransition(
  reservation: ReservationSnapshot,
  outcome:
    | { status: "settled"; chargedAmount: number }
    | { status: "released" },
): ReservationTransition {
  if (
    !Number.isSafeInteger(reservation.reservedAmount) ||
    reservation.reservedAmount <= 0 ||
    !Number.isSafeInteger(reservation.chargedAmount) ||
    reservation.chargedAmount < 0 ||
    reservation.chargedAmount > reservation.reservedAmount ||
    (reservation.kind === "card-news" && reservation.reservedAmount !== 1) ||
    (reservation.status !== "settled" && reservation.chargedAmount !== 0) ||
    (reservation.kind === "card-news" &&
      reservation.status === "settled" &&
      reservation.chargedAmount !== 1) ||
    !["video", "card-news"].includes(reservation.kind) ||
    !["held", "settled", "released"].includes(reservation.status)
  ) {
    throw new Error("Invalid reservation state");
  }
  if (reservation.status !== "held")
    return { changed: false, status: reservation.status };
  const chargeAmount = outcome.status === "settled" ? outcome.chargedAmount : 0;
  if (
    !Number.isSafeInteger(chargeAmount) ||
    chargeAmount < 0 ||
    chargeAmount > reservation.reservedAmount ||
    (reservation.kind === "card-news" &&
      outcome.status === "settled" &&
      chargeAmount !== 1)
  ) {
    throw new Error("Invalid reservation charge");
  }
  return {
    changed: true,
    status: outcome.status,
    releaseAmount: reservation.reservedAmount,
    chargeAmount,
  };
}

export function videoReservationCharge(
  reservedAmount: number,
  persistedClipCount: number,
): number {
  if (
    !Number.isSafeInteger(reservedAmount) ||
    reservedAmount < 1 ||
    !Number.isSafeInteger(persistedClipCount) ||
    persistedClipCount < 0 ||
    persistedClipCount > reservedAmount
  ) {
    throw new Error("Invalid persisted video result count");
  }
  return persistedClipCount;
}
