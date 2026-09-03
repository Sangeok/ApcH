"use client";

import { useEffect } from "react";

/**
 * 라우트 에러 경계가 잡은 오류를 기록한다.
 *
 * 경계 다섯이 문자열만 다른 같은 effect를 각자 들고 있어서, 기록 방식을
 * 바꾸려면(로그 포맷조차) 다섯 디렉터리의 다섯 파일을 고쳐야 했다.
 *
 * ⚠️ 이 훅은 `shared/observability/index.ts`에서 재수출하지 않는다 — 그 barrel은
 * `server-only`인 `./report-error`를 재수출하므로 `"use client"` 경계가 barrel을
 * 임포트하면 빌드가 깨진다. 파일 경로로 임포트할 것.
 *
 * 지금은 `console.error`만 한다. 이 앱에는 클라이언트 Sentry 초기화가 없어
 * `Sentry.captureException`을 넣어도 아무 데도 도달하지 않는다 — 클라이언트
 * init을 먼저 붙이고 브라우저 이벤트 도달을 확인한 뒤에 추가할 것.
 */
export function useReportBoundaryError(
  error: Error & { digest?: string },
  origin: string,
) {
  useEffect(() => {
    console.error(`${origin} error boundary caught:`, error);
  }, [error, origin]);
}
