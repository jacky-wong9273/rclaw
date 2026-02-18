/**
 * Master Dashboard — Role Management View
 *
 * Allows administrators to:
 *   1. View and define agent roles
 *   2. Assign/unassign roles to agents
 *   3. Configure role permissions, tool allowlists, and priorities
 */

import { html, nothing, type TemplateResult } from "lit";

export type RoleDefinition = {
  roleId: string;
  name: string;
  description?: string;
  systemPromptFragment?: string;
  allowedTools?: string[];
  deniedTools?: string[];
  maxConcurrent?: number;
  priority?: number;
};

export type RoleAssignmentEntry = {
  agentInstanceId: string;
  agentConfigId: string;
  gatewayId: string;
  roleId: string;
  roleName: string;
  assignedAt: number;
  assignedBy: string;
};

export type RolesViewProps = {
  loading: boolean;
  error: string | null;
  roles: RoleDefinition[];
  assignments: RoleAssignmentEntry[];
  availableAgents: Array<{ agentConfigId: string; displayName?: string }>;
  selectedRoleId: string | null;
  editingRole: RoleDefinition | null;
  onSelectRole: (roleId: string) => void;
  onCreateRole: (role: RoleDefinition) => void;
  onUpdateRole: (role: RoleDefinition) => void;
  onDeleteRole: (roleId: string) => void;
  onAssignRole: (agentConfigId: string, roleId: string) => void;
  onUnassignRole: (agentInstanceId: string) => void;
  onEditRole: (role: RoleDefinition | null) => void;
};

export function renderRolesView(props: RolesViewProps): TemplateResult {
  if (props.loading) {
    return html`<div class="loading-spinner">Loading roles...</div>`;
  }

  if (props.error) {
    return html`<div class="error-banner">${props.error}</div>`;
  }

  return html`
    <div class="roles-dashboard">
      <div class="roles-header">
        <h2>Role Management</h2>
        <button
          class="btn btn-primary"
          @click=${() =>
            props.onEditRole({
              roleId: "",
              name: "",
              priority: 50,
            })}
        >
          + New Role
        </button>
      </div>

      <div class="roles-layout">
        <!-- Role list -->
        <div class="roles-sidebar">
          <h3>Defined Roles (${props.roles.length})</h3>
          <div class="role-list">${props.roles.map((role) => renderRoleCard(role, props))}</div>
        </div>

        <!-- Role detail / editor -->
        <div class="roles-main">
          ${props.editingRole
            ? renderRoleEditor(props.editingRole, props)
            : props.selectedRoleId
              ? renderRoleDetail(props)
              : html`<div class="empty-state">Select a role to view details</div>`}
        </div>

        <!-- Active assignments -->
        <div class="roles-assignments">
          <h3>Active Assignments (${props.assignments.length})</h3>
          ${renderAssignmentsList(props)}
        </div>
      </div>
    </div>
  `;
}

function renderRoleCard(
  role: RoleDefinition,
  props: RolesViewProps,
): TemplateResult {
  const isSelected = role.roleId === props.selectedRoleId;
  const assignedCount = props.assignments.filter(
    (a) => a.roleId === role.roleId,
  ).length;

  return html`
    <div
      class="role-card ${isSelected ? "selected" : ""}"
      @click=${() => props.onSelectRole(role.roleId)}
    >
      <div class="role-card-header">
        <span class="role-name">${role.name}</span>
        <span class="role-priority badge">P${role.priority ?? 50}</span>
      </div>
      <div class="role-card-meta">
        <span class="muted">${role.description?.slice(0, 80) ?? "No description"}</span>
      </div>
      <div class="role-card-stats">
        <span class="badge">${assignedCount} agent${assignedCount !== 1 ? "s" : ""}</span>
        ${role.maxConcurrent != null
          ? html`<span class="badge muted">max ${role.maxConcurrent}</span>`
          : nothing}
      </div>
    </div>
  `;
}

