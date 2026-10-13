import type { DraftDocument } from "./types";

export type DraftSnapshots = Record<string, DraftDocument>;

export function planDraftRevision(input: {
  currentRevision: number;
  expectedRevision: number;
  snapshots: DraftSnapshots;
  document: DraftDocument;
}):
  | { revision: number; snapshots: DraftSnapshots }
  | { conflict: true; currentRevision: number } {
  if (input.currentRevision !== input.expectedRevision)
    return { conflict: true, currentRevision: input.currentRevision };
  if (!Number.isSafeInteger(input.currentRevision) || input.currentRevision < 1)
    throw new Error("Initial generation must complete before editing");
  const revision = input.currentRevision + 1;
  if (Object.hasOwn(input.snapshots, String(revision)))
    throw new Error("An immutable draft revision already exists");
  return {
    revision,
    snapshots: {
      ...input.snapshots,
      [String(revision)]: structuredClone(input.document),
    },
  };
}

export function advancePublishedRevision(
  current: number,
  completed: number,
): number {
  if (
    ![current, completed].every(
      (revision) => Number.isSafeInteger(revision) && revision >= 0,
    )
  )
    throw new Error("Invalid revision");
  return Math.max(current, completed);
}

export function pendingRenderRevision(
  currentPending: number | null,
  savedRevision: number,
): number {
  if (!Number.isSafeInteger(savedRevision) || savedRevision < 1)
    throw new Error("Invalid saved revision");
  return Math.max(currentPending ?? 0, savedRevision);
}
