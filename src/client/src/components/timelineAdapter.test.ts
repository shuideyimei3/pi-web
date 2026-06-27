import { assert, describe, it } from "vitest";
import { buildTimelineNodes, type TimelineNode } from "./timelineAdapter";
import type { ChatLine, ChatPart } from "./shared";

/* ─── Helpers ──────────────────────────────────────────────────────── */

function textPart(text: string): ChatPart {
  return { type: "text", text };
}

function toolCallPart(
  toolName: string,
  toolCallId = "tc1",
  summary = "summary"
): ChatPart {
  return { type: "toolCall", toolName, toolCallId, summary, args: {} };
}

function toolCallPartWithoutId(toolName: string, summary = "summary"): ChatPart {
  return { type: "toolCall", toolName, summary, args: {} };
}

function toolExecutionPart(
  toolName: string,
  status: "pending" | "running" | "success" | "error",
  toolCallId = "tc1",
  summary = "summary"
): ChatPart {
  return { type: "toolExecution", toolName, status, toolCallId, summary };
}

function toolExecutionPartWithoutId(
  toolName: string,
  status: "pending" | "running" | "success" | "error",
  summary = "summary"
): ChatPart {
  return { type: "toolExecution", toolName, status, summary };
}

function toolResultPart(
  toolName: string,
  isError: boolean,
  toolCallId = "tc1",
  text = "result"
): ChatPart {
  return { type: "toolResult", toolName, isError, toolCallId, text };
}

function chatLine(
  role: ChatLine["role"],
  parts: ChatPart[],
  meta?: ChatLine["meta"],
  source?: ChatLine["source"]
): ChatLine {
  return { role, parts, ...(meta === undefined ? {} : { meta }), ...(source === undefined ? {} : { source }) };
}

function nodeAt(nodes: readonly TimelineNode[], index: number): TimelineNode {
  const node = nodes[index];
  assert.isDefined(node);
  return node;
}

/* ─── Tests ────────────────────────────────────────────────────────── */

describe("buildTimelineNodes", () => {
  it("converts a user text message into a user node", () => {
    const messages = [chatLine("user", [textPart("Hello")])];
    const nodes = buildTimelineNodes(messages);
    const node = nodeAt(nodes, 0);
    assert.equal(nodes.length, 1);
    assert.equal(node.type, "user");
    assert.equal(node.status, "idle");
  });

  it("converts an assistant text message into an assistant node", () => {
    const messages = [chatLine("assistant", [textPart("I can help")])];
    const nodes = buildTimelineNodes(messages);
    assert.equal(nodes.length, 1);
    assert.equal(nodeAt(nodes, 0).type, "assistant");
  });

  it("aggregates toolCall + toolExecution + toolResult with same id into one tool node", () => {
    const messages = [
      chatLine("tool", [
        toolCallPart("read", "tc1"),
        toolExecutionPart("read", "success", "tc1"),
        toolResultPart("read", false, "tc1"),
      ]),
    ];
    const nodes = buildTimelineNodes(messages);
    const node = nodeAt(nodes, 0);
    assert.equal(nodes.length, 1);
    assert.equal(node.type, "tool");
    assert.equal(node.status, "success");
    assert.isDefined(node.tool);
    assert.isDefined(node.tool.toolCall);
    assert.isDefined(node.tool.execution);
    assert.isDefined(node.tool.result);
  });

  it("separates tool calls with different ids into separate nodes", () => {
    const messages = [
      chatLine("tool", [
        toolCallPart("read", "tc1"),
        toolCallPart("edit", "tc2"),
        toolExecutionPart("read", "running", "tc1"),
        toolExecutionPart("edit", "pending", "tc2"),
      ]),
    ];
    const nodes = buildTimelineNodes(messages);
    assert.equal(nodes.length, 2);
    assert.equal(nodeAt(nodes, 0).type, "tool");
    assert.equal(nodeAt(nodes, 0).status, "running");
    assert.equal(nodeAt(nodes, 1).type, "tool");
    assert.equal(nodeAt(nodes, 1).status, "pending");
  });

  it("derives error status from toolResult.isError", () => {
    const messages = [
      chatLine("tool", [
        toolCallPart("bash", "tc1"),
        toolExecutionPart("bash", "error", "tc1"),
        toolResultPart("bash", true, "tc1"),
      ]),
    ];
    const nodes = buildTimelineNodes(messages);
    assert.equal(nodes.length, 1);
    assert.equal(nodeAt(nodes, 0).status, "error");
  });

  it("derives error status from toolResult.isError when no execution exists", () => {
    const messages = [
      chatLine("tool", [
        toolCallPart("bash", "tc1"),
        toolResultPart("bash", true, "tc1"),
      ]),
    ];
    const nodes = buildTimelineNodes(messages);
    assert.equal(nodes.length, 1);
    assert.equal(nodeAt(nodes, 0).status, "error");
  });

  it("converts a bash text message into a bash node", () => {
    const messages = [chatLine("bash", [textPart("output")])];
    const nodes = buildTimelineNodes(messages);
    assert.equal(nodes.length, 1);
    assert.equal(nodeAt(nodes, 0).type, "bash");
  });

  it("converts a system text message into an error node", () => {
    const messages = [chatLine("system", [textPart("Something went wrong")])];
    const nodes = buildTimelineNodes(messages);
    const node = nodeAt(nodes, 0);
    assert.equal(nodes.length, 1);
    assert.equal(node.type, "error");
    assert.equal(node.status, "error");
  });

  it("creates a meta node for compaction source messages", () => {
    const messages = [chatLine("tool", [textPart("summary")], undefined, "compaction")];
    const nodes = buildTimelineNodes(messages);
    const node = nodeAt(nodes, 0);
    assert.equal(nodes.length, 1);
    assert.equal(node.type, "meta");
    assert.equal(node.source, "compaction");
  });

  it("handles messages with no id tool parts gracefully", () => {
    const messages = [
      chatLine("tool", [
        toolCallPartWithoutId("read"),
        toolExecutionPartWithoutId("read", "success"),
      ]),
    ];
    const nodes = buildTimelineNodes(messages);
    assert.isAtLeast(nodes.length, 1);
    assert.isTrue(nodes.every((node) => node.type === "tool"));
  });

  it("preserves metadata (timestamp, model) on nodes", () => {
    const messages = [
      chatLine("assistant", [textPart("hi")], {
        timestamp: "2026-01-01T00:00:00Z",
        model: { provider: "openai", id: "gpt-4.1" },
      }),
    ];
    const nodes = buildTimelineNodes(messages);
    assert.equal(nodes.length, 1);
    assert.deepEqual(nodeAt(nodes, 0).meta, {
      timestamp: "2026-01-01T00:00:00Z",
      model: { provider: "openai", id: "gpt-4.1" },
    });
  });

  it("skips empty parts", () => {
    const messages = [chatLine("assistant", [{ type: "empty" }])];
    const nodes = buildTimelineNodes(messages);
    assert.equal(nodes.length, 0);
  });

  it("flushes buffered tools before a text part", () => {
    const messages = [
      chatLine("tool", [
        toolExecutionPart("read", "success", "tc1"),
        textPart("done"),
      ]),
    ];
    const nodes = buildTimelineNodes(messages);
    assert.equal(nodes.length, 2);
    assert.equal(nodeAt(nodes, 0).type, "tool");
    assert.equal(nodeAt(nodes, 1).type, "assistant");
  });
});
