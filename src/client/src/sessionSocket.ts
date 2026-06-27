import { realtimeEvents, realtimeEventStream, sessionEvents, sessionEventStream } from "./api";
import type { GlobalSessionEvent, RealtimeEvent, SessionRef, SessionUiEvent } from "../../shared/apiTypes";

export type { GlobalSessionEvent, RealtimeEvent, SessionUiEvent } from "../../shared/apiTypes";

export class SessionSocket {
  private socket: WebSocket | undefined;
  private source: EventSource | undefined;
  private session: SessionRef | undefined;
  private onEvent: ((event: SessionUiEvent) => void) | undefined;
  private reconnectTimer?: number;
  private reconnectDelay = 500;
  private shouldReconnect = false;
  private hasOpened = false;
  private onReconnect: (() => void) | undefined;
  private machineId = "local";

  // Event buffer for reconnection
  private eventBuffer: SessionUiEvent[] = [];
  private readonly maxBufferSize = 500;
  private isReconnecting = false;

  connect(session: SessionRef, onEvent: (event: SessionUiEvent) => void, onReconnect?: () => void, machineId = "local"): void {
    this.close();
    this.machineId = machineId;
    this.session = session;
    this.onEvent = onEvent;
    this.onReconnect = onReconnect;
    this.shouldReconnect = true;
    this.isReconnecting = false;
    this.open();
  }

  setHandler(onEvent: (event: SessionUiEvent) => void): void {
    this.onEvent = onEvent;
  }

  close(): void {
    this.shouldReconnect = false;
    this.isReconnecting = false;
    window.clearTimeout(this.reconnectTimer);
    closeSocketQuietly(this.socket);
    closeEventSourceQuietly(this.source);
    this.socket = undefined;
    this.source = undefined;
    this.session = undefined;
    this.onEvent = undefined;
    this.onReconnect = undefined;
    this.hasOpened = false;
    this.machineId = "local";
    this.eventBuffer = [];
  }

  private open(): void {
    if (this.session === undefined || this.session.id === "" || this.session.cwd === "" || !this.shouldReconnect) return;
    if (typeof EventSource === "undefined") {
      this.openWebSocket();
      return;
    }
    this.openEventSource();
  }

  private openEventSource(): void {
    if (this.session === undefined) return;
    const source = sessionEventStream(this.session, this.machineId);
    this.source = source;
    source.onopen = () => {
      this.reconnectDelay = 500;
      if (this.hasOpened) {
        this.flushEventBuffer();
        this.onReconnect?.();
      }
      this.hasOpened = true;
      this.isReconnecting = false;
    };
    source.onmessage = (message) => void this.handleMessage(message.data);
    source.onerror = () => {
      if (!this.shouldReconnect) return;
      // Native EventSource reconnects automatically. Mark the stream as
      // reconnecting so any late/buffered messages are held until the next open.
      this.isReconnecting = true;
    };
  }

  private openWebSocket(): void {
    if (this.session === undefined) return;
    const socket = sessionEvents(this.session, this.machineId);
    this.socket = socket;
    socket.onopen = () => {
      this.reconnectDelay = 500;
      if (this.hasOpened) {
        // Reconnected - flush buffered events
        this.flushEventBuffer();
        this.onReconnect?.();
      }
      this.hasOpened = true;
      this.isReconnecting = false;
    };
    socket.onmessage = (message) => void this.handleMessage(message.data);
    socket.onerror = () => { socket.close(); };
    socket.onclose = () => {
      if (this.socket === socket) this.socket = undefined;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    window.clearTimeout(this.reconnectTimer);
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.6, 5000);
    this.isReconnecting = true;
    this.reconnectTimer = window.setTimeout(() => { this.open(); }, delay);
  }

  private flushEventBuffer(): void {
    if (this.eventBuffer.length === 0) return;

    const events = this.eventBuffer;
    this.eventBuffer = [];

    // Process buffered events in order
    for (const event of events) {
      try {
        this.onEvent?.(event);
      } catch (error) {
        console.error("Error processing buffered event:", error);
      }
    }
  }

  private async handleMessage(data: MessageEvent["data"]): Promise<void> {
    const event = await parseSocketEvent(data);
    if (event === undefined) return;

    // Handle batched events from server
    if (isBatchEvent(event)) {
      for (const singleEvent of event.events) {
        if (isSessionUiEvent(singleEvent)) {
          if (this.isReconnecting) {
            // Buffer events during reconnection
            this.bufferEvent(singleEvent);
          } else {
            this.onEvent?.(singleEvent);
          }
        }
      }
    } else if (isSessionUiEvent(event)) {
      if (this.isReconnecting) {
        this.bufferEvent(event);
      } else {
        this.onEvent?.(event);
      }
    }
  }

