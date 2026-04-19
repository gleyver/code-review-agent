import type { ReviewAgentType } from "../../domain/value-objects/review-agent-type.js";
import type { Env } from "../../../../shared/config/env.js";
import type { FoundryAgentBinding } from "./hybrid-agent-review-adapter.js";

function bind(name: string | undefined, version: string | undefined): FoundryAgentBinding | undefined {
  const n = name?.trim();
  const v = version?.trim();
  if (!n || !v) {
    return undefined;
  }

  return { name: n, version: v };
}

export function buildFoundryAgentBindingsFromEnv(env: Env): Partial<Record<ReviewAgentType, FoundryAgentBinding>> {
  return {
    performance: bind(env.FOUNDRY_AGENT_PERFORMANCE_NAME, env.FOUNDRY_AGENT_PERFORMANCE_VERSION),
    security: bind(env.FOUNDRY_AGENT_SECURITY_NAME, env.FOUNDRY_AGENT_SECURITY_VERSION),
    architecture: bind(env.FOUNDRY_AGENT_ARCHITECTURE_NAME, env.FOUNDRY_AGENT_ARCHITECTURE_VERSION)
  };
}
