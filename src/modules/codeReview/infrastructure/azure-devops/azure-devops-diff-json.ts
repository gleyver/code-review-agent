function readArrayProperty(payload: Record<string, unknown>, ...keys: string[]): unknown[] {
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

export function readDiffsCommitsChangeArray(body: unknown): unknown[] {
  if (!body || typeof body !== "object") {
    return [];
  }

  return readArrayProperty(body as Record<string, unknown>, "changes", "Changes");
}

export function readIterationChangeEntriesArray(body: unknown): unknown[] {
  if (!body || typeof body !== "object") {
    return [];
  }

  const record = body as Record<string, unknown>;
  return readArrayProperty(record, "changeEntries", "ChangeEntries", "changes", "Changes");
}

export function extractPatchFromGitChangeEntry(entry: unknown): string {
  if (!entry || typeof entry !== "object") {
    return "";
  }

  const record = entry as Record<string, unknown>;
  const direct = record.patch ?? record.Patch;

  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct;
  }

  const objectDetails = record.objectDetails ?? record.ObjectDetails;

  if (!objectDetails || typeof objectDetails !== "object") {
    return "";
  }

  const details = objectDetails as Record<string, unknown>;
  const content = details.content ?? details.Content;

  if (typeof content === "string" && content.trim().length > 0) {
    return content;
  }

  return "";
}

export function joinPatchesFromChangeEntries(entries: readonly unknown[]): string {
  return entries
    .map((entry) => extractPatchFromGitChangeEntry(entry))
    .filter((patch) => patch.length > 0)
    .join("\n\n");
}
