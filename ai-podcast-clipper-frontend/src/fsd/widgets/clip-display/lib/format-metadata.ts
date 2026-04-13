// Prisma Clip 타입에 직접 의존하지 않도록 필요한 필드만 추출한 로컬 인터페이스를 선언한다.
// TypeScript 구조적 타이핑 덕분에 Clip 객체를 그대로 전달할 수 있다.
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
