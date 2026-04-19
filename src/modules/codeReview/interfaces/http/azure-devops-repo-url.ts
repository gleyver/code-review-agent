export type AzureDevOpsGitRepositoryParts = {
  readonly organization: string;
  readonly project: string;
  readonly repoSlug: string;
};

export function parseAzureDevOpsGitRepositoryUrl(url: string): AzureDevOpsGitRepositoryParts | null {
  const trimmed = url.trim();
  const match = trimmed.match(/^https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/?#]+)/i);

  if (!match) {
    return null;
  }

  return {
    organization: decodeURIComponent(match[1]),
    project: decodeURIComponent(match[2]),
    repoSlug: decodeURIComponent(match[3])
  };
}

export function parseAzureDevOpsRepoUrl(url: string): { organization: string; project: string } | null {
  const parsed = parseAzureDevOpsGitRepositoryUrl(url);

  if (!parsed) {
    return null;
  }

  return {
    organization: parsed.organization,
    project: parsed.project
  };
}

export function buildAzureDevOpsPullRequestWebUrl(repositoryRootUrl: string, pullRequestId: number): string {
  const base = repositoryRootUrl.trim().replace(/\/+$/, "");
  return `${base}/pullrequest/${pullRequestId}`;
}

export function buildAzureDevOpsPullRequestWebUrlFromParts(
  organization: string,
  project: string,
  repositoryId: string,
  pullRequestId: number
): string {
  return `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repositoryId)}/pullrequest/${pullRequestId}`;
}
