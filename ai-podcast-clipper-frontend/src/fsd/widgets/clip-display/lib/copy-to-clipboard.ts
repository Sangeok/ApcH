export async function copyToClipboard(
  text: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!navigator?.clipboard?.writeText) {
      throw new Error("Clipboard API not available");
    }
    await navigator.clipboard.writeText(text);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
