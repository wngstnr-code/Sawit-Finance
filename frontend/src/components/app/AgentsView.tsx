'use client';

import { Card, Stat } from '@/components/ui/primitives';
import { txUrl } from '@/lib/onchain';
import { shortHash, bpsToPct, fmtUsdFromCents } from '@/lib/format';
import { useLocale } from '@/lib/i18n';
import type { Dict } from '@/lib/dictionaries';
import { useAgents } from '@/lib/useAgents';
import type { AgentInfo, AgentKind } from '@/lib/agentsTypes';
import { PageHead, Chip, SectionTitle } from './shared';

/* ── helpers ──────────────────────────────────────────────────────────── */

function formatRelative(at: number, t: Dict): string {
  const p = t.app.portfolio;
  const diffMs = Date.now() - at;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return p.justNow;
  if (mins < 60) return p.minsAgo.replace('{n}', String(mins));
  const hours = Math.floor(mins / 60);
  if (hours < 24) return p.hoursAgo.replace('{n}', String(hours));
  const days = Math.floor(hours / 24);
  return p.daysAgo.replace('{n}', String(days));
}

const KIND_TONE: Record<AgentKind, 'brand' | 'muted'> = {
  llm: 'brand',
  'llm-advisory': 'brand',
  'rule-based': 'muted',
};

function kindLabel(kind: AgentKind, t: Dict): string {
  const a = t.app.agents;
  if (kind === 'llm') return a.kindLlm;
  if (kind === 'llm-advisory') return a.kindLlmAdvisory;
  return a.kindRuleBased;
}

const TAGLINES: Record<string, keyof Dict['app']['agents']> = {
  oracle: 'oracleTagline',
  'market-analyst': 'marketAnalystTagline',
  allocation: 'allocationTagline',
  'yield-router': 'yieldRouterTagline',
};

function configLabel(key: string): string {
  // camelCase config key -> "Title Case" (small, self-contained formatter — this
  // view is the only consumer of the raw agent config map).
  const spaced = key.replace(/([A-Z])/g, ' $1');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function configValue(key: string, value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (/bps/i.test(key) && typeof value === 'number') return `${value} bps`;
  if (/hours/i.test(key) && typeof value === 'number') return `${value}h`;
  if (/seconds/i.test(key) && typeof value === 'number') return `${value}s`;
  if (/cspr/i.test(key) && typeof value === 'number') return `${value.toLocaleString('en-US')} CSPR`;
  return String(value);
}

/* ── agent card ───────────────────────────────────────────────────────── */

function AgentCard({ agent }: { agent: AgentInfo }) {
  const { t } = useLocale();
  const a = t.app.agents;
  const taglineKey = TAGLINES[agent.id];
  const tagline = taglineKey ? a[taglineKey] : undefined;

  return (
    <Card className="flex h-full flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg text-ink">{agent.name}</h3>
          {tagline && <p className="mt-1 text-[13px] text-muted">{tagline}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Chip tone={agent.status === 'active' ? 'brand' : 'muted'}>
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                agent.status === 'active' ? 'bg-brand' : 'bg-faint'
              }`}
            />
            {agent.status === 'active' ? a.statusActive : a.statusIdle}
          </Chip>
          <Chip tone={KIND_TONE[agent.kind]}>{kindLabel(agent.kind, t)}</Chip>
        </div>
      </div>

      {agent.status === 'idle' && !agent.lastAction && agent.idleHint && (
        <div className="mt-4 rounded-lg bg-bg-2 px-3 py-2.5 text-[12px] text-muted">
          {a.idleHint} <code className="font-mono text-[11px] text-ink">{agent.idleHint}</code>
        </div>
      )}

      {agent.decision && (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-[0.1em] text-faint">{a.decisionLabel}</div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{agent.decision.summary}</p>
          <div className="mt-1.5 text-[11px] text-faint">{agent.decision.engine}</div>
        </div>
      )}

      {agent.provenance && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip tone={agent.provenance.paidViaX402 ? 'brand' : 'muted'}>
            {agent.provenance.method === 'official'
              ? a.paidOfficial
              : agent.provenance.method === 'reference'
              ? a.paidReference
              : a.unpaidFallback}
          </Chip>
          <span className="text-[11px] text-faint">{formatRelative(agent.provenance.timestamp, t)}</span>
        </div>
      )}

      {agent.config && Object.keys(agent.config).length > 0 && (
        <div className="mt-4 rounded-lg border border-line bg-bg-2/60 p-3">
          <div className="text-[11px] uppercase tracking-[0.1em] text-faint">{a.guardrailsLabel}</div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
            {Object.entries(agent.config).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <dt className="text-muted">{configLabel(k)}</dt>
                <dd className="font-mono text-ink">{configValue(k, v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {agent.lastAction && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.1em] text-faint">{a.lastActionLabel}</div>
            <div className="mt-1 text-[12px] text-muted">{agent.lastAction.detail}</div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-faint">
              {agent.lastAction.isLastKnown ? (
                <span>{a.lastKnownTag}</span>
              ) : (
                <span>{formatRelative(agent.lastAction.timestamp, t)}</span>
              )}
            </div>
          </div>
          {agent.lastAction.txHash && (
            <a
              href={txUrl(agent.lastAction.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 font-mono text-[12px] text-brand hover:underline"
            >
              {shortHash(agent.lastAction.txHash, 6, 4)} ↗
            </a>
          )}
        </div>
      )}
    </Card>
  );
}

function AgentCardSkeleton() {
  return (
    <Card className="h-[280px] p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="h-5 w-36 animate-pulse rounded bg-bg-2" />
          <div className="h-3 w-56 animate-pulse rounded bg-bg-2" />
        </div>
        <div className="h-6 w-16 animate-pulse rounded-full bg-bg-2" />
      </div>
      <div className="mt-6 space-y-2">
        <div className="h-3 w-full animate-pulse rounded bg-bg-2" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-bg-2" />
      </div>
      <div className="mt-6 h-16 w-full animate-pulse rounded-lg bg-bg-2" />
    </Card>
  );
}

/* ── autonomy feed ────────────────────────────────────────────────────── */

function AutonomyFeed({ agents }: { agents: AgentInfo[] }) {
  const { t } = useLocale();
  const a = t.app.agents;
  const items = agents
    .filter((ag) => ag.lastAction)
    .map((ag) => ({ agent: ag, action: ag.lastAction! }))
    .sort((x, y) => y.action.timestamp - x.action.timestamp);

  if (items.length === 0) {
    return (
      <Card className="px-6 py-8 text-center text-[13px] text-muted">{a.feedEmpty}</Card>
    );
  }

  return (
    <Card className="divide-y divide-line overflow-hidden">
      {items.map(({ agent, action }, i) => (
        <div key={`${agent.id}-${i}`} className="flex items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                agent.status === 'active' ? 'bg-brand' : 'bg-faint'
              }`}
            />
            <div>
              <div className="text-[14px] font-medium text-ink">
                {agent.name} <span className="text-faint">· {action.type}</span>
              </div>
              <div className="text-[12px] text-muted">
                {action.isLastKnown ? (
                  <span className="text-faint">{a.lastKnownTag}</span>
                ) : (
                  formatRelative(action.timestamp, t)
                )}
              </div>
            </div>
          </div>
          {action.txHash && (
            <a
              href={txUrl(action.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 font-mono text-[12px] text-brand hover:underline"
            >
              {shortHash(action.txHash, 6, 4)} ↗
            </a>
          )}
        </div>
      ))}
    </Card>
  );
}

