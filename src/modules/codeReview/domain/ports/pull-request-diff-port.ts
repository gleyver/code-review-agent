import type { PullRequestRef } from "../value-objects/pull-request-ref.js";
import type { ScmProvider } from "../value-objects/scm-provider.js";

export type PullRequestDiff = {
  readonly provider: ScmProvider;
  readonly repositoryLabel: string;
  readonly pullRequestNumber: number;
  readonly headSha: string;
  readonly pullRequestUrl: string;
  readonly unifiedDiff: string;
};

export interface PullRequestDiffPort {
  getDiff(ref: PullRequestRef): Promise<PullRequestDiff>;
}
