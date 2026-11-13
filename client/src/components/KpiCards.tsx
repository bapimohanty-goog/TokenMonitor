import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Coins,
  Cpu,
  Scale,
} from 'lucide-react';
import type { KpiSummary } from '../types/analytics';
import { formatCompactNumber, formatExactNumber, formatUsd } from '../utils/format';

interface KpiCardsProps {
  kpis: KpiSummary | null;
  isLoading: boolean;
}

export function KpiCards({ kpis, isLoading }: KpiCardsProps) {
  if (isLoading && !kpis) {
    return (
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={idx}
            className="h-32 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
          >
            <div className="h-3.5 w-28 rounded bg-slate-800" />
            <div className="mt-4 h-7 w-36 rounded bg-slate-800" />
            <div className="mt-3 h-3 w-24 rounded bg-slate-800" />
          </div>
        ))}
      </section>
    );
  }

  const totalTokens = kpis?.totalTokens ?? 0;
  const inputTokens = kpis?.inputTokens ?? 0;
  const outputTokens = kpis?.outputTokens ?? 0;
  const inputPct = totalTokens > 0 ? Math.round((inputTokens / totalTokens) * 100) : 0;
  const outputPct = totalTokens > 0 ? 100 - inputPct : 0;

  const pctChange = kpis?.tokenChangePercent ?? null;
  const isPositive = pctChange !== null && pctChange >= 0;

  return (
    <section
      aria-label="Key Performance Indicators"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {/* 1. Total Tokens Consumed */}
      <div className="rounded-2xl border border-slate-800/90 bg-slate-900/70 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Total Tokens Consumed
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
            <Cpu className="h-4 w-4" />
          </span>
        </div>
        <div className="mt-3 flex items-baseline gap-2.5">
          <span
            className="text-2xl font-bold tracking-tight text-white"
            title={formatExactNumber(totalTokens)}
          >
            {formatCompactNumber(totalTokens)}
          </span>
          {pctChange !== null ? (
            <span
              className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                isPositive
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-rose-500/15 text-rose-300'
              }`}
            >
              {isPositive ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" />
              )}
              {Math.abs(pctChange).toFixed(1)}%
            </span>
          ) : (
            <span className="text-xs text-slate-500">No prior baseline</span>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          vs. {formatCompactNumber(kpis?.previousTotalTokens ?? 0)} prior period
        </p>
      </div>

      {/* 2. Input vs. Output Token Ratio */}
      <div className="rounded-2xl border border-slate-800/90 bg-slate-900/70 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Input / Output Ratio
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
            <Scale className="h-4 w-4" />
          </span>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight text-white">
            {kpis?.inputOutputRatio !== null && kpis?.inputOutputRatio !== undefined
              ? `${kpis.inputOutputRatio.toFixed(2)} : 1`
              : '—'}
          </span>
          <span className="text-xs text-slate-400">
            ({inputPct}% / {outputPct}%)
          </span>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div className="flex h-full w-full">
            <div
              className="bg-blue-500 transition-all duration-300"
              style={{ width: `${inputPct}%` }}
            />
            <div
              className="bg-violet-500 transition-all duration-300"
              style={{ width: `${outputPct}%` }}
            />
          </div>
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-slate-400">
          <span>In: {formatCompactNumber(inputTokens)}</span>
          <span>Out: {formatCompactNumber(outputTokens)}</span>
        </div>
      </div>

      {/* 3. Total Estimated Token Cost */}
      <div className="rounded-2xl border border-slate-800/90 bg-slate-900/70 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Estimated Token Cost
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
            <Coins className="h-4 w-4" />
          </span>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight text-white">
            {formatUsd(kpis?.totalCostUsd ?? 0)}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {kpis && kpis.estimatedCostUsd > 0 ? (
            <>
              <span className="text-emerald-300/90">
                {formatUsd(kpis.reconciledCostUsd)} billed
              </span>{' '}
              +{' '}
              <span className="text-cyan-300/90">
                {formatUsd(kpis.estimatedCostUsd)} live est.
              </span>
            </>
          ) : (
            <>Prior period: {formatUsd(kpis?.previousTotalCostUsd ?? 0)}</>
          )}
        </p>
      </div>

      {/* 4. Top Active Agent */}
      <div className="rounded-2xl border border-slate-800/90 bg-slate-900/70 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Top Active Agent
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
            <Bot className="h-4 w-4" />
          </span>
        </div>
        <div className="mt-3">
          {kpis?.topAgent ? (
            <>
              <div
                className="truncate text-xl font-bold tracking-tight text-white"
                title={kpis.topAgent.agentId}
              >
                {kpis.topAgent.agentId}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {formatCompactNumber(kpis.topAgent.totalTokens)} tokens &bull;{' '}
                {formatUsd(kpis.topAgent.costUsd)}
              </p>
            </>
          ) : (
            <>
              <div className="text-xl font-semibold text-slate-500">No data</div>
              <p className="mt-2 text-xs text-slate-500">
                Adjust filters or date range
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
