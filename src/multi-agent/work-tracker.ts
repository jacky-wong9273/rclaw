/**
 * Multi-Agent Work Tracker
 *
 * Tracks the progress and status of all tasks across agents in the mesh.
 * Provides real-time work monitoring, deadline tracking, and result reporting.
 */

import type { MultiAgentIdentity, TaskResultPayload } from "./protocol.js";

export type TaskStatus =
  | "pending"
  | "assigned"
  | "in-progress"
  | "completed"
  | "failed"
  | "timeout"
  | "cancelled";

export type TrackedTask = {
  /** Unique task ID. */
  taskId: string;
  /** Correlation ID that ties this task to a workflow or request chain. */
  correlationId: string;
  /** The task description/prompt. */
  task: string;
  /** Current status. */
  status: TaskStatus;
  /** Assigned agent. */
  assignedTo?: MultiAgentIdentity;
  /** Who requested this task. */
  requestedBy?: MultiAgentIdentity;
  /** Workflow step ID if part of a mesh workflow. */
  workflowStepId?: string;
  /** Workflow plan ID. */
  workflowPlanId?: string;
  /** Priority (higher = more important). */
  priority: number;
  /** Creation timestamp. */
  createdAt: number;
  /** Assignment timestamp. */
  assignedAt?: number;
  /** Start timestamp (when agent began work). */
  startedAt?: number;
  /** Completion timestamp. */
  completedAt?: number;
  /** Deadline as epoch ms. */
  deadline?: number;
  /** Progress percentage (0–100). */
  progressPercent?: number;
  /** Latest status line from the agent. */
  statusLine?: string;
  /** Result data after completion. */
  result?: TaskResultPayload;
  /** Retry count. */
  retryCount: number;
  /** Maximum retries before marking as failed. */
  maxRetries: number;
  /** Tags for filtering/grouping. */
  tags: string[];
};

export type WorkSummary = {
  total: number;
  pending: number;
  assigned: number;
  inProgress: number;
  completed: number;
  failed: number;
  timeout: number;
  cancelled: number;
  averageDurationMs: number | null;
  /** Tasks at risk of missing deadline. */
  atRiskCount: number;
};

export type AgentWorkload = {
  agentInstanceId: string;
  agentConfigId: string;
  roleId?: string;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageDurationMs: number | null;
  /** Current load as reported by heartbeat. */
  reportedLoad?: number;
};

export class WorkTracker {
  private tasks: Map<string, TrackedTask> = new Map();
  /** Index: agentInstanceId → Set<taskId> */
  private agentTaskIndex: Map<string, Set<string>> = new Map();
  /** Index: workflowPlanId → Set<taskId> */
  private workflowTaskIndex: Map<string, Set<string>> = new Map();
  /** Index: workflowStepId → taskId for O(1) step-based lookups. */
  readonly stepIndex: Map<string, string> = new Map();

  /** Create and track a new task. */
  createTask(opts: {
    taskId: string;
    correlationId: string;
    task: string;
    requestedBy?: MultiAgentIdentity;
    workflowStepId?: string;
    workflowPlanId?: string;
    priority?: number;
    deadline?: number;
    maxRetries?: number;
    tags?: string[];
  }): TrackedTask {
    const tracked: TrackedTask = {
      taskId: opts.taskId,
      correlationId: opts.correlationId,
      task: opts.task,
      status: "pending",
      requestedBy: opts.requestedBy,
      workflowStepId: opts.workflowStepId,
      workflowPlanId: opts.workflowPlanId,
      priority: opts.priority ?? 50,
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: opts.maxRetries ?? 2,
      tags: opts.tags ?? [],
    };

    this.tasks.set(tracked.taskId, tracked);

    if (opts.workflowPlanId) {
      let set = this.workflowTaskIndex.get(opts.workflowPlanId);
      if (!set) {
        set = new Set();
        this.workflowTaskIndex.set(opts.workflowPlanId, set);
      }
      set.add(tracked.taskId);
    }

    if (opts.workflowStepId) {
      this.stepIndex.set(opts.workflowStepId, tracked.taskId);
    }

    return tracked;
  }

