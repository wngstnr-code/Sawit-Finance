// Shared shape for the Agent Control Room (/api/agents ↔ useAgents() ↔ AgentsView).
// Plain types only (no 'use client'), safe to import from server route handlers,
// client hooks, and components alike.

export type AgentKind = 'llm' | 'rule-based' | 'llm-advisory';
export type AgentStatus = 'active' | 'idle';

export type AgentAction = {
  // Free-form action label, e.g. 'record_production' | 'set_gorr' | 'allocate' | 'settle_epoch'.
  type: string;
  timestamp: number; // ms epoch
  txHash?: string;
  // True when txHash is a known-good example from a prior run (README), not a
  // hash read fresh from this machine's local agent state — always disclosed in UI.
  isLastKnown?: boolean;
  detail: string;
};

export type AgentDecision = {
  summary: string;
  engine: string;
};

export type AgentProvenance = {
  method: 'official' | 'reference' | 'unpaid_fallback';
  paidViaX402: boolean;
  resourcePath: string;
  timestamp: number; // ms epoch
};

export type AgentInfo = {
  id: string;
  name: string;
  kind: AgentKind;
  status: AgentStatus;
  // Shown in the empty/idle state — how to start the agent locally.
  idleHint?: string;
  lastAction?: AgentAction;
  decision?: AgentDecision;
  config?: Record<string, string | number | boolean>;
  provenance?: AgentProvenance;
};

export type AgentsPayload = {
  generatedAt: number;
  onchain: {
    gorrBps: number | null;
    oracleReputation: number | null;
    epochCount: number | null;
    latestCpoPriceCents: number | null;
    latestEpochLabel: string | null;
    currentDistributionEpoch: number | null;
    latestEpochFunded: boolean | null;
  };
  agents: AgentInfo[];
  mcp: { tools: string[]; status: 'available' | 'unavailable' };
  x402: { assetSymbol: string; assetPackage: string; status: string };
  isSnapshot?: boolean;
};
