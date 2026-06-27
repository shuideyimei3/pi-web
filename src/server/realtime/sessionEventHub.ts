import type { GlobalSessionEvent, RealtimeEvent, SessionUiEvent } from "../../shared/apiTypes.js";

export interface RealtimeSocket {
  readonly OPEN: number;
  readyState: number;
  send(payload: string): void;
  on(event: "close", listener: () => void): unknown;
}

type GlobalRealtimeEvent = GlobalSessionEvent | RealtimeEvent;

/**
 * Fan-out hub for session and realtime websocket events.
 *
 * By default the hub preserves the historical immediate-send behavior. The
 * session daemon enables a small flush interval so high-frequency deltas are
 * grouped into one websocket payload per frame, reducing packet churn without
 * changing the public event protocol. Clients that do not understand batches
 * still work when batching is left disabled in tests or other embedders.
 */
export class SessionEventHub {
  private readonly socketsBySession = new Map<string, Set<RealtimeSocket>>();
  private readonly globalSockets = new Set<RealtimeSocket>();
  private readonly sessionBuffers = new Map<string, SessionUiEvent[]>();
  private readonly globalBuffer: GlobalRealtimeEvent[] = [];
  private readonly flushIntervalMs: number;
  private readonly maxBufferSize: number;
  private readonly sessionFlushTimers = new Map<string, NodeJS.Timeout>();
  private globalFlushTimer: NodeJS.Timeout | undefined;

  constructor(options: { flushIntervalMs?: number; maxBufferSize?: number } = {}) {
    this.flushIntervalMs = options.flushIntervalMs ?? 0;
    this.maxBufferSize = options.maxBufferSize ?? 100;
  }

  add(sessionId: string, socket: RealtimeSocket): void {
    let sockets = this.socketsBySession.get(sessionId);
    if (sockets === undefined) {
      sockets = new Set();
      this.socketsBySession.set(sessionId, sockets);
    }
    sockets.add(socket);
    socket.on("close", () => {
      sockets.delete(socket);
      if (sockets.size > 0) return;
      this.socketsBySession.delete(sessionId);
      this.sessionBuffers.delete(sessionId);
      this.clearSessionFlushTimer(sessionId);
    });
  }

  addGlobal(socket: RealtimeSocket): void {
    this.globalSockets.add(socket);
    socket.on("close", () => this.globalSockets.delete(socket));
  }

  publish(sessionId: string, event: SessionUiEvent): void {
    if (this.flushIntervalMs <= 0) {
      this.sendSessionEvents(sessionId, [event]);
      return;
    }

    const buffer = this.sessionBuffers.get(sessionId) ?? [];
    buffer.push(event);
    this.sessionBuffers.set(sessionId, buffer);

    if (buffer.length >= this.maxBufferSize) {
      this.flushSession(sessionId);
      return;
    }

    if (!this.sessionFlushTimers.has(sessionId)) this.scheduleSessionFlush(sessionId);
  }

  publishGlobal(event: GlobalSessionEvent): void {
    this.publishRealtime(event);
  }

  publishRealtime(event: RealtimeEvent): void {
    if (this.flushIntervalMs <= 0) {
      this.sendGlobalEvents([event]);
      return;
    }

    this.globalBuffer.push(event);

    if (this.globalBuffer.length >= this.maxBufferSize) {
      this.flushGlobal();
      return;
    }

    if (this.globalFlushTimer === undefined) this.scheduleGlobalFlush();
  }

  private scheduleSessionFlush(sessionId: string): void {
    const timer = setTimeout(() => {
      this.sessionFlushTimers.delete(sessionId);
      this.flushSession(sessionId);
    }, this.flushIntervalMs);
    this.sessionFlushTimers.set(sessionId, timer);
  }

  private flushSession(sessionId: string): void {
    this.clearSessionFlushTimer(sessionId);
    const events = this.sessionBuffers.get(sessionId);
    if (events === undefined || events.length === 0) return;
    this.sessionBuffers.delete(sessionId);
    this.sendSessionEvents(sessionId, events);
  }

  private clearSessionFlushTimer(sessionId: string): void {
    const timer = this.sessionFlushTimers.get(sessionId);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.sessionFlushTimers.delete(sessionId);
  }

  private scheduleGlobalFlush(): void {
    this.globalFlushTimer = setTimeout(() => {
      this.globalFlushTimer = undefined;
      this.flushGlobal();
    }, this.flushIntervalMs);
  }

  private flushGlobal(): void {
    if (this.globalFlushTimer !== undefined) {
      clearTimeout(this.globalFlushTimer);
      this.globalFlushTimer = undefined;
    }
    if (this.globalBuffer.length === 0) return;
    const events = [...this.globalBuffer];
    this.globalBuffer.length = 0;
    this.sendGlobalEvents(events);
  }

  private sendSessionEvents(sessionId: string, events: readonly SessionUiEvent[]): void {
    this.sendToSockets(this.socketsBySession.get(sessionId) ?? [], serializeEvents(events));
  }

  private sendGlobalEvents(events: readonly GlobalRealtimeEvent[]): void {
    this.sendToSockets(this.globalSockets, serializeEvents(events));
  }

  private sendToSockets(sockets: Iterable<RealtimeSocket>, payload: string): void {
    for (const socket of sockets) {
      if (socket.readyState !== socket.OPEN) continue;
      try {
        socket.send(payload);
      } catch (error) {
        console.error("Failed to send realtime event:", error);
      }
    }
  }
}

function serializeEvents(events: readonly unknown[]): string {
  return JSON.stringify(events.length === 1 ? events[0] : { type: "batch", events });
}
