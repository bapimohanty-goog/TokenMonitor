import { Bot, FolderGit2, Info, Users } from 'lucide-react';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BreakdownItem } from '../types/analytics';
import { formatCompactNumber, formatExactNumber, formatUsd } from '../utils/format';

interface BreakdownChartsProps {
  projects: BreakdownItem[];
  users: BreakdownItem[];
  agents: BreakdownItem[];
  hasAnyLabels: boolean;
  isLoading: boolean;
}

type TabKey = 'projects' | 'users' | 'agents';

const TABS: Array<{ key: TabKey; label: string; icon: typeof FolderGit2 }> = [
  { key: 'projects', label: 'Top 10 Projects', icon: FolderGit2 },
  { key: 'users', label: 'Top 10 Users', icon: Users },
  { key: 'agents', label: 'Top 10 Agents', icon: Bot },
];

export function BreakdownCharts({
  projects,
  users,
  agents,
  hasAnyLabels,
  isLoading,
}: BreakdownChartsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('projects');

  const activeData =
    activeTab === 'projects'
      ? projects
      : activeTab === 'users'
        ? users
        : agents;

  const showMissingLabelsNotice =
    !hasAnyLabels && (activeTab === 'users' || activeTab === 'agents');

  return (
    <section className="rounded-2xl border border-slate-800/90 bg-slate-900/70 p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">
            Consumption Breakdown
          </h2>
          <p className="text-xs text-slate-400">
            Top 10 entities by total token volume (stacked Input + Output)
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Breakdown dimensions"
          className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5"
        >
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                activeTab === key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {showMissingLabelsNotice && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <p className="font-medium">No custom User or Agent labels detected</p>
            <p className="mt-0.5 text-amber-200/80">
              All Vertex AI calls in this window are grouped under{' '}
              <code className="rounded bg-amber-950/60 px-1 py-0.5 font-mono">
                unassigned
              </code>
              . Pass <code className="font-mono">labels: &#123; user_id, agent_id &#125;</code>{' '}
              in your Vertex AI API requests to enable per-user and per-agent attribution.
            </p>
          </div>
        </div>
      )}

      {isLoading && activeData.length === 0 ? (
        <div className="h-80 w-full animate-pulse rounded-xl bg-slate-800/50" />
      ) : activeData.length === 0 ? (
        <div className="flex h-80 flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 text-center">
          <p className="text-sm font-medium text-slate-300">
            No {activeTab} data available
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Try widening the date range or clearing filters.
          </p>
        </div>
      ) : (
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={activeData}
              layout="vertical"
              margin={{ top: 4, right: 20, left: 10, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1e293b"
                horizontal={false}
              />
              <XAxis
                type="number"
                tickFormatter={(val: number) => formatCompactNumber(val)}
                stroke="#64748b"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={150}
                stroke="#64748b"
                tick={{ fontSize: 11, fill: '#cbd5e1' }}
                tickFormatter={(val: string) =>
                  val.length > 22 ? `${val.slice(0, 20)}…` : val
                }
              />
              <Tooltip
                cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const item = payload[0].payload as BreakdownItem;
                  return (
                    <div className="rounded-xl border border-slate-700 bg-slate-950/95 p-3 text-xs shadow-xl">
                      <p className="mb-1.5 font-semibold text-white">
                        {item.name}
                      </p>
                      <div className="space-y-1">
                        <div className="flex justify-between gap-6">
                          <span className="text-blue-300">Input Tokens</span>
                          <span className="font-mono text-white">
                            {formatExactNumber(item.inputTokens)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-6">
                          <span className="text-violet-300">Output Tokens</span>
                          <span className="font-mono text-white">
                            {formatExactNumber(item.outputTokens)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-6 border-t border-slate-800 pt-1">
                          <span className="text-slate-400">Total Tokens</span>
                          <span className="font-mono font-semibold text-white">
                            {formatExactNumber(item.totalTokens)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-6">
                          <span className="text-slate-400">Est. Cost</span>
                          <span className="font-mono font-semibold text-emerald-300">
                            {formatUsd(item.costUsd)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />
              <Bar
                dataKey="inputTokens"
                name="Input Tokens"
                stackId="a"
                fill="#3b82f6"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="outputTokens"
                name="Output Tokens"
                stackId="a"
                fill="#8b5cf6"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
