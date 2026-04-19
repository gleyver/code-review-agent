export const REVIEW_AGENT_TYPES = ["performance", "security", "architecture"] as const;

export type ReviewAgentType = (typeof REVIEW_AGENT_TYPES)[number];
