/**
 * Input validation and sanitization utilities for inter-agent communication.
 *
 * Prevents injection attacks, oversized payloads, and malformed data from
 * propagating through the multi-agent message bus.
 */

/** Maximum allowed payload size in bytes (256 KB). */
export const MAX_PAYLOAD_SIZE = 256 * 1024;

/** Maximum agent ID length. */
export const MAX_AGENT_ID_LENGTH = 128;

/** Maximum role name length. */
export const MAX_ROLE_NAME_LENGTH = 64;

/** Maximum task description length. */
export const MAX_TASK_DESCRIPTION_LENGTH = 16_384;

/** Agent ID must be lowercase alphanumeric with hyphens/underscores. */
const AGENT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,127}$/;

/** Role name must be alphanumeric with hyphens/underscores. */
const ROLE_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;

/** UUID v4 pattern for message/correlation IDs. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: string };

/**
 * Validate an agent identifier.
 */
export function validateAgentId(id: unknown): ValidationResult {
  if (typeof id !== "string") {
    return { valid: false, error: "agent ID must be a string" };
  }
  if (id.length === 0) {
    return { valid: false, error: "agent ID must not be empty" };
  }
  if (id.length > MAX_AGENT_ID_LENGTH) {
    return { valid: false, error: `agent ID exceeds max length (${MAX_AGENT_ID_LENGTH})` };
  }
  if (!AGENT_ID_PATTERN.test(id)) {
    return {
      valid: false,
      error: "agent ID must be lowercase alphanumeric (a-z, 0-9, hyphens, underscores)",
    };
  }
  return { valid: true };
}

/**
 * Validate a role name.
 */
export function validateRoleName(name: unknown): ValidationResult {
  if (typeof name !== "string") {
    return { valid: false, error: "role name must be a string" };
  }
  if (name.length === 0) {
    return { valid: false, error: "role name must not be empty" };
  }
  if (name.length > MAX_ROLE_NAME_LENGTH) {
    return { valid: false, error: `role name exceeds max length (${MAX_ROLE_NAME_LENGTH})` };
  }
  if (!ROLE_NAME_PATTERN.test(name)) {
    return {
      valid: false,
      error: "role name must start with a letter and contain only lowercase alphanumeric, hyphens, underscores",
    };
  }
  return { valid: true };
}

/**
 * Validate a UUID v4 string (for message IDs, correlation IDs).
 */
export function validateUUID(value: unknown): ValidationResult {
  if (typeof value !== "string") {
    return { valid: false, error: "UUID must be a string" };
  }
  if (!UUID_PATTERN.test(value)) {
    return { valid: false, error: "invalid UUID v4 format" };
  }
  return { valid: true };
}

/**
 * Validate an inter-agent message payload size.
 * Prevents oversized messages from consuming excessive memory.
 */
export function validatePayloadSize(payload: unknown): ValidationResult {
  let size: number;
  try {
    size = Buffer.byteLength(JSON.stringify(payload), "utf-8");
  } catch {
    return { valid: false, error: "payload is not JSON-serializable" };
  }
  if (size > MAX_PAYLOAD_SIZE) {
    return {
      valid: false,
      error: `payload size (${size} bytes) exceeds limit (${MAX_PAYLOAD_SIZE} bytes)`,
    };
  }
  return { valid: true };
}

/**
 * Validate task description text.
 */
export function validateTaskDescription(text: unknown): ValidationResult {
  if (typeof text !== "string") {
    return { valid: false, error: "task description must be a string" };
  }
  if (text.trim().length === 0) {
    return { valid: false, error: "task description must not be empty" };
  }
  if (text.length > MAX_TASK_DESCRIPTION_LENGTH) {
    return {
      valid: false,
      error: `task description exceeds max length (${MAX_TASK_DESCRIPTION_LENGTH})`,
    };
  }
  return { valid: true };
}

/**
 * Sanitize a string by removing control characters (except newline/tab/carriage return).
 * Prevents injection of terminal escape sequences or hidden Unicode characters.
 */
export function sanitizeString(input: string): string {
  // Remove C0 controls (0x00-0x1F) except \t (0x09), \n (0x0A), \r (0x0D)
  // Remove C1 controls (0x80-0x9F)
  // Remove zero-width characters
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/[\x80-\x9F]/g, "")
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, "");
}

/**
 * Validate and sanitize a gateway URL.
 * Only allows ws:, wss:, http:, and https: schemes.
 */
export function validateGatewayUrl(url: unknown): ValidationResult {
  if (typeof url !== "string") {
    return { valid: false, error: "gateway URL must be a string" };
  }
  try {
    const parsed = new URL(url);
    const allowedProtocols = new Set(["ws:", "wss:", "http:", "https:"]);
    if (!allowedProtocols.has(parsed.protocol)) {
      return {
        valid: false,
        error: `gateway URL protocol must be one of: ws, wss, http, https (got: ${parsed.protocol})`,
      };
    }
    // Reject URLs with credentials embedded
    if (parsed.username || parsed.password) {
      return {
        valid: false,
        error: "gateway URL must not contain embedded credentials",
      };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "gateway URL is not a valid URL" };
  }
}

/**
 * Batch-validate multiple items, returning the first error found.
 */
export function validateAll(
  ...checks: Array<() => ValidationResult>
): ValidationResult {
  for (const check of checks) {
    const result = check();
    if (!result.valid) {
      return result;
    }
  }
  return { valid: true };
}
