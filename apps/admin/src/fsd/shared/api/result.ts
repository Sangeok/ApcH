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
export function success(): ActionResult<void>;
export function success<T>(data: T): ActionResult<T>;
export function success<T>(...args: [] | [T]): ActionResult<T | void> {
  if (args.length === 0) {
    return { success: true, data: undefined };
  }

  return { success: true, data: args[0] };
}

/**
 * Creates a failure result
 */
export function failure(error: string): ActionResult<never> {
  return { success: false, error };
}

