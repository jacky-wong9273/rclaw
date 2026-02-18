import { describe, expect, it } from "vitest";
import {
  validateAgentId,
  validateRoleName,
  validateUUID,
  validatePayloadSize,
  validateTaskDescription,
  sanitizeString,
  validateGatewayUrl,
  validateAll,
  MAX_PAYLOAD_SIZE,
} from "./input-validation.js";

describe("validateAgentId", () => {
  it("accepts valid IDs", () => {
    expect(validateAgentId("main")).toEqual({ valid: true });
    expect(validateAgentId("agent-1")).toEqual({ valid: true });
    expect(validateAgentId("my_agent_2")).toEqual({ valid: true });
  });

  it("rejects non-strings", () => {
    expect(validateAgentId(42)).toEqual({ valid: false, error: "agent ID must be a string" });
    expect(validateAgentId(null)).toEqual({ valid: false, error: "agent ID must be a string" });
  });

  it("rejects empty", () => {
    const res = validateAgentId("");
    expect(res.valid).toBe(false);
  });

  it("rejects uppercase", () => {
    const res = validateAgentId("Agent-1");
    expect(res.valid).toBe(false);
  });

  it("rejects IDs starting with hyphen", () => {
    const res = validateAgentId("-agent");
    expect(res.valid).toBe(false);
  });

  it("rejects overlong IDs", () => {
    const res = validateAgentId("a".repeat(200));
    expect(res.valid).toBe(false);
  });
});

describe("validateRoleName", () => {
  it("accepts valid role names", () => {
    expect(validateRoleName("coder")).toEqual({ valid: true });
    expect(validateRoleName("code-reviewer")).toEqual({ valid: true });
  });

  it("rejects names starting with digit", () => {
    const res = validateRoleName("1coder");
    expect(res.valid).toBe(false);
  });
});

describe("validateUUID", () => {
  it("accepts valid UUID v4", () => {
    const res = validateUUID("123e4567-e89b-42d3-a456-426614174000");
    expect(res).toEqual({ valid: true });
  });

  it("rejects malformed UUID", () => {
    const res = validateUUID("not-a-uuid");
    expect(res.valid).toBe(false);
  });
});

describe("validatePayloadSize", () => {
  it("accepts small payloads", () => {
    expect(validatePayloadSize({ text: "hello" })).toEqual({ valid: true });
  });

  it("rejects oversized payloads", () => {
    const huge = { data: "x".repeat(MAX_PAYLOAD_SIZE + 1) };
    const res = validatePayloadSize(huge);
    expect(res.valid).toBe(false);
  });

  it("rejects non-serializable payloads", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const res = validatePayloadSize(circular);
    expect(res.valid).toBe(false);
  });
});

describe("validateTaskDescription", () => {
  it("accepts normal descriptions", () => {
    expect(validateTaskDescription("Fix the bug in parser")).toEqual({ valid: true });
  });

  it("rejects empty/whitespace-only", () => {
    expect(validateTaskDescription("   ").valid).toBe(false);
  });

  it("rejects overly long descriptions", () => {
    expect(validateTaskDescription("x".repeat(20_000)).valid).toBe(false);
  });
});

describe("sanitizeString", () => {
  it("preserves normal text", () => {
    expect(sanitizeString("Hello, world!\nNew line\ttab")).toBe("Hello, world!\nNew line\ttab");
  });

  it("strips null bytes", () => {
    expect(sanitizeString("he\x00llo")).toBe("hello");
  });

  it("strips C1 controls", () => {
    expect(sanitizeString("test\x85data")).toBe("testdata");
  });

  it("strips zero-width characters", () => {
    expect(sanitizeString("a\u200Bb\uFEFFc")).toBe("abc");
  });
});

describe("validateGatewayUrl", () => {
  it("accepts wss URLs", () => {
    expect(validateGatewayUrl("wss://gateway.example.com:18789")).toEqual({ valid: true });
  });

  it("accepts http localhost", () => {
    expect(validateGatewayUrl("http://localhost:18789")).toEqual({ valid: true });
  });

  it("rejects file URLs", () => {
    expect(validateGatewayUrl("file:///etc/passwd").valid).toBe(false);
  });

  it("rejects URLs with embedded credentials", () => {
    expect(validateGatewayUrl("wss://user:pass@host.com").valid).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(validateGatewayUrl("not-a-url").valid).toBe(false);
  });
});

describe("validateAll", () => {
  it("returns valid when all pass", () => {
    const res = validateAll(
      () => validateAgentId("main"),
      () => validateRoleName("coder"),
    );
    expect(res).toEqual({ valid: true });
  });

  it("returns first failure", () => {
    const res = validateAll(
      () => validateAgentId("main"),
      () => validateRoleName(""),
      () => validateAgentId("also-valid"),
    );
    expect(res.valid).toBe(false);
  });
});
