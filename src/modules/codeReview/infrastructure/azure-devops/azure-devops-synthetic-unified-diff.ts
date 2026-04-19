import { createTwoFilesPatch } from "diff";
import type { PullRequestRef } from "../../domain/value-objects/pull-request-ref.js";
import { readGitChangeRepositoryPath, readGitChangeTypeName } from "./azure-devops-git-change-meta.js";
import { fetchGitItemTextAtCommit } from "./azure-devops-item-text-fetcher.js";

const MAX_FILES_IN_SYNTHETIC_DIFF = 45;

type AzureDevOpsRef = Extract<PullRequestRef, { provider: "azure_devops" }>;

export async function buildSyntheticUnifiedDiffFromCommitChanges(input: {
  readonly collectionBaseUrl: string;
  readonly ref: AzureDevOpsRef;
  readonly targetCommitId: string;
  readonly sourceCommitId: string;
  readonly changes: readonly unknown[];
  readonly headers: HeadersInit;
}): Promise<string> {
  const parts: string[] = [];

  for (const change of input.changes) {
    if (parts.length >= MAX_FILES_IN_SYNTHETIC_DIFF) {
      break;
    }

    const path = readGitChangeRepositoryPath(change);

    if (!path) {
      continue;
    }

    const changeType = readGitChangeTypeName(change);

    if (changeType === "none" || changeType === "branch") {
      continue;
    }

    if (isLikelyRenameChange(change, changeType)) {
      parts.push(`# rename (diff sintetico omitido): ${path}\n`);
      continue;
    }

    const patch = await buildPatchByFetchingBothCommits({
      collectionBaseUrl: input.collectionBaseUrl,
      ref: input.ref,
      path,
      targetCommitId: input.targetCommitId,
      sourceCommitId: input.sourceCommitId,
      headers: input.headers
    });

    if (!patch) {
      continue;
    }

    parts.push(patch);
  }

  return parts.join("\n\n");
}

function isLikelyRenameChange(change: unknown, changeType: string): boolean {
  if (changeType === "rename") {
    return true;
  }

  if (!change || typeof change !== "object") {
    return false;
  }

  const record = change as Record<string, unknown>;
  const item = record.item ?? record.Item;

  if (!item || typeof item !== "object") {
    return false;
  }

  const original = (item as Record<string, unknown>).originalPath ?? (item as Record<string, unknown>).OriginalPath;

  return typeof original === "string" && original.trim().length > 0;
}

async function buildPatchByFetchingBothCommits(input: {
  readonly collectionBaseUrl: string;
  readonly ref: AzureDevOpsRef;
  readonly path: string;
  readonly targetCommitId: string;
  readonly sourceCommitId: string;
  readonly headers: HeadersInit;
}): Promise<string | null> {
  const fetcher = {
    collectionBaseUrl: input.collectionBaseUrl,
    repositoryId: input.ref.repositoryId,
    headers: input.headers
  };

  const oldText = await fetchGitItemTextAtCommit({
    ...fetcher,
    commitId: input.targetCommitId,
    repositoryPath: input.path
  });
  const newText = await fetchGitItemTextAtCommit({
    ...fetcher,
    commitId: input.sourceCommitId,
    repositoryPath: input.path
  });

  const oldStr = oldText ?? "";
  const newStr = newText ?? "";

  if (oldStr.length === 0 && newStr.length === 0) {
    return null;
  }

  return createTwoFilesPatch(
    input.path,
    input.path,
    oldStr,
    newStr,
    input.targetCommitId,
    input.sourceCommitId
  );
}
