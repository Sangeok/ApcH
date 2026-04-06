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

