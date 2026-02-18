/**
 * Multi-Agent Communication Protocol
 *
 * Defines the message types and routing logic for inter-agent communication
 * across devices and gateway instances. Agents can be assigned roles,
 * exchange structured messages, and coordinate on shared workflows.
 *
 * Protocol layers:
 *   1. Transport — WebSocket or HTTP between gateways
 *   2. Envelope  — routing, auth, idempotency
 *   3. Payload   — typed message body (task, result, heartbeat, etc.)
 */

import { Type, type Static } from "@sinclair/typebox";

// ---------------------------------------------------------------------------
// Agent Identity & Role
// ---------------------------------------------------------------------------

export const AgentRoleSchema = Type.Object(
  {
    /** Unique role identifier (e.g. "researcher", "coder", "reviewer"). */
    roleId: Type.String({ minLength: 1, maxLength: 128 }),
    /** Human-readable name. */
    name: Type.String({ minLength: 1, maxLength: 256 }),
    /** Description of the role's responsibilities. */
    description: Type.Optional(Type.String({ maxLength: 2048 })),
    /** System-prompt snippet injected when an agent adopts this role. */
    systemPromptFragment: Type.Optional(Type.String({ maxLength: 16_384 })),
    /** Tool allowlist — tools this role is permitted to use. Empty = all. */
    allowedTools: Type.Optional(Type.Array(Type.String(), { maxItems: 256 })),
    /** Tool denylist — tools this role must never invoke. */
    deniedTools: Type.Optional(Type.Array(Type.String(), { maxItems: 256 })),
    /** Maximum concurrency for agents in this role. */
    maxConcurrent: Type.Optional(Type.Integer({ minimum: 1, maximum: 64 })),
    /** Priority (higher = scheduled first when resources are scarce). */
    priority: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
  },
  { additionalProperties: false },
);

export type AgentRole = Static<typeof AgentRoleSchema>;

export const MultiAgentIdentitySchema = Type.Object(
  {
    /** Globally unique agent instance ID (UUID v4). */
    agentInstanceId: Type.String({ format: "uuid" }),
    /** Gateway-local agent config id (matches AgentConfig.id). */
    agentConfigId: Type.String({ minLength: 1 }),
    /** Gateway instance identifier (hostname:port or peer key). */
    gatewayId: Type.String({ minLength: 1 }),
    /** Active role for this agent. */
    roleId: Type.Optional(Type.String()),
    /** Display name. */
    displayName: Type.Optional(Type.String()),
    /** Capabilities this agent advertises. */
    capabilities: Type.Optional(Type.Array(Type.String(), { maxItems: 128 })),
  },
  { additionalProperties: false },
);

export type MultiAgentIdentity = Static<typeof MultiAgentIdentitySchema>;

// ---------------------------------------------------------------------------
// Message Envelope
// ---------------------------------------------------------------------------

/** Direction of the message within the multi-agent mesh. */
export type MessageDirection = "request" | "response" | "broadcast" | "event";

export const MessageEnvelopeSchema = Type.Object(
  {
    /** Unique message ID for idempotency. */
    messageId: Type.String({ format: "uuid" }),
    /** Correlation ID — groups request/response pairs and workflow chains. */
    correlationId: Type.String({ format: "uuid" }),
    /** ISO-8601 timestamp of message creation. */
    timestamp: Type.String(),
    /** Sender identity. */
    from: MultiAgentIdentitySchema,
    /** Recipient — omit for broadcasts. */
    to: Type.Optional(MultiAgentIdentitySchema),
    /** Direction/intent. */
    direction: Type.Unsafe<MessageDirection>({ type: "string" }),
    /** Protocol version for forward-compat. */
    protocolVersion: Type.Literal("1.0"),
    /** HMAC-SHA256 signature of the payload for integrity verification. */
    signature: Type.Optional(Type.String()),
    /** TTL in seconds — messages older than this are discarded. */
    ttlSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 86_400 })),
    /** Hop count to prevent routing loops. */
    hopCount: Type.Optional(Type.Integer({ minimum: 0, maximum: 32 })),
  },
  { additionalProperties: false },
);

export type MessageEnvelope = Static<typeof MessageEnvelopeSchema>;

// ---------------------------------------------------------------------------
// Payload Types
// ---------------------------------------------------------------------------

