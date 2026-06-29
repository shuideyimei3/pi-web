import type { PiWebPlugin } from "@jmfederico/pi-web/plugin-api";

interface SessionInfoPayload {
  id: string;
  cwd: string;
  modified: string;
}

interface SessionStatusPayload {
  sessionId?: string;
  tokens?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
  cost?: number;
}

interface DailyUsage {
  key: string;
  label: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  cost: number;
  sessions: number;
}

const TOKEN_USAGE_ELEMENT = "pi-token-usage-panel";
const USAGE_DAYS = 14;

registerTokenUsageElement();

const plugin: PiWebPlugin = {
  apiVersion: 1,
  name: "Info Plugin",
  activate: ({ html, svg }) => ({
    contributions: {
      actions: [
        {
          id: "workspace.show-path",
          title: "Show Current Workspace Path",
          group: "Info",
          enabled: (context) => context.state.selectedWorkspace !== undefined,
          run: (context) => {
            const path = context.state.selectedWorkspace?.path ?? "No workspace selected";
            window.alert(path);
          },
        },
      ],
      workspaceLabels: [
        {
          id: "workspace.kind-label",
          order: 100,
          items: (context) => [{ type: "text", text: context.workspace.isGitRepo ? "git" : "folder", title: context.workspace.path }],
        },
      ],
      workspacePanels: [
        {
          id: "workspace.info",
          title: "Info",
          icon: svg`
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9"></circle>
              <path d="M12 11v5"></path>
              <path d="M12 8h.01"></path>
            </svg>
          `,
          order: 1000,
          render: (context) => html`
            <section class="toolbar"><strong>Info</strong></section>
            <section class="viewer">
              <p><strong>Workspace</strong></p>
              <p class="muted">${context.workspace.label}</p>
              <p class="muted">${context.workspace.path}</p>
            </section>
          `,
        },
        {
          id: "workspace.token-usage",
          title: "Usage",
          icon: svg`
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19V5"></path>
              <path d="M4 19h16"></path>
              <rect x="7" y="11" width="2.8" height="5.5" rx="1"></rect>
              <rect x="12" y="7" width="2.8" height="9.5" rx="1"></rect>
              <rect x="17" y="9" width="2.8" height="7.5" rx="1"></rect>
            </svg>
          `,
          order: 1001,
          render: (context) => html`
            <pi-token-usage-panel cwd=${context.workspace.path} .days=${dailyUsageFromState(context.workspace.path, context.state)}></pi-token-usage-panel>
          `,
        },
      ],
    },
  }),
};

export default plugin;

function registerTokenUsageElement(): void {
  if (typeof customElements === "undefined" || customElements.get(TOKEN_USAGE_ELEMENT) !== undefined) return;

  customElements.define(TOKEN_USAGE_ELEMENT, class TokenUsagePanel extends HTMLElement {
    static get observedAttributes(): string[] {
      return ["cwd"];
    }

    private shadow: ShadowRoot;
    private usageDays: DailyUsage[] = seedDays(USAGE_DAYS);

    set days(days: DailyUsage[]) {
      this.usageDays = days;
      if (this.isConnected) this.renderUsage(this.getAttribute("cwd") ?? "", this.usageDays);
    }

    get days(): DailyUsage[] {
      return this.usageDays;
    }

    constructor() {
      super();
      this.shadow = this.attachShadow({ mode: "open" });
    }

    connectedCallback(): void {
      this.renderUsage(this.getAttribute("cwd") ?? "", this.usageDays);
    }

    attributeChangedCallback(): void {
      if (this.isConnected) this.renderUsage(this.getAttribute("cwd") ?? "", this.usageDays);
    }

    private renderUsage(cwd: string, days: DailyUsage[]): void {
      const total = sum(days, "total");
      const input = sum(days, "input");
      const output = sum(days, "output");
      const cacheRead = sum(days, "cacheRead");
      const cacheWrite = sum(days, "cacheWrite");
      const cost = days.reduce((next, day) => next + day.cost, 0);
      const max = Math.max(1, ...days.map((day) => day.total));
      this.shadow.innerHTML = `${styles()}
        <section class="toolbar">
          <div>
            <strong>Usage</strong>
            <small>Daily token totals by session activity</small>
          </div>
        </section>
        <section class="viewer">
          <div class="summary-grid">
            <article><span>Total</span><strong>${formatTokens(total)}</strong></article>
            <article><span>Input</span><strong>${formatTokens(input)}</strong></article>
            <article><span>Output</span><strong>${formatTokens(output)}</strong></article>
            <article><span>Cost</span><strong>${formatCost(cost)}</strong></article>
          </div>
          <div class="chart" aria-label="Daily token usage chart">
            ${days.map((day) => renderDayBar(day, max)).join("")}
          </div>
          <div class="legend">
            <span><i class="input"></i>Input</span>
            <span><i class="output"></i>Output</span>
            <span><i class="cache"></i>Cache</span>
          </div>
          <section class="breakdown">
            <div><span>Cache read</span><strong>${formatTokens(cacheRead)}</strong></div>
            <div><span>Cache write</span><strong>${formatTokens(cacheWrite)}</strong></div>
            <div><span>Workspace</span><strong title="${escapeAttr(cwd)}">${escapeHtml(shortWorkspace(cwd))}</strong></div>
          </section>
          <p class="note">Uses the latest loaded workspace session token counters, grouped by the day each session was last modified.</p>
        </section>`;
    }
  });
}

