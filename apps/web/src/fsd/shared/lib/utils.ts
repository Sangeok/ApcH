import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 백엔드가 보낸 JSON 배열 문자열을 파싱한다. 요소 검증은 호출부가 명시한다 —
 *  기본 가드를 두면 `parseJsonArray<string>(...)`가 검증 없는 캐스트가 된다. */
export function parseJsonArray<T>(
  value: string | null | undefined,
  guard: (item: unknown) => item is T,
): T[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(guard) : [];
  } catch {
    return [];
  }
}

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;
