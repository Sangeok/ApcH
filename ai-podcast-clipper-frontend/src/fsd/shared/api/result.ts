/**
 * Unified result type for server actions
 * Provides type-safe success/failure handling
 */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Creates a success result
 */
export function success<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

/**
 * Creates a failure result
 */
export function failure(error: string): ActionResult<never> {
  return { success: false, error };
}

/**
 * Type guard for success results
 */
export function isSuccess<T>(
  result: ActionResult<T>,
): result is { success: true; data: T } {
  return result.success;
}

/**
 * Type guard for failure results
 */
export function isFailure<T>(
  result: ActionResult<T>,
): result is { success: false; error: string } {
  return !result.success;
}
