/**
 * Master Dashboard — Security Controls View
 *
 * Provides:
 *   - Per-agent security policy management
 *   - Audit log viewer
 *   - Rate limit monitoring
 *   - Permission configuration
 *   - Cross-gateway access controls
 */

import { html, nothing, type TemplateResult } from "lit";

export type PermissionId =
  | "task.assign"
  | "task.cancel"
  | "role.assign"
  | "role.manage"
  | "agent.register"
  | "agent.unregister"
  | "workflow.create"
  | "workflow.abort"
  | "config.read"
  | "config.write"
  | "report.read"
  | "report.export";

export const ALL_PERMISSIONS: { id: PermissionId; label: string; description: string }[] = [
  { id: "task.assign", label: "Assign Tasks", description: "Can assign tasks to other agents" },
  { id: "task.cancel", label: "Cancel Tasks", description: "Can cancel running tasks" },
  { id: "role.assign", label: "Assign Roles", description: "Can assign roles to agents" },
  { id: "role.manage", label: "Manage Roles", description: "Can create/edit/delete role definitions" },
  { id: "agent.register", label: "Register Agents", description: "Can register new agents in the mesh" },
  { id: "agent.unregister", label: "Unregister Agents", description: "Can remove agents from the mesh" },
  { id: "workflow.create", label: "Create Workflows", description: "Can create and start workflows" },
  { id: "workflow.abort", label: "Abort Workflows", description: "Can abort running workflows" },
  { id: "config.read", label: "Read Config", description: "Can read agent and gateway configuration" },
  { id: "config.write", label: "Write Config", description: "Can modify configuration" },
  { id: "report.read", label: "Read Reports", description: "Can view work reports and metrics" },
  { id: "report.export", label: "Export Reports", description: "Can export reports as JSON/CSV" },
];

export type SecurityPolicyEntry = {
  agentId: string;
  permissions: PermissionId[];
  networkAllowlist: string[];
  maxConcurrentTasks: number;
  maxMessagesPerMinute: number;
  allowCrossGateway: boolean;
};

export type AuditLogEntry = {
  timestamp: number;
  agentId: string;
  action: string;
  allowed: boolean;
  reason?: string;
  sourceIp?: string;
};

export type SecurityViewProps = {
  loading: boolean;
  error: string | null;
  policies: SecurityPolicyEntry[];
  auditLog: AuditLogEntry[];
  selectedAgentId: string | null;
  editingPolicy: SecurityPolicyEntry | null;
  availableAgents: Array<{ agentConfigId: string; displayName?: string }>;
  onSelectAgent: (agentId: string) => void;
  onSavePolicy: (policy: SecurityPolicyEntry) => void;
  onDeletePolicy: (agentId: string) => void;
  onEditPolicy: (policy: SecurityPolicyEntry | null) => void;
  onRefreshAuditLog: () => void;
};

export function renderSecurityView(props: SecurityViewProps): TemplateResult {
  if (props.loading) {
    return html`<div class="loading-spinner">Loading security settings...</div>`;
  }

  return html`
    <div class="security-dashboard">
      <div class="security-header">
        <h2>Security Controls</h2>
      </div>

      ${props.error ? html`<div class="error-banner">${props.error}</div>` : nothing}

      <div class="security-layout">
        <!-- Policy list -->
        <div class="security-sidebar">
          <h3>Agent Policies</h3>
          <button
            class="btn btn-primary btn-full"
            @click=${() =>
              props.onEditPolicy({
                agentId: "",
                permissions: ["task.assign", "report.read", "config.read"],
                networkAllowlist: [],
                maxConcurrentTasks: 8,
                maxMessagesPerMinute: 120,
                allowCrossGateway: false,
              })}
          >
            + New Policy
          </button>
          <div class="policy-list">
            ${props.policies.map((p) => renderPolicyCard(p, props))}
          </div>
        </div>

        <!-- Policy editor or detail -->
        <div class="security-main">
          ${props.editingPolicy
            ? renderPolicyEditor(props.editingPolicy, props)
            : props.selectedAgentId
              ? renderPolicyDetail(props)
              : html`<div class="empty-state">Select an agent policy to view details</div>`}
        </div>
      </div>

      <!-- Audit log -->
      ${renderAuditLog(props)}
    </div>
  `;
}

function renderPolicyCard(
  policy: SecurityPolicyEntry,
  props: SecurityViewProps,
): TemplateResult {
  const isSelected = policy.agentId === props.selectedAgentId;

  return html`
    <div
      class="policy-card ${isSelected ? "selected" : ""}"
      @click=${() => props.onSelectAgent(policy.agentId)}
    >
      <div class="policy-card-header">
        <span class="agent-name">${policy.agentId}</span>
        ${policy.allowCrossGateway
          ? html`<span class="badge badge-warning">Cross-GW</span>`
          : nothing}
      </div>
      <div class="policy-card-stats">
        <span>${policy.permissions.length} permissions</span>
        <span>Rate: ${policy.maxMessagesPerMinute}/min</span>
      </div>
    </div>
  `;
}

