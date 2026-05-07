import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface ArchivedSessionRecord {
  sessionId: string;
  cwd: string;
  archivedAt: string;
}

interface ArchiveFile {
  sessions: ArchivedSessionRecord[];
}

export class SessionArchiveStore {
  constructor(private readonly filePath = join(homedir(), ".pi-web", "archived-sessions.json")) {}

  async list(): Promise<ArchivedSessionRecord[]> {
    return (await this.read()).sessions;
  }

  async archive(sessionId: string, cwd: string): Promise<ArchivedSessionRecord> {
    const data = await this.read();
    const existing = data.sessions.find((session) => session.sessionId === sessionId);
    if (existing !== undefined) return existing;
    const record = { sessionId, cwd, archivedAt: new Date().toISOString() };
    data.sessions.push(record);
    await this.write(data);
    return record;
  }

  async restore(sessionId: string): Promise<void> {
    const data = await this.read();
    const sessions = data.sessions.filter((session) => session.sessionId !== sessionId);
    if (sessions.length === data.sessions.length) return;
    await this.write({ sessions });
  }

  async isArchived(sessionId: string): Promise<boolean> {
    return (await this.list()).some((session) => session.sessionId === sessionId);
  }

  private async read(): Promise<ArchiveFile> {
    try {
      const value: unknown = JSON.parse(await readFile(this.filePath, "utf8"));
      return parseArchiveFile(value);
    } catch (error: unknown) {
      if (isNodeErrorWithCode(error, "ENOENT")) return { sessions: [] };
      throw error;
    }
  }

  private async write(data: ArchiveFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
}

function parseArchiveFile(value: unknown): ArchiveFile {
  if (!isRecord(value) || !Array.isArray(value["sessions"])) throw new Error("Invalid archive file");
  return { sessions: value["sessions"].map(parseArchivedSessionRecord) };
}

function parseArchivedSessionRecord(value: unknown): ArchivedSessionRecord {
  if (!isRecord(value)) throw new Error("Invalid archived session record");
  const sessionId = value["sessionId"];
  const cwd = value["cwd"];
  const archivedAt = value["archivedAt"];
  if (typeof sessionId !== "string" || typeof cwd !== "string" || typeof archivedAt !== "string") throw new Error("Invalid archived session record");
  return { sessionId, cwd, archivedAt };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNodeErrorWithCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}
