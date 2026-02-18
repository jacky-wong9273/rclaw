/**
 * Multi-Agent Orchestrator
 *
 * High-level coordination layer that ties together the role manager,
 * message router, and work tracker to enable multi-agent workflows
 * across devices and gateway instances.
 */

import { randomUUID } from "node:crypto";
import type {
  AgentRole,
  MultiAgentIdentity,
  MultiAgentMessage,
  TaskAssignmentPayload,
  TaskResultPayload,
  TaskProgressPayload,
  HeartbeatPayload,
  AgentDiscoveryPayload,
  RoleAssignPayload,
} from "./protocol.js";
import { RoleManager } from "./role-manager.js";
import { MessageRouter } from "./message-router.js";
import { WorkTracker, type TrackedTask, type WorkSummary, type AgentWorkload } from "./work-tracker.js";
import { AgentSecurityManager } from "./security.js";

export type OrchestratorConfig = {
  /** This gateway's unique identifier. */
  gatewayId: string;
  /** Heartbeat interval in ms (default: 30_000). */
  heartbeatIntervalMs?: number;
  /** Cleanup interval for completed tasks in ms (default: 3_600_000 = 1h). */
  cleanupIntervalMs?: number;
  /** Max age for completed tasks before cleanup in ms (default: 86_400_000 = 24h). */
  taskMaxAgeMs?: number;
};

export type OrchestratorEvent =
  | { type: "agent.joined"; agent: MultiAgentIdentity }
  | { type: "agent.left"; agentInstanceId: string }
  | { type: "role.assigned"; agentInstanceId: string; roleId: string }
  | { type: "task.created"; taskId: string }
  | { type: "task.assigned"; taskId: string; agentInstanceId: string }
  | { type: "task.progress"; taskId: string; percent?: number }
  | { type: "task.completed"; taskId: string; status: string }
  | { type: "workflow.completed"; workflowPlanId: string };

type EventListener = (event: OrchestratorEvent) => void;

export class MultiAgentOrchestrator {
  readonly roleManager: RoleManager;
  readonly router: MessageRouter;
  readonly workTracker: WorkTracker;
  readonly securityManager: AgentSecurityManager;

  /** Convenience alias for roleManager. */
  get roles(): RoleManager { return this.roleManager; }
  /** Convenience alias for workTracker. */
  get tracker(): WorkTracker { return this.workTracker; }
  /** Convenience alias for securityManager. */
  get security(): AgentSecurityManager { return this.securityManager; }
  /** This gateway's unique identifier. */
  get gatewayId(): string { return this.config.gatewayId; }

  private config: Required<OrchestratorConfig>;
  private eventListeners: EventListener[] = [];
  private heartbeatTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private agentHeartbeats: Map<string, HeartbeatPayload & { receivedAt: number }> = new Map();

  constructor(config: OrchestratorConfig) {
    this.config = {
      gatewayId: config.gatewayId,
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? 30_000,
      cleanupIntervalMs: config.cleanupIntervalMs ?? 3_600_000,
      taskMaxAgeMs: config.taskMaxAgeMs ?? 86_400_000,
    };

    this.roleManager = new RoleManager();
    this.router = new MessageRouter(this.config.gatewayId);
    this.workTracker = new WorkTracker();
    this.securityManager = new AgentSecurityManager();

    this.setupMessageHandlers();
  }

  /** Start the orchestrator (heartbeats, cleanup timers). */
  start(): void {
    // Periodic cleanup
    this.cleanupTimer = setInterval(() => {
      this.workTracker.cleanup(this.config.taskMaxAgeMs);
    }, this.config.cleanupIntervalMs);

    // Broadcast local agents to peers
    for (const agent of this.router.getLocalAgents()) {
      this.broadcastDiscovery(agent, "announce");
    }
  }

