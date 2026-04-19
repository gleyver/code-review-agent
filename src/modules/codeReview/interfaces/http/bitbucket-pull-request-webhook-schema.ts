import { z } from "zod";

const bitbucketPullRequestWebhookSchema = z.object({
  pullrequest: z.object({
    id: z.number().int().positive(),
    links: z
      .object({
        html: z.object({ href: z.string().url() }).optional()
      })
      .optional(),
    source: z
      .object({
        commit: z.object({ hash: z.string().min(1) }).optional()
      })
      .optional()
  }),
  repository: z.object({
    full_name: z.string().min(1)
  })
});

export type BitbucketPullRequestWebhook = z.infer<typeof bitbucketPullRequestWebhookSchema>;

export function parseBitbucketPullRequestWebhook(payload: unknown): BitbucketPullRequestWebhook {
  return bitbucketPullRequestWebhookSchema.parse(payload);
}
