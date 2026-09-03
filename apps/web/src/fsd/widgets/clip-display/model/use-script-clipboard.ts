"use client";

import type { Clip } from "@repo/db";
import { toast } from "sonner";
import { copyToClipboard } from "../lib/copy-to-clipboard";

/**
 * 클립 스크립트의 파생·가드·토스트 문구를 한 곳에.
 *
 * 카드와 스크립트 모달이 같은 세 가지(trim한 본문, 존재 판정, 세 토스트 문자열)를
 * 각자 들고 있었다. 둘 다 살아 있는 경로라 한쪽 문구만 고치면 같은 실패가
 * 화면에 따라 다르게 보인다.
 */
export function useScriptClipboard(clip: Pick<Clip, "scriptText">) {
  const scriptText = clip.scriptText?.trim() ?? "";
  const hasScript = scriptText.length > 0;

  const copyScript = async () => {
    if (!hasScript) {
      toast.error("Script is not available yet.");
      return;
    }

    const result = await copyToClipboard(scriptText);

    if (result.success) {
      toast.success("Copied script.");
    } else {
      toast.error(`Failed to copy script: ${result.error}`);
    }
  };

  return { scriptText, hasScript, copyScript };
}
