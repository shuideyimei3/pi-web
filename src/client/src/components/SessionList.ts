import { LitElement, html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { SessionActivity, SessionInfo, SessionStatus } from "../api";
import { listStyles } from "./shared";

function sessionLabel(session: SessionInfo): string {
  if (session.name !== undefined && session.name !== "") return session.name;
  return session.firstMessage !== "" ? session.firstMessage : session.id.slice(0, 8);
}

@customElement("session-list")
export class SessionList extends LitElement {
  @property({ attribute: false }) sessions: SessionInfo[] = [];
  @property({ attribute: false }) statuses: Record<string, SessionStatus> = {};
  @property({ attribute: false }) activities: Record<string, SessionActivity> = {};
  @property({ attribute: false }) selected?: SessionInfo;
  @property({ type: Boolean }) canStart = false;
  @property({ attribute: false }) onSelect?: (session: SessionInfo) => void;
  @property({ attribute: false }) onStart?: () => void;
  @state() private openMenuSessionId: string | undefined;
  private readonly onDocumentClick = (event: MouseEvent) => {
    if (event.composedPath().includes(this)) return;
    this.openMenuSessionId = undefined;
  };
  @property({ attribute: false }) onArchive?: (session: SessionInfo) => void;
  @property({ attribute: false }) onRestore?: (session: SessionInfo) => void;

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("click", this.onDocumentClick);
  }

  override disconnectedCallback(): void {
    document.removeEventListener("click", this.onDocumentClick);
    super.disconnectedCallback();
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has("sessions") && this.openMenuSessionId !== undefined && !this.sessions.some((session) => session.id === this.openMenuSessionId)) this.openMenuSessionId = undefined;
  }

  override render() {
    const active = this.sessions.filter((session) => session.archived !== true);
    const archived = this.sessions.filter((session) => session.archived === true);
    return html`
      <section>
        <h2>Sessions <button ?disabled=${!this.canStart} @click=${() => this.onStart?.()}>+</button></h2>
        ${active.map((session) => this.renderSession(session))}
        ${archived.length > 0 ? html`
          <h2 class="subheading">Archived</h2>
          ${archived.map((session) => this.renderSession(session))}
        ` : null}
      </section>
    `;
  }

  private renderSession(session: SessionInfo) {
    return html`
      <div class="session-row ${this.selected?.id === session.id ? "selected" : ""} ${session.archived === true ? "archived" : ""}">
        <button class="session-main" @click=${() => this.onSelect?.(session)}>
          <span>${sessionLabel(session)}</span><small>${this.renderStatus(session)}${String(session.messageCount)} messages</small>
        </button>
        <div class="session-menu">
          <button class="session-menu-toggle" title="Session actions" @click=${(event: MouseEvent) => { event.stopPropagation(); this.toggleMenu(session.id); }}>⋯</button>
          ${this.openMenuSessionId === session.id ? html`
            <div class="session-menu-panel">
              ${session.archived === true
                ? html`<button title="Restore session" @click=${() => { this.openMenuSessionId = undefined; this.onRestore?.(session); }}>Restore</button>`
                : html`<button title="Archive session" @click=${() => { this.openMenuSessionId = undefined; this.onArchive?.(session); }}>Archive</button>`}
            </div>
          ` : null}
        </div>
      </div>
    `;
  }

  private toggleMenu(sessionId: string) {
    this.openMenuSessionId = this.openMenuSessionId === sessionId ? undefined : sessionId;
  }

  private renderStatus(session: SessionInfo) {
    if (session.archived === true) return "read-only · ";
    const status = this.statuses[session.id];
    const activity = this.activities[session.id];
    if (activity?.phase === "active") return `● ${activity.label} · `;
    if (status === undefined) return "";
    if (status.isStreaming) return "● streaming · ";
    if (status.isBashRunning) return "● bash · ";
    if (status.isCompacting) return "● compacting · ";
    if (status.pendingMessageCount > 0) return `● ${String(status.pendingMessageCount)} pending · `;
    return "";
  }

  static override styles = listStyles;
}
