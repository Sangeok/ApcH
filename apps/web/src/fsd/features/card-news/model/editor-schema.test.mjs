import assert from "node:assert/strict";
import test from "node:test";
import {
  editorDraftSchema,
  markEditedCards,
  countEditedCardNewsFields,
} from "./editor-schema.ts";
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

test("edited fields count text and document fields, excluding derived provenance", () => {
  const previous = draft();
  const next = draft();
  next.cards[1].title = "Changed title";
  next.cards[1].body = "Changed body";
  next.cards[1].highlight = "body";
  next.caption = "Changed caption";
  next.hashtags = ["#Changed"];
  next.theme = "dark";
  next.accentColor = "#059669";
  next.coverCandidateId = "cover-75";
  assert.equal(countEditedCardNewsFields(previous, next), 8);
  const derivedOnly = draft();
  derivedOnly.cards[1].provenance = "user-edited";
  derivedOnly.cards[1].sourceSentenceIds = [];
  assert.equal(countEditedCardNewsFields(previous, derivedOnly), 0);
  assert.equal(countEditedCardNewsFields(previous, previous), 0);
});

test("reordering body cards counts once without counting moved cards as text edits", () => {
  const previous = draft();
  previous.cards.splice(2, 0, {
    ...previous.cards[1],
    id: "extra",
    title: "Other title",
  });
  const next = structuredClone(previous);
  [next.cards[1], next.cards[2]] = [next.cards[2], next.cards[1]];
  assert.equal(countEditedCardNewsFields(previous, next), 1);
  next.cards[1].title = "Changed too";
  assert.equal(countEditedCardNewsFields(previous, next), 2);
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
