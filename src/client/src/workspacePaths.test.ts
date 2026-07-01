import { describe, expect, it } from "vitest";
import { workspaceRelativePath } from "./workspacePaths";

describe("workspaceRelativePath", () => {
  it("converts POSIX absolute paths inside the workspace to relative paths", () => {
    expect(workspaceRelativePath("/repo/src/App.ts", "/repo")).toBe("src/App.ts");
    expect(workspaceRelativePath("/repo//src/./App.ts", "/repo/")).toBe("src/App.ts");
  });

  it("converts Windows absolute paths inside the workspace to relative paths", () => {
    expect(workspaceRelativePath("C:\\Repo\\src\\App.ts", "c:\\repo")).toBe("src/App.ts");
    expect(workspaceRelativePath("C:\\repo\\src\\App.ts", "C:\\")).toBe("repo/src/App.ts");
  });

  it("leaves paths outside the workspace absolute", () => {
    expect(workspaceRelativePath("/tmp/App.ts", "/repo")).toBe("/tmp/App.ts");
  });

  it("normalizes relative path separators without hiding traversal", () => {
    expect(workspaceRelativePath(".\\src//App.ts", "/repo")).toBe("src/App.ts");
    expect(workspaceRelativePath("../outside.ts", "/repo")).toBe("../outside.ts");
  });
});
