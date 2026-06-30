import type { ClientCommand } from "../types.js";

export const BUILTIN_COMMANDS: ClientCommand[] = [
  { name: "name", description: "Set session display name", source: "builtin" },
  { name: "session", description: "Show session info and stats", source: "builtin" },
  { name: "fork", description: "Create a new fork from a previous user message", source: "builtin" },
  { name: "clone", description: "Duplicate current session at current position", source: "builtin" },
  { name: "compact", description: "Manually compact session context", source: "builtin" },
];

export function isBuiltinCommand(name: string): boolean {
  return BUILTIN_COMMANDS.some((command) => command.name === name);
}
