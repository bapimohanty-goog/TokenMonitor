import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Granularity, TimeSeriesPoint } from '../types/analytics';
import {
  formatCompactNumber,
  formatExactNumber,
  formatTimestamp,
  formatUsd,
} from '../utils/format';

interface TokenTimeSeriesChartProps {
  data: TimeSeriesPoint[];
  granularity: Granularity;
  onGranularityChange: (g: Granularity) => void;
  allowMinuteGranularity: boolean;
  isLoading: boolean;
}

interface ChartPoint extends TimeSeriesPoint {
  reconciledInput: number | null;
  reconciledOutput: number | null;
  estimatedInput: number | null;
  estimatedOutput: number | null;
}

export function TokenTimeSeriesChart({
  data,
  granularity,
  onGranularityChange,
  allowMinuteGranularity,
  isLoading,
}: TokenTimeSeriesChartProps) {
  // Split series into solid (billing_reconciled) and dashed/hatched (realtime_estimated)
  // while bridging the boundary point so the area remains continuous.
  const chartData: ChartPoint[] = data.map((point, idx) => {
    const isEst = point.dataSource === 'realtime_estimated';
    const nextPoint = data[idx + 1];
    const isBridge =
      !isEst && nextPoint?.dataSource === 'realtime_estimated';

    return {
      ...point,
      reconciledInput: !isEst ? point.inputTokens : null,
      reconciledOutput: !isEst ? point.outputTokens : null,
      estimatedInput: isEst || isBridge ? point.inputTokens : null,
      estimatedOutput: isEst || isBridge ? point.outputTokens : null,
    };
  });

  const hasEstimated = data.some((d) => d.dataSource === 'realtime_estimated');
  const hasReconciled = data.some((d) => d.dataSource === 'billing_reconciled');

  return (
    <section className="rounded-2xl border border-slate-800/90 bg-slate-900/70 p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">
            Token Consumption Over Time
          </h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span>
              Stacked Input vs. Output (
              {granularity === 'minute'
                ? '1-Minute'
                : granularity === 'hour'
                  ? '1-Hour'
                  : 'Daily'}
              )
            </span>
            {hasReconciled && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-300">
                <span className="inline-block h-0.5 w-4 bg-blue-500" />
                Reconciled (BQ Billing)
              </span>
            )}
            {hasEstimated && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-cyan-300">
                <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-cyan-400" />
                Estimated (Live SDK)
              </span>
            )}
          </div>
        </div>

        <div
          role="group"
          aria-label="Chart granularity"
          className="inline-flex h-8 items-center self-start rounded-lg border border-slate-800 bg-slate-950 p-0.5"
        >
          {allowMinuteGranularity && (
            <button
              type="button"
              onClick={() => onGranularityChange('minute')}
              className={`h-7 rounded-md px-2.5 text-xs font-medium transition ${
                granularity === 'minute'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              1-Min
            </button>
          )}
          <button
            type="button"
            onClick={() => onGranularityChange('hour')}
            className={`h-7 rounded-md px-2.5 text-xs font-medium transition ${
              granularity === 'hour'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            1-Hour
          </button>
          <button
            type="button"
            onClick={() => onGranularityChange('day')}
            className={`h-7 rounded-md px-2.5 text-xs font-medium transition ${
              granularity === 'day'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Daily
          </button>
        </div>
      </div>

      {isLoading && data.length === 0 ? (
        <div className="h-72 w-full animate-pulse rounded-xl bg-slate-800/50" />
      ) : data.length === 0 ? (
        <div className="flex h-72 flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 text-center">
          <p className="text-sm font-medium text-slate-300">
            No token usage recorded for this window
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Try expanding your date range or clearing active dimension filters.
          </p>
        </div>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="inputTokensGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="outputTokensGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
                </linearGradient>
                <pattern
                  id="estimatedInputHatch"
                  width="6"
                  height="6"
                  patternTransform="rotate(45 0 0)"
                  patternUnits="userSpaceOnUse"
                >
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="6"
                    stroke="#06b6d4"
                    strokeWidth="2"
                    strokeOpacity="0.35"
                  />
                </pattern>
                <pattern
                  id="estimatedOutputHatch"
                  width="6"
                  height="6"
                  patternTransform="rotate(45 0 0)"
                  patternUnits="userSpaceOnUse"
                >
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="6"
                    stroke="#a855f7"
                    strokeWidth="2"
                    strokeOpacity="0.35"
                  />
                </pattern>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1e293b"
                vertical={false}
              />
              <XAxis
                dataKey="bucket"
                tickFormatter={(val: string) => formatTimestamp(val, granularity)}
                stroke="#64748b"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                minTickGap={28}
              />
              <YAxis
                tickFormatter={(val: number) => formatCompactNumber(val)}
                stroke="#64748b"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                width={56}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const point = payload[0].payload as ChartPoint;
                  const isEstimated = point.dataSource === 'realtime_estimated';
                  return (
                    <div className="max-w-xs rounded-xl border border-slate-700 bg-slate-950/95 p-3 text-xs shadow-xl">
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <p className="font-semibold text-slate-200">
                          {formatTimestamp(String(label), granularity)}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            isEstimated
                              ? 'bg-cyan-500/15 text-cyan-300'
                              : 'bg-emerald-500/15 text-emerald-300'
                          }`}
                        >
                          {isEstimated ? 'Live Estimated' : 'Reconciled'}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-6">
                          <span className="flex items-center gap-1.5 text-blue-300">
                            <span className="h-2 w-2 rounded-full bg-blue-500" />
                            Input Tokens
                          </span>
                          <span className="font-mono font-medium text-white">
                            {formatExactNumber(point.inputTokens)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-6">
                          <span className="flex items-center gap-1.5 text-violet-300">
                            <span className="h-2 w-2 rounded-full bg-violet-500" />
                            Output Tokens
                          </span>
                          <span className="font-mono font-medium text-white">
                            {formatExactNumber(point.outputTokens)}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-6 border-t border-slate-800 pt-1.5">
                          <span className="text-slate-400">
                            {isEstimated ? 'Est. Cost' : 'Billed Cost'}
                          </span>
                          <span className="font-mono font-semibold text-emerald-300">
                            {formatUsd(point.costUsd)}
                          </span>
                        </div>
                        {isEstimated && (
                          <p className="mt-1 border-t border-slate-800/80 pt-1 text-[10px] leading-snug text-cyan-300/90">
                            Estimated from live SDK telemetry — pending BQ
                            billing reconciliation
                          </p>
                        )}
                      </div>
                    </div>
                  );
                }}
              />

              {/* Reconciled BQ Billing Series (Solid) */}
              <Area
                type="monotone"
                dataKey="reconciledInput"
                name="Input (Reconciled)"
                stackId="reconciled"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#inputTokensGrad)"
                connectNulls={false}
              />
              <Area
                type="monotone"
                dataKey="reconciledOutput"
                name="Output (Reconciled)"
                stackId="reconciled"
                stroke="#8b5cf6"
                strokeWidth={2}
                fill="url(#outputTokensGrad)"
                connectNulls={false}
              />

              {/* Live Real-Time Telemetry Series (Dashed + Hatched) */}
              <Area
                type="monotone"
                dataKey="estimatedInput"
                name="Input (Live Est.)"
                stackId="estimated"
                stroke="#06b6d4"
                strokeWidth={2}
                strokeDasharray="5 5"
                fill="url(#estimatedInputHatch)"
                connectNulls={false}
              />
              <Area
                type="monotone"
                dataKey="estimatedOutput"
                name="Output (Live Est.)"
                stackId="estimated"
                stroke="#a855f7"
                strokeWidth={2}
                strokeDasharray="5 5"
                fill="url(#estimatedOutputHatch)"
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