  /** Stop the orchestrator. */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Broadcast leave for all local agents
    for (const agent of this.router.getLocalAgents()) {
      this.broadcastDiscovery(agent, "leave");
    }
  }

  /** Alias for stop() for symmetry with lifecycle methods. */
  shutdown(): void {
    this.stop();
  }

  /** List all local agents registered with this orchestrator. */
  listAgents(): MultiAgentIdentity[] {
    return this.router.getLocalAgents();
  }

  /** Register a local agent with the orchestrator. */
  registerAgent(agent: MultiAgentIdentity, roleId?: string): void {
    this.router.registerLocalAgent(agent);

    if (roleId) {
      this.roleManager.assignRole(agent, roleId, "orchestrator");
    }

    this.broadcastDiscovery(agent, "join");
    this.emit({ type: "agent.joined", agent });

    if (roleId) {
      this.emit({ type: "role.assigned", agentInstanceId: agent.agentInstanceId, roleId });
    }
  }

  /** Unregister a local agent. */
  unregisterAgent(agentInstanceId: string): void {
    this.router.unregisterLocalAgent(agentInstanceId);
    this.roleManager.unassignRole(agentInstanceId);
    this.agentHeartbeats.delete(agentInstanceId);
    this.emit({ type: "agent.left", agentInstanceId });
  }

  /** Assign a role to an agent. */
  assignRole(agentInstanceId: string, roleId: string): boolean {
    const agents = this.router.getLocalAgents();
    const agent = agents.find((a) => a.agentInstanceId === agentInstanceId);
    if (!agent) return false;

    const assignment = this.roleManager.assignRole(agent, roleId, "orchestrator");
    if (!assignment) return false;

    // Notify the agent of its role assignment
    const payload: RoleAssignPayload = {
      type: "role.assign",
      targetAgentInstanceId: agentInstanceId,
      role: assignment.role,
    };
    this.router.send(
      this.getOrchestratorIdentity(),
      agent,
      payload,
      { direction: "request" },
    );

    this.emit({ type: "role.assigned", agentInstanceId, roleId });
    return true;
  }

  /**
   * Submit a task to be assigned to the best available agent.
   * Uses role matching and load balancing to select the target.
   */
  submitTask(opts: {
    task: string;
    requestedBy?: MultiAgentIdentity;
    targetRoleId?: string;
    targetAgentInstanceId?: string;
    priority?: number;
    deadline?: number;
    workflowStepId?: string;
    workflowPlanId?: string;
    timeoutMs?: number;
    tags?: string[];
  }): TrackedTask | null {
    const taskId = randomUUID();

    const tracked = this.workTracker.createTask({
      taskId,
      correlationId: opts.workflowPlanId ?? randomUUID(),
      task: opts.task,
      requestedBy: opts.requestedBy,
      workflowStepId: opts.workflowStepId,
      workflowPlanId: opts.workflowPlanId,
      priority: opts.priority,
      deadline: opts.deadline,
      tags: opts.tags,
    });

    this.emit({ type: "task.created", taskId });

    // Index by workflowStepId for fast task.result/progress lookup
    // (WorkTracker.stepIndex handles this automatically)

    // Find the best agent to assign to
    const targetAgent = this.selectAgent(
      opts.targetRoleId,
      opts.targetAgentInstanceId,
    );

    if (!targetAgent) {
      // No agent available — task stays pending
      return tracked;
    }

    // Assign and send
    this.workTracker.assignTask(taskId, targetAgent);
    this.workTracker.startTask(taskId);

    const payload: TaskAssignmentPayload = {
      type: "task.assign",
      task: opts.task,
      priority: opts.priority,
      timeoutMs: opts.timeoutMs,
      workflowStepId: opts.workflowStepId,
    };

    this.router.send(
      opts.requestedBy ?? this.getOrchestratorIdentity(),
      targetAgent,
      payload,
      { correlationId: tracked.correlationId, direction: "request" },
    );

    this.emit({ type: "task.assigned", taskId, agentInstanceId: targetAgent.agentInstanceId });
    return tracked;
  }

  /** Get work summary. */
  getWorkSummary(): WorkSummary {
    return this.workTracker.getSummary();
  }

  /** Get agent workloads. */
  getAgentWorkloads(): AgentWorkload[] {
    return this.workTracker.getAgentWorkloads();
  }

  /** Generate a status report. */
  generateReport(opts?: { workflowPlanId?: string; since?: number }) {
    return this.workTracker.generateReport(opts);
  }

  /** Subscribe to orchestrator events. */
  onEvent(listener: EventListener): () => void {
    this.eventListeners.push(listener);
    return () => {
      const idx = this.eventListeners.indexOf(listener);
      if (idx >= 0) this.eventListeners.splice(idx, 1);
    };
  }

  /** Get all defined roles. */
  getRoles(): AgentRole[] {
    return this.roleManager.listRoles();
  }

  /** Add or update a role definition. */
  defineRole(role: AgentRole): void {
    this.roleManager.defineRole(role);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private setupMessageHandlers(): void {
    // Handle task results
    this.router.subscribe({ payloadType: "task.result" }, (msg) => {
      const payload = msg.payload as TaskResultPayload;
      if (payload.workflowStepId) {
        const taskId = this.workTracker.stepIndex.get(payload.workflowStepId);
        if (taskId) {
          this.workTracker.completeTask(taskId, payload);
          this.emit({
            type: "task.completed",
            taskId,
            status: payload.status,
          });
        }
      }
    });

    // Handle task progress updates
    this.router.subscribe({ payloadType: "task.progress" }, (msg) => {
      const payload = msg.payload as TaskProgressPayload;
      if (payload.workflowStepId) {
        const taskId = this.workTracker.stepIndex.get(payload.workflowStepId);
        if (taskId) {
          this.workTracker.updateProgress(
            taskId,
            payload.percent,
            payload.statusLine,
          );
          this.emit({
            type: "task.progress",
            taskId,
            percent: payload.percent,
          });
        }
      }
    });

    // Handle heartbeats
    this.router.subscribe({ payloadType: "heartbeat" }, (msg) => {
      const payload = msg.payload as HeartbeatPayload;
      this.agentHeartbeats.set(msg.envelope.from.agentInstanceId, {
        ...payload,
        receivedAt: Date.now(),
      });
    });

    // Handle agent discovery
    this.router.subscribe({ payloadType: "agent.discovery" }, (msg) => {
      const payload = msg.payload as AgentDiscoveryPayload;
      if (payload.action === "join" || payload.action === "announce") {
        // Register remote agent as known
        this.emit({ type: "agent.joined", agent: payload.agent });
      } else if (payload.action === "leave") {
        this.emit({ type: "agent.left", agentInstanceId: payload.agent.agentInstanceId });
      }
    });
  }

  /**
   * Select the best agent for a task based on role matching and load.
   * Prefers agents with:
   *   1. Matching role (if specified)
   *   2. Lowest current load
   *   3. Highest role priority
   */
  private selectAgent(
    targetRoleId?: string,
    targetAgentInstanceId?: string,
  ): MultiAgentIdentity | undefined {
    const agents = this.router.getLocalAgents();
    if (agents.length === 0) return undefined;

    // Direct target
    if (targetAgentInstanceId) {
      return agents.find((a) => a.agentInstanceId === targetAgentInstanceId);
    }

    // Filter by role
    let candidates = agents;
    if (targetRoleId) {
      const assignedAgents = this.roleManager.getAgentsWithRole(targetRoleId);
      const assignedIds = new Set(assignedAgents.map((a) => a.agentInstanceId));
      candidates = agents.filter((a) => assignedIds.has(a.agentInstanceId));
    }

    if (candidates.length === 0) return undefined;

    // Sort by load (ascending) then priority (descending)
    const withLoad = candidates.map((agent) => {
      const heartbeat = this.agentHeartbeats.get(agent.agentInstanceId);
      const assignment = this.roleManager.getAssignment(agent.agentInstanceId);
      return {
        agent,
        load: heartbeat?.load ?? 0,
        priority: assignment?.role.priority ?? 50,
      };
    });

    withLoad.sort((a, b) => {
      // Lower load first
      if (a.load !== b.load) return a.load - b.load;
      // Higher priority first
      return b.priority - a.priority;
    });

    return withLoad[0]?.agent;
  }

  private broadcastDiscovery(
    agent: MultiAgentIdentity,
    action: "join" | "leave" | "announce",
  ): void {
    const assignment = this.roleManager.getAssignment(agent.agentInstanceId);
    const payload: AgentDiscoveryPayload = {
      type: "agent.discovery",
      action,
      agent,
      availableRoles: assignment ? [assignment.role.roleId] : undefined,
    };
    this.router.send(agent, undefined, payload, {
      direction: "broadcast",
      ttlSeconds: 300,
    });
  }

  private getOrchestratorIdentity(): MultiAgentIdentity {
    return {
      agentInstanceId: "00000000-0000-0000-0000-000000000000",
      agentConfigId: "__orchestrator__",
      gatewayId: this.config.gatewayId,
      roleId: "orchestrator",
      displayName: "Orchestrator",
    };
  }

  private emit(event: OrchestratorEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // swallow listener errors
      }
    }
  }
}
