import type { PullRequestReviewCommentPort } from "../../domain/ports/pull-request-review-comment-port.js";
import type { PullRequestRef } from "../../domain/value-objects/pull-request-ref.js";
import type { ReviewInlineFinding } from "../../domain/value-objects/review-inline-finding.js";
import { formatScmInlineCommentBody } from "../format-scm-inline-comment-body.js";

type GitLabDiffRefs = {
  readonly base_sha?: string;
  readonly start_sha?: string;
  readonly head_sha?: string;
};

type GitLabMergeRequestForRefs = {
  readonly diff_refs?: GitLabDiffRefs;
};

export class GitLabMergeRequestReviewCommentAdapter implements PullRequestReviewCommentPort {
  public constructor(
    private readonly gitlabToken: string,
    private readonly apiBaseUrl: string
  ) {}

  public async postReviewSummary(input: {
    readonly pullRequestRef: PullRequestRef;
    readonly bodyMarkdown: string;
    readonly headSha: string;
  }): Promise<void> {
    if (input.pullRequestRef.provider !== "gitlab") {
      throw new Error("GitLabMergeRequestReviewCommentAdapter: provider mismatch");
    }

    if (!this.gitlabToken.trim()) {
      throw new Error("GITLAB_TOKEN is not configured");
    }

    const ref = input.pullRequestRef;
    const project = encodeURIComponent(ref.projectId);
    const base = this.trimTrailingSlash(this.apiBaseUrl);
    const url = `${base}/projects/${project}/merge_requests/${ref.mergeRequestIid}/notes`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "PRIVATE-TOKEN": this.gitlabToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ body: input.bodyMarkdown })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`GitLab MR comment failed: ${response.status} ${errorBody.slice(0, 800)}`);
    }
  }

  public async postInlineFindings(input: {
    readonly pullRequestRef: PullRequestRef;
    readonly headSha: string;
    readonly findings: readonly ReviewInlineFinding[];
  }): Promise<number> {
    if (input.pullRequestRef.provider !== "gitlab") {
      throw new Error("GitLabMergeRequestReviewCommentAdapter: provider mismatch");
    }

    if (input.findings.length === 0) {
      return 0;
    }

    if (!this.gitlabToken.trim()) {
      throw new Error("GITLAB_TOKEN is not configured");
    }

    const ref = input.pullRequestRef;
    const project = encodeURIComponent(ref.projectId);
    const base = this.trimTrailingSlash(this.apiBaseUrl);
    const mergeRequestUrl = `${base}/projects/${project}/merge_requests/${ref.mergeRequestIid}`;
    const mergeResponse = await fetch(mergeRequestUrl, {
      headers: { "PRIVATE-TOKEN": this.gitlabToken }
    });

    if (!mergeResponse.ok) {
      const errorBody = await mergeResponse.text();
      throw new Error(`GitLab merge request fetch failed: ${mergeResponse.status} ${errorBody.slice(0, 800)}`);
    }

    const mergeRequest = (await mergeResponse.json()) as GitLabMergeRequestForRefs;
    const refs = mergeRequest.diff_refs;

    if (!refs?.base_sha?.trim() || !refs?.start_sha?.trim() || !refs?.head_sha?.trim()) {
      throw new Error("GitLab MR response missing diff_refs (cannot post inline discussions)");
    }

    let posted = 0;
    const errors: string[] = [];

    for (const finding of input.findings) {
      const url = `${base}/projects/${project}/merge_requests/${ref.mergeRequestIid}/discussions`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "PRIVATE-TOKEN": this.gitlabToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          body: formatScmInlineCommentBody(finding),
          position: {
            base_sha: refs.base_sha,
            start_sha: refs.start_sha,
            head_sha: refs.head_sha,
            old_path: finding.path,
            new_path: finding.path,
            position_type: "text",
            new_line: finding.line
          }
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
      throw new Error(`GitLab inline discussions failed: ${errors.join(" | ")}`);
    }

    return posted;
  }

  private trimTrailingSlash(value: string): string {
    return value.endsWith("/") ? value.slice(0, -1) : value;
  }
}
