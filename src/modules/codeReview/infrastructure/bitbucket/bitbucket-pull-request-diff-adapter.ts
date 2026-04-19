import { ServiceNotConfiguredError } from "../../domain/errors/service-not-configured-error.js";
import type { PullRequestDiff } from "../../domain/ports/pull-request-diff-port.js";
import type { PullRequestRef } from "../../domain/value-objects/pull-request-ref.js";

type BitbucketPullRequest = {
  readonly id: number;
  readonly links?: {
    readonly html?: {
      readonly href?: string;
    };
  };
  readonly source?: {
    readonly commit?: {
      readonly hash?: string;
    };
  };
};

export class BitbucketPullRequestDiffAdapter {
  public constructor(
    private readonly username: string,
    private readonly appPassword: string
  ) {}

  public async getDiffForBitbucket(ref: Extract<PullRequestRef, { provider: "bitbucket" }>): Promise<PullRequestDiff> {
    if (!this.username.trim() || !this.appPassword.trim()) {
      throw new ServiceNotConfiguredError("BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD are not configured");
    }

    const base = `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(ref.workspace)}/${encodeURIComponent(ref.repoSlug)}`;
    const authorization = `Basic ${Buffer.from(`${this.username}:${this.appPassword}`).toString("base64")}`;

    const [metadataResponse, diffResponse] = await Promise.all([
      fetch(`${base}/pullrequests/${ref.pullRequestId}`, {
        headers: { Authorization: authorization }
      }),
      fetch(`${base}/pullrequests/${ref.pullRequestId}/diff`, {
        headers: { Authorization: authorization, Accept: "text/plain" }
      })
    ]);

    if (!metadataResponse.ok) {
      throw new Error(`Bitbucket pull request request failed: ${metadataResponse.status}`);
    }

    if (!diffResponse.ok) {
      throw new Error(`Bitbucket pull request diff request failed: ${diffResponse.status}`);
    }

    const metadata = (await metadataResponse.json()) as BitbucketPullRequest;
    const unifiedDiff = await diffResponse.text();
    const pullRequestUrl = metadata.links?.html?.href ?? "";
    const headSha = metadata.source?.commit?.hash ?? "";

    return {
      provider: "bitbucket",
      repositoryLabel: `${ref.workspace}/${ref.repoSlug}`,
      pullRequestNumber: metadata.id,
      headSha,
      pullRequestUrl,
      unifiedDiff
    };
  }
}
