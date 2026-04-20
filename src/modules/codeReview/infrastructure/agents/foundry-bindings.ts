import type { FoundryAgentSpec } from "../../../../shared/config/foundry-agents-config.js";

export type FoundryAgentBinding = {
  readonly name: string;
  readonly version: string;
};

export function buildFoundryAgentMapFromSpecs(
  agents: readonly FoundryAgentSpec[]
): ReadonlyMap<string, FoundryAgentBinding> {
  const map = new Map<string, FoundryAgentBinding>();
  for (const row of agents) {
    map.set(row.id, { name: row.foundryName, version: row.foundryVersion });
  }
  return map;
}

export function orderedAgentIds(agents: readonly FoundryAgentSpec[]): readonly string[] {
  return agents.map((row) => row.id);
}
