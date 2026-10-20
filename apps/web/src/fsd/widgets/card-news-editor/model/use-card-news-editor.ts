"use client";
import { useEffect, useRef, useState } from "react";
import {
  useLiveCardNewsDetail,
  useCardNewsMutations,
} from "~/fsd/features/card-news";
import type { CardNewsDetail, DraftDocument } from "~/fsd/entities/card-news";

export function useCardNewsEditor(userId: string, initial: CardNewsDetail) {
  const query = useLiveCardNewsDetail(userId, initial);
  const detail = query.data ?? initial;
  const [draft, setDraft] = useState<DraftDocument | null>(
    initial.draftDocument,
  );
  const [expectedRevision, setExpectedRevision] = useState(
    initial.draftRevision,
  );
  const [hashtagText, setHashtagText] = useState(
    initial.draftDocument?.hashtags.join(" ") ?? "",
  );
  const baseline = useRef(JSON.stringify(initial.draftDocument));
  const baselineHashtags = useRef(hashtagText);
  const latestInput = useRef({ draft, hashtagText });
  latestInput.current = { draft, hashtagText };
  const dirty =
    JSON.stringify(draft) !== baseline.current ||
    hashtagText !== baselineHashtags.current;
  const mutations = useCardNewsMutations(userId);
  useEffect(() => {
    if (!dirty && detail.draftRevision !== expectedRevision) {
      setDraft(detail.draftDocument);
      setExpectedRevision(detail.draftRevision);
      baseline.current = JSON.stringify(detail.draftDocument);
      const savedHashtags = detail.draftDocument?.hashtags.join(" ") ?? "";
      setHashtagText(savedHashtags);
      baselineHashtags.current = savedHashtags;
    }
  }, [detail.draftDocument, detail.draftRevision, dirty, expectedRevision]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    const guardLink = (event: MouseEvent) => {
      if (!dirty || !(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (
        anchor &&
        !window.confirm(
          "You have unsaved card news changes. Leave without saving?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", guardLink, true);
    return () => {
      window.removeEventListener("beforeunload", handler);
      document.removeEventListener("click", guardLink, true);
    };
  }, [dirty]);
  const save = async () => {
    if (!draft) return;
    const submitted = JSON.stringify({ draft, hashtagText });
    const result = await mutations.save.mutateAsync({
      setId: detail.id,
      expectedRevision,
      draft: { ...draft, hashtags: hashtagText.split(/\s+/).filter(Boolean) },
    });
    setExpectedRevision(result.revision);
    const refreshed = await query.refetch({ throwOnError: true });
    if (!refreshed.data) throw new Error("Saved version could not be loaded");
    const saved = refreshed.data;
    const savedHashtags = saved.draftDocument?.hashtags.join(" ") ?? "";
    baseline.current = JSON.stringify(saved.draftDocument);
    baselineHashtags.current = savedHashtags;
    setExpectedRevision(saved.draftRevision);
    if (JSON.stringify(latestInput.current) === submitted) {
      setDraft(saved.draftDocument);
      setHashtagText(savedHashtags);
    }
  };
  const loadLatest = async () => {
    const refreshed = await query.refetch({ throwOnError: true });
    if (!refreshed.data)
      throw new Error("Latest saved version could not be loaded");
    const latest = refreshed.data;
    const savedHashtags = latest.draftDocument?.hashtags.join(" ") ?? "";
    setDraft(latest.draftDocument);
    setHashtagText(savedHashtags);
    setExpectedRevision(latest.draftRevision);
    baseline.current = JSON.stringify(latest.draftDocument);
    baselineHashtags.current = savedHashtags;
  };
  return {
    detail,
    draft,
    setDraft,
    hashtagText,
    setHashtagText,
    expectedRevision,
    dirty,
    save,
    loadLatest,
    query,
    mutations,
  };
}
