export function buildGitHubPullRequestWebUrl(repositoryFullName: string, pullRequestNumber: number): string {
  const slug = repositoryFullName.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return `https://github.com/${slug}/pull/${pullRequestNumber}`;
}

export function buildBitbucketPullRequestWebUrl(repositoryFullName: string, pullRequestId: number): string {
  const slug = repositoryFullName.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return `https://bitbucket.org/${slug}/pull-requests/${pullRequestId}`;
}

export function deriveGitLabWebRootFromApiBase(apiBaseUrl: string): string {
  const trimmed = apiBaseUrl.trim().replace(/\/+$/, "");
  const withoutApi = trimmed.replace(/\/api\/v4$/i, "");
  return withoutApi.length > 0 ? withoutApi : trimmed;
}

export function buildGitLabMergeRequestWebUrl(
  webRoot: string,
  pathWithNamespace: string,
  mergeRequestIid: number
): string {
  const root = webRoot.trim().replace(/\/+$/, "");
  const path = pathWithNamespace.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return `${root}/${path}/-/merge_requests/${mergeRequestIid}`;
}

export function buildGitLabMergeRequestWebUrlByProjectId(
  webRoot: string,
  projectId: string,
  mergeRequestIid: number
): string {
  const root = webRoot.trim().replace(/\/+$/, "");
  return `${root}/-/project/${encodeURIComponent(projectId)}/merge_requests/${mergeRequestIid}`;
}