function dailyUsageFromState(cwd: string, state: unknown): DailyUsage[] {
  const days = seedDays(USAGE_DAYS);
  const record = isRecord(state) ? state : {};
  const sessions = parseSessions(record["sessions"]);
  const statusMap = parseStatusMap(record["sessionStatuses"]);
  const selectedStatus = parseStatus(record["status"]);
  for (const session of sessions) {
    if (session.cwd !== cwd) continue;
    const status = statusMap[session.id] ?? (selectedStatus?.sessionId === session.id ? selectedStatus : undefined);
    if (status === undefined) continue;
    const day = days.find((candidate) => candidate.key === dayKey(new Date(session.modified)));
    if (day === undefined) continue;
    day.input += safeNumber(status.tokens?.input);
    day.output += safeNumber(status.tokens?.output);
    day.cacheRead += safeNumber(status.tokens?.cacheRead);
    day.cacheWrite += safeNumber(status.tokens?.cacheWrite);
    day.total += safeNumber(status.tokens?.total);
    day.cost += safeNumber(status.cost);
    day.sessions += 1;
  }
  return days;
}

function parseSessions(value: unknown): SessionInfoPayload[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const id = stringField(entry, "id");
    const cwd = stringField(entry, "cwd");
    const modified = stringField(entry, "modified");
    return id === undefined || cwd === undefined || modified === undefined ? [] : [{ id, cwd, modified }];
  });
}

function parseStatusMap(value: unknown): Record<string, SessionStatusPayload> {
  if (!isRecord(value)) return {};
  const statuses: Record<string, SessionStatusPayload> = {};
  for (const [sessionId, rawStatus] of Object.entries(value)) {
    const status = parseStatus(rawStatus);
    if (status !== undefined) statuses[sessionId] = { ...status, sessionId: status.sessionId ?? sessionId };
  }
  return statuses;
}

function parseStatus(value: unknown): SessionStatusPayload | undefined {
  if (!isRecord(value)) return undefined;
  const tokens = parseTokens(value["tokens"]);
  const cost = numberField(value, "cost");
  const sessionId = stringField(value, "sessionId");
  return {
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(tokens === undefined ? {} : { tokens }),
    ...(cost === undefined ? {} : { cost }),
  };
}

function parseTokens(value: unknown): NonNullable<SessionStatusPayload["tokens"]> | undefined {
  if (!isRecord(value)) return undefined;
  const input = numberField(value, "input");
  const output = numberField(value, "output");
  const cacheRead = numberField(value, "cacheRead");
  const cacheWrite = numberField(value, "cacheWrite");
  const total = numberField(value, "total");
  return {
    ...(input === undefined ? {} : { input }),
    ...(output === undefined ? {} : { output }),
    ...(cacheRead === undefined ? {} : { cacheRead }),
    ...(cacheWrite === undefined ? {} : { cacheWrite }),
    ...(total === undefined ? {} : { total }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function seedDays(count: number): DailyUsage[] {
  const today = startOfDay(new Date());
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (count - index - 1));
    return {
      key: dayKey(date),
      label: shortDayLabel(date),
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
      cost: 0,
      sessions: 0,
    };
  });
}