  /** Assign a task to an agent. */
  assignTask(taskId: string, agent: MultiAgentIdentity): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (task.status !== "pending" && task.status !== "failed") return false;

    task.status = "assigned";
    task.assignedTo = agent;
    task.assignedAt = Date.now();

    let agentTasks = this.agentTaskIndex.get(agent.agentInstanceId);
    if (!agentTasks) {
      agentTasks = new Set();
      this.agentTaskIndex.set(agent.agentInstanceId, agentTasks);
    }
    agentTasks.add(taskId);

    return true;
  }

  /** Mark a task as in-progress. */
  startTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "assigned") return false;
    task.status = "in-progress";
    task.startedAt = Date.now();
    return true;
  }

  /** Update task progress. */
  updateProgress(
    taskId: string,
    percent?: number,
    statusLine?: string,
  ): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (percent != null) task.progressPercent = percent;
    if (statusLine != null) task.statusLine = statusLine;
    return true;
  }

  /** Complete a task with result. */
  completeTask(taskId: string, result: TaskResultPayload): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.completedAt = Date.now();
    task.result = result;
    task.progressPercent = 100;

    if (result.status === "success" || result.status === "partial") {
      task.status = "completed";
    } else if (result.status === "timeout") {
      task.status = "timeout";
    } else {
      task.status = "failed";
    }

    return true;
  }

  /** Cancel a task. */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (task.status === "completed" || task.status === "cancelled") return false;
    task.status = "cancelled";
    task.completedAt = Date.now();
    return true;
  }

  /** Retry a failed task. */
  retryTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (task.status !== "failed" && task.status !== "timeout") return false;
    if (task.retryCount >= task.maxRetries) return false;

    task.retryCount++;
    task.status = "pending";
    task.assignedTo = undefined;
    task.assignedAt = undefined;
    task.startedAt = undefined;
    task.completedAt = undefined;
    task.progressPercent = undefined;
    task.statusLine = undefined;
    task.result = undefined;

    return true;
  }

  /** Get a task by ID. */
  getTask(taskId: string): TrackedTask | undefined {
    return this.tasks.get(taskId);
  }

  /** Get all tasks, optionally filtered. */
  listTasks(filter?: {
    status?: TaskStatus;
    agentInstanceId?: string;
    workflowPlanId?: string;
    tag?: string;
  }): TrackedTask[] {
    // Fast path: narrow by index first when possible
    let source: Iterable<TrackedTask>;

    if (filter?.agentInstanceId) {
      const ids = this.agentTaskIndex.get(filter.agentInstanceId);
      if (!ids || ids.size === 0) return [];
      source = (function* (tasks: Map<string, TrackedTask>, taskIds: Set<string>) {
        for (const id of taskIds) {
          const task = tasks.get(id);
          if (task) yield task;
        }
      })(this.tasks, ids);
    } else if (filter?.workflowPlanId) {
      const ids = this.workflowTaskIndex.get(filter.workflowPlanId);
      if (!ids || ids.size === 0) return [];
      source = (function* (tasks: Map<string, TrackedTask>, taskIds: Set<string>) {
        for (const id of taskIds) {
          const task = tasks.get(id);
          if (task) yield task;
        }
      })(this.tasks, ids);
    } else {
      source = this.tasks.values();
    }

    const results: TrackedTask[] = [];
    for (const t of source) {
      if (filter?.status && t.status !== filter.status) continue;
      if (filter?.tag && !t.tags.includes(filter.tag)) continue;
      // Skip redundant index checks already handled above
      results.push(t);
    }

    return results.sort((a, b) => b.priority - a.priority);
  }

  /** Get a work summary across all tasks. */
  getSummary(): WorkSummary {
    const now = Date.now();

    let pending = 0;
    let assigned = 0;
    let inProgress = 0;
    let completed = 0;
    let failed = 0;
    let timeout = 0;
    let cancelled = 0;
    let durationSum = 0;
    let durationCount = 0;
    let atRiskCount = 0;

    for (const t of this.tasks.values()) {
      switch (t.status) {
        case "pending": pending++; break;
        case "assigned": assigned++; break;
        case "in-progress": inProgress++; break;
        case "completed":
          completed++;
          if (t.startedAt && t.completedAt) {
            durationSum += t.completedAt - t.startedAt;
            durationCount++;
          }
          break;
        case "failed": failed++; break;
        case "timeout": timeout++; break;
        case "cancelled": cancelled++; break;
      }

      // At-risk: has deadline, not completed/cancelled, < 20% time remaining
      if (t.deadline && t.status !== "completed" && t.status !== "cancelled") {
        const remaining = t.deadline - now;
        const total = t.deadline - t.createdAt;
        if (remaining > 0 && total > 0 && remaining / total < 0.2) {
          atRiskCount++;
        }
      }
    }

    return {
      total: pending + assigned + inProgress + completed + failed + timeout + cancelled,
      pending,
      assigned,
      inProgress,
      completed,
      failed,
      timeout,
      cancelled,
      averageDurationMs: durationCount > 0 ? durationSum / durationCount : null,
      atRiskCount,
    };
  }

  /** Get workload per agent. */
  getAgentWorkloads(): AgentWorkload[] {
    const agentMap = new Map<string, AgentWorkload>();

    for (const task of this.tasks.values()) {
      if (!task.assignedTo) continue;
      const id = task.assignedTo.agentInstanceId;

      let workload = agentMap.get(id);
      if (!workload) {
        workload = {
          agentInstanceId: id,
          agentConfigId: task.assignedTo.agentConfigId,
          roleId: task.assignedTo.roleId,
          activeTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          averageDurationMs: null,
        };
        agentMap.set(id, workload);
      }

      if (task.status === "assigned" || task.status === "in-progress") {
        workload.activeTasks++;
      } else if (task.status === "completed") {
        workload.completedTasks++;
      } else if (task.status === "failed" || task.status === "timeout") {
        workload.failedTasks++;
      }
    }

    // Calculate average duration per agent
    for (const [id, workload] of agentMap) {
      const agentTaskIds = this.agentTaskIndex.get(id);
      if (!agentTaskIds) continue;

      const completedTasks: number[] = [];
      for (const taskId of agentTaskIds) {
        const task = this.tasks.get(taskId);
        if (task?.status === "completed" && task.startedAt && task.completedAt) {
          completedTasks.push(task.completedAt - task.startedAt);
        }
      }
      if (completedTasks.length > 0) {
        workload.averageDurationMs =
          completedTasks.reduce((a, b) => a + b, 0) / completedTasks.length;
      }
    }

    return [...agentMap.values()];
  }

  /** Generate a report for completed tasks. */
  generateReport(opts?: {
    workflowPlanId?: string;
    since?: number;
  }): {
    tasks: TrackedTask[];
    summary: WorkSummary;
    agentWorkloads: AgentWorkload[];
    generatedAt: number;
  } {
    let tasks = [...this.tasks.values()];

    if (opts?.workflowPlanId) {
      const ids = this.workflowTaskIndex.get(opts.workflowPlanId);
      tasks = ids ? tasks.filter((t) => ids.has(t.taskId)) : [];
    }
    if (opts?.since) {
      tasks = tasks.filter((t) => t.createdAt >= opts.since!);
    }

    return {
      tasks,
      summary: this.getSummary(),
      agentWorkloads: this.getAgentWorkloads(),
      generatedAt: Date.now(),
    };
  }

  /** Clean up old completed/cancelled tasks. */
  cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;

    for (const [taskId, task] of this.tasks) {
      if (
        (task.status === "completed" ||
          task.status === "cancelled" ||
          task.status === "failed") &&
        (task.completedAt ?? task.createdAt) < cutoff
      ) {
        this.tasks.delete(taskId);
        // Clean indexes
        if (task.assignedTo) {
          this.agentTaskIndex.get(task.assignedTo.agentInstanceId)?.delete(taskId);
        }
        if (task.workflowPlanId) {
          this.workflowTaskIndex.get(task.workflowPlanId)?.delete(taskId);
        }
        if (task.workflowStepId) {
          this.stepIndex.delete(task.workflowStepId);
        }
        removed++;
      }
    }

    return removed;
  }
}
