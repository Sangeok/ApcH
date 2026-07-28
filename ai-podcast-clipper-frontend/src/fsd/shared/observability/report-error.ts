import "server-only";

import * as Sentry from "@sentry/nextjs";

// flush 대기 상한의 **기본값**. 호출부마다 예산이 다르므로 인자로 덮어쓸 수 있다.
// 사용자 응답을 붙잡는 경로는 더 짧게(§7-2 경계), 배경 cron은 이 기본값을 쓴다.
const FLUSH_TIMEOUT_MS = 2_000;

type ReportContextValue = string | number | boolean | null | undefined;

/** 자유 문자열이 섞일 수 있는 채널. beforeSend 스크러빙 대상이다. */
export type ReportContext = Record<string, ReportContextValue>;

/**
 * 예외가 아닌 파이프라인 실패.
 * kind별로 필요한 키를 타입에 박아, fingerprint가 `[kind, undefined]`로
 * 퇴화해 모든 실패 모드가 한 이슈로 합쳐지는 오용을 컴파일 타임에 막는다.
 */
export type PipelineFailureReport =
  | {
      kind: "pipeline-failure";
      failureCode: string;
      uploadedFileId: string;
      attempt: number;
    }
  | {
      kind: "dispatch-failure";
      failureCode: string;
      uploadedFileId: string;
      attempt: number;
    }
  | {
      kind: "dispatch-dead-letter";
      dispatchId: string;
      lastError: string;
    }
  | {
      kind: "stuck-processing";
      uploadedFileId: string;
      // Inngest step 경계를 JSON으로 넘나들므로 Date가 아니라 ISO 문자열이다.
      processingStartedAt: string;
      elapsedMinutes: number;
    };

function assertNever(value: never): never {
  throw new Error(`Unhandled report kind: ${JSON.stringify(value)}`);
}

/** fingerprint는 호출부가 아니라 여기서 만든다. 호출부 리터럴은 드리프트를 만든다. */
function toFingerprint(report: PipelineFailureReport): string[] {
  switch (report.kind) {
    case "pipeline-failure":
    case "dispatch-failure":
      return [report.kind, report.failureCode];
    case "dispatch-dead-letter":
    case "stuck-processing":
      return [report.kind];
    default:
      return assertNever(report);
  }
}

function toMessage(report: PipelineFailureReport): string {
  switch (report.kind) {
    case "pipeline-failure":
    case "dispatch-failure":
      return `${report.kind}: ${report.failureCode}`;
    case "dispatch-dead-letter":
      // 리터럴을 다시 쓰지 않는다. discriminant를 그대로 반환해야
      // kind를 개명했을 때 이쪽만 조용히 어긋나는 일이 없다.
      return report.kind;
    case "stuck-processing":
      return `stuck-processing: ${report.elapsedMinutes}m`;
    default:
      return assertNever(report);
  }
}

/**
 * 예외 보고. console.error를 그대로 유지한 채 Sentry 전송을 추가한다.
 * 로컬에서 로그가 사라지지 않고, 나중에 로그 드레인을 붙여도 그 줄이 잡힌다.
 */
export function reportError(
  error: unknown,
  context: { origin: string } & ReportContext,
): void {
  console.error(context.origin, { ...context, error });

  try {
    Sentry.withScope((scope) => {
      scope.setTag("origin", context.origin);
      scope.setContext("report", context);
      Sentry.captureException(error);
    });
  } catch (reportingError) {
    // 관측이 서비스를 죽이면 본말전도다. 절대 밖으로 던지지 않는다.
    console.error("reportError failed", reportingError);
  }
}

/** 예외가 아닌 파이프라인 실패 보고. */
export function reportPipelineFailure(report: PipelineFailureReport): void {
  console.error("pipeline failure", report);

  try {
    Sentry.withScope((scope) => {
      scope.setLevel("error");
      scope.setFingerprint(toFingerprint(report));
      scope.setTag("failureKind", report.kind);
      // 캐스트 없이 그대로 넘긴다. @sentry/core의 Context가 Record<string, unknown>이라
      // 객체 리터럴 타입의 유니온은 암묵적 인덱스 시그니처로 그대로 대입된다(v10.68.0 확인).
      scope.setContext("report", report);
      Sentry.captureMessage(toMessage(report));
    });
  } catch (reportingError) {
    console.error("reportPipelineFailure failed", reportingError);
  }
}

/**
 * 서버리스 인스턴스가 얼어붙기 전에 전송을 마친다.
 * 타임아웃되어도 **reject가 아니라 resolve로 종료**하므로 never-throw 계약을 지킨다.
 *
 * @param timeoutMs 대기 상한. 호출부마다 예산이 다르다 —
 *   사용자 응답을 붙잡는 경로는 짧게(§7-2), 배경 cron은 기본값(§8-4).
 *   하나의 상수를 공유하면 UX 튜닝이 cron의 유실 방지 동작까지 건드리게 된다.
 */
export async function flushReports(
  timeoutMs: number = FLUSH_TIMEOUT_MS,
): Promise<void> {
  try {
    await Sentry.flush(timeoutMs);
  } catch (flushError) {
    console.error("flushReports failed", flushError);
  }
}

/**
 * 사용자 식별은 id만. 이메일·이름은 보내지 않는다.
 *
 * ⚠️ Sentry.setUser는 **current scope가 아니라 isolation scope**에 쓴다
 * (@sentry/core exports.js: `getIsolationScope().setUser(user)`, v10.68.0 확인).
 * 따라서 호출 범위를 가두려면 `Sentry.withScope`로는 안 되고
 * `Sentry.withIsolationScope`로 감싸야 한다 — withScope는 current scope만 분기한다.
 */
export function setReportUser(userId: string): void {
  try {
    Sentry.setUser({ id: userId });
  } catch (userError) {
    // 형제 헬퍼들과 동일하게 로그는 남긴다. 조용히 삼키면
    // 사용자 태깅이 언제부터 안 됐는지 알 방법이 없다.
    console.error("setReportUser failed", userError);
  }
}

/**
 * 콜백 안에서 일어난 setReportUser·보고가 콜백 밖으로 새지 않게 가둔다.
 *
 * setReportUser가 isolation scope에 쓰기 때문에 필요하다(위 주석 참고).
 * 서버리스 warm 인스턴스에서 일회성 호출(예: 관리자 도달 테스트)이 사용자 태그를
 * 남기면, 이후의 무관한 이벤트가 그 사용자에게 잘못 귀속된다.
 *
 * ⚠️ 형제 헬퍼들과 달리 **삼키지 않는다.** 콜백이 던지는 것을 그대로 통과시킨다 —
 * Next의 redirect()/notFound() 제어 흐름 예외가 여기서 잡히면 안 되기 때문이다.
 */
export function withIsolatedReportScope<T>(run: () => T): T {
  return Sentry.withIsolationScope(() => run());
}
