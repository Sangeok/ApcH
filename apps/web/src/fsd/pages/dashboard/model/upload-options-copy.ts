export function uploadButtonLabel(reviewBeforeGenerate: boolean): string {
  return reviewBeforeGenerate
    ? "Upload and review clips"
    : "Upload and generate clips";
}

export function generationModeHint(reviewBeforeGenerate: boolean): string {
  return reviewBeforeGenerate
    ? "Edit clips before generating."
    : "Generates clips immediately.";
}
