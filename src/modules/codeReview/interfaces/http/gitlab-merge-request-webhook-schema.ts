import { z } from "zod";

const gitlabMergeRequestWebhookSchema = z.object({
  object_attributes: z.object({
    iid: z.number().int().positive(),
    action: z.string().min(1),
    state: z.string().optional(),
    url: z.string().url().optional(),
    last_commit: z.object({ id: z.string().min(1) }).optional()
  }),
  project: z.object({
    id: z.union([z.number(), z.string()]),
    path_with_namespace: z.string().optional()
  })
});

export type GitlabMergeRequestWebhook = z.infer<typeof gitlabMergeRequestWebhookSchema>;

export function parseGitlabMergeRequestWebhook(payload: unknown): GitlabMergeRequestWebhook {
  return gitlabMergeRequestWebhookSchema.parse(payload);
}
