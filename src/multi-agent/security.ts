/**
 * Multi-Agent Security Manager
 *
 * Handles authentication, authorization, and integrity verification
 * for inter-agent communication. Uses Ed25519 challenge/response
 * for peer gateway authentication and HMAC-SHA256 for message integrity.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  MessageEnvelope,
  MultiAgentMessage,
  SecurityChallengePayload,
  SecurityResponsePayload,
} from "./protocol.js";

export type AgentPermission =
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

export type AgentSecurityPolicy = {
  /** Agent instance or config ID this policy applies to. */
  agentId: string;
  /** Granted permissions. */
  permissions: AgentPermission[];
  /** IP/network allowlist (CIDR notation). Empty = any. */
  networkAllowlist: string[];
  /** Maximum tasks this agent can have assigned concurrently. */
  maxConcurrentTasks: number;
  /** Maximum message rate per minute. */
  maxMessagesPerMinute: number;
  /** Whether this agent can communicate with external gateways. */
  allowCrossGateway: boolean;
};

export type SecurityAuditEntry = {
  timestamp: number;
  agentId: string;
  action: string;
  allowed: boolean;
  reason?: string;
  sourceIp?: string;
};

const DEFAULT_PERMISSIONS: AgentPermission[] = [
  "task.assign",
  "report.read",
  "config.read",
];

export class AgentSecurityManager {
  private policies: Map<string, AgentSecurityPolicy> = new Map();
  private sharedSecret: Buffer;
  private auditLog: SecurityAuditEntry[] = [];
  private readonly maxAuditEntries = 10_000;
  /** Ring-buffer write index for log compaction. */
  private auditTrimPending = false;
  /** Rate limiter: agentId → { count, windowStart }. */
  private rateLimiter: Map<string, { count: number; windowStart: number }> = new Map();

  constructor(sharedSecret?: string) {
    // Derive from provided secret or generate a random one
    this.sharedSecret = sharedSecret
      ? Buffer.from(sharedSecret, "utf8")
      : randomBytes(32);
  }

  /** Set or update a security policy for an agent. */
  setPolicy(policy: AgentSecurityPolicy): void {
    this.policies.set(policy.agentId, policy);
  }

  /** Remove a security policy. */
  removePolicy(agentId: string): void {
    this.policies.delete(agentId);
  }

  /** Get the policy for an agent, falling back to defaults. */
  getPolicy(agentId: string): AgentSecurityPolicy {
    return (
      this.policies.get(agentId) ?? {
        agentId,
        permissions: [...DEFAULT_PERMISSIONS],
        networkAllowlist: [],
        maxConcurrentTasks: 8,
        maxMessagesPerMinute: 120,
        allowCrossGateway: false,
      }
    );
  }

  /** Check if an agent has a specific permission. */
  hasPermission(agentId: string, permission: AgentPermission): boolean {
    const policy = this.getPolicy(agentId);
    const allowed = policy.permissions.includes(permission);

    this.logAudit({
      timestamp: Date.now(),
      agentId,
      action: `permission.check:${permission}`,
      allowed,
      reason: allowed ? undefined : `missing permission: ${permission}`,
    });

    return allowed;
  }

  /** Check rate limit for an agent. Returns true if allowed. */
  checkRateLimit(agentId: string): boolean {
    const policy = this.getPolicy(agentId);
    const now = Date.now();
    const windowMs = 60_000;

    let entry = this.rateLimiter.get(agentId);
    if (!entry || now - entry.windowStart > windowMs) {
      entry = { count: 0, windowStart: now };
      this.rateLimiter.set(agentId, entry);
    }

    entry.count++;
    const allowed = entry.count <= policy.maxMessagesPerMinute;

    if (!allowed) {
      this.logAudit({
        timestamp: now,
        agentId,
        action: "rate-limit.exceeded",
        allowed: false,
        reason: `${entry.count}/${policy.maxMessagesPerMinute} msgs/min`,
      });
    }

    return allowed;
  }

