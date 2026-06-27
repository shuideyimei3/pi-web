import type { SessionRef } from "../../../shared/apiTypes";

type SessionLookup = SessionRef | string;

export function sessionEvents(session: SessionLookup, machineId = "local"): WebSocket {
  return new WebSocket(`${webSocketBaseUrl()}${sessionEventsPath(session, machineId)}`);
}

export function sessionEventStream(session: SessionLookup, machineId = "local"): EventSource {
  return new EventSource(sessionEventsPath(session, machineId, "/sse"));
}

export function globalSessionEvents(machineId = "local"): WebSocket {
  return new WebSocket(`${webSocketBaseUrl()}${machinePrefix(machineId)}/sessions/events`);
}


export function terminalSocket(projectId: string, workspaceId: string, terminalId: string, initialSize?: { cols: number; rows: number }, machineId = "local"): WebSocket {
  const sizeQuery = initialSize === undefined ? "" : `?cols=${encodeURIComponent(String(initialSize.cols))}&rows=${encodeURIComponent(String(initialSize.rows))}`;
  return new WebSocket(`${webSocketBaseUrl()}${machinePrefix(machineId)}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}/terminals/${encodeURIComponent(terminalId)}/socket${sizeQuery}`);
}

export function realtimeEvents(machineId = "local"): WebSocket {
  return new WebSocket(`${webSocketBaseUrl()}${machinePrefix(machineId)}/events`);
}

export function realtimeEventStream(machineId = "local"): EventSource {
  return new EventSource(`${machinePrefix(machineId)}/events/sse`);
}

function sessionEventsPath(session: SessionLookup, machineId: string, suffix = ""): string {
  const cwd = typeof session === "string" ? undefined : session.cwd;
  const query = cwd === undefined || cwd === "" ? "" : `?${new URLSearchParams({ cwd }).toString()}`;
  const sessionId = typeof session === "string" ? session : session.id;
  return `${machinePrefix(machineId)}/sessions/${encodeURIComponent(sessionId)}/events${suffix}${query}`;
}

function machinePrefix(machineId: string): string {
  return `/api/machines/${encodeURIComponent(machineId)}`;
}

function webSocketBaseUrl(): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}`;
}
