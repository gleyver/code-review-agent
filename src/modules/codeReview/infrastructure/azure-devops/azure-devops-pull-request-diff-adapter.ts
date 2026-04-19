import type { PullRequestDiff } from "../../domain/ports/pull-request-diff-port.js";
import type { PullRequestRef } from "../../domain/value-objects/pull-request-ref.js";
import {
  joinPatchesFromChangeEntries,
  readDiffsCommitsChangeArray,
  readIterationChangeEntriesArray
} from "./azure-devops-diff-json.js";
import { buildSyntheticUnifiedDiffFromCommitChanges } from "./azure-devops-synthetic-unified-diff.js";

type AzurePullRequest = {
  readonly pullRequestId: number;
  readonly url?: string;
  readonly lastMergeSourceCommit?: {
    readonly commitId?: string;
  };
  readonly lastMergeTargetCommit?: {
    readonly commitId?: string;
  };
};

type IterationsListResponse = {
  readonly value?: ReadonlyArray<{ readonly id: number }>;
};

export class AzureDevOpsPullRequestDiffAdapter {
  public constructor(private readonly personalAccessToken: string) {}

  public async getDiffForAzureDevOps(ref: Extract<PullRequestRef, { provider: "azure_devops" }>): Promise<PullRequestDiff> {
    if (!this.personalAccessToken.trim()) {
      throw new Error("AZURE_DEVOPS_PAT is not configured");
    }

    const base = this.buildCollectionUrl(ref.organization, ref.project);
    const pullRequest = await this.fetchPullRequestJson(base, ref);
    const sourceCommit = pullRequest.lastMergeSourceCommit?.commitId;
    const targetCommit = pullRequest.lastMergeTargetCommit?.commitId;

    if (!sourceCommit || !targetCommit) {
      throw new Error("Azure DevOps pull request is missing merge commit identifiers");
    }

    const unifiedDiff = await this.resolveUnifiedDiff(base, ref, targetCommit, sourceCommit);

    return {
      provider: "azure_devops",
      repositoryLabel: `${ref.organization}/${ref.project}`,
      pullRequestNumber: pullRequest.pullRequestId,
      headSha: sourceCommit,
      pullRequestUrl: pullRequest.url ?? "",
      unifiedDiff
    };
  }

  private async resolveUnifiedDiff(
    base: string,
    ref: Extract<PullRequestRef, { provider: "azure_devops" }>,
    targetCommit: string,
    sourceCommit: string
  ): Promise<string> {
    const fromCommits = await this.tryMergeDiffsFromCommitsApi(base, ref, targetCommit, sourceCommit);

    if (fromCommits.patchText.length > 0) {
      return fromCommits.patchText;
    }

    if (fromCommits.rawChanges.length > 0) {
      const synthetic = await buildSyntheticUnifiedDiffFromCommitChanges({
        collectionBaseUrl: base,
        ref,
        targetCommitId: targetCommit,
        sourceCommitId: sourceCommit,
        changes: fromCommits.rawChanges,
        headers: this.buildHeaders()
      });

      if (synthetic.trim().length > 0) {
        return synthetic;
      }
    }

    return this.fetchUnifiedDiffFromLatestIteration(base, ref, targetCommit, sourceCommit);
  }

  private async tryMergeDiffsFromCommitsApi(
    base: string,
    ref: Extract<PullRequestRef, { provider: "azure_devops" }>,
    targetCommit: string,
    sourceCommit: string
  ): Promise<{ patchText: string; rawChanges: unknown[] }> {
    const forward = await this.fetchDiffsCommitsJson(base, ref, targetCommit, sourceCommit);

    if (forward) {
      const changes = readDiffsCommitsChangeArray(forward);
      const patchText = joinPatchesFromChangeEntries(changes);

      if (patchText.length > 0) {
        return { patchText, rawChanges: [] };
      }

      if (changes.length > 0) {
        return { patchText: "", rawChanges: [...changes] };
      }
    }

    const swapped = await this.fetchDiffsCommitsJson(base, ref, sourceCommit, targetCommit);

    if (!swapped) {
      return { patchText: "", rawChanges: [] };
    }

    const swappedChanges = readDiffsCommitsChangeArray(swapped);
    const swappedPatches = joinPatchesFromChangeEntries(swappedChanges);

    if (swappedPatches.length > 0) {
      return { patchText: swappedPatches, rawChanges: [] };
    }

    return { patchText: "", rawChanges: [...swappedChanges] };
  }

  private async fetchDiffsCommitsJson(
    base: string,
    ref: Extract<PullRequestRef, { provider: "azure_devops" }>,
    baseVersion: string,
    targetVersion: string
  ): Promise<unknown> {
    const repo = encodeURIComponent(ref.repositoryId);
    const query = [
      `baseVersion=${encodeURIComponent(baseVersion)}`,
      `targetVersion=${encodeURIComponent(targetVersion)}`,
      "baseVersionType=commit",
      "targetVersionType=commit",
      "api-version=7.0",
      "$top=2000"
    ].join("&");
    const diffsUrl = `${base}/_apis/git/repositories/${repo}/diffs/commits?${query}`;

    const diffsResponse = await fetch(diffsUrl, {
      headers: this.buildHeaders()
    });

    if (!diffsResponse.ok) {
      return null;
    }

    return (await diffsResponse.json()) as unknown;
  }

