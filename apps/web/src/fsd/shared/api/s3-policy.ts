export function chunkS3Keys(keys: readonly string[], size = 1_000): string[][] {
  if (!Number.isInteger(size) || size < 1 || size > 1_000)
    throw new Error("Invalid S3 delete batch size");
  const unique = [...new Set(keys)];
  return Array.from({ length: Math.ceil(unique.length / size) }, (_, index) =>
    unique.slice(index * size, (index + 1) * size),
  );
}

export function attachmentDisposition(filename: string): string {
  const safe = filename.replace(/[\r\n"\\/]/g, "_");
  return `attachment; filename="${safe.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
export class S3DeleteError extends Error {
  readonly failedKeys: string[];
  constructor(failedKeys: string[]) {
    super(`S3 deletion left ${failedKeys.length} objects pending`);
    this.name = "S3DeleteError";
    this.failedKeys = [...new Set(failedKeys)];
  }
}
