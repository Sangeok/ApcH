import assert from "node:assert/strict";
import test from "node:test";
import { editorDraftSchema, markEditedCards } from "./editor-schema.ts";
import { parseCardNewsDraft } from "../../../entities/card-news/model/contract.ts";

const draft = () => ({
  schemaVersion: 1,
  language: "English",
  cards: ["cover", "body", "summary"].map((role, index) => ({
    id: `c${index}`,
    role,
    title: "Title",
    body: "Body",
    highlight: null,
    sourceSentenceIds: [0],
    provenance: "ai",
  })),
  theme: "light",
  accentColor: "#2563EB",
  coverCandidateId: "cover-50",
  caption: "Caption",
  hashtags: ["#Save"],
});
test("editor keeps immutable card roles and rejects duplicate IDs and unknown fields", () => {
  assert.equal(editorDraftSchema.safeParse(draft()).success, true);
  const moved = draft();
  moved.cards.reverse();
  assert.equal(editorDraftSchema.safeParse(moved).success, false);
  const duplicate = draft();
  duplicate.cards[1].id = duplicate.cards[0].id;
  assert.equal(editorDraftSchema.safeParse(duplicate).success, false);
  assert.equal(
    editorDraftSchema.safeParse({ ...draft(), s3Key: "other/key" }).success,
    false,
  );
});
test("changed text loses AI provenance without trusting client source IDs", () => {
  const initial = draft();
  const edited = draft();
  edited.cards[1].title = "Changed";
  edited.cards[1].sourceSentenceIds = [999];
  const result = markEditedCards(initial, edited);
  assert.equal(result.cards[1].provenance, "user-edited");
  assert.deepEqual(result.cards[1].sourceSentenceIds, []);
  assert.equal(result.cards[0].provenance, "ai");
});
test("unchanged canonical paid draft remains editable with hyphen hashtags and full admitted limits", () => {
  const paid = draft();
  paid.hashtags = ["#example-topic", "#" + "😀".repeat(79)];
  paid.cards[1].id = "x".repeat(160);
  paid.cards[1].sourceSentenceIds = Array.from(
    { length: 101 },
    (_, index) => index,
  );
  paid.cards[1].title = "😀".repeat(80);
  const canonical = parseCardNewsDraft(paid);
  const editable = editorDraftSchema.parse(canonical);
  assert.deepEqual(editable, canonical);
  assert.deepEqual(markEditedCards(editable, editable), canonical);
  assert.equal(
    editorDraftSchema.safeParse({ ...paid, hashtags: ["#" + "a".repeat(80)] })
      .success,
    false,
  );
});
