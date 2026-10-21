import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { QueryClient } from "@tanstack/react-query";
import { cardNewsKeys } from "../src/fsd/entities/card-news/model/query-keys.ts";
import { uploadedFileKeys } from "../src/fsd/entities/uploaded-file/model/query-keys.ts";

function loadHook(relative, imports, globals = {}) {
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: relative,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    ...globals,
    require(name) {
      assert.ok(name in imports, `Unexpected dependency ${name}`);
      return imports[name];
    },
  });
  return exports;
}

const clone = (value) => JSON.parse(JSON.stringify(value));

test("terminal upload actions and card creation follow the shared live balance", () => {
  const originalBalance = { owned: 1, reserved: 0, available: 1 };
  const snapshot = {
    id: "upload",
    status: "processed",
    clips: [{ id: "clip" }],
    clipDrafts: [],
    outcome: { kind: "success" },
    creditBalance: originalBalance,
  };
  let liveBalance = originalBalance;
  const element = (type, props) => ({ type, props });
  const { default: UploadDetailPage } = loadHook(
    "../src/fsd/pages/upload-detail/ui/index.tsx",
    {
      "react/jsx-runtime": { jsx: element, jsxs: element },
      react: { useEffect() {}, useRef: () => ({ current: false }) },
      "~/fsd/entities/uploaded-file": { UploadedFileStatusBadge: "status" },
      "~/fsd/features/upload": { UploadedFileActions: "actions" },
      "~/fsd/pages/upload-detail/model/use-live-uploaded-file-detail": {
        useLiveUploadedFileDetail: () => ({ data: snapshot }),
      },
      "~/fsd/pages/upload-detail/ui/_component/ProcessingTimeline": {
        default: "timeline",
      },
      "~/fsd/shared/analytics": {},
      "~/fsd/shared/lib/format-date": { formatDateTime: () => "date" },
      "~/fsd/shared/ui/atoms/card": {
        Card: "card",
        CardContent: "content",
        CardHeader: "header",
        CardTitle: "title",
      },
      "~/fsd/shared/ui/atoms/separator": { Separator: "separator" },
      "~/fsd/widgets/clip-display": { ClipDisplay: "clips" },
      "~/fsd/widgets/clip-draft-review": { ClipDraftReviewSection: "review" },
      "./_component/OriginalMediaCard": { default: "media" },
      "@tanstack/react-query": {
        useQuery: (options) => ({
          data: options.queryKey[0] === "balance" ? liveBalance : [],
        }),
      },
      "~/fsd/features/credit-balance": {
        creditBalanceQueryOptions: () => ({ queryKey: ["balance"] }),
      },
      "~/fsd/features/card-news": {
        cardNewsListQueryOptions: () => ({ queryKey: ["cards"] }),
      },
    },
  );
  const find = (node, type) => {
    if (!node || typeof node !== "object") return undefined;
    if (Array.isArray(node))
      return node.map((item) => find(item, type)).find(Boolean);
    return node.type === type ? node : find(node.props?.children, type);
  };
  for (const balance of [
    { owned: 1, reserved: 1, available: 0 },
    { owned: 3, reserved: 1, available: 2 },
    { owned: 2, reserved: 1, available: 1 },
  ]) {
    liveBalance = balance;
    const tree = UploadDetailPage({
      userId: "user",
      uploadedFileData: snapshot,
      cardNewsContext: {
        userId: "user",
        enabled: true,
        sets: [],
        creditBalance: originalBalance,
      },
    });
    assert.equal(
      find(tree, "actions").props.availableCredits,
      balance.available,
    );
    assert.equal(
      find(tree, "clips").props.cardNewsContext.creditBalance,
      balance,
    );
  }
});
const initial = () => ({
  id: "set",
  draftRevision: 1,
  draftDocument: {
    cards: [
      {
        id: "body",
        title: "Original",
        body: "Body",
        provenance: "ai",
        sourceSentenceIds: [0],
      },
    ],
    caption: "Caption",
    hashtags: ["#first"],
  },
});

// Run the actual hook with controlled async boundaries and persistent hook slots.
// This exercises state transitions without adding a DOM or test framework dependency.
function editorHarness() {
  const seed = initial();
  const query = { data: seed, refetch: async () => ({ data: query.data }) };
  const mutations = { save: { mutateAsync: async () => ({ revision: 2 }) } };
  const slots = [];
  let cursor = 0,
    changed = false,
    effects = [];
  const react = {
    useState(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = value;
      return [
        slots[index],
        (next) => {
          slots[index] = typeof next === "function" ? next(slots[index]) : next;
          changed = true;
        },
      ];
    },
    useRef(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: value };
      return slots[index];
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (
        !previous ||
        dependencies.some(
          (value, offset) => !Object.is(value, previous[offset]),
        )
      )
        effects.push(effect);
      slots[index] = dependencies;
    },
  };
  const { useCardNewsEditor } = loadHook(
    "../src/fsd/widgets/card-news-editor/model/use-card-news-editor.ts",
    {
      react,
      "~/fsd/features/card-news": {
        useLiveCardNewsDetail: () => query,
        useCardNewsMutations: () => mutations,
      },
    },
    {
      window: { addEventListener() {}, removeEventListener() {} },
      document: { addEventListener() {}, removeEventListener() {} },
    },
  );
  function render() {
    let value;
    for (let attempt = 0; attempt < 10; attempt++) {
      cursor = 0;
      changed = false;
      effects = [];
      value = useCardNewsEditor("user", seed);
      for (const effect of effects) effect();
      if (!changed) return value;
    }
    throw new Error("Hook state did not settle");
  }
  return { query, mutations, render };
}

