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
    /** URL do projeto Azure AI / Foundry; vazio ate o superRefine validar (mensagem clara se faltar no .env). */
    AZURE_AI_PROJECT_ENDPOINT: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() : ""),
      z.string()
    ),
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
    const endpoint = data.AZURE_AI_PROJECT_ENDPOINT;
    if (!endpoint) {
      ctx.addIssue({
        code: "custom",
        message:
          "Defina AZURE_AI_PROJECT_ENDPOINT no .env (URL do projeto Microsoft Foundry / Azure AI Projects). Veja .env.example.",
        path: ["AZURE_AI_PROJECT_ENDPOINT"]
      });
    }
    if (endpoint && !URL.canParse(endpoint)) {
      ctx.addIssue({
        code: "custom",
        message:
          "AZURE_AI_PROJECT_ENDPOINT deve ser uma URL valida (ex.: https://<recurso>.services.ai.azure.com/api/projects/<projeto>).",
        path: ["AZURE_AI_PROJECT_ENDPOINT"]
      });
    }

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
          code: "custom",
          message: `Foundry: para o agente "${role}", defina nome e versao juntos (ou deixe ambos vazios).`
        });
      }
    }

    const allRolesConfigured = pairs.every(([name, version]) => Boolean(name?.trim()) && Boolean(version?.trim()));
    if (!allRolesConfigured) {
      ctx.addIssue({
        code: "custom",
        message:
          "Microsoft Foundry: defina FOUNDRY_AGENT_PERFORMANCE_NAME/VERSION, FOUNDRY_AGENT_SECURITY_NAME/VERSION e FOUNDRY_AGENT_ARCHITECTURE_NAME/VERSION."
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