  private bufferEvent(event: SessionUiEvent): void {
    this.eventBuffer.push(event);

    // Limit buffer size to prevent memory issues
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer.shift(); // Remove oldest event
    }
  }
}

export class RealtimeSocket {
  private socket: WebSocket | undefined;
  private source: EventSource | undefined;
  private onEvent: ((event: RealtimeEvent) => void) | undefined;
  private onOpen: (() => void) | undefined;
  private reconnectTimer?: number;
  private reconnectDelay = 500;
  private shouldReconnect = false;
  private machineId = "local";

  connect(onEvent: (event: RealtimeEvent) => void, onOpen?: () => void, machineId = "local"): void {
    this.close();
    this.machineId = machineId;
    this.onEvent = onEvent;
    this.onOpen = onOpen;
    this.shouldReconnect = true;
    this.open();
  }

  close(): void {
    this.shouldReconnect = false;
    window.clearTimeout(this.reconnectTimer);
    closeSocketQuietly(this.socket);
    closeEventSourceQuietly(this.source);
    this.socket = undefined;
    this.source = undefined;
    this.onEvent = undefined;
    this.onOpen = undefined;
    this.machineId = "local";
  }

  private open(): void {
    if (!this.shouldReconnect) return;
    if (typeof EventSource === "undefined") {
      this.openWebSocket();
      return;
    }
    this.openEventSource();
  }

  private openEventSource(): void {
    const source = realtimeEventStream(this.machineId);
    this.source = source;
    source.onopen = () => {
      this.reconnectDelay = 500;
      this.onOpen?.();
    };
    source.onmessage = (message) => void this.handleMessage(message.data);
    source.onerror = () => {
      // Native EventSource keeps retrying; websocket fallback below is only for
      // browsers/environments without EventSource support.
    };
  }

  private openWebSocket(): void {
    const socket = realtimeEvents(this.machineId);
    this.socket = socket;
    socket.onopen = () => {
      this.reconnectDelay = 500;
      this.onOpen?.();
    };
    socket.onmessage = (message) => void this.handleMessage(message.data);
    socket.onerror = () => { socket.close(); };
    socket.onclose = () => {
      if (this.socket === socket) this.socket = undefined;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    window.clearTimeout(this.reconnectTimer);
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.6, 5000);
    this.reconnectTimer = window.setTimeout(() => { this.open(); }, delay);
  }

  private async handleMessage(data: MessageEvent["data"]): Promise<void> {
    const event = await parseSocketEvent(data);
    if (isRealtimeEvent(event)) this.onEvent?.(event);
  }
}

function isSessionUiEvent(event: unknown): event is SessionUiEvent {
  const type = eventType(event);
  return ["message.append", "assistant.delta", "assistant.thinking.delta", "tool.start", "tool.update", "tool.end", "shell.start", "shell.chunk", "shell.end", "agent.start", "agent.end", "message.end", "status.update", "activity.update", "command.output", "session.error", "session.name", "session.created", "pi.event"].includes(type);
}

function isGlobalSessionEvent(event: unknown): event is GlobalSessionEvent {
  const type = eventType(event);
  return type === "status.update" || type === "activity.update" || type === "session.name" || type === "session.created";
}

function isRealtimeEvent(event: unknown): event is RealtimeEvent {
  const type = eventType(event);
  return isGlobalSessionEvent(event) || type === "terminal.created" || type === "terminal.exited" || type === "terminal.closed" || type === "workspace.activity";
}

function eventType(event: unknown): string {
  if (typeof event !== "object" || event === null || !("type" in event)) return "";
  const type = event.type;
  return typeof type === "string" ? type : "";
}

async function parseSocketEvent(data: MessageEvent["data"]): Promise<unknown> {
  try {
    if (typeof data === "string") return JSON.parse(data);
    if (data instanceof Blob) return JSON.parse(await data.text());
    if (data instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(data));
    return undefined;
  } catch {
    return undefined;
  }
}

function isBatchEvent(event: unknown): event is { type: "batch"; events: unknown[] } {
  return isRecord(event) && event["type"] === "batch" && Array.isArray(event["events"]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function closeSocketQuietly(socket: WebSocket | undefined): void {
  if (socket === undefined) return;
  socket.onmessage = null;
  socket.onerror = null;
  socket.onclose = null;
  if (socket.readyState === WebSocket.CONNECTING) {
    socket.onopen = () => { socket.close(); };
    return;
  }
  socket.close();
}

function closeEventSourceQuietly(source: EventSource | undefined): void {
  if (source === undefined) return;
  source.onopen = null;
  source.onmessage = null;
  source.onerror = null;
  source.close();
}