  private async fetchUnifiedDiffFromLatestIteration(
    base: string,
    ref: Extract<PullRequestRef, { provider: "azure_devops" }>,
    targetCommitId: string,
    sourceCommitId: string
  ): Promise<string> {
    const repo = encodeURIComponent(ref.repositoryId);
    const prId = ref.pullRequestId;
    const iterationsUrl = `${base}/_apis/git/repositories/${repo}/pullRequests/${prId}/iterations?api-version=7.0`;
    const iterationsResponse = await fetch(iterationsUrl, {
      headers: this.buildHeaders()
    });

    if (!iterationsResponse.ok) {
      throw new Error(`Azure DevOps iterations request failed: ${iterationsResponse.status}`);
    }

    const iterationsBody = (await iterationsResponse.json()) as IterationsListResponse;
    const iterations = this.readIterationsList(iterationsBody);

    if (iterations.length === 0) {
      throw new Error("Azure DevOps pull request has no iterations (cannot build diff)");
    }

    const latestIterationId = Math.max(...iterations.map((item) => item.id));
    const previousIterationId = this.resolvePreviousIterationId(iterations, latestIterationId);
    const attemptUrls = this.buildIterationChangesUrls(base, repo, prId, latestIterationId, previousIterationId);

    let lastChangesBody: unknown = undefined;

    for (const changesUrl of attemptUrls) {
      const changesResponse = await fetch(changesUrl, {
        headers: this.buildHeaders()
      });

      if (!changesResponse.ok) {
        continue;
      }

      const changesBody = (await changesResponse.json()) as unknown;
      lastChangesBody = changesBody;
      const entries = readIterationChangeEntriesArray(changesBody);
      const patchText = joinPatchesFromChangeEntries(entries);

      if (patchText.length > 0) {
        return patchText;
      }
    }

    if (lastChangesBody !== undefined) {
      const synthetic = await buildSyntheticUnifiedDiffFromCommitChanges({
        collectionBaseUrl: base,
        ref,
        targetCommitId,
        sourceCommitId,
        changes: readIterationChangeEntriesArray(lastChangesBody),
        headers: this.buildHeaders()
      });

      if (synthetic.trim().length > 0) {
        return synthetic;
      }
    }

    throw new Error(
      "Azure DevOps: nao foi possivel obter diff (API sem patches; sintese por conteudo de arquivos tambem falhou). Verifique PAT (Code Read) e se o PR tem arquivos de texto."
    );
  }

  private readIterationsList(body: IterationsListResponse): ReadonlyArray<{ readonly id: number }> {
    const record = body as unknown as Record<string, unknown>;
    const fromValue = body.value;
    if (Array.isArray(fromValue)) {
      return fromValue as ReadonlyArray<{ readonly id: number }>;
    }

    const fromPascal = record.Value;
    if (Array.isArray(fromPascal)) {
      return fromPascal as ReadonlyArray<{ readonly id: number }>;
    }

    return [];
  }

  private resolvePreviousIterationId(
    iterations: ReadonlyArray<{ readonly id: number }>,
    latestId: number
  ): number | null {
    const sortedIds = [...new Set(iterations.map((item) => item.id))].sort((left, right) => left - right);
    const index = sortedIds.indexOf(latestId);

    if (index <= 0) {
      return null;
    }

    return sortedIds[index - 1] ?? null;
  }

  private buildIterationChangesUrls(
    base: string,
    repo: string,
    prId: number,
    latestIterationId: number,
    previousIterationId: number | null
  ): string[] {
    const root = `${base}/_apis/git/repositories/${repo}/pullRequests/${prId}/iterations/${latestIterationId}/changes`;
    const baseQuery = "api-version=7.0&$top=500";
    const urls = [`${root}?${baseQuery}&$compareTo=0`, `${root}?${baseQuery}`];

    if (previousIterationId !== null) {
      urls.push(`${root}?${baseQuery}&$compareTo=${previousIterationId}`);
    }

    return urls;
  }

  private async fetchPullRequestJson(
    base: string,
    ref: Extract<PullRequestRef, { provider: "azure_devops" }>
  ): Promise<AzurePullRequest> {
    const pullRequestUrl = `${base}/_apis/git/repositories/${encodeURIComponent(ref.repositoryId)}/pullRequests/${ref.pullRequestId}?api-version=7.0`;
    const pullRequestResponse = await fetch(pullRequestUrl, {
      headers: this.buildHeaders()
    });

    if (!pullRequestResponse.ok) {
      throw new Error(`Azure DevOps pull request request failed: ${pullRequestResponse.status}`);
    }

    return (await pullRequestResponse.json()) as AzurePullRequest;
  }

  private buildCollectionUrl(organization: string, project: string): string {
    return `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}`;
  }

  private buildHeaders(): HeadersInit {
    const token = Buffer.from(`:${this.personalAccessToken}`).toString("base64");
    return {
      Authorization: `Basic ${token}`
    };
  }
}
