/**
 * Centralized error classifier for sofIA CLI.
 *
 * Maps raw errors to well-defined categories with:
 * - Recovery guidance (is it retryable?)
 * - User-facing messages (no stack traces)
 * - Category-based handling (MCP, auth, network, validation, etc.)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ErrorCategory =
  | 'connection'
  | 'dns'
  | 'timeout'
  | 'auth'
  | 'rate-limit'
  | 'not-found'
  | 'validation'
  | 'mcp'
  | 'internal';

export interface ErrorClassification {
  category: ErrorCategory;
  recoverable: boolean;
  message: string;
  originalError: unknown;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Classify any thrown value into a well-defined `ErrorClassification`.
 */
export function classifyError(err: unknown): ErrorClassification {
  // Normalise to an Error-like shape
  const error =
    err instanceof Error ? err : typeof err === 'string' ? new Error(err) : new Error(String(err));

  const code = (err as { code?: string }).code;
  const statusCode = (err as { statusCode?: number }).statusCode;

  // --- Network / system codes ---
  if (code === 'ECONNREFUSED') {
    return {
      category: 'connection',
      recoverable: true,
      message: error.message,
      originalError: err,
    };
  }
  if (code === 'ENOTFOUND') {
    return {
      category: 'dns',
      recoverable: true,
      message: error.message,
      originalError: err,
    };
  }
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') {
    return {
      category: 'timeout',
      recoverable: true,
      message: error.message,
      originalError: err,
    };
  }
  if (code === 'ENOENT') {
    return {
      category: 'not-found',
      recoverable: false,
      message: error.message,
      originalError: err,
    };
  }

  // --- HTTP status codes ---
  if (statusCode === 401 || statusCode === 403) {
    return {
      category: 'auth',
      recoverable: false,
      message: error.message,
      originalError: err,
    };
  }
  if (statusCode === 429) {
    return {
      category: 'rate-limit',
      recoverable: true,
      message: error.message,
      originalError: err,
    };
  }

  // --- Zod / validation errors ---
  if (error.name === 'ZodError' || error.name === 'ZodValidationError') {
    return {
      category: 'validation',
      recoverable: false,
      message: error.message,
      originalError: err,
    };
  }

  // --- MCP server errors (heuristic: message mentions "MCP") ---
  if (/\bmcp\b/i.test(error.message)) {
    return {
      category: 'mcp',
      recoverable: true,
      message: error.message,
      originalError: err,
    };
  }

  // --- Fallback ---
  return {
    category: 'internal',
    recoverable: false,
    message: error.message,
    originalError: err,
  };
}

// ---------------------------------------------------------------------------
// User-facing messages
// ---------------------------------------------------------------------------

const USER_MESSAGES: Record<ErrorCategory, string> = {
  connection:
    'Unable to establish a connection. Please check that the service is running and try again.',
  dns: 'DNS lookup failed — verify your network connection and that the hostname is correct.',
  timeout: 'The request timed out. The service may be under heavy load; please try again shortly.',
  auth: 'Authentication failed — please check your credentials or auth token and try again.',
  'rate-limit': 'Rate limit exceeded. Please wait a moment before retrying.',
  'not-found': 'The requested resource was not found. Verify the path or identifier and try again.',
  validation:
    'Data validation failed. The input or stored data does not match the expected schema.',
  mcp: 'An MCP service encountered an error. It may be temporarily unavailable — retrying might help.',
  internal: 'An unexpected error occurred. If the problem persists, please report it.',
};

/**
 * Convert a classification into a safe, user-facing message
 * (never includes stack traces or internal details).
 */
export function toUserMessage(classification: ErrorClassification): string {
  return USER_MESSAGES[classification.category];
}
