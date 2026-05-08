import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api, type FileSuggestion } from "../api";
import { css } from "lit";

@customElement("project-dialog")
export class ProjectDialog extends LitElement {
  @property({ attribute: false }) onSubmit?: (path: string, create: boolean) => void;
  @property({ attribute: false }) onCancel?: () => void;
  @state() private path = "";
  @state() private createMissing = true;
  @state() private suggestions: FileSuggestion[] = [];
  @state() private selected = 0;
  @state() private loading = false;

  private requestId = 0;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.loadSuggestions();
  }

  private async loadSuggestions() {
    const requestId = ++this.requestId;
    this.loading = true;
    try {
      const suggestions = await api.projectDirectories(this.path);
      if (requestId !== this.requestId) return;
      this.suggestions = suggestions;
      this.selected = Math.min(this.selected, Math.max(0, suggestions.length - 1));
    } catch {
      if (requestId === this.requestId) this.suggestions = [];
    } finally {
      if (requestId === this.requestId) this.loading = false;
    }
  }

  private setPath(value: string) {
    this.path = value;
    this.selected = 0;
    void this.loadSuggestions();
  }

  private pick(suggestion: FileSuggestion) {
    this.setPath(suggestion.path);
  }

  private submit() {
    if (this.path.trim() === "") return;
    this.onSubmit?.(this.path, this.createMissing);
  }

  private onPathInput(event: InputEvent) {
    if (!(event.target instanceof HTMLInputElement)) return;
    this.setPath(event.target.value);
  }

  private onCreateMissingChange(event: InputEvent) {
    if (!(event.target instanceof HTMLInputElement)) return;
    this.createMissing = event.target.checked;
  }

  private onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      this.onCancel?.();
    } else if (event.key === "Enter") {
      event.preventDefault();
      this.submit();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      this.selected = Math.min(this.selected + 1, Math.max(0, this.suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      this.selected = Math.max(0, this.selected - 1);
    } else if (event.key === "Tab") {
      const suggestion = this.suggestions[this.selected];
      if (suggestion === undefined) return;
      event.preventDefault();
      this.pick(suggestion);
    }
  }

  override render() {
    return html`
      <div class="backdrop" @click=${() => this.onCancel?.()}>
        <section @click=${(event: Event) => { event.stopPropagation(); }}>
          <header>
            <strong>Add project</strong>
            <button @click=${() => { this.onCancel?.(); }} aria-label="Close">×</button>
          </header>
          <div class="body">
            <label>
              Project folder
              <input .value=${this.path} @input=${(event: InputEvent) => { this.onPathInput(event); }} @keydown=${(event: KeyboardEvent) => { this.onKeyDown(event); }} placeholder="/path/to/project or ~/code/project" autofocus />
            </label>
            <div class="suggestions">
              ${this.loading ? html`<div class="hint">Loading folders…</div>` : null}
              ${this.suggestions.map((suggestion, index) => html`
                <button class=${index === this.selected ? "selected" : ""} @click=${() => { this.pick(suggestion); }}>
                  ${suggestion.path}
                </button>
              `)}
              ${!this.loading && this.suggestions.length === 0 ? html`<div class="hint">No matching folders. Enter a new path to create it.</div>` : null}
            </div>
            <label class="check">
              <input type="checkbox" .checked=${this.createMissing} @change=${(event: InputEvent) => { this.onCreateMissingChange(event); }} />
              Create the folder if it does not exist
            </label>
          </div>
          <footer>
            <button @click=${() => { this.onCancel?.(); }}>Cancel</button>
            <button class="primary" ?disabled=${this.path.trim() === ""} @click=${() => { this.submit(); }}>Add project</button>
          </footer>
        </section>
      </div>
    `;
  }

  static override styles = css`
    :host { position: fixed; inset: 0; z-index: 30; color: #e6edf3; font: 14px system-ui, sans-serif; }
    .backdrop { display: grid; place-items: start center; width: 100%; height: 100%; padding-top: min(12vh, 90px); box-sizing: border-box; background: #0008; }
    section { width: min(720px, calc(100vw - 40px)); max-height: min(700px, calc(100vh - 40px)); display: flex; flex-direction: column; border: 1px solid #30363d; border-radius: 12px; background: #0d1117; box-shadow: 0 20px 60px #000b; overflow: hidden; }
    header, footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px; border-bottom: 1px solid #30363d; }
    footer { border-top: 1px solid #30363d; border-bottom: 0; justify-content: end; }
    .body { display: grid; gap: 12px; padding: 12px; min-height: 0; }
    label { display: grid; gap: 6px; color: #8b949e; }
    input[type="text"], input:not([type]) { box-sizing: border-box; width: 100%; border: 1px solid #30363d; border-radius: 8px; background: #0d1117; color: #e6edf3; padding: 9px; font: 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .check { display: flex; grid-template-columns: auto 1fr; align-items: center; color: #e6edf3; }
    .suggestions { min-height: 90px; max-height: 320px; overflow: auto; border: 1px solid #30363d; border-radius: 8px; background: #161b22; }
    .suggestions button { display: block; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: 0; border-bottom: 1px solid #30363d; border-radius: 0; background: transparent; color: #e6edf3; padding: 8px 10px; text-align: left; font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .suggestions button.selected, .suggestions button:hover { background: #0d2847; }
    .hint { padding: 12px; color: #8b949e; }
    button { border: 1px solid #30363d; border-radius: 8px; background: #161b22; color: #e6edf3; padding: 7px 9px; cursor: pointer; }
    header button { border: 0; background: transparent; color: #8b949e; font-size: 22px; padding: 0 8px; }
    .primary { border-color: #238636; background: #238636; }
    button:disabled { opacity: .5; cursor: not-allowed; }
  `;
}
