/**
 * Tests for multi-agent orchestrator, role manager, work tracker,
 * message router, and security manager.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { MultiAgentOrchestrator } from "./orchestrator.js";
import { RoleManager, BUILT_IN_ROLES } from "./role-manager.js";
import { MessageRouter } from "./message-router.js";
import { WorkTracker } from "./work-tracker.js";
import { AgentSecurityManager } from "./security.js";
import type { MultiAgentIdentity, TaskResultPayload } from "./protocol.js";

function makeAgent(overrides?: Partial<MultiAgentIdentity>): MultiAgentIdentity {
  return {
    agentInstanceId: crypto.randomUUID(),
    agentConfigId: "test-agent",
    gatewayId: "gw-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// RoleManager
// ---------------------------------------------------------------------------
describe("RoleManager", () => {
  let rm: RoleManager;

  beforeEach(() => {
    rm = new RoleManager();
  });

  it("seeds built-in roles", () => {
    const roles = rm.listRoles();
    expect(roles.length).toBeGreaterThanOrEqual(BUILT_IN_ROLES.length);
    expect(roles.find((r) => r.roleId === "orchestrator")).toBeDefined();
    expect(roles.find((r) => r.roleId === "coder")).toBeDefined();
    expect(roles.find((r) => r.roleId === "reviewer")).toBeDefined();
  });

  it("assigns and retrieves role", () => {
    const agent = makeAgent();
    const result = rm.assignRole(agent, "coder", "admin");
    expect(result).not.toBeNull();
    expect(result!.role.roleId).toBe("coder");

    const retrieved = rm.getAssignment(agent.agentInstanceId);
    expect(retrieved?.role.roleId).toBe("coder");
  });

  it("enforces maxConcurrent", () => {
    // Monitor role has maxConcurrent: 1
    const a1 = makeAgent();
    const a2 = makeAgent();

    const r1 = rm.assignRole(a1, "monitor", "admin");
    expect(r1).not.toBeNull();

    const r2 = rm.assignRole(a2, "monitor", "admin");
    expect(r2).toBeNull(); // Should fail
  });

  it("unassigns role", () => {
    const agent = makeAgent();
    rm.assignRole(agent, "coder", "admin");
    expect(rm.unassignRole(agent.agentInstanceId)).toBe(true);
    expect(rm.getAssignment(agent.agentInstanceId)).toBeUndefined();
  });

  it("defines custom role", () => {
    rm.defineRole({
      roleId: "custom-qa",
      name: "QA Tester",
      description: "Runs automated tests",
      priority: 55,
    });
    expect(rm.getRole("custom-qa")?.name).toBe("QA Tester");
  });

  it("exports and imports state", () => {
    const agent = makeAgent();
    rm.defineRole({ roleId: "custom", name: "Custom", priority: 10 });
    rm.assignRole(agent, "custom", "admin");

    const exported = rm.exportState();
    const rm2 = new RoleManager();
    rm2.importState(exported);

    expect(rm2.getRole("custom")).toBeDefined();
    expect(rm2.getAssignment(agent.agentInstanceId)?.role.roleId).toBe("custom");
  });
});

// ---------------------------------------------------------------------------
// MessageRouter
// ---------------------------------------------------------------------------
describe("MessageRouter", () => {
  let router: MessageRouter;

  beforeEach(() => {
    router = new MessageRouter("gw-1");
  });

  it("registers and retrieves local agents", () => {
    const agent = makeAgent();
    router.registerLocalAgent(agent);
    expect(router.getLocalAgents()).toHaveLength(1);
    router.unregisterLocalAgent(agent.agentInstanceId);
    expect(router.getLocalAgents()).toHaveLength(0);
  });

  it("delivers messages to matching subscriptions", () => {
    const handler = vi.fn();
    router.subscribe({ payloadType: "task.assign" }, handler);

    const from = makeAgent();
    router.registerLocalAgent(from);

    router.send(from, undefined, {
      type: "task.assign",
      task: "test task",
    });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].payload.task).toBe("test task");
  });

  it("does not deliver mismatched payload types", () => {
    const handler = vi.fn();
    router.subscribe({ payloadType: "heartbeat" }, handler);

    const from = makeAgent();
    router.send(from, undefined, {
      type: "task.assign",
      task: "test task",
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("deduplicates messages", () => {
    const handler = vi.fn();
    router.subscribe({}, handler);

    const from = makeAgent();
    const envelope = router.send(from, undefined, {
      type: "heartbeat",
    });

    // Manually re-route the same message
    router.route({
      envelope,
      payload: { type: "heartbeat" },
    });

    // Should only be delivered once
    expect(handler).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// WorkTracker
// ---------------------------------------------------------------------------
describe("WorkTracker", () => {
  let tracker: WorkTracker;

  beforeEach(() => {
    tracker = new WorkTracker();
  });

  it("creates and tracks tasks", () => {
    const task = tracker.createTask({
      taskId: "t1",
      correlationId: "c1",
      task: "write code",
    });

    expect(task.status).toBe("pending");
    expect(tracker.getTask("t1")).toBeDefined();
  });

  it("manages task lifecycle", () => {
    const agent = makeAgent();

    tracker.createTask({ taskId: "t1", correlationId: "c1", task: "write code" });
    expect(tracker.assignTask("t1", agent)).toBe(true);
    expect(tracker.getTask("t1")!.status).toBe("assigned");

    expect(tracker.startTask("t1")).toBe(true);
    expect(tracker.getTask("t1")!.status).toBe("in-progress");

    tracker.updateProgress("t1", 50, "halfway done");
    expect(tracker.getTask("t1")!.progressPercent).toBe(50);

    const result: TaskResultPayload = {
      type: "task.result",
      status: "success",
      result: "done",
      durationMs: 1000,
    };
    expect(tracker.completeTask("t1", result)).toBe(true);
    expect(tracker.getTask("t1")!.status).toBe("completed");
  });

  it("retries failed tasks", () => {
    const agent = makeAgent();
    tracker.createTask({ taskId: "t1", correlationId: "c1", task: "flaky task", maxRetries: 2 });
    tracker.assignTask("t1", agent);
    tracker.startTask("t1");
    tracker.completeTask("t1", { type: "task.result", status: "failure", error: "oops" });

    expect(tracker.retryTask("t1")).toBe(true);
    expect(tracker.getTask("t1")!.status).toBe("pending");
    expect(tracker.getTask("t1")!.retryCount).toBe(1);
  });

  it("respects retry limit", () => {
    const agent = makeAgent();
    tracker.createTask({ taskId: "t1", correlationId: "c1", task: "broken", maxRetries: 0 });
    tracker.assignTask("t1", agent);
    tracker.startTask("t1");
    tracker.completeTask("t1", { type: "task.result", status: "failure" });

    expect(tracker.retryTask("t1")).toBe(false);
  });

  it("generates summary", () => {
    tracker.createTask({ taskId: "t1", correlationId: "c1", task: "a" });
    tracker.createTask({ taskId: "t2", correlationId: "c2", task: "b" });

    const summary = tracker.getSummary();
    expect(summary.total).toBe(2);
    expect(summary.pending).toBe(2);
  });

  it("filters tasks", () => {
    tracker.createTask({ taskId: "t1", correlationId: "c1", task: "a", tags: ["urgent"] });
    tracker.createTask({ taskId: "t2", correlationId: "c2", task: "b", tags: ["normal"] });

    const urgent = tracker.listTasks({ tag: "urgent" });
    expect(urgent).toHaveLength(1);
    expect(urgent[0].taskId).toBe("t1");
  });

  it("cleans up old tasks", () => {
    const task = tracker.createTask({ taskId: "t1", correlationId: "c1", task: "old" });
    const agent = makeAgent();
    tracker.assignTask("t1", agent);
    tracker.startTask("t1");
    tracker.completeTask("t1", { type: "task.result", status: "success" });

    // Force the completedAt to be old
    const t = tracker.getTask("t1")!;
    (t as { completedAt: number }).completedAt = Date.now() - 2 * 86_400_000;

    const removed = tracker.cleanup(86_400_000);
    expect(removed).toBe(1);
    expect(tracker.getTask("t1")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// AgentSecurityManager
// ---------------------------------------------------------------------------
describe("AgentSecurityManager", () => {
  let sec: AgentSecurityManager;

  beforeEach(() => {
    sec = new AgentSecurityManager("test-secret-key");
  });

  it("returns default permissions for unknown agents", () => {
    const policy = sec.getPolicy("unknown-agent");
    expect(policy.permissions).toContain("task.assign");
    expect(policy.permissions).toContain("report.read");
  });

  it("checks permissions", () => {
    expect(sec.hasPermission("agent-1", "task.assign")).toBe(true);
    expect(sec.hasPermission("agent-1", "role.manage")).toBe(false);
  });

  it("sets and enforces custom policy", () => {
    sec.setPolicy({
      agentId: "agent-1",
      permissions: ["report.read"],
      networkAllowlist: [],
      maxConcurrentTasks: 4,
      maxMessagesPerMinute: 60,
      allowCrossGateway: false,
    });

    expect(sec.hasPermission("agent-1", "task.assign")).toBe(false);
    expect(sec.hasPermission("agent-1", "report.read")).toBe(true);
  });

  it("signs and verifies messages", () => {
    const envelope = {
      messageId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      from: makeAgent(),
      direction: "request" as const,
      protocolVersion: "1.0" as const,
    };
    const payload = { type: "heartbeat" };

    const signature = sec.signMessage(envelope, payload);
    expect(typeof signature).toBe("string");

    envelope.signature = signature;
    expect(sec.verifySignature(envelope, payload)).toBe(true);
  });

  it("rejects tampered messages", () => {
    const envelope = {
      messageId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      from: makeAgent(),
      direction: "request" as const,
      protocolVersion: "1.0" as const,
    };
    const payload = { type: "heartbeat" };
    const signature = sec.signMessage(envelope, payload);
    envelope.signature = signature;

    // Tamper with payload
    const tampered = { type: "task.assign", task: "malicious" };
    expect(sec.verifySignature(envelope, tampered)).toBe(false);
  });

  it("enforces rate limits", () => {
    sec.setPolicy({
      agentId: "fast-agent",
      permissions: [],
      networkAllowlist: [],
      maxConcurrentTasks: 1,
      maxMessagesPerMinute: 3,
      allowCrossGateway: false,
    });

    expect(sec.checkRateLimit("fast-agent")).toBe(true);
    expect(sec.checkRateLimit("fast-agent")).toBe(true);
    expect(sec.checkRateLimit("fast-agent")).toBe(true);
    expect(sec.checkRateLimit("fast-agent")).toBe(false); // 4th exceeds limit
  });

  it("logs audit entries", () => {
    sec.hasPermission("agent-1", "task.assign");
    sec.hasPermission("agent-1", "role.manage");

    const log = sec.getAuditLog();
    expect(log.length).toBe(2);
    expect(log[0].allowed).toBe(true);
    expect(log[1].allowed).toBe(false);
  });

  it("generates security challenges", () => {
    const challenge = sec.generateChallenge();
    expect(challenge.type).toBe("security.challenge");
    expect(challenge.algorithm).toBe("ed25519");
    expect(typeof challenge.nonce).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// MultiAgentOrchestrator (integration)
// ---------------------------------------------------------------------------
describe("MultiAgentOrchestrator", () => {
  let orch: MultiAgentOrchestrator;

  beforeEach(() => {
    orch = new MultiAgentOrchestrator({ gatewayId: "gw-test" });
  });

  it("registers agents and assigns roles", () => {
    const agent = makeAgent({ gatewayId: "gw-test" });
    orch.registerAgent(agent, "coder");

    const assignments = orch.roleManager.listAssignments();
    expect(assignments).toHaveLength(1);
    expect(assignments[0].role.roleId).toBe("coder");
  });

  it("submits and tracks tasks", () => {
    const agent = makeAgent({ gatewayId: "gw-test" });
    orch.registerAgent(agent, "coder");

    const task = orch.submitTask({
      task: "implement feature X",
      targetRoleId: "coder",
      priority: 80,
    });

    expect(task).not.toBeNull();
    expect(task!.status).toBe("in-progress");

    const summary = orch.getWorkSummary();
    expect(summary.inProgress).toBe(1);
  });

  it("returns null task when no agent available", () => {
    const task = orch.submitTask({
      task: "no one to do this",
      targetRoleId: "nonexistent-role",
    });

    // Task is created but stays pending (not assigned)
    expect(task).not.toBeNull();
    expect(task!.status).toBe("pending");
  });

  it("emits events", () => {
    const events: string[] = [];
    orch.onEvent((e) => events.push(e.type));

    const agent = makeAgent({ gatewayId: "gw-test" });
    orch.registerAgent(agent, "coder");

    expect(events).toContain("agent.joined");
    expect(events).toContain("role.assigned");
  });

  it("generates reports", () => {
    const agent = makeAgent({ gatewayId: "gw-test" });
    orch.registerAgent(agent, "coder");   
    orch.submitTask({ task: "test", targetRoleId: "coder" });

    const report = orch.generateReport();
    expect(report.tasks.length).toBeGreaterThan(0);
    expect(report.summary.total).toBeGreaterThan(0);
  });

  it("lists roles including built-ins", () => {
    const roles = orch.getRoles();
    expect(roles.length).toBeGreaterThanOrEqual(6);
  });

  it("defines custom role", () => {
    orch.defineRole({
      roleId: "analyst",
      name: "Data Analyst",
      description: "Analyzes data and produces reports",
      priority: 45,
    });

    const roles = orch.getRoles();
    expect(roles.find((r) => r.roleId === "analyst")).toBeDefined();
  });

  it("unregisters agents", () => {
    const agent = makeAgent({ gatewayId: "gw-test" });
    orch.registerAgent(agent, "coder");
    orch.unregisterAgent(agent.agentInstanceId);

    expect(orch.roleManager.listAssignments()).toHaveLength(0);
  });

  it("stops cleanly", () => {
    orch.start();
    expect(() => orch.stop()).not.toThrow();
  });
});
