/**
 * Multi-Agent Message Router
 *
 * Routes messages between agents within a gateway and across gateway instances.
 * Handles message delivery, broadcast, and hop-count enforcement.
 */

import { randomUUID } from "node:crypto";
import type {
  MessageEnvelope,
  MultiAgentIdentity,
  MultiAgentMessage,
  MultiAgentPayload,
  MessageDirection,
} from "./protocol.js";

export type MessageHandler = (message: MultiAgentMessage) => void | Promise<void>;

export type PeerGateway = {
  gatewayId: string;
  endpoint: string;
  publicKey?: string;
  lastSeen: number;
  status: "connected" | "connecting" | "disconnected";
};

type Subscription = {
  /** Match payload type (e.g. "task.assign", "heartbeat"). Omit for all. */
  payloadType?: string;
  /** Match sender agentConfigId. Omit for any. */
  fromAgentConfigId?: string;
  /** Match sender roleId. Omit for any. */
  fromRoleId?: string;
  handler: MessageHandler;
};

const MAX_HOP_COUNT = 16;

export class MessageRouter {
  private localGatewayId: string;
  private subscriptions: Subscription[] = [];
  private peerGateways: Map<string, PeerGateway> = new Map();
  private localAgents: Map<string, MultiAgentIdentity> = new Map();
  /** Dedup set — seen messageIds (bounded). */
  private seenMessages: Set<string> = new Set();
  private readonly maxSeenSize = 10_000;

  constructor(gatewayId: string) {
    this.localGatewayId = gatewayId;
  }

  /** Register a local agent so its messages can be routed. */
  registerLocalAgent(agent: MultiAgentIdentity): void {
    this.localAgents.set(agent.agentInstanceId, agent);
  }

  /** Unregister a local agent. */
  unregisterLocalAgent(agentInstanceId: string): void {
    this.localAgents.delete(agentInstanceId);
  }

  /** Get all local agents. */
  getLocalAgents(): MultiAgentIdentity[] {
    return [...this.localAgents.values()];
  }

  /** Register a peer gateway for cross-device routing. */
  registerPeer(peer: PeerGateway): void {
    this.peerGateways.set(peer.gatewayId, peer);
  }

  /** Remove a peer gateway. */
  removePeer(gatewayId: string): void {
    this.peerGateways.delete(gatewayId);
  }

  /** Get all peers. */
  getPeers(): PeerGateway[] {
    return [...this.peerGateways.values()];
  }

  /** Subscribe to messages matching a filter. */
  subscribe(opts: Omit<Subscription, "handler">, handler: MessageHandler): () => void {
    const sub: Subscription = { ...opts, handler };
    this.subscriptions.push(sub);
    return () => {
      const idx = this.subscriptions.indexOf(sub);
      if (idx >= 0) this.subscriptions.splice(idx, 1);
    };
  }

  /**
   * Build and send a message from a local agent.
   * Returns the envelope for tracking/correlation.
   */
  send(
    from: MultiAgentIdentity,
    to: MultiAgentIdentity | undefined,
    payload: MultiAgentPayload,
    opts?: {
      correlationId?: string;
      direction?: MessageDirection;
      ttlSeconds?: number;
    },
  ): MessageEnvelope {
    const envelope: MessageEnvelope = {
      messageId: randomUUID(),
      correlationId: opts?.correlationId ?? randomUUID(),
      timestamp: new Date().toISOString(),
      from,
      to,
      direction: opts?.direction ?? (to ? "request" : "broadcast"),
      protocolVersion: "1.0",
      ttlSeconds: opts?.ttlSeconds,
      hopCount: 0,
    };

    const message: MultiAgentMessage = { envelope, payload };
    this.route(message);
    return envelope;
  }

  /**
   * Route an incoming message to appropriate handlers.
   * Handles dedup, TTL, hop-count, and local/remote delivery.
   */
  route(message: MultiAgentMessage): void {
    const { envelope } = message;

    // Dedup
    if (this.seenMessages.has(envelope.messageId)) return;
    this.trackSeen(envelope.messageId);

    // TTL check
    if (envelope.ttlSeconds != null) {
      const age = (Date.now() - new Date(envelope.timestamp).getTime()) / 1000;
      if (age > envelope.ttlSeconds) return;
    }

    // Hop-count guard
    if ((envelope.hopCount ?? 0) >= MAX_HOP_COUNT) return;

    // Determine if this is a local or remote target
    const isLocalTarget =
      !envelope.to || envelope.to.gatewayId === this.localGatewayId;
    const isRemoteTarget =
      envelope.to && envelope.to.gatewayId !== this.localGatewayId;

    if (isLocalTarget || envelope.direction === "broadcast") {
      this.deliverLocally(message);
    }

    if (isRemoteTarget || envelope.direction === "broadcast") {
      this.forwardToRemote(message);
    }
  }

  /** Deliver to matching local subscriptions. */
  private deliverLocally(message: MultiAgentMessage): void {
    const payloadType = message.payload.type;
    const fromConfigId = message.envelope.from.agentConfigId;
    const fromRoleId = message.envelope.from.roleId;

    for (const sub of this.subscriptions) {
      if (sub.payloadType && sub.payloadType !== payloadType) continue;
      if (sub.fromAgentConfigId && sub.fromAgentConfigId !== fromConfigId) continue;
      if (sub.fromRoleId && sub.fromRoleId !== fromRoleId) continue;

      try {
        const result = sub.handler(message);
        // Handle async handlers — fire-and-forget but log errors
        if (result instanceof Promise) {
          result.catch((err) => {
            console.error(`[multi-agent] Handler error for ${payloadType}:`, err);
          });
        }
      } catch (err) {
        console.error(`[multi-agent] Sync handler error for ${payloadType}:`, err);
      }
    }
  }

  /**
   * Forward to peer gateways.
   * In this implementation, remote forwarding is a placeholder that can be
   * wired to WebSocket or HTTP transport for cross-device communication.
   */
  private forwardToRemote(message: MultiAgentMessage): void {
    const bumped: MultiAgentMessage = {
      ...message,
      envelope: {
        ...message.envelope,
        hopCount: (message.envelope.hopCount ?? 0) + 1,
      },
    };

    for (const peer of this.peerGateways.values()) {
      if (peer.status !== "connected") continue;
      // Target-specific: only forward to the target gateway
      if (
        bumped.envelope.to &&
        bumped.envelope.to.gatewayId !== peer.gatewayId
      ) {
        continue;
      }
      this.sendToPeer(peer, bumped);
    }
  }

  /**
   * Send a message to a peer gateway.
   * Override this method to implement the actual transport (WebSocket/HTTP).
   */
  protected sendToPeer(_peer: PeerGateway, _message: MultiAgentMessage): void {
    // Transport implementation is provided by subclasses or injected
  }

  private trackSeen(messageId: string): void {
    this.seenMessages.add(messageId);
    // Bounded cleanup
    if (this.seenMessages.size > this.maxSeenSize) {
      const toRemove = this.seenMessages.size - Math.floor(this.maxSeenSize * 0.8);
      const iterator = this.seenMessages.values();
      for (let i = 0; i < toRemove; i++) {
        const next = iterator.next();
        if (!next.done) this.seenMessages.delete(next.value);
      }
    }
  }
}
