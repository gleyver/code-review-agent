export function splitBitbucketFullName(fullName: string): { workspace: string; repoSlug: string } {
  const parts = fullName.split("/");
  if (parts.length < 2) {
    throw new Error("invalid Bitbucket repository full_name");
  }

  const workspace = parts[0] ?? "";
  const repoSlug = parts.slice(1).join("/");

  return { workspace, repoSlug };
}
