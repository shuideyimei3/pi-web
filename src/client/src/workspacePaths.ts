export function workspaceRelativePath(path: string, workspaceRoot: string | undefined): string {
  const normalizedPath = normalizeSlashes(path);
  const normalizedRoot = workspaceRoot === undefined || workspaceRoot === "" ? undefined : trimTrailingSeparators(normalizeSlashes(workspaceRoot));

  if (normalizedRoot !== undefined && normalizedRoot !== "" && isAbsoluteLike(normalizedPath) && isAbsoluteLike(normalizedRoot)) {
    const trimmedPath = trimTrailingSeparators(normalizedPath);
    if (pathComparisonKey(trimmedPath) === pathComparisonKey(normalizedRoot)) return "";

    const rootPrefix = normalizedRoot.endsWith("/") ? normalizedRoot : `${normalizedRoot}/`;
    if (pathComparisonKey(normalizedPath).startsWith(pathComparisonKey(rootPrefix))) {
      const relativePath = normalizedPath.slice(rootPrefix.length);
      if (!containsTraversal(relativePath)) return normalizeWorkspaceRelativePath(relativePath);
    }
  }

  return isAbsoluteLike(normalizedPath) ? normalizedPath : normalizeWorkspaceRelativePath(normalizedPath);
}

function normalizeSlashes(path: string): string {
  return path.replace(/\\/gu, "/");
}

function normalizeWorkspaceRelativePath(path: string): string {
  return path.split("/").filter((part) => part !== "" && part !== ".").join("/");
}

function containsTraversal(path: string): boolean {
  return path.split("/").some((part) => part === "..");
}

function isAbsoluteLike(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:\//u.test(path);
}

function trimTrailingSeparators(path: string): string {
  let result = path;
  while (result.length > 1 && result.endsWith("/") && !/^[A-Za-z]:\/$/u.test(result)) result = result.slice(0, -1);
  return result;
}

function pathComparisonKey(path: string): string {
  return isWindowsLikeAbsolutePath(path) ? path.toLowerCase() : path;
}

function isWindowsLikeAbsolutePath(path: string): boolean {
  return /^[A-Za-z]:\//u.test(path) || path.startsWith("//");
}
