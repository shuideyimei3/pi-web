/**
 * Timeline Execution Stream — adapter layer.
 *
 * Converts the existing ChatLine/ChatGroup data model into a flat sequence
 * of TimelineNode entries that the TimelineLayout can render as a vertical
 * execution stream with status beacons on a 1px anchor axis.
 *
 * Design notes:
 *  - toolCall / toolExecution / toolResult parts that share the same
 *    toolCallId are merged into a single TimelineToolNode so the UI can
 *    show input, output, status, and error in one collapsible row.
 *  - Duration is surfaced only when the upstream data provides it; we never
 *    fabricate a value.
 *  - The adapter is a pure function — no side effects, no DOM, no state.
 */

import type { ChatLine, ChatPart, ToolExecutionPart } from "./shared";

// ─── Status ───────────────────────────────────────────────────────────

export type TimelineNodeStatus =
  | "pending"
  | "running"
  | "success"
  | "error"
  | "idle";

// ─── Node types ───────────────────────────────────────────────────────

export type TimelineNodeType =
  | "user"        // User prompt
  | "assistant"   // AI prose / markdown
  | "tool"        // Tool call (aggregated call + execution + result)
  | "error"       // System / error message
  | "bash"        // Shell output log
  | "thinking"    // Thinking section
  | "skill"       // Skill invocation / read
  | "meta";       // Low-key metadata line (event group summary)

// ─── Tool aggregation ─────────────────────────────────────────────────

export interface ToolAggregation {
  toolCall?: Extract<ChatPart, { type: "toolCall" }>;
  execution?: ToolExecutionPart;
  result?: Extract<ChatPart, { type: "toolResult" }>;
}

// ─── Timeline node ────────────────────────────────────────────────────

export interface TimelineNode {
  type: TimelineNodeType;
  status: TimelineNodeStatus;
  /** Unique key for Lit diffing and scroll anchoring. */
  key: string;
  /** The ChatPart(s) that feed this node. */
  parts: ChatPart[];
  /** Aggregated tool data (only set when type === "tool"). */
  tool?: ToolAggregation;
  /** Original message metadata (timestamp, model). */
  meta?: ChatLine["meta"];
  /** Compaction / branch_summary marker. */
  source?: ChatLine["source"];
}

// ─── Adapter ──────────────────────────────────────────────────────────

/**
 * Convert a flat ChatLine array into a TimelineNode sequence.
 *
 * @param messages  The raw chat lines from the session transcript.
 * @param offset   Index offset (messageStart) for generating stable keys.
 */
export function buildTimelineNodes(
  messages: readonly ChatLine[],
  offset = 0,
): TimelineNode[] {
  const nodes: TimelineNode[] = [];
  let toolBuffer = new Map<string, ToolAggregation>();
  let toolBufferIndex = 0;

  const flushTools = () => {
    if (toolBuffer.size === 0) return;
    for (const [id, agg] of toolBuffer) {
      nodes.push({
        type: "tool",
        status: toolAggregationStatus(agg),
        key: `t:${String(offset)}:${String(toolBufferIndex)}:${id === "" ? "anon" : id}`,
        parts: [
          ...(agg.toolCall === undefined ? [] : [agg.toolCall]),
          ...(agg.execution === undefined ? [] : [agg.execution]),
          ...(agg.result === undefined ? [] : [agg.result]),
        ],
        tool: agg,
      });
      toolBufferIndex++;
    }
    toolBuffer = new Map<string, ToolAggregation>();
    toolBufferIndex = 0;
  };

  let lineIndex = 0;
  for (const message of messages) {
    const absIndex = offset + lineIndex;
    const absIndexKey = String(absIndex);
    lineIndex++;

    // Emit a meta node for compaction / branch_summary messages
    if (message.source === "compaction" || message.source === "branch_summary") {
      flushTools();
      nodes.push({
        type: "meta",
        status: "idle",
        key: `m:${absIndexKey}`,
        parts: message.parts,
        meta: message.meta,
        source: message.source,
      });
      continue;
    }

    for (const part of message.parts) {
      switch (part.type) {
        case "toolCall":
        case "toolExecution":
        case "toolResult": {
          const id = part.toolCallId ?? `__no_id_${String(toolBufferIndex)}`;
          const existing = toolBuffer.get(id) ?? {};
          if (part.type === "toolCall") existing.toolCall = part;
          if (part.type === "toolExecution") existing.execution = part;
          if (part.type === "toolResult") existing.result = part;
          toolBuffer.set(id, existing);
          toolBufferIndex++;
          break;
        }

        case "text": {
          flushTools();
          if (message.role === "user") {
            nodes.push({ type: "user", status: "idle", key: `u:${absIndexKey}`, parts: [part], meta: message.meta });
          } else if (message.role === "assistant") {
            nodes.push({ type: "assistant", status: "idle", key: `a:${absIndexKey}`, parts: [part], meta: message.meta });
          } else if (message.role === "bash") {
            nodes.push({ type: "bash", status: "idle", key: `b:${absIndexKey}`, parts: [part], meta: message.meta });
          } else if (message.role === "system") {
            nodes.push({ type: "error", status: "error", key: `s:${absIndexKey}`, parts: [part], meta: message.meta });
          } else {
            // tool/skill role with text — render as assistant fallback
            nodes.push({ type: "assistant", status: "idle", key: `x:${absIndexKey}`, parts: [part], meta: message.meta });
          }
          break;
        }

        case "thinking":
          flushTools();
          nodes.push({ type: "thinking", status: "idle", key: `th:${absIndexKey}`, parts: [part], meta: message.meta });
          break;

        case "skillInvocation":
        case "skillRead":
          flushTools();
          nodes.push({ type: "skill", status: "idle", key: `sk:${absIndexKey}`, parts: [part], meta: message.meta });
          break;

        case "image":
          flushTools();
          nodes.push({ type: "assistant", status: "idle", key: `img:${absIndexKey}`, parts: [part], meta: message.meta });
          break;

        case "empty":
          break;
      }
    }
  }

  flushTools();
  return nodes;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function toolAggregationStatus(agg: ToolAggregation): TimelineNodeStatus {
  if (agg.execution !== undefined) {
    switch (agg.execution.status) {
      case "running":
        return "running";
      case "pending":
        return "pending";
      case "error":
        return "error";
      case "success":
        return "success";
    }
  }
  if (agg.result !== undefined) return agg.result.isError ? "error" : "success";
  if (agg.toolCall !== undefined) return "pending";
  return "idle";
}
