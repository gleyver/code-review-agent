import type { ScmProvider } from "./scm-provider.js";

export type PullRequestRef =
  | {
      readonly provider: Extract<ScmProvider, "github">;
      readonly repositoryFullName: string;
      readonly pullRequestNumber: number;
    }
  | {
      readonly provider: Extract<ScmProvider, "gitlab">;
      readonly projectId: string;
      readonly mergeRequestIid: number;
    }
  | {
      readonly provider: Extract<ScmProvider, "bitbucket">;
      readonly workspace: string;
      readonly repoSlug: string;
      readonly pullRequestId: number;
    }
  | {
      readonly provider: Extract<ScmProvider, "azure_devops">;
      readonly organization: string;
      readonly project: string;
      readonly repositoryId: string;
      readonly pullRequestId: number;
    };
