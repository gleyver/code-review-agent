import "dotenv/config";
import { z } from "zod";

const envSchema = z
  .object({
    PORT: z.coerce.number().default(3000),
    LOG_LEVEL: z.string().default("info"),
    GITHUB_TOKEN: z.string().optional(),
    GITHUB_WEBHOOK_SECRET: z.string().optional(),
    GITLAB_TOKEN: z.string().optional(),
    GITLAB_BASE_URL: z.string().default("https://gitlab.com/api/v4"),
    GITLAB_WEBHOOK_SECRET: z.string().optional(),
    BITBUCKET_USERNAME: z.string().optional(),
    BITBUCKET_APP_PASSWORD: z.string().optional(),
    REVIEW_SERVICE_TOKEN: z.string().optional(),
    AZURE_DEVOPS_PAT: z.string().optional(),
    AZURE_DEVOPS_WEBHOOK_SECRET: z.string().optional(),
    AZURE_DEVOPS_ORGANIZATION: z.string().optional(),
    AZURE_DEVOPS_PROJECT: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
    AZURE_AI_PROJECT_ENDPOINT: z.string().url().optional(),
    /** API key do recurso Azure AI / Foundry (opcional; se vazio, usa DefaultAzureCredential) */
    AZURE_AI_PROJECT_API_KEY: z.string().optional(),
    FOUNDRY_AGENT_PERFORMANCE_NAME: z.string().optional(),
    FOUNDRY_AGENT_PERFORMANCE_VERSION: z.string().optional(),
    FOUNDRY_AGENT_SECURITY_NAME: z.string().optional(),
    FOUNDRY_AGENT_SECURITY_VERSION: z.string().optional(),
    FOUNDRY_AGENT_ARCHITECTURE_NAME: z.string().optional(),
    FOUNDRY_AGENT_ARCHITECTURE_VERSION: z.string().optional(),
    EXPOSE_REVIEW_ERROR_DETAIL: z
      .string()
      .optional()
      .transform((value) => {
        const normalized = value?.trim().toLowerCase();
        return normalized === "true" || normalized === "1" || normalized === "yes";
      }),
    /** Publica resumo do review como comentario na PR/MR (default: ligado) */
    POST_REVIEW_PR_COMMENT: z
      .string()
      .optional()
      .transform((value) => {
        const trimmed = value?.trim() ?? "";
        if (trimmed === "") {
          return true;
        }

        const normalized = trimmed.toLowerCase();
        return normalized === "true" || normalized === "1" || normalized === "yes";
      })
  })
  .superRefine((data, ctx) => {
    const pairs: ReadonlyArray<[string | undefined, string | undefined, string]> = [
      [data.FOUNDRY_AGENT_PERFORMANCE_NAME, data.FOUNDRY_AGENT_PERFORMANCE_VERSION, "performance"],
      [data.FOUNDRY_AGENT_SECURITY_NAME, data.FOUNDRY_AGENT_SECURITY_VERSION, "security"],
      [data.FOUNDRY_AGENT_ARCHITECTURE_NAME, data.FOUNDRY_AGENT_ARCHITECTURE_VERSION, "architecture"]
    ];

    for (const [name, version, role] of pairs) {
      const hasName = Boolean(name?.trim());
      const hasVersion = Boolean(version?.trim());
      if (hasName !== hasVersion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Foundry: para o agente "${role}", defina nome e versao juntos (ou deixe ambos vazios).`
        });
      }
    }

    const anyFoundryRole = pairs.some(([name]) => Boolean(name?.trim()));
    if (anyFoundryRole && !data.AZURE_AI_PROJECT_ENDPOINT?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AZURE_AI_PROJECT_ENDPOINT e obrigatorio quando algum FOUNDRY_AGENT_* estiver configurado."
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
