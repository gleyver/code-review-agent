import { ServiceNotConfiguredError } from "../../domain/errors/service-not-configured-error.js";
import type { PullRequestReviewCommentPort } from "../../domain/ports/pull-request-review-comment-port.js";
import type { PullRequestRef } from "../../domain/value-objects/pull-request-ref.js";
import type { ReviewInlineFinding } from "../../domain/value-objects/review-inline-finding.js";
import { formatScmInlineCommentBody } from "../format-scm-inline-comment-body.js";

export class AzureDevOpsPullRequestReviewCommentAdapter implements PullRequestReviewCommentPort {
  public constructor(private readonly personalAccessToken: string) {}

  public async postReviewSummary(input: {
    readonly pullRequestRef: PullRequestRef;
    readonly bodyMarkdown: string;
    readonly headSha: string;
  }): Promise<void> {
    if (input.pullRequestRef.provider !== "azure_devops") {
      throw new Error("AzureDevOpsPullRequestReviewCommentAdapter: provider mismatch");
    }

    if (!this.personalAccessToken.trim()) {
      throw new ServiceNotConfiguredError("AZURE_DEVOPS_PAT is not configured");
    }

    const ref = input.pullRequestRef;
    const base = `https://dev.azure.com/${encodeURIComponent(ref.organization)}/${encodeURIComponent(ref.project)}`;
    const url = `${base}/_apis/git/repositories/${encodeURIComponent(ref.repositoryId)}/pullRequests/${ref.pullRequestId}/threads?api-version=7.0`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`:${this.personalAccessToken}`).toString("base64")}`
      },
      body: JSON.stringify({
        status: "active",
        comments: [
          {
            parentCommentId: 0,
            content: input.bodyMarkdown,
            commentType: 1
          }
        ]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Azure DevOps PR thread comment failed: ${response.status} ${errorBody.slice(0, 800)}`);
    }
  }

  public async postInlineFindings(input: {
    readonly pullRequestRef: PullRequestRef;
    readonly headSha: string;
    readonly findings: readonly ReviewInlineFinding[];
  }): Promise<number> {
    if (input.pullRequestRef.provider !== "azure_devops") {
      throw new Error("AzureDevOpsPullRequestReviewCommentAdapter: provider mismatch");
    }

    if (input.findings.length === 0) {
      return 0;
    }

    if (!this.personalAccessToken.trim()) {
      throw new ServiceNotConfiguredError("AZURE_DEVOPS_PAT is not configured");
    }

    const ref = input.pullRequestRef;
    const base = `https://dev.azure.com/${encodeURIComponent(ref.organization)}/${encodeURIComponent(ref.project)}`;
    let posted = 0;
    const errors: string[] = [];

    for (const finding of input.findings) {
      const url = `${base}/_apis/git/repositories/${encodeURIComponent(ref.repositoryId)}/pullRequests/${ref.pullRequestId}/threads?api-version=7.0`;
      const filePath = this.toAdoFilePath(finding.path);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(`:${this.personalAccessToken}`).toString("base64")}`
        },
        body: JSON.stringify({
          status: "active",
          threadContext: {
            filePath,
            rightFileStart: { line: finding.line, offset: 1 },
            rightFileEnd: { line: finding.line, offset: 1 }
          },
          comments: [
            {
              parentCommentId: 0,
              content: formatScmInlineCommentBody(finding),
              commentType: 1
            }
          ]
        })
      });

      if (response.ok) {
        posted += 1;
        continue;
      }

      const errorBody = await response.text();
      errors.push(`${finding.path}:${finding.line} -> ${response.status} ${errorBody.slice(0, 240)}`);
    }

    if (posted === 0) {
      throw new Error(`Azure DevOps inline threads failed: ${errors.join(" | ")}`);
    }

    return posted;
  }

  private toAdoFilePath(path: string): string {
    const trimmed = path.trim().replace(/\\/g, "/");
    if (trimmed.startsWith("/")) {
      return trimmed;
    }

    return `/${trimmed}`;
  }
}
