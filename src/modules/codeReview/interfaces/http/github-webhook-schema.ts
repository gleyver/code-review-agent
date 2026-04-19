import { z } from "zod";

const pullRequestSchema = z.object({
  action: z.string().min(1),
  repository: z.object({
    full_name: z.string().min(1)
  }),
  pull_request: z.object({
    number: z.number().int().positive(),
    html_url: z.string().url().optional(),
    head: z
      .object({
        sha: z.string().min(1).optional()
      })
      .optional()
  })
});

export type PullRequestWebhook = z.infer<typeof pullRequestSchema>;

export function parsePullRequestWebhook(payload: unknown): PullRequestWebhook {
  return pullRequestSchema.parse(payload);
}
