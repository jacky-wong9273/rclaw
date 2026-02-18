/**
 * Master Dashboard — Result Reporting View
 *
 * Provides:
 *   - Workflow completion reports
 *   - Per-agent performance metrics
 *   - Token usage and cost tracking
 *   - Exportable reports (JSON)
 */

import { html, nothing, type TemplateResult } from "lit";

export type ReportEntry = {
  taskId: string;
  task: string;
  status: string;
  agentConfigId?: string;
  roleId?: string;
  durationMs?: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
  };
  result?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
};

export type ReportSummary = {
  totalTasks: number;
  successRate: number;
  avgDurationMs: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  topAgents: Array<{ agentConfigId: string; completedCount: number; avgDurationMs: number }>;
  failedTasks: ReportEntry[];
};

export type ReportViewProps = {
  loading: boolean;
  error: string | null;
  reports: ReportEntry[];
  summary: ReportSummary | null;
  timeRange: "1h" | "24h" | "7d" | "30d" | "all";
  workflowFilter?: string;
  onTimeRangeChange: (range: ReportViewProps["timeRange"]) => void;
  onWorkflowFilterChange: (workflowId: string | undefined) => void;
  onExportReport: () => void;
  onRefresh: () => void;
};

export function renderReportView(props: ReportViewProps): TemplateResult {
  if (props.loading) {
    return html`<div class="loading-spinner">Loading reports...</div>`;
  }

  return html`
    <div class="report-dashboard">
      <div class="report-header">
        <h2>Results & Reports</h2>
        <div class="report-actions">
          <button class="btn btn-secondary" @click=${props.onRefresh}>Refresh</button>
          <button class="btn btn-primary" @click=${props.onExportReport}>Export JSON</button>
        </div>
      </div>

      ${props.error ? html`<div class="error-banner">${props.error}</div>` : nothing}

      <!-- Time range selector -->
      <div class="time-range-selector">
        ${(["1h", "24h", "7d", "30d", "all"] as const).map(
          (range) => html`
            <button
              class="btn ${props.timeRange === range ? "btn-primary" : "btn-secondary"}"
              @click=${() => props.onTimeRangeChange(range)}
            >
              ${range === "all" ? "All Time" : range}
            </button>
          `,
        )}
      </div>

      <!-- Summary metrics -->
      ${props.summary ? renderReportSummary(props.summary) : nothing}

      <!-- Top agents -->
      ${props.summary?.topAgents.length
        ? renderTopAgents(props.summary.topAgents)
        : nothing}

      <!-- Failed tasks -->
      ${props.summary?.failedTasks.length
        ? renderFailedTasks(props.summary.failedTasks)
        : nothing}

      <!-- Completed task details -->
      ${renderReportTable(props.reports)}
    </div>
  `;
}

function renderReportSummary(summary: ReportSummary): TemplateResult {
  return html`
    <div class="report-summary-grid">
      <div class="summary-card">
        <div class="summary-value">${summary.totalTasks}</div>
        <div class="summary-label">Total Tasks</div>
      </div>
      <div class="summary-card card-success">
        <div class="summary-value">${(summary.successRate * 100).toFixed(1)}%</div>
        <div class="summary-label">Success Rate</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">
          ${summary.avgDurationMs ? formatReportDuration(summary.avgDurationMs) : "N/A"}
        </div>
        <div class="summary-label">Avg Duration</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${formatTokenCount(summary.totalInputTokens)}</div>
        <div class="summary-label">Input Tokens</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${formatTokenCount(summary.totalOutputTokens)}</div>
        <div class="summary-label">Output Tokens</div>
      </div>
    </div>
  `;
}

function renderTopAgents(
  agents: Array<{ agentConfigId: string; completedCount: number; avgDurationMs: number }>,
): TemplateResult {
  return html`
    <div class="top-agents">
      <h3>Top Performing Agents</h3>
      <table class="compact-table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Completed</th>
            <th>Avg Duration</th>
          </tr>
        </thead>
        <tbody>
          ${agents.map(
            (a) => html`
              <tr>
                <td>${a.agentConfigId}</td>
                <td>${a.completedCount}</td>
                <td>${formatReportDuration(a.avgDurationMs)}</td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    </div>
  `;
}

function renderFailedTasks(tasks: ReportEntry[]): TemplateResult {
  return html`
    <div class="failed-tasks-section">
      <h3>Failed Tasks (${tasks.length})</h3>
      <div class="failed-list">
        ${tasks.map(
          (t) => html`
            <div class="failed-card">
              <div class="failed-header">
                <span class="status-badge status-failed">${t.status}</span>
                <span class="agent-name">${t.agentConfigId ?? "unassigned"}</span>
              </div>
              <div class="failed-task">${t.task.slice(0, 200)}</div>
              ${t.error
                ? html`<div class="failed-error"><code>${t.error}</code></div>`
                : nothing}
            </div>
          `,
        )}
      </div>
    </div>
  `;
}

function renderReportTable(reports: ReportEntry[]): TemplateResult {
  if (reports.length === 0) {
    return html`<div class="empty-state">No completed tasks in this time range</div>`;
  }

  return html`
    <div class="report-table-section">
      <h3>Task Details</h3>
      <table class="report-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Task</th>
            <th>Agent</th>
            <th>Duration</th>
            <th>Tokens (in/out)</th>
            <th>Completed</th>
          </tr>
        </thead>
        <tbody>
          ${reports.map(
            (r) => html`
              <tr>
                <td><span class="status-badge status-${r.status}">${r.status}</span></td>
                <td>${r.task.slice(0, 100)}</td>
                <td>${r.agentConfigId ?? "—"}</td>
                <td>${r.durationMs ? formatReportDuration(r.durationMs) : "—"}</td>
                <td>
                  ${r.usage
                    ? `${formatTokenCount(r.usage.inputTokens)} / ${formatTokenCount(r.usage.outputTokens)}`
                    : "—"}
                </td>
                <td>${r.completedAt ? new Date(r.completedAt).toLocaleString() : "—"}</td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    </div>
  `;
}

function formatReportDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function formatTokenCount(count: number): string {
  if (count < 1_000) return String(count);
  if (count < 1_000_000) return `${(count / 1_000).toFixed(1)}K`;
  return `${(count / 1_000_000).toFixed(2)}M`;
}
