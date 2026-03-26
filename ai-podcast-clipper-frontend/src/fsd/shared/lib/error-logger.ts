/**
 * 중앙화된 에러 로깅 유틸리티.
 * 외부 에러 리포팅 서비스 도입 시 이 파일만 수정하면 됨.
 */
export function logError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${context}] ${message}`, error);
}

/**
 * unknown 타입의 에러에서 사용자에게 보여줄 메시지를 추출한다.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
