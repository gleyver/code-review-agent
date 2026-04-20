import { z } from "zod";

const foundryAgentSpecSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, "id: use apenas letras, numeros, _ e -"),
  foundryName: z.string().min(1),
  foundryVersion: z.string().min(1)
});

const foundryAgentsArraySchema = z
  .array(foundryAgentSpecSchema)
  .min(1, "Defina pelo menos um agente Foundry.")
  .superRefine((arr, ctx) => {
    const seen = new Set<string>();
    for (const row of arr) {
      const key = row.id.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: `id duplicado (case-insensitive): ${row.id}`,
          path: []
        });
        return;
      }
      seen.add(key);
    }
  });

export type FoundryAgentSpec = z.infer<typeof foundryAgentSpecSchema>;

export function parseFoundryAgentsJson(raw: string): FoundryAgentSpec[] {
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    throw new z.ZodError([
      {
        code: "custom",
        message: "FOUNDRY_AGENTS: JSON invalido.",
        path: ["FOUNDRY_AGENTS_JSON"]
      }
    ]);
  }

  return foundryAgentsArraySchema.parse(data);
}
