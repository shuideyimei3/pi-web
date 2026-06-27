import type { EventEmitter } from "node:events";
import { EventEmitter as NodeEventEmitter } from "node:events";
import type { FastifyReply } from "fastify";
import type { RealtimeSocket } from "./sessionEventHub.js";

const SSE_KEEPALIVE_INTERVAL_MS = 15_000;

/**
 * Adapts a Fastify HTTP response to the same tiny socket interface used by the
 * realtime fan-out hub. Events are encoded as Server-Sent Events so browsers can
 * consume session updates with EventSource while websocket clients remain
 * supported by the same hub.
 */
export function createSseSocket(reply: FastifyReply): RealtimeSocket {
  reply.hijack();
  const response = reply.raw;
  const events: EventEmitter = new NodeEventEmitter();
  let closed = false;

  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    "connection": "keep-alive",
    "x-accel-buffering": "no",
  });
  response.write(": connected\n\n");

  const keepAlive = setInterval(() => {
    if (!closed && !response.writableEnded) response.write(": keepalive\n\n");
  }, SSE_KEEPALIVE_INTERVAL_MS);

  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(keepAlive);
    events.emit("close");
  };
  response.on("close", close);
  response.on("finish", close);
  response.on("error", close);

  return {
    OPEN: 1,
    get readyState() {
      return closed || response.writableEnded ? 3 : 1;
    },
    send(payload: string): void {
      if (closed || response.writableEnded) return;
      response.write(encodeSseMessage(payload));
    },
    on(event: "close", listener: () => void): unknown {
      return events.on(event, listener);
    },
  };
}

function encodeSseMessage(payload: string): string {
  return `${payload.split(/\r?\n/u).map((line) => `data: ${line}`).join("\n")}\n\n`;
}