/* ── page ─────────────────────────────────────────────────────────────── */

export default function AgentsView() {
  const { t } = useLocale();
  const a = t.app.agents;
  const { data, loading } = useAgents();

  return (
    <div className="space-y-6">
      <PageHead title={a.title} sub={a.sub} />

      {data?.isSnapshot && (
        <div className="rounded-lg border border-line bg-bg-2 px-4 py-2.5 text-[12px] text-faint">
          {a.snapshotNote}
        </div>
      )}

      {data?.onchain && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat
            label={a.onchainGorr}
            value={data.onchain.gorrBps != null ? bpsToPct(data.onchain.gorrBps) : '—'}
          />
          <Stat
            label={a.onchainOracleRep}
            value={data.onchain.oracleReputation != null ? `${data.onchain.oracleReputation}/100` : '—'}
            accent
          />
          <Stat
            label={a.onchainEpochs}
            value={data.onchain.epochCount != null ? String(data.onchain.epochCount) : '—'}
          />
          <Stat
            label={a.onchainPrice}
            value={
              data.onchain.latestCpoPriceCents != null
                ? fmtUsdFromCents(data.onchain.latestCpoPriceCents)
                : '—'
            }
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {loading && !data ? (
          <>
            <AgentCardSkeleton />
            <AgentCardSkeleton />
            <AgentCardSkeleton />
            <AgentCardSkeleton />
          </>
        ) : (
          data?.agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)
        )}
      </div>

      {data && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-[15px] text-ink">{a.mcpTitle}</h3>
              <Chip tone={data.mcp.status === 'available' ? 'brand' : 'muted'}>{data.mcp.status}</Chip>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              {a.mcpBody.replace('{n}', String(data.mcp.tools.length))}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.mcp.tools.map((tool) => (
                <span
                  key={tool}
                  className="rounded bg-bg-2 px-2 py-1 font-mono text-[10.5px] text-muted"
                >
                  {tool}
                </span>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-[15px] text-ink">{a.x402Title}</h3>
              <Chip tone="brand">{data.x402.assetSymbol}</Chip>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">{a.x402Body}</p>
            <div className="mt-3 text-[11px] text-faint">
              {a.provenanceLabel}: {data.x402.status === 'unknown' ? a.provenanceUnknown : data.x402.status}
            </div>
          </Card>
        </div>
      )}

      <div>
        <SectionTitle>{a.feedTitle}</SectionTitle>
        {data ? <AutonomyFeed agents={data.agents} /> : <AgentCardSkeleton />}
      </div>
    </div>
  );
}
