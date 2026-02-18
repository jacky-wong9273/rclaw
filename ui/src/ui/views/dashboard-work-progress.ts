/**
 * Master Dashboard — Work Progress Monitoring View
 *
 * Displays real-time work progress across all agents:
 *   - Overall work summary (pending/in-progress/completed/failed)
 *   - Per-agent workload breakdown
 *   - Task timeline with progress bars
 *   - At-risk and overdue task alerts
 */

import { html, nothing, type TemplateResult } from "lit";

export type TaskEntry = {
  taskId: string;
  correlationId: string;
  task: string;
  status: "pending" | "assigned" | "in-progress" | "completed" | "failed" | "timeout" | "cancelled";
  assignedAgentId?: string;
  assignedRoleId?: string;
  progressPercent?: number;
  statusLine?: string;
  priority: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  deadline?: number;
  retryCount: number;
  tags: string[];
  workflowPlanId?: string;
};

export type WorkSummaryData = {
  total: number;
  pending: number;
  assigned: number;
  inProgress: number;
  completed: number;
  failed: number;
  timeout: number;
  cancelled: number;
  averageDurationMs: number | null;
  atRiskCount: number;
};

export type AgentWorkloadEntry = {
  agentInstanceId: string;
  agentConfigId: string;
  roleId?: string;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageDurationMs: number | null;
  reportedLoad?: number;
};

export type WorkProgressProps = {
  loading: boolean;
  error: string | null;
  tasks: TaskEntry[];
  summary: WorkSummaryData | null;
  agentWorkloads: AgentWorkloadEntry[];
  filter: {
    status?: string;
    agentId?: string;
    tag?: string;
  };
  onFilterChange: (filter: WorkProgressProps["filter"]) => void;
  onCancelTask: (taskId: string) => void;
  onRetryTask: (taskId: string) => void;
  onRefresh: () => void;
};

export function renderWorkProgress(props: WorkProgressProps): TemplateResult {
  if (props.loading) {
    return html`<div class="loading-spinner">Loading work progress...</div>`;
  }

  return html`
    <div class="work-progress-dashboard">
      <div class="work-header">
        <h2>Work Progress</h2>
        <button class="btn btn-secondary" @click=${props.onRefresh}>Refresh</button>
      </div>

      ${props.error ? html`<div class="error-banner">${props.error}</div>` : nothing}

      <!-- Summary cards -->
      ${props.summary ? renderSummaryCards(props.summary) : nothing}

      <!-- Agent workloads -->
      ${props.agentWorkloads.length > 0 ? renderAgentWorkloads(props.agentWorkloads) : nothing}

      <!-- Task filters -->
      ${renderTaskFilters(props)}

      <!-- Task list -->
      ${renderTaskList(props)}
    </div>
  `;
}

function renderSummaryCards(summary: WorkSummaryData): TemplateResult {
  const avgDuration = summary.averageDurationMs
    ? formatDuration(summary.averageDurationMs)
    : "N/A";

  return html`
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-value">${summary.total}</div>
        <div class="summary-label">Total Tasks</div>
      </div>
      <div class="summary-card card-pending">
        <div class="summary-value">${summary.pending + summary.assigned}</div>
        <div class="summary-label">Queued</div>
      </div>
      <div class="summary-card card-active">
        <div class="summary-value">${summary.inProgress}</div>
        <div class="summary-label">In Progress</div>
      </div>
      <div class="summary-card card-success">
        <div class="summary-value">${summary.completed}</div>
        <div class="summary-label">Completed</div>
      </div>
      <div class="summary-card card-danger">
        <div class="summary-value">${summary.failed + summary.timeout}</div>
        <div class="summary-label">Failed</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${avgDuration}</div>
        <div class="summary-label">Avg Duration</div>
      </div>
      ${summary.atRiskCount > 0
        ? html`
            <div class="summary-card card-warning">
              <div class="summary-value">${summary.atRiskCount}</div>
              <div class="summary-label">At Risk</div>
            </div>
          `
        : nothing}
    </div>
  `;
}

