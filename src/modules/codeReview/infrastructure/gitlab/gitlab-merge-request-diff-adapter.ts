import { ServiceNotConfiguredError } from "../../domain/errors/service-not-configured-error.js";
import type { PullRequestDiff } from "../../domain/ports/pull-request-diff-port.js";
import type { PullRequestRef } from "../../domain/value-objects/pull-request-ref.js";

type GitLabMergeRequest = {
  readonly iid: number;
  readonly web_url: string;
  readonly sha?: string;
  readonly diff_refs?: {
    readonly head_sha?: string;
  };
  readonly references?: {
    readonly full?: string;
  };
};

type GitLabChanges = {
  readonly changes?: ReadonlyArray<{
    readonly diff?: string;
  }>;
};

export class GitLabMergeRequestDiffAdapter {
  public constructor(
    private readonly gitlabToken: string,
    private readonly apiBaseUrl: string
  ) {}

  public async getDiffForGitlab(ref: Extract<PullRequestRef, { provider: "gitlab" }>): Promise<PullRequestDiff> {
    if (!this.gitlabToken.trim()) {
      throw new ServiceNotConfiguredError("GITLAB_TOKEN is not configured");
    }

    const project = encodeURIComponent(ref.projectId);
    const iid = ref.mergeRequestIid;
    const mergeRequestUrl = `${this.trimTrailingSlash(this.apiBaseUrl)}/projects/${project}/merge_requests/${iid}`;
    const changesUrl = `${this.trimTrailingSlash(this.apiBaseUrl)}/projects/${project}/merge_requests/${iid}/changes`;

    const headers = { "PRIVATE-TOKEN": this.gitlabToken };

    const [mergeResponse, changesResponse] = await Promise.all([
      fetch(mergeRequestUrl, { headers }),
      fetch(changesUrl, { headers })
    ]);

    if (!mergeResponse.ok) {
      throw new Error(`GitLab merge request request failed: ${mergeResponse.status}`);
    }

    if (!changesResponse.ok) {
      throw new Error(`GitLab merge request changes request failed: ${changesResponse.status}`);
    }

    const mergeRequest = (await mergeResponse.json()) as GitLabMergeRequest;
    const changesPayload = (await changesResponse.json()) as GitLabChanges;
    const changes = changesPayload.changes ?? [];

    const unifiedDiff = changes
      .map((change) => change.diff ?? "")
      .filter((diff) => diff.length > 0)
      .join("\n\n");

    const headSha = mergeRequest.diff_refs?.head_sha ?? mergeRequest.sha ?? "";

    return {
      provider: "gitlab",
      repositoryLabel: mergeRequest.references?.full ?? ref.projectId,
      pullRequestNumber: mergeRequest.iid,
      headSha,
      pullRequestUrl: mergeRequest.web_url,
      unifiedDiff
    };
  }

  private trimTrailingSlash(value: string): string {
    return value.endsWith("/") ? value.slice(0, -1) : value;
  }
}
