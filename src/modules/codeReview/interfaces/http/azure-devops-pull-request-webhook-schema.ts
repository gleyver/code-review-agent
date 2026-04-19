import { z } from "zod";

const azureRepositorySchema = z
  .object({
    id: z.string().min(1).optional(),
    url: z.string().url().optional()
  })
  .refine((repository) => Boolean(repository.id?.trim()) || Boolean(repository.url?.trim()), {
    message: "repository deve incluir id ou url"
  });

const azureDevOpsPullRequestWebhookSchema = z.object({
  eventType: z.string().min(1),
  resource: z.object({
    pullRequestId: z.number().int().positive(),
    url: z.string().url().optional(),
    lastMergeSourceCommit: z.object({ commitId: z.string().min(1) }).optional(),
    repository: azureRepositorySchema
  })
});

export type AzureDevOpsPullRequestWebhook = z.infer<typeof azureDevOpsPullRequestWebhookSchema>;

export function parseAzureDevOpsPullRequestWebhook(payload: unknown): AzureDevOpsPullRequestWebhook {
  return azureDevOpsPullRequestWebhookSchema.parse(payload);
}
