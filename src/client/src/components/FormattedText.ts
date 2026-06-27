import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { toSafeMarkdownHtml, toStreamingMarkdownHtml } from "../formatting/markdown";
import { chatBatchRenderer } from "../utils/batchRenderer.js";
import { formattedTextStyles } from "./shared";

/**
 * Renders markdown-formatted text with a streaming fast path.
 *
 * While streaming, complete markdown blocks are rendered incrementally and the
 * still-changing tail is also parsed every frame. That lets in-progress tables,
 * lists, code fences, and other markdown structures switch into formatted form as
 * soon as their syntax is recognizable, instead of waiting for the answer to end.
 *
 * When streaming transitions true → false, a single full sanitize + code-block
 * enhancement pass runs on the final text.
 */
@customElement("formatted-text")
export class FormattedText extends LitElement {
  @property() text = "";
  @property({ type: Boolean }) streaming = false;

  private stableMarkdown = "";
  private stableElement: HTMLDivElement | undefined;
  private tailElement: HTMLDivElement | undefined;
  private scheduledUpdate = false;
  private readonly batchId = `formatted-${Math.random().toString(36).slice(2)}`;

  override render() {
    if (this.streaming) {
      return html`
        <div class="formatted streaming" dir="auto" @click=${this.onFormattedClick}>
          <div class="streaming-blocks"></div><div class="streaming-tail"></div>
        </div>
      `;
    }
    return html`<div class="formatted" dir="auto" @click=${this.onFormattedClick}>${unsafeHTML(toSafeMarkdownHtml(this.text))}</div>`;
  }

  override firstUpdated(): void {
    if (this.streaming) this.syncStreamingElements(true);
  }

  override updated(changed: Map<string, unknown>): void {
    if (!this.streaming) {
      if (changed.has("streaming")) this.cleanupStreamingState();
      this.enhanceCodeBlocks();
      return;
    }

    if (changed.has("streaming")) this.syncStreamingElements(true);
    if (changed.has("text") || changed.has("streaming")) this.scheduleIncrementalUpdate();
  }

  override disconnectedCallback(): void {
    this.cleanupStreamingState();
    super.disconnectedCallback();
  }

  private syncStreamingElements(reset = false): void {
    this.stableElement = this.renderRoot.querySelector<HTMLDivElement>(".streaming-blocks") ?? undefined;
    this.tailElement = this.renderRoot.querySelector<HTMLDivElement>(".streaming-tail") ?? undefined;
    if (!reset) return;
    this.stableMarkdown = "";
    if (this.stableElement !== undefined) this.stableElement.innerHTML = "";
    if (this.tailElement !== undefined) this.tailElement.innerHTML = "";
  }

  private scheduleIncrementalUpdate(): void {
    if (this.scheduledUpdate) return;
    this.scheduledUpdate = true;

    chatBatchRenderer.schedule(this.id || this.batchId, () => {
      this.scheduledUpdate = false;
      this.applyIncrementalUpdate();
    });
  }

  private applyIncrementalUpdate(): void {
    if (!this.streaming) return;
    if (this.stableElement === undefined || this.tailElement === undefined) this.syncStreamingElements();
    if (this.stableElement === undefined || this.tailElement === undefined) return;

    const { stable, tail } = splitStreamingMarkdown(this.text);
    this.renderStableMarkdown(stable);
    this.renderTailMarkdown(tail);
    this.scrollIntoViewIfNeeded();
  }

  private renderStableMarkdown(stable: string): void {
    if (this.stableElement === undefined || stable === this.stableMarkdown) return;

    if (stable.startsWith(this.stableMarkdown)) {
      const delta = stable.slice(this.stableMarkdown.length);
      if (delta !== "") this.stableElement.insertAdjacentHTML("beforeend", toStreamingMarkdownHtml(delta));
    } else {
      this.stableElement.innerHTML = toStreamingMarkdownHtml(stable);
    }
    this.stableMarkdown = stable;
  }

  private renderTailMarkdown(tail: string): void {
    if (this.tailElement === undefined) return;
    this.tailElement.innerHTML = tail === "" ? "" : toStreamingMarkdownHtml(tail);
  }

