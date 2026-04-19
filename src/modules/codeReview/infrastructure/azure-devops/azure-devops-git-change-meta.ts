export function readGitChangeRepositoryPath(change: unknown): string {
  if (!change || typeof change !== "object") {
    return "";
  }

  const record = change as Record<string, unknown>;
  const fromItem = readPathFromGitItem(record.item ?? record.Item);

  if (fromItem.length > 0) {
    return fromItem;
  }

  return readPathFromGitItem(record.sourceServerItem ?? record.SourceServerItem);
}

function readPathFromGitItem(item: unknown): string {
  if (!item || typeof item !== "object") {
    return "";
  }

  const itemRecord = item as Record<string, unknown>;
  const path = itemRecord.path ?? itemRecord.Path;

  if (typeof path !== "string") {
    return "";
  }

  return path.trim().replace(/\\/g, "/");
}

export function readGitChangeTypeName(change: unknown): string {
  if (!change || typeof change !== "object") {
    return "edit";
  }

  const record = change as Record<string, unknown>;
  const raw = record.changeType ?? record.ChangeType;

  if (typeof raw === "string") {
    return raw.toLowerCase();
  }

  if (typeof raw === "number") {
    return "edit";
  }

  return "edit";
}
