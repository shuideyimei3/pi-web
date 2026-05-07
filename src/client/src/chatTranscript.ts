import { appendText, textMessage } from "./chatMessages";
import type { ChatLine, ChatPart } from "./components/shared";
import { appendShellChunk, finalizeShellMessage, shellStartMessage } from "./shellMessages";
import type { SessionUiEvent } from "./sessionSocket";

export function applyTranscriptEvent(messages: ChatLine[], event: SessionUiEvent): ChatLine[] | undefined {
  if (event.type === "assistant.delta") return appendText(messages, "assistant", event.text);
  if (event.type === "tool.start") return appendPart(messages, "assistant", { type: "toolCall", toolName: event.toolName, summary: event.summary });
  if (event.type === "tool.end") return [...messages, { role: "tool", parts: [{ type: "toolResult", toolName: event.toolName, text: event.text, isError: event.isError }] }];
  if (event.type === "shell.start") return [...messages, shellStartMessage(event.command, event.excludeFromContext)];
  if (event.type === "shell.chunk") return appendShellChunk(messages, event.chunk);
  if (event.type === "shell.end") return finalizeShellMessage(messages, event);
  if (event.type === "command.output") return [...messages, textMessage(event.level === "error" ? "system" : "tool", event.message)];
  if (event.type === "session.error") return [...messages, textMessage("system", event.message)];
  return undefined;
}

function appendPart(messages: ChatLine[], role: ChatLine["role"], part: ChatPart): ChatLine[] {
  const last = messages.at(-1);
  if (last?.role === role) return [...messages.slice(0, -1), { ...last, parts: [...last.parts, part] }];
  return [...messages, { role, parts: [part] }];
}
