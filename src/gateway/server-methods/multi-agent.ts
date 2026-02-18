/**
 * Multi-Agent Gateway Method Handlers
 *
 * Wires the MultiAgentOrchestrator to gateway RPC methods so the
 * dashboard and CLI can manage agents, roles, tasks, and security.
 */

import {
  MultiAgentOrchestrator,
  type OrchestratorConfig,
} from "../../multi-agent/index.js";
import type { GatewayRequestHandlers } from "./types.js";

// Singleton orchestrator — created lazily on first use
let orchestrator: MultiAgentOrchestrator | null = null;

function getOrchestrator(): MultiAgentOrchestrator {
  if (!orchestrator) {
    const config: OrchestratorConfig = {
      gatewayId: `gateway-${Date.now().toString(36)}`,
      cleanupIntervalMs: 60_000,
    };
    orchestrator = new MultiAgentOrchestrator(config);
  }
  return orchestrator;
}

export const multiAgentHandlers: GatewayRequestHandlers = {
  // -----------------------------------------------------------------------
  // Roles
  // -----------------------------------------------------------------------
  "multi-agent.roles.list": ({ respond }) => {
    const orch = getOrchestrator();
    const roles = orch.roles.listRoles();
    respond(true, { roles }, undefined);
  },

  "multi-agent.roles.assign": ({ params, respond }) => {
    const orch = getOrchestrator();
    const { agentId, roleName } = params as { agentId: string; roleName: string };
    const role = orch.roles.getRole(roleName);
    if (!role) {
      respond(false, undefined, { code: -1, message: `role not found: ${roleName}` });
      return;
    }
    // Find the agent in registered locals, or create a minimal identity
    const agents = orch.listAgents();
    const agent = agents.find((a) => a.agentInstanceId === agentId);
    if (!agent) {
      respond(false, undefined, { code: -1, message: `agent not registered: ${agentId}` });
      return;
    }
    orch.assignRole(agentId, roleName);
    respond(true, { agentId, roleName }, undefined);
  },

  "multi-agent.roles.unassign": ({ params, respond }) => {
    const orch = getOrchestrator();
    const { agentId } = params as { agentId: string };
    orch.roles.unassignRole(agentId);
    respond(true, { agentId }, undefined);
  },

  // -----------------------------------------------------------------------
  // Tasks
  // -----------------------------------------------------------------------
  "multi-agent.tasks.submit": ({ params, respond }) => {
    const orch = getOrchestrator();
    const { description, requiredRole, priority, metadata, workflowId } = params as {
      description: string;
      requiredRole?: string;
      priority?: number;
      metadata?: Record<string, unknown>;
      workflowId?: string;
    };
    const task = orch.submitTask({
      task: description,
      targetRoleId: requiredRole,
      priority,
      tags: metadata ? Object.keys(metadata) : undefined,
      workflowPlanId: workflowId,
    });
    respond(true, { task }, undefined);
  },

  "multi-agent.tasks.status": ({ params, respond }) => {
    const orch = getOrchestrator();
    const { taskId } = params as { taskId: string };
    const task = orch.tracker.getTask(taskId);
    if (!task) {
      respond(false, undefined, { code: -1, message: `task not found: ${taskId}` });
      return;
    }
    respond(true, { task }, undefined);
  },

  "multi-agent.tasks.cancel": ({ params, respond }) => {
    const orch = getOrchestrator();
    const { taskId } = params as { taskId: string; reason?: string };
    const cancelled = orch.tracker.cancelTask(taskId);
    if (!cancelled) {
      respond(false, undefined, { code: -1, message: `cannot cancel task: ${taskId}` });
      return;
    }
    respond(true, { taskId, cancelled: true }, undefined);
  },

  "multi-agent.tasks.summary": ({ respond }) => {
    const orch = getOrchestrator();
    const summary = orch.tracker.getSummary();
    respond(true, { summary }, undefined);
  },

  // -----------------------------------------------------------------------
  // Agents
  // -----------------------------------------------------------------------
  "multi-agent.agents.register": ({ params, respond }) => {
    const orch = getOrchestrator();
    const { agentId, gatewayId, roleName, capabilities } = params as {
      agentId: string;
      gatewayId?: string;
      roleName?: string;
      capabilities?: string[];
    };
    const identity = {
      agentInstanceId: agentId,
      agentConfigId: agentId,
      gatewayId: gatewayId ?? orch.gatewayId,
      roleId: roleName,
      displayName: agentId,
      capabilities,
    };
    orch.registerAgent(identity, roleName);
    respond(true, { agentId, registered: true }, undefined);
  },

  "multi-agent.agents.unregister": ({ params, respond }) => {
    const orch = getOrchestrator();
    const { agentId } = params as { agentId: string };
    orch.unregisterAgent(agentId);
    respond(true, { agentId, unregistered: true }, undefined);
  },

  "multi-agent.agents.list": ({ respond }) => {
    const orch = getOrchestrator();
    const agents = orch.listAgents();
    respond(true, { agents }, undefined);
  },

  // -----------------------------------------------------------------------
  // Security
  // -----------------------------------------------------------------------
  "multi-agent.security.audit": ({ params, respond }) => {
    const orch = getOrchestrator();
    const { limit } = (params ?? {}) as { limit?: number };
    const entries = orch.security.getAuditLog(limit ?? 100);
    respond(true, { entries }, undefined);
  },

  "multi-agent.security.policy.set": ({ params, respond }) => {
    const orch = getOrchestrator();
    const { agentId, permissions, maxMessagesPerMinute, allowedGateways } = params as {
      agentId: string;
      permissions: string[];
      maxMessagesPerMinute?: number;
      allowedGateways?: string[];
    };
    orch.security.setPolicy({
      agentId,
      permissions: permissions as import("../../multi-agent/security.js").AgentPermission[],
      maxMessagesPerMinute: maxMessagesPerMinute ?? 120,
      allowedGateways: allowedGateways ?? [],
      crossGatewayAllowed: true,
    });
    respond(true, { agentId, updated: true }, undefined);
  },

  // -----------------------------------------------------------------------
  // Work progress (for dashboard)
  // -----------------------------------------------------------------------
  "multi-agent.work.progress": ({ respond }) => {
    const orch = getOrchestrator();
    const summary = orch.tracker.getSummary();
    const workloads = orch.tracker.getAgentWorkloads();
    const tasks = orch.tracker.listTasks();
    respond(true, { summary, workloads, tasks }, undefined);
  },
};

/**
 * Reset the multi-agent orchestrator (for tests).
 */
export function __resetMultiAgentForTest() {
  if (orchestrator) {
    orchestrator.shutdown();
    orchestrator = null;
  }
}