export const TaskAssignmentPayloadSchema = Type.Object(
  {
    type: Type.Literal("task.assign"),
    /** Human-readable task description / prompt. */
    task: Type.String({ minLength: 1, maxLength: 65_536 }),
    /** Optional structured context (files, data, prior results). */
    context: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    /** Deadline as ISO-8601. */
    deadline: Type.Optional(Type.String()),
    /** Priority override for this specific task. */
    priority: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
    /** Maximum runtime in ms before task is force-aborted. */
    timeoutMs: Type.Optional(Type.Integer({ minimum: 1_000, maximum: 3_600_000 })),
    /** Workflow step reference (ties into MeshWorkflowPlan). */
    workflowStepId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const TaskResultPayloadSchema = Type.Object(
  {
    type: Type.Literal("task.result"),
    /** Outcome status. */
    status: Type.Unsafe<"success" | "failure" | "partial" | "timeout">({ type: "string" }),
    /** Result data. */
    result: Type.Optional(Type.String({ maxLength: 262_144 })),
    /** Structured output (JSON-serializable). */
    structuredOutput: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    /** Error details when status != success. */
    error: Type.Optional(Type.String({ maxLength: 8192 })),
    /** Token usage for the task. */
    usage: Type.Optional(
      Type.Object({
        inputTokens: Type.Integer({ minimum: 0 }),
        outputTokens: Type.Integer({ minimum: 0 }),
        cacheReadTokens: Type.Optional(Type.Integer({ minimum: 0 })),
      }),
    ),
    /** Duration in ms. */
    durationMs: Type.Optional(Type.Integer({ minimum: 0 })),
    /** Workflow step reference. */
    workflowStepId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const TaskProgressPayloadSchema = Type.Object(
  {
    type: Type.Literal("task.progress"),
    /** 0–100 percentage. */
    percent: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
    /** Human-readable status line. */
    statusLine: Type.Optional(Type.String({ maxLength: 1024 })),
    /** Structured progress metadata. */
    metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    /** Workflow step reference. */
    workflowStepId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const HeartbeatPayloadSchema = Type.Object(
  {
    type: Type.Literal("heartbeat"),
    /** Agent load (0–1 ratio of busy lanes / total lanes). */
    load: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
    /** Active task count. */
    activeTasks: Type.Optional(Type.Integer({ minimum: 0 })),
    /** Uptime in ms. */
    uptimeMs: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const AgentDiscoveryPayloadSchema = Type.Object(
  {
    type: Type.Literal("agent.discovery"),
    /** Action: join the mesh or leave. */
    action: Type.Unsafe<"join" | "leave" | "announce">({ type: "string" }),
    /** Agent identity being announced. */
    agent: MultiAgentIdentitySchema,
    /** Roles this agent can fill. */
    availableRoles: Type.Optional(Type.Array(Type.String(), { maxItems: 32 })),
  },
  { additionalProperties: false },
);

export const RoleAssignPayloadSchema = Type.Object(
  {
    type: Type.Literal("role.assign"),
    /** Target agent instance ID. */
    targetAgentInstanceId: Type.String({ format: "uuid" }),
    /** Role to assign. */
    role: AgentRoleSchema,
  },
  { additionalProperties: false },
);

export const SecurityChallengePayloadSchema = Type.Object(
  {
    type: Type.Literal("security.challenge"),
    /** Challenge nonce (base64). */
    nonce: Type.String(),
    /** Expected algorithm for response. */
    algorithm: Type.Literal("ed25519"),
  },
  { additionalProperties: false },
);

export const SecurityResponsePayloadSchema = Type.Object(
  {
    type: Type.Literal("security.response"),
    /** Signed nonce (base64). */
    signedNonce: Type.String(),
    /** Public key of the responder (base64). */
    publicKey: Type.String(),
  },
  { additionalProperties: false },
);

export type TaskAssignmentPayload = Static<typeof TaskAssignmentPayloadSchema>;
export type TaskResultPayload = Static<typeof TaskResultPayloadSchema>;
export type TaskProgressPayload = Static<typeof TaskProgressPayloadSchema>;
export type HeartbeatPayload = Static<typeof HeartbeatPayloadSchema>;
export type AgentDiscoveryPayload = Static<typeof AgentDiscoveryPayloadSchema>;
export type RoleAssignPayload = Static<typeof RoleAssignPayloadSchema>;
export type SecurityChallengePayload = Static<typeof SecurityChallengePayloadSchema>;
export type SecurityResponsePayload = Static<typeof SecurityResponsePayloadSchema>;

/** Union of all multi-agent message payloads. */
export type MultiAgentPayload =
  | TaskAssignmentPayload
  | TaskResultPayload
  | TaskProgressPayload
  | HeartbeatPayload
  | AgentDiscoveryPayload
  | RoleAssignPayload
  | SecurityChallengePayload
  | SecurityResponsePayload;

/** A fully-typed multi-agent message with envelope + payload. */
export type MultiAgentMessage = {
  envelope: MessageEnvelope;
  payload: MultiAgentPayload;
};
