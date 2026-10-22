/**
 * Content types a stored clip MP4 may carry. GPU `upload_file` (apps/backend/main.py) sends no
 * ContentType, so S3 stores its default `binary/octet-stream` — rejecting it settled every
 * successful video as zero clips and queued the clips for orphan deletion (FEAT-63).
 */
export const STORED_CLIP_CONTENT_TYPES = [
  "video/mp4",
  "binary/octet-stream",
  "application/octet-stream",
] as const;

/** Whether a discovered clip object is a non-empty stored MP4 the settlement may charge for. */
export function isStoredClipObject(head: {
  contentLength: number;
  contentType: string;
}): boolean {
  const mediaType = head.contentType.split(";")[0]!.trim().toLowerCase();
  return (
    head.contentLength > 0 &&
    (STORED_CLIP_CONTENT_TYPES as readonly string[]).includes(mediaType)
  );
}