function renderRoleDetail(props: RolesViewProps): TemplateResult {
  const role = props.roles.find((r) => r.roleId === props.selectedRoleId);
  if (!role) return html`<div class="empty-state">Role not found</div>`;

  const roleAssignments = props.assignments.filter(
    (a) => a.roleId === role.roleId,
  );

  return html`
    <div class="role-detail">
      <div class="role-detail-header">
        <h3>${role.name}</h3>
        <div class="role-actions">
          <button class="btn btn-secondary" @click=${() => props.onEditRole(role)}>Edit</button>
          <button class="btn btn-danger" @click=${() => props.onDeleteRole(role.roleId)}>
            Delete
          </button>
        </div>
      </div>

      <div class="role-detail-body">
        <div class="detail-section">
          <label>ID</label>
          <span class="mono">${role.roleId}</span>
        </div>

        <div class="detail-section">
          <label>Description</label>
          <p>${role.description ?? "—"}</p>
        </div>

        <div class="detail-section">
          <label>Priority</label>
          <span>${role.priority ?? 50}</span>
        </div>

        <div class="detail-section">
          <label>Max Concurrent</label>
          <span>${role.maxConcurrent ?? "unlimited"}</span>
        </div>

        ${role.allowedTools?.length
          ? html`
              <div class="detail-section">
                <label>Allowed Tools</label>
                <div class="tag-list">
                  ${role.allowedTools.map((t) => html`<span class="tag">${t}</span>`)}
                </div>
              </div>
            `
          : nothing}
        ${role.deniedTools?.length
          ? html`
              <div class="detail-section">
                <label>Denied Tools</label>
                <div class="tag-list">
                  ${role.deniedTools.map((t) => html`<span class="tag tag-danger">${t}</span>`)}
                </div>
              </div>
            `
          : nothing}
        ${role.systemPromptFragment
          ? html`
              <div class="detail-section">
                <label>System Prompt Fragment</label>
                <pre class="code-block">${role.systemPromptFragment}</pre>
              </div>
            `
          : nothing}

        <!-- Assign agent to this role -->
        <div class="detail-section">
          <label>Assign Agent</label>
          <div class="assign-row">
            <select id="assign-agent-select">
              <option value="">Select agent...</option>
              ${props.availableAgents.map(
                (a) =>
                  html`<option value=${a.agentConfigId}>
                    ${a.displayName ?? a.agentConfigId}
                  </option>`,
              )}
            </select>
            <button
              class="btn btn-primary"
              @click=${(e: Event) => {
                const select = (e.target as HTMLElement)
                  .closest(".assign-row")
                  ?.querySelector("select") as HTMLSelectElement | null;
                if (select?.value) {
                  props.onAssignRole(select.value, role.roleId);
                  select.value = "";
                }
              }}
            >
              Assign
            </button>
          </div>
        </div>

        <!-- Currently assigned agents -->
        ${roleAssignments.length > 0
          ? html`
              <div class="detail-section">
                <label>Assigned Agents</label>
                <div class="assignment-list">
                  ${roleAssignments.map(
                    (a) => html`
                      <div class="assignment-row">
                        <span>${a.agentConfigId}</span>
                        <span class="muted">${a.gatewayId}</span>
                        <button
                          class="btn btn-small btn-danger"
                          @click=${() => props.onUnassignRole(a.agentInstanceId)}
                        >
                          Remove
                        </button>
                      </div>
                    `,
                  )}
                </div>
              </div>
            `
          : nothing}
      </div>
    </div>
  `;
}

function renderRoleEditor(
  role: RoleDefinition,
  props: RolesViewProps,
): TemplateResult {
  const isNew = !role.roleId;

  return html`
    <div class="role-editor">
      <h3>${isNew ? "Create New Role" : `Edit: ${role.name}`}</h3>

      <form
        class="role-form"
        @submit=${(e: Event) => {
          e.preventDefault();
          const form = e.target as HTMLFormElement;
          const data = new FormData(form);
          const updated: RoleDefinition = {
            roleId: (data.get("roleId") as string) || role.roleId,
            name: (data.get("name") as string) || "",
            description: (data.get("description") as string) || undefined,
            systemPromptFragment: (data.get("systemPromptFragment") as string) || undefined,
            priority: Number(data.get("priority")) || 50,
            maxConcurrent: data.get("maxConcurrent")
              ? Number(data.get("maxConcurrent"))
              : undefined,
          };
          if (isNew) {
            props.onCreateRole(updated);
          } else {
            props.onUpdateRole(updated);
          }
        }}
      >
        <div class="form-group">
          <label for="roleId">Role ID</label>
          <input
            name="roleId"
            type="text"
            .value=${role.roleId}
            ?disabled=${!isNew}
            required
            pattern="^[a-z][a-z0-9-]{0,127}$"
            placeholder="e.g. data-analyst"
          />
        </div>

        <div class="form-group">
          <label for="name">Display Name</label>
          <input name="name" type="text" .value=${role.name} required placeholder="Data Analyst" />
        </div>

        <div class="form-group">
          <label for="description">Description</label>
          <textarea name="description" rows="3" .value=${role.description ?? ""}></textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="priority">Priority (0–100)</label>
            <input
              name="priority"
              type="number"
              min="0"
              max="100"
              .value=${String(role.priority ?? 50)}
            />
          </div>

          <div class="form-group">
            <label for="maxConcurrent">Max Concurrent (optional)</label>
            <input
              name="maxConcurrent"
              type="number"
              min="1"
              max="64"
              .value=${role.maxConcurrent != null ? String(role.maxConcurrent) : ""}
            />
          </div>
        </div>

        <div class="form-group">
          <label for="systemPromptFragment">System Prompt Fragment</label>
          <textarea
            name="systemPromptFragment"
            rows="6"
            .value=${role.systemPromptFragment ?? ""}
            placeholder="Instructions injected when an agent adopts this role..."
          ></textarea>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary">
            ${isNew ? "Create" : "Save Changes"}
          </button>
          <button type="button" class="btn btn-secondary" @click=${() => props.onEditRole(null)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  `;
}

function renderAssignmentsList(props: RolesViewProps): TemplateResult {
  if (props.assignments.length === 0) {
    return html`<div class="empty-state">No agents assigned to roles</div>`;
  }

  return html`
    <div class="assignments-list">
      ${props.assignments.map(
        (a) => html`
          <div class="assignment-card">
            <div class="assignment-card-header">
              <span class="agent-name">${a.agentConfigId}</span>
              <span class="badge">${a.roleName}</span>
            </div>
            <div class="assignment-card-meta">
              <span class="muted">Gateway: ${a.gatewayId}</span>
              <span class="muted">Since: ${new Date(a.assignedAt).toLocaleString()}</span>
            </div>
            <button
              class="btn btn-small btn-danger"
              @click=${() => props.onUnassignRole(a.agentInstanceId)}
            >
              Unassign
            </button>
          </div>
        `,
      )}
    </div>
  `;
}
