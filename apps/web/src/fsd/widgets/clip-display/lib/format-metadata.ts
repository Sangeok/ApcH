interface ClipMetadataInput {
  youtubeTitle: string | null | undefined;
  youtubeDescription: string | null | undefined;
}

export function formatAllMetadataForCopy(
  { youtubeTitle, youtubeDescription }: ClipMetadataInput,
  hashtags: string[],
): string {
  return [youtubeTitle, youtubeDescription, hashtags.join(" ")]
    .filter(Boolean)
    .join("\n\n");
}