  /**
   * Authorize an incoming multi-agent message.
   * Checks: permission, rate limit, signature (if present), cross-gateway policy.
   */
  authorizeMessage(message: MultiAgentMessage): {
    allowed: boolean;
    reason?: string;
  } {
    const fromId = message.envelope.from.agentConfigId;
    const policy = this.getPolicy(fromId);

    // Rate limit
    if (!this.checkRateLimit(fromId)) {
      return { allowed: false, reason: "rate limit exceeded" };
    }

    // Cross-gateway check
    const isCrossGateway = message.envelope.from.gatewayId !== message.envelope.to?.gatewayId;
    if (isCrossGateway && !policy.allowCrossGateway) {
      this.logAudit({
        timestamp: Date.now(),
        agentId: fromId,
        action: "cross-gateway.denied",
        allowed: false,
        reason: "cross-gateway communication not allowed",
      });
      return { allowed: false, reason: "cross-gateway communication not allowed" };
    }

    // Signature verification (if present)
    if (message.envelope.signature) {
      const valid = this.verifySignature(message.envelope, message.payload);
      if (!valid) {
        this.logAudit({
          timestamp: Date.now(),
          agentId: fromId,
          action: "signature.invalid",
          allowed: false,
        });
        return { allowed: false, reason: "invalid message signature" };
      }
    }

    // Permission check based on payload type
    const requiredPermission = this.payloadToPermission(message.payload.type);
    if (requiredPermission && !policy.permissions.includes(requiredPermission)) {
      return { allowed: false, reason: `missing permission: ${requiredPermission}` };
    }

    return { allowed: true };
  }

  /** Sign a message envelope with HMAC-SHA256. */
  signMessage(envelope: MessageEnvelope, payload: unknown): string {
    const data = JSON.stringify({ messageId: envelope.messageId, payload });
    const hmac = createHmac("sha256", this.sharedSecret);
    hmac.update(data);
    return hmac.digest("base64");
  }

  /** Verify a message signature. */
  verifySignature(envelope: MessageEnvelope, payload: unknown): boolean {
    if (!envelope.signature) return false;
    const expected = this.signMessage(envelope, payload);
    try {
      return timingSafeEqual(
        Buffer.from(envelope.signature, "base64"),
        Buffer.from(expected, "base64"),
      );
    } catch {
      return false;
    }
  }

  /** Generate a security challenge for peer authentication. */
  generateChallenge(): SecurityChallengePayload {
    return {
      type: "security.challenge",
      nonce: randomBytes(32).toString("base64"),
      algorithm: "ed25519",
    };
  }

  /** Get recent audit log entries. */
  getAuditLog(limit = 100): SecurityAuditEntry[] {
    return this.auditLog.slice(-limit);
  }

  /** Get audit entries for a specific agent. */
  getAgentAuditLog(agentId: string, limit = 50): SecurityAuditEntry[] {
    return this.auditLog
      .filter((e) => e.agentId === agentId)
      .slice(-limit);
  }

  /** Export all policies for persistence. */
  exportPolicies(): AgentSecurityPolicy[] {
    return [...this.policies.values()];
  }

  /** Import policies from persistence. */
  importPolicies(policies: AgentSecurityPolicy[]): void {
    this.policies.clear();
    for (const p of policies) {
      this.policies.set(p.agentId, p);
    }
  }

  private payloadToPermission(payloadType: string): AgentPermission | null {
    switch (payloadType) {
      case "task.assign":
        return "task.assign";
      case "role.assign":
        return "role.assign";
      case "agent.discovery":
        return "agent.register";
      case "task.result":
      case "task.progress":
      case "heartbeat":
        return null; // Always allowed
      default:
        return null;
    }
  }

  private logAudit(entry: SecurityAuditEntry): void {
    this.auditLog.push(entry);
    // Batch trim: schedule a microtask trim instead of splicing on every log
    if (this.auditLog.length > this.maxAuditEntries && !this.auditTrimPending) {
      this.auditTrimPending = true;
      queueMicrotask(() => {
        if (this.auditLog.length > this.maxAuditEntries) {
          const trimCount = Math.floor(this.maxAuditEntries * 0.2);
          this.auditLog = this.auditLog.slice(trimCount);
        }
        this.auditTrimPending = false;
      });
    }
  }
}