test("conflict recovery fetches the server version and a failed fetch retains unsaved text", async () => {
  const harness = editorHarness();
  let editor = harness.render();
  editor.setDraft({ ...editor.draft, caption: "Unsaved" });
  editor = harness.render();
  harness.query.refetch = async () => {
    throw new Error("offline");
  };
  await assert.rejects(editor.loadLatest(), /offline/);
  assert.equal(harness.render().draft.caption, "Unsaved");
  const fresh = initial();
  fresh.draftRevision = 2;
  fresh.draftDocument.caption = "Other session";
  harness.query.refetch = async () => {
    harness.query.data = fresh;
    return { data: fresh };
  };
  await harness.render().loadLatest();
  editor = harness.render();
  assert.equal(editor.expectedRevision, 2);
  assert.equal(editor.draft.caption, "Other session");
  assert.equal(editor.dirty, false);
});

test("hashtag separators survive typing and save normalizes tokens and adopts canonical attribution", async () => {
  const harness = editorHarness();
  let editor = harness.render();
  for (const character of " #second") {
    editor.setHashtagText(editor.hashtagText + character);
    editor = harness.render();
  }
  assert.equal(editor.hashtagText, "#first #second");
  assert.equal(editor.dirty, true);
  editor.setDraft({
    ...editor.draft,
    cards: [{ ...editor.draft.cards[0], title: " Changed " }],
  });
  editor = harness.render();
  let submitted;
  const saved = initial();
  saved.draftRevision = 2;
  saved.draftDocument.cards[0] = {
    ...saved.draftDocument.cards[0],
    title: "Changed",
    provenance: "user-edited",
    sourceSentenceIds: [],
  };
  saved.draftDocument.hashtags = ["#first", "#second"];
  harness.mutations.save.mutateAsync = async (payload) => {
    submitted = clone(payload);
    return { revision: 2 };
  };
  harness.query.refetch = async () => {
    harness.query.data = saved;
    return { data: saved };
  };
  await editor.save();
  editor = harness.render();
  assert.deepEqual(submitted.draft.hashtags, ["#first", "#second"]);
  assert.equal(editor.draft.cards[0].title, "Changed");
  assert.equal(editor.draft.cards[0].provenance, "user-edited");
  assert.deepEqual(clone(editor.draft.cards[0].sourceSentenceIds), []);
  assert.equal(editor.dirty, false);
});

test("saving preserves a newer local edit made while the request is pending", async () => {
  const harness = editorHarness();
  let editor = harness.render();
  editor.setDraft({ ...editor.draft, caption: "Submitted" });
  editor = harness.render();
  let complete;
  harness.mutations.save.mutateAsync = () =>
    new Promise((resolve) => {
      complete = resolve;
    });
  const saved = initial();
  saved.draftRevision = 2;
  saved.draftDocument.caption = "Submitted";
  harness.query.refetch = async () => {
    harness.query.data = saved;
    return { data: saved };
  };
  const pending = editor.save();
  editor.setDraft({ ...editor.draft, caption: "Newer unsaved" });
  harness.render();
  complete({ revision: 2 });
  await pending;
  editor = harness.render();
  assert.equal(editor.expectedRevision, 2);
  assert.equal(editor.draft.caption, "Newer unsaved");
  assert.equal(editor.dirty, true);
});

for (const kind of ["clip", "upload"])
  test(`${kind} deletion returns cleanup receipt and invalidates only the authenticated card-news caches`, async () => {
    const client = new QueryClient();
    try {
      const user = "authenticated-user";
      const cards = cardNewsKeys.list(user);
      const otherCards = cardNewsKeys.list("other-user");
      const cleanup = ["asset-cleanup", user];
      for (const key of [cards, otherCards, cleanup])
        client.setQueryData(key, []);
      const fileKey = uploadedFileKeys.detail("upload-id");
      client.setQueryData(fileKey, {
        clips: [{ id: "clip-id" }, { id: "sibling" }],
      });
      const receipt = { status: "deleting", cleanupId: "cleanup-id" };
      const path =
        kind === "clip"
          ? "../src/fsd/features/clip/model/use-delete-clip.ts"
          : "../src/fsd/features/upload/model/use-delete-uploaded-file.ts";
      const hook = loadHook(path, {
        "@tanstack/react-query": {
          useQueryClient: () => client,
          useMutation: (options) => options,
        },
        "~/fsd/entities/card-news": { cardNewsKeys },
        "~/fsd/entities/uploaded-file": { uploadedFileKeys },
        "../api": {
          deleteClip: async () => ({ success: true, data: receipt }),
          deleteUploadedFile: async () => ({ success: true, data: receipt }),
        },
      });
      const mutation =
        kind === "clip"
          ? hook.useDeleteClip({ userId: user, uploadedFileId: "upload-id" })
          : hook.useDeleteUploadedFile(user);
      const result = await mutation.mutationFn(
        kind === "clip" ? "clip-id" : "upload-id",
      );
      assert.equal(result.status, "deleting");
      assert.equal(result.cleanupId, "cleanup-id");
      await mutation.onSuccess(result);
      assert.equal(client.getQueryState(cards).isInvalidated, true);
      assert.equal(client.getQueryState(cleanup).isInvalidated, true);
      assert.equal(client.getQueryState(otherCards).isInvalidated, false);
      if (kind === "clip")
        assert.deepEqual(client.getQueryData(fileKey).clips, [
          { id: "sibling" },
        ]);
      else assert.equal(client.getQueryData(fileKey), undefined);
    } finally {
      client.clear();
    }
  });
