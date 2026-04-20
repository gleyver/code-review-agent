import "dotenv/config";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { parseFoundryAgentsJson } from "./foundry-agents-config.js";

const rawEnvSchema = z.object({
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().default("info"),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  GITLAB_TOKEN: z.string().optional(),
  GITLAB_BASE_URL: z.string().default("https://gitlab.com/api/v4"),
  GITLAB_WEBHOOK_SECRET: z.string().optional(),
  BITBUCKET_USERNAME: z.string().optional(),
  BITBUCKET_APP_PASSWORD: z.string().optional(),
  BITBUCKET_WEBHOOK_SECRET: z.string().optional(),
  REVIEW_SERVICE_TOKEN: z.string().optional(),
  AZURE_DEVOPS_PAT: z.string().optional(),
  AZURE_DEVOPS_WEBHOOK_SECRET: z.string().optional(),
  AZURE_DEVOPS_ORGANIZATION: z.string().optional(),
  AZURE_DEVOPS_PROJECT: z.string().optional(),
  AZURE_AI_PROJECT_ENDPOINT: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z.string()
  ),
  AZURE_AI_PROJECT_API_KEY: z.string().optional(),
  /**
   * JSON: array de { "id", "foundryName", "foundryVersion" }.
   * Alternativa: FOUNDRY_AGENTS_CONFIG_PATH apontando para um ficheiro com o mesmo JSON.
   */
  FOUNDRY_AGENTS_JSON: z.string().optional(),
  FOUNDRY_AGENTS_CONFIG_PATH: z.string().optional(),
  EXPOSE_REVIEW_ERROR_DETAIL: z
    .string()
    .optional()
    .transform((value) => {
      const normalized = value?.trim().toLowerCase();
      return normalized === "true" || normalized === "1" || normalized === "yes";
    }),
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
});

const envWithEndpoint = rawEnvSchema.superRefine((data, ctx) => {
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
});

const envWithAgentsSource = envWithEndpoint.superRefine((data, ctx) => {
  const hasPath = Boolean(data.FOUNDRY_AGENTS_CONFIG_PATH?.trim());
  const hasJson = Boolean(data.FOUNDRY_AGENTS_JSON?.trim());
  if (!hasPath && !hasJson) {
    ctx.addIssue({
      code: "custom",
      message:
        "Defina FOUNDRY_AGENTS_JSON (array JSON) ou FOUNDRY_AGENTS_CONFIG_PATH (ficheiro com o mesmo array). Veja foundry-agents.example.json na raiz do repo.",
      path: ["FOUNDRY_AGENTS_JSON"]
    });
    return;
  }
  if (hasPath && hasJson) {
    ctx.addIssue({
      code: "custom",
      message: "Use apenas um: FOUNDRY_AGENTS_JSON ou FOUNDRY_AGENTS_CONFIG_PATH, nao ambos.",
      path: ["FOUNDRY_AGENTS_JSON"]
    });
  }
});

export const envSchema = envWithAgentsSource.transform((data) => {
  const path = data.FOUNDRY_AGENTS_CONFIG_PATH?.trim();
  let rawJson: string;
  if (path) {
    try {
      rawJson = readFileSync(path, "utf8");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new z.ZodError([
        {
          code: "custom",
          message: `Nao foi possivel ler FOUNDRY_AGENTS_CONFIG_PATH (${path}): ${msg}`,
          path: ["FOUNDRY_AGENTS_CONFIG_PATH"]
        }
      ]);
    }
  } else {
    rawJson = data.FOUNDRY_AGENTS_JSON?.trim() ?? "";
  }

  const foundryAgents = parseFoundryAgentsJson(rawJson);
  return { ...data, foundryAgents };
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
