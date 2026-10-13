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
  const baseline = useRef(JSON.stringify(initial.draftDocument));
  const dirty = JSON.stringify(draft) !== baseline.current;
  const mutations = useCardNewsMutations(userId);
  useEffect(() => {
    if (!dirty && detail.draftRevision !== expectedRevision) {
      setDraft(detail.draftDocument);
      setExpectedRevision(detail.draftRevision);
      baseline.current = JSON.stringify(detail.draftDocument);
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
    const result = await mutations.save.mutateAsync({
      setId: detail.id,
      expectedRevision,
      draft,
    });
    baseline.current = JSON.stringify(draft);
    setExpectedRevision(result.revision);
    await query.refetch();
  };
  const loadLatest = () => {
    setDraft(detail.draftDocument);
    setExpectedRevision(detail.draftRevision);
    baseline.current = JSON.stringify(detail.draftDocument);
  };
  return {
    detail,
    draft,
    setDraft,
    expectedRevision,
    dirty,
    save,
    loadLatest,
    query,
    mutations,
  };
}
