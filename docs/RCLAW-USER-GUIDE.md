# RClaw — Multi-Agent Management Platform

## User Guide

RClaw extends [OpenClaw](https://openclaw.ai) into a **multi-agent management platform** with a master dashboard, role-based coordination, work tracking, security controls, and a Windows MSI installer with onboarding UI.

This guide covers installation, gateway setup, dashboard usage, and multi-agent configuration.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
   - [From Source (All Platforms)](#from-source-all-platforms)
   - [Windows MSI Installer](#windows-msi-installer)
3. [Starting the Gateway](#starting-the-gateway)
4. [Accessing the Dashboard](#accessing-the-dashboard)
5. [Dashboard Tabs](#dashboard-tabs)
   - [Roles](#roles)
   - [Work Progress](#work-progress)
   - [Reports](#reports)
   - [Security](#security)
6. [Multi-Agent Configuration](#multi-agent-configuration)
   - [Registering Agents](#registering-agents)
   - [Defining Roles](#defining-roles)
   - [Submitting Tasks](#submitting-tasks)
   - [Cross-Gateway Communication](#cross-gateway-communication)
7. [Built-in Roles](#built-in-roles)
8. [Security](#security-1)
9. [API Reference](#api-reference)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Node.js 22+** (required for runtime)
- **pnpm** (recommended package manager) or npm/bun
- **Windows 10/11** (for MSI installer), macOS, or Linux
- An **AI provider API key** (Anthropic recommended, OpenAI also supported)

---

## Installation

### From Source (All Platforms)

```bash
# Clone the repository
git clone https://github.com/your-org/rclaw.git
cd rclaw

# Install dependencies
pnpm install

# Build the project
pnpm build

# Run the onboarding wizard
pnpm openclaw onboard
```

The onboarding wizard will guide you through:

1. Accepting the license agreement
2. Choosing an install directory
3. Naming your agent workspace
4. Selecting an AI provider and entering API credentials
5. Configuring gateway network binding
6. Setting a gateway password
7. Confirming and applying the configuration

### Windows MSI Installer

If you have [WiX Toolset v3](https://wixtoolset.org/) installed:

```powershell
# Build the MSI installer
pnpm tsx src/installer/build-msi.ts

# The installer will be output to:
#   dist/installer/rclaw-<version>-x64.msi
```

Run the MSI installer and follow the graphical onboarding wizard. The installer:

- Installs the CLI and gateway to `C:\Program Files\RClaw` (configurable)
- Adds `openclaw` to your system PATH
- Optionally installs a Windows Service for auto-start
- Launches the onboarding UI on first run

---

## Starting the Gateway

The gateway is the control plane that serves the web dashboard and manages agent communication.

```bash
# Start the gateway (loopback only — recommended for local use)
openclaw gateway run --bind loopback --port 18789

# Or start with force (overrides port conflicts)
openclaw gateway run --bind loopback --port 18789 --force

# Background mode (Linux/macOS)
nohup openclaw gateway run --bind loopback --port 18789 > /tmp/openclaw-gateway.log 2>&1 &
```

Verify the gateway is running:

```bash
openclaw channels status --probe
```

---

## Accessing the Dashboard

Once the gateway is running, open your browser:

```
http://localhost:18789
```

The dashboard is a local webapp served directly by the gateway. No external hosting or cloud services are needed — everything runs on your machine.

If you set a gateway password during onboarding, enter it when prompted.

### Dashboard Navigation

The web UI is organized into tab groups in the sidebar:

| Group         | Tabs                                                    |
| ------------- | ------------------------------------------------------- |
| **Chat**      | Chat (direct gateway session)                           |
| **Control**   | Overview, Channels, Instances, Sessions, Usage, Cron    |
| **Agent**     | Agents, Skills, Nodes                                   |
| **Dashboard** | **Roles**, **Work Progress**, **Reports**, **Security** |
| **Settings**  | Config, Debug, Logs                                     |

The **Dashboard** group contains the four multi-agent management views described below.

---

## Dashboard Tabs

### Roles

**Path:** `/dashboard/roles`

Manage agent roles — the core building blocks of multi-agent coordination.

**What you can do:**

- **View all roles** — See built-in and custom role definitions in the sidebar
- **Create roles** — Define new roles with name, description, tool allowlists/denylists, priority, and concurrency limits
- **Edit roles** — Modify system prompt fragments, allowed tools, and constraints
- **Delete roles** — Remove custom roles (built-in roles cannot be deleted)
- **Assign roles** — Assign a role to a registered agent (select from the agent list)
- **Unassign roles** — Remove an agent's current role assignment

Each role includes:

- **System Prompt Fragment** — Injected into the agent's prompt when the role is active
- **Allowed/Denied Tools** — Control which tools the agent can use in this role
- **Max Concurrent** — Limit how many agents can hold this role simultaneously
- **Priority** — Higher priority agents are scheduled first when resources are scarce

### Work Progress

**Path:** `/dashboard/progress`

Real-time monitoring of all tasks across the agent mesh.

**What you see:**

- **Summary cards** — Total, pending, in-progress, completed, failed, at-risk counts at a glance
- **Agent workloads** — Per-agent breakdown showing active tasks, completed, failed, and average duration
- **Task table** — Filterable list of all tasks with status, progress bars, assigned agent, priority, and deadlines
- **At-risk alerts** — Tasks approaching their deadline (< 20% time remaining) are highlighted

**Actions:**

- **Cancel** a running or pending task
- **Retry** a failed task (up to the configured retry limit)
- **Refresh** to pull the latest state from the gateway

### Reports

**Path:** `/dashboard/reports`

View workflow completion reports and performance metrics.

**What you see:**

- **Success rate** — Percentage of tasks completed successfully
- **Average duration** — Mean task completion time
- **Token usage** — Input/output token counts and costs
- **Top agents** — Ranked by completed task count and average duration
- **Failed tasks** — Detailed list of failures with error messages

**Controls:**

- **Time range** — Filter by 1h, 24h, 7d, 30d, or all time
- **Workflow filter** — Focus on a specific workflow plan
- **Export** — Download the report as JSON for external analysis

### Security

**Path:** `/dashboard/security`

Manage security policies, permissions, and audit logs.

**What you can do:**

- **View policies** — See per-agent security policies with permissions, rate limits, and network allowlists
- **Edit policies** — Configure:
  - **Permissions** — Which actions the agent can perform (task.assign, role.manage, config.write, etc.)
  - **Rate limits** — Maximum messages per minute
  - **Concurrent tasks** — Maximum simultaneous task assignments
  - **Network allowlist** — Restrict agent communication to specific networks (CIDR notation)
  - **Cross-gateway access** — Allow or deny communication with external gateways
- **Audit log** — Chronological log of all permission checks, rate limit events, and security decisions

---

## Multi-Agent Configuration

### Registering Agents

Agents are registered via the gateway's RPC interface. The dashboard automatically calls these methods when you interact with it.

From the CLI or programmatically:

```typescript
// Register a new agent with the orchestrator
await client.call("multiAgent.agents.register", {
  agentConfigId: "researcher-01",
  roleId: "researcher", // optional: assign a role on registration
  displayName: "Research Agent",
  capabilities: ["web-search", "doc-analysis"],
});
```

### Defining Roles

Beyond the 6 built-in roles, you can create custom roles:

```typescript
await client.call("multiAgent.roles.assign", {
  agentConfigId: "my-agent",
  roleId: "data-analyst",
});
```

Or define entirely new roles via the Roles dashboard tab.

### Submitting Tasks

Tasks can be submitted through the dashboard or API:

```typescript
const task = await client.call("multiAgent.tasks.submit", {
  task: "Research the latest AI safety papers from 2024",
  targetRoleId: "researcher", // route to agents with this role
  priority: 75,
  tags: ["research", "ai-safety"],
});
```

The orchestrator will:

1. Find the best available agent matching the target role
2. Consider agent load and priority for load balancing
3. Assign the task and notify the agent
4. Track progress until completion

### Cross-Gateway Communication

For multi-device setups, agents on different gateways can communicate through the mesh protocol:

1. **Peer registration** — Each gateway registers its peers with endpoint URLs
2. **Message routing** — The router handles local delivery and cross-gateway forwarding
3. **Deduplication** — Messages are deduplicated by ID across the mesh
4. **Hop-count limits** — Prevents infinite message loops (max 16 hops)
5. **TTL enforcement** — Messages expire after their time-to-live

---

## Built-in Roles

| Role             | Priority | Description                                                                                            |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| **Orchestrator** | 100      | Coordinates work, decomposes goals, assigns tasks, synthesizes results. Never performs tasks directly. |
| **Monitor**      | 80       | Tracks system health, detects anomalies, reports progress, alerts on deadline risks.                   |
| **Reviewer**     | 70       | Reviews work products for correctness, security, and adherence to standards. Read-only.                |
| **Coder**        | 60       | Writes, modifies, and reviews code. Has filesystem and execution access.                               |
| **Researcher**   | 50       | Gathers information from tools and knowledge bases. Cannot modify systems.                             |
| **Executor**     | 40       | Executes pre-approved commands and scripts. Stops on failure.                                          |

---

## Security

### Authentication

- **HMAC-SHA256** message signing ensures integrity of inter-agent messages
- **Ed25519** challenge/response for peer gateway authentication

### Authorization

- Per-agent permission policies (12 granular permissions)
- Rate limiting per agent (configurable messages per minute)
- Cross-gateway access controls
- Network allowlists (CIDR notation)

### Audit

- All permission checks, rate limit events, and security decisions are logged
- Audit log viewable in the Security dashboard tab
- Up to 10,000 entries retained with automatic compaction

### Default Permissions

New agents receive these permissions by default:

- `task.assign` — Can assign tasks
- `report.read` — Can view reports
- `config.read` — Can read configuration

Additional permissions must be explicitly granted via the Security dashboard.

---

## API Reference

All multi-agent methods are available via the gateway's WebSocket RPC interface:

### Roles

| Method                      | Description                    |
| --------------------------- | ------------------------------ |
| `multiAgent.roles.list`     | List all roles and assignments |
| `multiAgent.roles.assign`   | Assign a role to an agent      |
| `multiAgent.roles.unassign` | Remove an agent's role         |

### Tasks

| Method                     | Description                             |
| -------------------------- | --------------------------------------- |
| `multiAgent.tasks.submit`  | Submit a new task for assignment        |
| `multiAgent.tasks.status`  | Get status of a specific task           |
| `multiAgent.tasks.cancel`  | Cancel a running or pending task        |
| `multiAgent.tasks.summary` | Get summary statistics across all tasks |

### Agents

| Method                         | Description                   |
| ------------------------------ | ----------------------------- |
| `multiAgent.agents.register`   | Register a new agent          |
| `multiAgent.agents.unregister` | Remove an agent from the mesh |
| `multiAgent.agents.list`       | List all registered agents    |

### Security

| Method                           | Description                      |
| -------------------------------- | -------------------------------- |
| `multiAgent.security.audit`      | Get audit log entries            |
| `multiAgent.security.policy.set` | Set security policy for an agent |

### Work

| Method                     | Description                      |
| -------------------------- | -------------------------------- |
| `multiAgent.work.progress` | Get real-time work progress data |

---

## Troubleshooting

### Gateway won't start

```bash
# Check if the port is already in use
ss -ltnp | grep 18789    # Linux
netstat -an | findstr 18789  # Windows

# Force restart
openclaw gateway run --bind loopback --port 18789 --force
```

### Dashboard shows "Not Connected"

1. Verify the gateway is running: `openclaw channels status --probe`
2. Check the gateway URL in the browser matches your bind address
3. If using a password, ensure it's entered correctly

### Tasks stuck in "pending"

- No agent is registered, or no agent matches the target role
- Check the Roles tab to ensure agents are assigned appropriate roles
- Verify agent registration in the Agents tab

### Rate limit errors

- Increase the rate limit in the agent's security policy (Security tab)
- Default is 120 messages per minute per agent

### Run diagnostics

```bash
openclaw doctor
```

---

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run multi-agent tests specifically
pnpm vitest run src/multi-agent/

# Type-check
pnpm build

# Lint and format
pnpm check

# Start Vite dev server for live UI development
cd ui && pnpm dev
# Then open http://localhost:5173
```