  private scrollIntoViewIfNeeded(): void {
    const chat = this.closest(".chat");
    if (!(chat instanceof HTMLElement)) return;

    const isNearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 100;
    if (isNearBottom) chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
  }

  private cleanupStreamingState(): void {
    this.stableElement = undefined;
    this.tailElement = undefined;
    this.stableMarkdown = "";
    this.scheduledUpdate = false;
  }

  private enhanceCodeBlocks(): void {
    this.renderRoot.querySelectorAll("pre").forEach((element) => {
      if (!(element instanceof HTMLPreElement) || element.parentElement?.classList.contains("code-block-wrapper") === true) return;
      const code = element.querySelector("code");
      if (!(code instanceof HTMLElement)) return;
      const wrapper = document.createElement("div");
      wrapper.className = "code-block-wrapper";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "code-copy-button";
      button.title = "Copy code block";
      button.setAttribute("aria-label", "Copy code block");
      const icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "⧉";
      button.append(icon);
      // Count lines for collapsibility
      const lineCount = code.textContent.split("\n").length;
      if (lineCount > 20) {
        const collapseButton = document.createElement("button");
        collapseButton.type = "button";
        collapseButton.className = "code-collapse-button";
        collapseButton.title = "Collapse code block";
        collapseButton.setAttribute("aria-label", "Collapse code block");
        collapseButton.textContent = "Collapse";
        collapseButton.addEventListener("click", (event) => {
          event.stopPropagation();
          const pre = wrapper.querySelector("pre");
          if (pre) {
            pre.style.maxHeight = pre.style.maxHeight === "" ? "400px" : "";
            collapseButton.textContent = pre.style.maxHeight === "" ? "Collapse" : "Expand";
          }
        });
        wrapper.append(collapseButton);
      }
      element.before(wrapper);
      wrapper.append(element, button);
    });
  }

  private readonly onFormattedClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest(".code-copy-button");
    if (!(button instanceof HTMLButtonElement)) return;
    const wrapper = button.closest(".code-block-wrapper");
    if (!(wrapper instanceof HTMLElement)) return;
    const code = wrapper.querySelector("pre code");
    if (!(code instanceof HTMLElement)) return;
    void this.copyCode(code.textContent, button);
  };

  private async copyCode(text: string, button: HTMLButtonElement): Promise<void> {
    const ok = await writeClipboard(text);
    this.setCopyButtonState(button, ok ? "copied" : "failed");
    window.setTimeout(() => {
      this.setCopyButtonState(button, "idle");
    }, 1200);
  }

  private setCopyButtonState(button: HTMLButtonElement, state: "idle" | "copied" | "failed"): void {
    const icon = button.querySelector("span");
    if (icon !== null) icon.textContent = state === "copied" ? "✓" : "⧉";
    const label = state === "copied" ? "Copied code block" : state === "failed" ? "Failed to copy code block" : "Copy code block";
    button.title = label;
    button.setAttribute("aria-label", label);
  }

  static override styles = formattedTextStyles;
}

function splitStreamingMarkdown(text: string): { stable: string; tail: string } {
  let stableEnd = 0;
  let offset = 0;
  let inFence = false;
  for (const line of linesWithEndings(text)) {
    const fenceLine = isFenceLine(line);
    if (fenceLine) inFence = !inFence;
    offset += line.length;
    if (!inFence && line.trim() === "") stableEnd = offset;
    if (fenceLine && !inFence && line.endsWith("\n")) stableEnd = offset;
  }

  if (!inFence && text.length - stableEnd > 1600) {
    const breakAt = text.lastIndexOf("\n", text.length - 1);
    if (breakAt > stableEnd) stableEnd = breakAt + 1;
  }

  return { stable: text.slice(0, stableEnd), tail: text.slice(stableEnd) };
}

function linesWithEndings(text: string): string[] {
  const matches = text.match(/[^\n]*(?:\n|$)/gu) ?? [];
  return matches.at(-1) === "" ? matches.slice(0, -1) : matches;
}

function isFenceLine(line: string): boolean {
  return /^\s*(```|~~~)/u.test(line);
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