function renderPolicyDetail(props: SecurityViewProps): TemplateResult {
  const policy = props.policies.find((p) => p.agentId === props.selectedAgentId);
  if (!policy) return html`<div class="empty-state">Policy not found</div>`;

  return html`
    <div class="policy-detail">
      <div class="policy-detail-header">
        <h3>Policy: ${policy.agentId}</h3>
        <div class="policy-actions">
          <button class="btn btn-secondary" @click=${() => props.onEditPolicy(policy)}>
            Edit
          </button>
          <button class="btn btn-danger" @click=${() => props.onDeletePolicy(policy.agentId)}>
            Delete
          </button>
        </div>
      </div>

      <div class="policy-sections">
        <div class="detail-section">
          <label>Permissions</label>
          <div class="permissions-grid">
            ${ALL_PERMISSIONS.map(
              (p) => html`
                <div class="permission-item ${policy.permissions.includes(p.id) ? "granted" : "denied"}">
                  <span class="permission-icon">${policy.permissions.includes(p.id) ? "✓" : "✗"}</span>
                  <span class="permission-label">${p.label}</span>
                </div>
              `,
            )}
          </div>
        </div>

        <div class="detail-section">
          <label>Rate Limits</label>
          <div class="rate-info">
            <span>Max messages/min: <strong>${policy.maxMessagesPerMinute}</strong></span>
            <span>Max concurrent tasks: <strong>${policy.maxConcurrentTasks}</strong></span>
          </div>
        </div>

        <div class="detail-section">
          <label>Network</label>
          <div>
            <span>Cross-gateway: <strong>${policy.allowCrossGateway ? "Allowed" : "Denied"}</strong></span>
            ${policy.networkAllowlist.length > 0
              ? html`
                  <div class="network-list">
                    <label>IP Allowlist:</label>
                    ${policy.networkAllowlist.map(
                      (ip) => html`<span class="tag">${ip}</span>`,
                    )}
                  </div>
                `
              : html`<div class="muted">No IP restrictions (all allowed)</div>`}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderPolicyEditor(
  policy: SecurityPolicyEntry,
  props: SecurityViewProps,
): TemplateResult {
  const isNew = !policy.agentId;

  return html`
    <div class="policy-editor">
      <h3>${isNew ? "Create Security Policy" : `Edit Policy: ${policy.agentId}`}</h3>

      <form
        class="policy-form"
        @submit=${(e: Event) => {
          e.preventDefault();
          const form = e.target as HTMLFormElement;
          const data = new FormData(form);

          const permissions: PermissionId[] = ALL_PERMISSIONS
            .filter((p) => data.get(`perm-${p.id}`) === "on")
            .map((p) => p.id);

          const networkRaw = (data.get("networkAllowlist") as string) || "";
          const networkAllowlist = networkRaw
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);

          props.onSavePolicy({
            agentId: (data.get("agentId") as string) || policy.agentId,
            permissions,
            networkAllowlist,
            maxConcurrentTasks: Number(data.get("maxConcurrentTasks")) || 8,
            maxMessagesPerMinute: Number(data.get("maxMessagesPerMinute")) || 120,
            allowCrossGateway: data.get("allowCrossGateway") === "on",
          });
        }}
      >
        <div class="form-group">
          <label>Agent ID</label>
          ${isNew
            ? html`
                <select name="agentId" required>
                  <option value="">Select agent...</option>
                  ${props.availableAgents.map(
                    (a) =>
                      html`<option value=${a.agentConfigId}>
                        ${a.displayName ?? a.agentConfigId}
                      </option>`,
                  )}
                </select>
              `
            : html`<input name="agentId" type="text" .value=${policy.agentId} disabled />`}
        </div>

        <div class="form-group">
          <label>Permissions</label>
          <div class="permissions-checkboxes">
            ${ALL_PERMISSIONS.map(
              (p) => html`
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    name="perm-${p.id}"
                    ?checked=${policy.permissions.includes(p.id)}
                  />
                  <span>${p.label}</span>
                  <span class="muted">${p.description}</span>
                </label>
              `,
            )}
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Max Messages/Min</label>
            <input
              name="maxMessagesPerMinute"
              type="number"
              min="1"
              max="1000"
              .value=${String(policy.maxMessagesPerMinute)}
            />
          </div>
          <div class="form-group">
            <label>Max Concurrent Tasks</label>
            <input
              name="maxConcurrentTasks"
              type="number"
              min="1"
              max="64"
              .value=${String(policy.maxConcurrentTasks)}
            />
          </div>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input
              type="checkbox"
              name="allowCrossGateway"
              ?checked=${policy.allowCrossGateway}
            />
            <span>Allow cross-gateway communication</span>
          </label>
        </div>

        <div class="form-group">
          <label>Network Allowlist (one CIDR per line, empty = allow all)</label>
          <textarea
            name="networkAllowlist"
            rows="4"
            .value=${policy.networkAllowlist.join("\n")}
            placeholder="10.0.0.0/8&#10;192.168.1.0/24"
          ></textarea>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary">
            ${isNew ? "Create Policy" : "Save Changes"}
          </button>
          <button type="button" class="btn btn-secondary" @click=${() => props.onEditPolicy(null)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  `;
}

function renderAuditLog(props: SecurityViewProps): TemplateResult {
  return html`
    <div class="audit-log-section">
      <div class="audit-header">
        <h3>Security Audit Log</h3>
        <button class="btn btn-secondary" @click=${props.onRefreshAuditLog}>Refresh</button>
      </div>

      ${props.auditLog.length === 0
        ? html`<div class="empty-state">No audit entries</div>`
        : html`
            <table class="audit-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Agent</th>
                  <th>Action</th>
                  <th>Result</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                ${props.auditLog.slice(-100).reverse().map(
                  (entry) => html`
                    <tr class="${entry.allowed ? "" : "row-denied"}">
                      <td>${new Date(entry.timestamp).toLocaleTimeString()}</td>
                      <td>${entry.agentId}</td>
                      <td><code>${entry.action}</code></td>
                      <td>
                        <span class="status-badge ${entry.allowed ? "status-completed" : "status-failed"}">
                          ${entry.allowed ? "Allowed" : "Denied"}
                        </span>
                      </td>
                      <td>${entry.reason ?? "—"}</td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          `}
    </div>
  `;
}
