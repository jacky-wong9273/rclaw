/**
 * Multi-Agent Module — Public API
 *
 * Re-exports the core multi-agent infrastructure for use by the gateway,
 * CLI, and dashboard.
 */

export { MultiAgentOrchestrator, type OrchestratorConfig, type OrchestratorEvent } from "./orchestrator.js";
export { RoleManager, BUILT_IN_ROLES, type RoleAssignment } from "./role-manager.js";
export { MessageRouter, type PeerGateway, type MessageHandler } from "./message-router.js";
export {
  WorkTracker,
  type TrackedTask,
  type TaskStatus,
  type WorkSummary,
  type AgentWorkload,
} from "./work-tracker.js";
export {
  AgentSecurityManager,
  type AgentPermission,
  type AgentSecurityPolicy,
  type SecurityAuditEntry,
} from "./security.js";
export type {
  AgentRole,
  MultiAgentIdentity,
  MultiAgentMessage,
  MessageEnvelope,
  MultiAgentPayload,
  MessageDirection,
  TaskAssignmentPayload,
  TaskResultPayload,
  TaskProgressPayload,
  HeartbeatPayload,
  AgentDiscoveryPayload,
  RoleAssignPayload,
  SecurityChallengePayload,
  SecurityResponsePayload,
} from "./protocol.js";
export {
  validateAgentId,
  validateRoleName,
  validateUUID,
  validatePayloadSize,
  validateTaskDescription,
  sanitizeString,
  validateGatewayUrl,
  validateAll,
  type ValidationResult,
} from "./input-validation.js";
