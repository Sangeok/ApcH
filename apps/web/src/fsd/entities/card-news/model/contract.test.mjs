import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canonicalJson,
  canonicalSourceHash,
  parseCardNewsSource,
  parseCardNewsDraft,
  parseCardNewsInput,
  parseCardNewsCallback,
  parseCardNewsManifest,
  parseProducerStatusRequest,
  parseProducerStatusResponse,
  validateManifestBinding,
} from "./contract.ts";

const root = new URL("../../../../../../../", import.meta.url);
const schema = JSON.parse(
  readFileSync(
    new URL("packages/db/contracts/card-news-v1.schema.json", root),
    "utf8",
  ),
);
const fixtures = JSON.parse(
  readFileSync(
    new URL("packages/db/contracts/card-news-v1.fixtures.json", root),
    "utf8",
  ),
);
const parsers = {
  source: parseCardNewsSource,
  draft: parseCardNewsDraft,
  input: parseCardNewsInput,
  callback: parseCardNewsCallback,
  manifest: parseCardNewsManifest,
  producerStatusRequest: parseProducerStatusRequest,
  producerStatusResponse: parseProducerStatusResponse,
};

for (const fixture of fixtures.cases) {
  test(`wire fixture ${fixture.name} has the shared expected verdict`, () => {
    assert.ok(
      schema.$defs[fixture.definition],
      "Fixture must reference a canonical definition",
    );
    const parser = parsers[fixture.definition];
    assert.ok(parser, "No unknown fixture definition can pass by omission");
    if (fixture.valid) assert.deepEqual(parser(fixture.value), fixture.value);
    else assert.throws(() => parser(fixture.value));
  });
}
test("source hashing uses canonical content independent of property insertion order", () => {
  const source = fixtures.cases.find(
    (fixture) => fixture.name === "source-valid",
  ).value;
  const input = fixtures.cases.find(
    (fixture) => fixture.name === "input-valid",
  ).value;
  assert.equal(canonicalSourceHash(source), input.sourceHash);
  assert.equal(
    canonicalSourceHash(Object.fromEntries(Object.entries(source).reverse())),
    input.sourceHash,
  );
  assert.throws(() => canonicalJson({ value: NaN }), /Non-JSON/);
});
test("astral script length follows the canonical 100000 code-point boundary", () => {
  const source = structuredClone(
    fixtures.cases.find((fixture) => fixture.name === "source-valid").value,
  );
  source.scriptText = "😀".repeat(100000);
  source.sourceSentenceCount = 1;
  assert.equal(
    source.scriptText.length,
    200000,
    "The test must cross the UTF-16 boundary",
  );
  assert.deepEqual(parseCardNewsSource(source), source);
  assert.throws(() =>
    parseCardNewsSource({ ...source, scriptText: `${source.scriptText}😀` }),
  );
});
test("non-finite source time and unrecognized callback properties are rejected", () => {
  const source = fixtures.cases.find(
    (fixture) => fixture.name === "source-valid",
  ).value;
  for (const time of [Infinity, NaN, -Infinity])
    assert.throws(() => parseCardNewsSource({ ...source, endSeconds: time }));
});
test("manifest binding prevents another revision, path or evidence from being published", () => {
  const input = fixtures.cases.find(
    (fixture) => fixture.name === "input-valid",
  ).value;
  const manifest = fixtures.cases.find(
    (fixture) => fixture.name === "manifest-valid",
  ).value;
  validateManifestBinding(
    parseCardNewsManifest(manifest),
    parseCardNewsInput(input),
  );
  const changedRevision = structuredClone(manifest);
  changedRevision.revision = 99;
  assert.throws(
    () => validateManifestBinding(changedRevision, input),
    /binding/,
  );
  const changedPath = structuredClone(manifest);
  changedPath.cards[0].key = "card-news/other/01-cover.jpg";
  assert.throws(() => validateManifestBinding(changedPath, input), /prefix/);
  const changedEvidence = structuredClone(manifest);
  changedEvidence.draftDocument.cards[1].sourceSentenceIds = [99];
  assert.throws(() => validateManifestBinding(changedEvidence, input));
});
test("free rendering preserves exactly its approved draft and reused cover candidates", () => {
  const input = fixtures.cases.find(
    (fixture) => fixture.name === "input-render-valid",
  ).value;
  const manifest = structuredClone(
    fixtures.cases.find((fixture) => fixture.name === "manifest-valid").value,
  );
  manifest.revision = 2;
  validateManifestBinding(manifest, input);
  const changed = structuredClone(manifest);
  changed.draftDocument.caption = "Different words";
  changed.caption = "Different words";
  assert.throws(() => validateManifestBinding(changed, input), /snapshot/);
});
