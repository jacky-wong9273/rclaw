/**
 * Multi-Agent Protocol Schemas
 *
 * TypeBox schemas for multi-agent gateway RPC methods.
 * These extend the existing gateway protocol to support orchestrated
 * multi-agent workflows.
 */

import { Type, type Static } from "@sinclair/typebox";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const AgentIdString = Type.String({ minLength: 1, maxLength: 128, pattern: "^[a-z0-9][a-z0-9_-]*$" });
const RoleNameString = Type.String({ minLength: 1, maxLength: 64, pattern: "^[a-z][a-z0-9_-]*$" });

// ---------------------------------------------------------------------------
// multi-agent.roles
// ---------------------------------------------------------------------------

export const MultiAgentRolesListParamsSchema = Type.Object(
  {},
  { additionalProperties: false },
);

export const MultiAgentRoleSchema = Type.Object(
  {
    name: RoleNameString,
    description: Type.String(),
    priority: Type.Integer({ minimum: 0, maximum: 100 }),
    maxConcurrent: Type.Integer({ minimum: 1, maximum: 64 }),
    allowedTools: Type.Optional(Type.Array(Type.String())),
    deniedTools: Type.Optional(Type.Array(Type.String())),
    systemPromptExtension: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const MultiAgentRolesListResultSchema = Type.Object(
  {
    roles: Type.Array(MultiAgentRoleSchema),
  },
  { additionalProperties: false },
);

export const MultiAgentRoleAssignParamsSchema = Type.Object(
  {
    agentId: AgentIdString,
    roleName: RoleNameString,
  },
  { additionalProperties: false },
);

export const MultiAgentRoleUnassignParamsSchema = Type.Object(
  {
    agentId: AgentIdString,
  },
  { additionalProperties: false },
);

// ---------------------------------------------------------------------------
// multi-agent.tasks
// ---------------------------------------------------------------------------

export const MultiAgentTaskSubmitParamsSchema = Type.Object(
  {
    description: Type.String({ minLength: 1, maxLength: 16384 }),
    requiredRole: Type.Optional(RoleNameString),
    priority: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
    metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    workflowId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const MultiAgentTaskStatusParamsSchema = Type.Object(
  {
    taskId: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const MultiAgentTaskCancelParamsSchema = Type.Object(
  {
    taskId: Type.String({ minLength: 1 }),
    reason: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const MultiAgentWorkSummaryParamsSchema = Type.Object(
  {},
  { additionalProperties: false },
);

// ---------------------------------------------------------------------------
// multi-agent.agents
// ---------------------------------------------------------------------------

export const MultiAgentRegisterParamsSchema = Type.Object(
  {
    agentId: AgentIdString,
    gatewayId: Type.Optional(Type.String()),
    roleName: Type.Optional(RoleNameString),
    capabilities: Type.Optional(Type.Array(Type.String())),
  },
  { additionalProperties: false },
);

export const MultiAgentUnregisterParamsSchema = Type.Object(
  {
    agentId: AgentIdString,
  },
  { additionalProperties: false },
);

export const MultiAgentListParamsSchema = Type.Object(
  {},
  { additionalProperties: false },
);

// ---------------------------------------------------------------------------
// multi-agent.security
// ---------------------------------------------------------------------------

export const MultiAgentSecurityAuditParamsSchema = Type.Object(
  {
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
  },
  { additionalProperties: false },
);

export const MultiAgentSecurityPolicyParamsSchema = Type.Object(
  {
    agentId: AgentIdString,
    permissions: Type.Array(Type.String()),
    maxMessagesPerMinute: Type.Optional(Type.Integer({ minimum: 1, maximum: 10000 })),
    allowedGateways: Type.Optional(Type.Array(Type.String())),
  },
  { additionalProperties: false },
);

// ---------------------------------------------------------------------------
// Static types
// ---------------------------------------------------------------------------

export type MultiAgentRolesListParams = Static<typeof MultiAgentRolesListParamsSchema>;
export type MultiAgentRole = Static<typeof MultiAgentRoleSchema>;
export type MultiAgentRolesListResult = Static<typeof MultiAgentRolesListResultSchema>;
export type MultiAgentRoleAssignParams = Static<typeof MultiAgentRoleAssignParamsSchema>;
export type MultiAgentRoleUnassignParams = Static<typeof MultiAgentRoleUnassignParamsSchema>;
export type MultiAgentTaskSubmitParams = Static<typeof MultiAgentTaskSubmitParamsSchema>;
export type MultiAgentTaskStatusParams = Static<typeof MultiAgentTaskStatusParamsSchema>;
export type MultiAgentTaskCancelParams = Static<typeof MultiAgentTaskCancelParamsSchema>;
export type MultiAgentWorkSummaryParams = Static<typeof MultiAgentWorkSummaryParamsSchema>;
export type MultiAgentRegisterParams = Static<typeof MultiAgentRegisterParamsSchema>;
export type MultiAgentUnregisterParams = Static<typeof MultiAgentUnregisterParamsSchema>;
export type MultiAgentListParams = Static<typeof MultiAgentListParamsSchema>;
export type MultiAgentSecurityAuditParams = Static<typeof MultiAgentSecurityAuditParamsSchema>;
export type MultiAgentSecurityPolicyParams = Static<typeof MultiAgentSecurityPolicyParamsSchema>;
