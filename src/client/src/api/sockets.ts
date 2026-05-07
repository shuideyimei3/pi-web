export function sessionEvents(sessionId: string): WebSocket {
  return new WebSocket(`${webSocketBaseUrl()}/api/sessions/${sessionId}/events`);
}

export function globalSessionEvents(): WebSocket {
  return new WebSocket(`${webSocketBaseUrl()}/api/sessions/events`);
}

function webSocketBaseUrl(): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}`;
}
