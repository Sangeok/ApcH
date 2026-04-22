export type ClipboardResult =
  | { success: true }
  | { success: false; error: string };

export async function copyToClipboard(text: string): Promise<ClipboardResult> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return { success: false, error: "Clipboard API not available" };
  }

  try {
    await navigator.clipboard.writeText(text);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
