const UPLOAD_DETAIL_PATTERN = /^\/dashboard\/uploads\/[^/]+(?:\/.*)?$/;
const MAX_PATH_LENGTH = 512;

function stripTrailingSlash(path: string) {
  if (path === "/") {
    return path;
  }

  return path.endsWith("/") ? path.slice(0, -1) : path;
}

export function normalizeAnalyticsPath(input: string | null | undefined) {
  if (!input || typeof input !== "string") {
    return "/";
  }

  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return "/";
  }

  let pathname: string;

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      pathname = new URL(trimmed).pathname;
    } else if (trimmed.startsWith("/")) {
      pathname = new URL(trimmed, "https://analytics.local").pathname;
    } else {
      return "/";
    }
  } catch {
    return "/";
  }

  const normalizedPath = stripTrailingSlash(pathname);

  if (UPLOAD_DETAIL_PATTERN.test(normalizedPath)) {
    return "/dashboard/uploads/[uploadedFileId]";
  }

  return normalizedPath.slice(0, MAX_PATH_LENGTH) || "/";
}

export function normalizeAnalyticsReferrer(input: string | null | undefined) {
  if (!input || typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.startsWith("/")) {
    return normalizeAnalyticsPath(trimmed);
  }

  try {
    const url = new URL(trimmed);
    const normalizedPath = normalizeAnalyticsPath(url.pathname);

    if (normalizedPath.startsWith("/dashboard/uploads/")) {
      return normalizedPath;
    }

    return `${url.origin}${normalizedPath}`.slice(0, MAX_PATH_LENGTH);
  } catch {
    return null;
  }
}
