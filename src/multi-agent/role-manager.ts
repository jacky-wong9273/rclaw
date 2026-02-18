/**
 * Multi-Agent Role Manager
 *
 * Manages agent role definitions, assignments, and lifecycle.
 * Roles define what an agent is responsible for, which tools it can use,
 * and what system-prompt fragments are injected.
 */

import type { AgentRole, MultiAgentIdentity } from "./protocol.js";

export type RoleAssignment = {
  agentInstanceId: string;
  agentConfigId: string;
  gatewayId: string;
  role: AgentRole;
  assignedAt: number;
  assignedBy: string;
};

export type RoleManagerState = {
  /** All defined roles. */
  roles: Map<string, AgentRole>;
  /** Active assignments: agentInstanceId → RoleAssignment. */
  assignments: Map<string, RoleAssignment>;
};

/**
 * Built-in role templates for common business processes.
 * Users can customize or create their own roles on top of these.
 */
export const BUILT_IN_ROLES: readonly AgentRole[] = [
  {
    roleId: "orchestrator",
    name: "Orchestrator",
    description:
      "Coordinates work across agents. Decomposes goals into tasks, assigns them, monitors progress, and synthesizes results.",
    systemPromptFragment: `You are the orchestrator. Your job is to:
1. Break down the user's goal into discrete tasks
2. Assign each task to the most appropriate agent based on their role and capabilities
3. Monitor progress and handle failures (retry, reassign, or escalate)
4. Synthesize results from all agents into a coherent response
5. Never perform tasks directly — always delegate to specialist agents`,
    allowedTools: [],
    priority: 100,
    maxConcurrent: 2,
  },
  {
    roleId: "researcher",
    name: "Researcher",
    description:
      "Gathers information from tools, APIs, and knowledge bases. Does not make changes to systems.",
    systemPromptFragment: `You are a researcher. Your job is to:
1. Search for and gather relevant information
2. Analyze and summarize findings
3. Provide well-sourced answers with references
4. Flag when information is uncertain or conflicting
You must NOT modify files, execute commands that change state, or make decisions — only inform.`,
    deniedTools: ["exec", "fs_write", "fs_delete", "fs_move", "apply_patch"],
    priority: 50,
  },
  {
    roleId: "coder",
    name: "Coder",
    description:
      "Writes, modifies, and reviews code. Has access to filesystem and execution tools within sandboxed environments.",
    systemPromptFragment: `You are a coder. Your job is to:
1. Write clean, well-tested, idiomatic code
2. Follow the project's coding standards and patterns
3. Run tests after making changes
4. Report results clearly with file paths and line numbers`,
    priority: 60,
  },
  {
    roleId: "reviewer",
    name: "Reviewer",
    description:
      "Reviews work products from other agents. Checks for correctness, security, and adherence to standards.",
    systemPromptFragment: `You are a reviewer. Your job is to:
1. Review code, documents, or other artifacts for quality
2. Check for security vulnerabilities, bugs, and anti-patterns
3. Verify adherence to project standards
4. Provide specific, actionable feedback
You must NOT make changes directly — only review and report findings.`,
    deniedTools: ["exec", "fs_write", "fs_delete", "fs_move", "apply_patch"],
    priority: 70,
  },
  {
    roleId: "monitor",
    name: "Monitor",
    description:
      "Observes system health, tracks task progress, and raises alerts on anomalies or deadline risks.",
    systemPromptFragment: `You are a monitor. Your job is to:
1. Track the status of all active tasks and agents
2. Detect anomalies (stalled tasks, high error rates, resource exhaustion)
3. Report progress summaries periodically
4. Alert the orchestrator about deadline risks or failures`,
    deniedTools: ["exec", "fs_write", "fs_delete", "fs_move", "apply_patch"],
    priority: 80,
    maxConcurrent: 1,
  },
  {
    roleId: "executor",
    name: "Executor",
    description:
      "Executes approved commands and scripts. Only acts on explicit, pre-approved instructions.",
    systemPromptFragment: `You are an executor. Your job is to:
1. Execute commands that have been explicitly approved
2. Report execution results faithfully
3. Stop immediately if a command fails and report the error
4. Never improvise or execute unapproved actions`,
    priority: 40,
    maxConcurrent: 4,
  },
] as const;

export class RoleManager {
  private state: RoleManagerState;

  constructor() {
    this.state = {
      roles: new Map(),
      assignments: new Map(),
    };
    // Seed built-in roles
    for (const role of BUILT_IN_ROLES) {
      this.state.roles.set(role.roleId, { ...role });
    }
  }

  /** Register or update a role definition. */
  defineRole(role: AgentRole): void {
    this.state.roles.set(role.roleId, { ...role });
  }

  /** Remove a role definition (does not unassign agents already on this role). */
  removeRole(roleId: string): boolean {
    return this.state.roles.delete(roleId);
  }

  /** Get a role by ID. */
  getRole(roleId: string): AgentRole | undefined {
    return this.state.roles.get(roleId);
  }

  /** List all defined roles. */
  listRoles(): AgentRole[] {
    return [...this.state.roles.values()];
  }

  /** Assign a role to an agent. */
  assignRole(
    agent: MultiAgentIdentity,
    roleId: string,
    assignedBy: string,
  ): RoleAssignment | null {
    const role = this.state.roles.get(roleId);
    if (!role) return null;

    // Enforce maxConcurrent for the role
    if (role.maxConcurrent != null) {
      const activeCount = this.countAgentsWithRole(roleId);
      const currentAssignment = this.state.assignments.get(agent.agentInstanceId);
      const alreadyHasRole = currentAssignment?.role.roleId === roleId;
      if (!alreadyHasRole && activeCount >= role.maxConcurrent) {
        return null;
      }
    }

    const assignment: RoleAssignment = {
      agentInstanceId: agent.agentInstanceId,
      agentConfigId: agent.agentConfigId,
      gatewayId: agent.gatewayId,
      role: { ...role },
      assignedAt: Date.now(),
      assignedBy,
    };

    this.state.assignments.set(agent.agentInstanceId, assignment);
    return assignment;
  }

  /** Unassign an agent's role. */
  unassignRole(agentInstanceId: string): boolean {
    return this.state.assignments.delete(agentInstanceId);
  }

  /** Get the current assignment for an agent. */
  getAssignment(agentInstanceId: string): RoleAssignment | undefined {
    return this.state.assignments.get(agentInstanceId);
  }

  /** List all current assignments. */
  listAssignments(): RoleAssignment[] {
    return [...this.state.assignments.values()];
  }

  /** Count agents currently assigned to a role. */
  countAgentsWithRole(roleId: string): number {
    let count = 0;
    for (const a of this.state.assignments.values()) {
      if (a.role.roleId === roleId) count++;
    }
    return count;
  }

  /** Get all agents assigned to a specific role. */
  getAgentsWithRole(roleId: string): RoleAssignment[] {
    return [...this.state.assignments.values()].filter((a) => a.role.roleId === roleId);
  }

  /** Export state for persistence. */
  exportState(): { roles: AgentRole[]; assignments: RoleAssignment[] } {
    return {
      roles: [...this.state.roles.values()],
      assignments: [...this.state.assignments.values()],
    };
  }

  /** Import state from persistence. */
  importState(data: { roles: AgentRole[]; assignments: RoleAssignment[] }): void {
    this.state.roles.clear();
    this.state.assignments.clear();
    for (const role of data.roles) {
      this.state.roles.set(role.roleId, role);
    }
    for (const assignment of data.assignments) {
      this.state.assignments.set(assignment.agentInstanceId, assignment);
    }
  }
}
