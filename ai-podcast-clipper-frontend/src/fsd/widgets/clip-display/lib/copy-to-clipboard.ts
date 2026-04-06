import { toast } from "sonner";

export async function copyToClipboard(text: string, label: string): Promise<boolean> {
  try {
    if (!navigator?.clipboard?.writeText) {
      throw new Error("Clipboard API not available");
    }
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${label}.`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast.error(`Failed to copy ${label}: ${message}`);
    return false;
  }
}