function renderDayBar(day: DailyUsage, max: number): string {
  const totalHeight = Math.max(day.total === 0 ? 0 : 4, Math.round((day.total / max) * 100));
  const inputHeight = day.total === 0 ? 0 : Math.max(0, (day.input / day.total) * totalHeight);
  const outputHeight = day.total === 0 ? 0 : Math.max(0, (day.output / day.total) * totalHeight);
  const cacheHeight = Math.max(0, totalHeight - inputHeight - outputHeight);
  const title = `${day.label}: ${formatTokens(day.total)} tokens · ${String(day.sessions)} sessions · ${formatCost(day.cost)}`;
  return `<article class="day" title="${escapeAttr(title)}">
    <div class="bar" aria-label="${escapeAttr(title)}">
      <span class="cache" style="height:${String(cacheHeight)}%"></span>
      <span class="output" style="height:${String(outputHeight)}%"></span>
      <span class="input" style="height:${String(inputHeight)}%"></span>
    </div>
    <small>${escapeHtml(day.label)}</small>
  </article>`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayKey(date: Date): string {
  if (!Number.isFinite(date.getTime())) return "";
  const local = startOfDay(date);
  const yyyy = String(local.getFullYear());
  const mm = String(local.getMonth() + 1).padStart(2, "0");
  const dd = String(local.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function shortDayLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: "numeric", day: "numeric" }).format(date);
}

function sum(days: readonly DailyUsage[], key: keyof Pick<DailyUsage, "input" | "output" | "cacheRead" | "cacheWrite" | "total">): number {
  return days.reduce((next, day) => next + day[key], 0);
}

function safeNumber(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(value));
}

function formatCost(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function shortWorkspace(path: string): string {
  const parts = path.split(/[\\/]/u).filter((part) => part !== "");
  return parts.at(-1) ?? path;
}

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replaceAll("'", "&#39;");
}

function styles(): string {
  return `<style>
    :host { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; color: var(--pi-text); font: 13px system-ui, sans-serif; }
    .toolbar { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border-bottom: 1px solid var(--pi-border); background: var(--pi-bg); }
    .toolbar > div { display: grid; gap: 2px; min-width: 0; }
    .toolbar strong { font-size: 13px; }
    .toolbar small, .muted, .note { color: var(--pi-muted); }
    button { border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-surface); color: var(--pi-text); padding: 6px 9px; font: inherit; cursor: pointer; }
    button:hover { border-color: var(--pi-accent-border); }
    .viewer { flex: 1 1 auto; min-height: 0; overflow: auto; display: grid; align-content: start; gap: 14px; padding: 12px; box-sizing: border-box; }
    .summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .summary-grid article { border: 1px solid var(--pi-border); border-radius: 10px; background: var(--pi-surface); padding: 10px; display: grid; gap: 4px; }
    .summary-grid span, .breakdown span { color: var(--pi-muted); font-size: 11px; text-transform: uppercase; letter-spacing: .03em; }
    .summary-grid strong { font-size: 18px; color: var(--pi-text-bright); }
    .chart { height: 170px; border: 1px solid var(--pi-border); border-radius: 12px; background: var(--pi-surface); padding: 12px 10px 8px; display: grid; grid-template-columns: repeat(14, minmax(0, 1fr)); gap: 6px; align-items: end; }
    .day { min-width: 0; height: 100%; display: grid; grid-template-rows: minmax(0, 1fr) auto; gap: 6px; align-items: end; }
    .bar { height: 100%; min-height: 4px; display: flex; flex-direction: column-reverse; justify-content: flex-start; border-radius: 999px; overflow: hidden; background: rgba(255,255,255,.06); }
    .bar span { display: block; min-height: 0; }
    .input { background: var(--pi-accent); }
    .output { background: var(--pi-success); }
    .cache { background: var(--pi-warning); }
    .day small { overflow: hidden; text-overflow: clip; white-space: nowrap; color: var(--pi-muted); font-size: 10px; text-align: center; }
    .legend { display: flex; flex-wrap: wrap; gap: 10px; color: var(--pi-muted); font-size: 12px; }
    .legend span { display: inline-flex; align-items: center; gap: 5px; }
    .legend i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .breakdown { border: 1px solid var(--pi-border); border-radius: 10px; background: var(--pi-surface); display: grid; gap: 0; }
    .breakdown div { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; padding: 8px 10px; border-bottom: 1px solid var(--pi-border-muted); }
    .breakdown div:last-child { border-bottom: 0; }
    .breakdown strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .note { margin: 0; line-height: 1.45; }
    .error { color: var(--pi-danger); }
    @media (max-width: 760px) {
      .chart { gap: 4px; padding-inline: 8px; }
      .summary-grid { grid-template-columns: minmax(0, 1fr); }
      .day small { font-size: 9px; }
    }
  </style>`;
}