function renderAgentWorkloads(workloads: AgentWorkloadEntry[]): TemplateResult {
  return html`
    <div class="agent-workloads">
      <h3>Agent Workloads</h3>
      <div class="workload-grid">
        ${workloads.map(
          (w) => html`
            <div class="workload-card">
              <div class="workload-header">
                <span class="agent-name">${w.agentConfigId}</span>
                ${w.roleId ? html`<span class="badge">${w.roleId}</span>` : nothing}
              </div>
              <div class="workload-bar">
                <div
                  class="workload-fill"
                  style="width: ${Math.min((w.reportedLoad ?? 0) * 100, 100)}%"
                ></div>
              </div>
              <div class="workload-stats">
                <span>Active: ${w.activeTasks}</span>
                <span>Done: ${w.completedTasks}</span>
                <span>Failed: ${w.failedTasks}</span>
                ${w.averageDurationMs
                  ? html`<span>Avg: ${formatDuration(w.averageDurationMs)}</span>`
                  : nothing}
              </div>
            </div>
          `,
        )}
      </div>
    </div>
  `;
}

function renderTaskFilters(props: WorkProgressProps): TemplateResult {
  return html`
    <div class="task-filters">
      <select
        @change=${(e: Event) => {
          const val = (e.target as HTMLSelectElement).value;
          props.onFilterChange({ ...props.filter, status: val || undefined });
        }}
      >
        <option value="">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="assigned">Assigned</option>
        <option value="in-progress">In Progress</option>
        <option value="completed">Completed</option>
        <option value="failed">Failed</option>
        <option value="timeout">Timeout</option>
        <option value="cancelled">Cancelled</option>
      </select>

      <input
        type="text"
        placeholder="Filter by tag..."
        .value=${props.filter.tag ?? ""}
        @input=${(e: Event) => {
          const val = (e.target as HTMLInputElement).value;
          props.onFilterChange({ ...props.filter, tag: val || undefined });
        }}
      />
    </div>
  `;
}

function renderTaskList(props: WorkProgressProps): TemplateResult {
  if (props.tasks.length === 0) {
    return html`<div class="empty-state">No tasks found</div>`;
  }

  return html`
    <div class="task-list">
      <table class="task-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Task</th>
            <th>Agent</th>
            <th>Priority</th>
            <th>Progress</th>
            <th>Duration</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${props.tasks.map((task) => renderTaskRow(task, props))}
        </tbody>
      </table>
    </div>
  `;
}

function renderTaskRow(task: TaskEntry, props: WorkProgressProps): TemplateResult {
  const statusClass = `status-${task.status}`;
  const duration =
    task.startedAt && task.completedAt
      ? formatDuration(task.completedAt - task.startedAt)
      : task.startedAt
        ? formatDuration(Date.now() - task.startedAt) + "..."
        : "—";

  const isDeadlineRisk =
    task.deadline &&
    task.status !== "completed" &&
    task.status !== "cancelled" &&
    task.deadline - Date.now() < (task.deadline - task.createdAt) * 0.2;

  return html`
    <tr class="${isDeadlineRisk ? "row-at-risk" : ""}">
      <td>
        <span class="status-badge ${statusClass}">${task.status}</span>
      </td>
      <td>
        <div class="task-description">${task.task.slice(0, 120)}</div>
        ${task.statusLine
          ? html`<div class="task-status-line muted">${task.statusLine}</div>`
          : nothing}
        ${task.tags.length > 0
          ? html`<div class="task-tags">
              ${task.tags.map((t) => html`<span class="tag">${t}</span>`)}
            </div>`
          : nothing}
      </td>
      <td>${task.assignedAgentId ?? "—"}</td>
      <td><span class="priority-badge">P${task.priority}</span></td>
      <td>
        ${task.progressPercent != null
          ? html`
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${task.progressPercent}%"></div>
                <span class="progress-label">${task.progressPercent}%</span>
              </div>
            `
          : html`<span class="muted">—</span>`}
      </td>
      <td>${duration}</td>
      <td>
        ${task.status === "in-progress" || task.status === "assigned"
          ? html`<button
              class="btn btn-small btn-danger"
              @click=${() => props.onCancelTask(task.taskId)}
            >
              Cancel
            </button>`
          : nothing}
        ${task.status === "failed" || task.status === "timeout"
          ? html`<button
              class="btn btn-small btn-secondary"
              @click=${() => props.onRetryTask(task.taskId)}
            >
              Retry
            </button>`
          : nothing}
      </td>
    </tr>
  `;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}
