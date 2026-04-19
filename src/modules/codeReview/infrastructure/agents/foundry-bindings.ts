import type { ReviewAgentType } from "../../domain/value-objects/review-agent-type.js";
import type { Env } from "../../../../shared/config/env.js";

export type FoundryAgentBinding = {
  readonly name: string;
  readonly version: string;
};

function bind(name: string | undefined, version: string | undefined): FoundryAgentBinding | undefined {
  const n = name?.trim();
  const v = version?.trim();
  if (!n || !v) {
    return undefined;
  }

  return { name: n, version: v };
}

export function buildFoundryAgentBindingsFromEnv(env: Env): Record<ReviewAgentType, FoundryAgentBinding> {
  const performance = bind(env.FOUNDRY_AGENT_PERFORMANCE_NAME, env.FOUNDRY_AGENT_PERFORMANCE_VERSION);
  const security = bind(env.FOUNDRY_AGENT_SECURITY_NAME, env.FOUNDRY_AGENT_SECURITY_VERSION);
  const architecture = bind(env.FOUNDRY_AGENT_ARCHITECTURE_NAME, env.FOUNDRY_AGENT_ARCHITECTURE_VERSION);
  if (!performance || !security || !architecture) {
    throw new Error(
      "Microsoft Foundry: configuracao incompleta dos agentes (performance, security, architecture)."
    );
  }

  return { performance, security, architecture };
}
