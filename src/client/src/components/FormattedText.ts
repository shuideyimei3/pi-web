import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { toSafeMarkdownHtml } from "../formatting/markdown";
import { formattedTextStyles } from "./shared";

@customElement("formatted-text")
export class FormattedText extends LitElement {
  @property() text = "";

  override render() {
    return html`<div class="formatted" dir="auto" @click=${this.onFormattedClick}>${unsafeHTML(toSafeMarkdownHtml(this.text))}</div>`;
  }

  override updated(): void {
    this.enhanceCodeBlocks();
  }

  private enhanceCodeBlocks(): void {
    this.renderRoot.querySelectorAll("pre").forEach((element) => {
      if (!(element instanceof HTMLPreElement) || element.parentElement?.classList.contains("code-block-wrapper") === true) return;
      const code = element.querySelector("code");
      if (!(code instanceof HTMLElement)) return;
      const wrapper = document.createElement("div");
      wrapper.className = "code-block-wrapper";
      // Detect language from class
      const langClass = Array.from(code.classList).find(c => c.startsWith("language-"));
      const lang = langClass?.replace("language-", "") ?? "";
      if (lang !== "" && !isPlainTextLanguage(lang)) {
        const langLabel = document.createElement("span");
        langLabel.className = "code-lang-label";
        langLabel.textContent = lang;
        wrapper.append(langLabel);
      }
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

function isPlainTextLanguage(language: string): boolean {
  const normalized = language.toLowerCase();
  return normalized === "text" || normalized === "txt" || normalized === "plain" || normalized === "plaintext";
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
