export const SCM_PROVIDERS = ["github", "gitlab", "bitbucket", "azure_devops"] as const;

export type ScmProvider = (typeof SCM_PROVIDERS)[number];
