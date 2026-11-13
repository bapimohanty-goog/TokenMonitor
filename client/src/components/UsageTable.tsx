import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Search,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Granularity, UsageRow } from '../types/analytics';
import { formatExactNumber, formatTimestamp, formatUsd } from '../utils/format';

interface UsageTableProps {
  rows: UsageRow[];
  granularity: Granularity;
  isLoading: boolean;
}

type SortKey =
  | 'timestamp'
  | 'projectName'
  | 'userId'
  | 'agentId'
  | 'skuDescription'
  | 'inputTokens'
  | 'outputTokens'
  | 'totalTokens'
  | 'costUsd';

type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 15;

export function UsageTable({ rows, granularity, isLoading }: UsageTableProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('timestamp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter(
          (r) =>
            r.projectName.toLowerCase().includes(q) ||
            r.projectId.toLowerCase().includes(q) ||
            r.userId.toLowerCase().includes(q) ||
            r.agentId.toLowerCase().includes(q) ||
            r.skuDescription.toLowerCase().includes(q)
        )
      : rows;

    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [rows, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredAndSorted.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(1);
  };

  const handleDownloadCsv = () => {
    const headers = [
      'Timestamp',
      'Source',
      'Project ID',
      'Project Name',
      'User',
      'Agent',
      'Model/SKU',
      'Input Tokens',
      'Output Tokens',
      'Total Tokens',
      'Cost (USD)',
    ];

    const escapeCsv = (val: string | number) => {
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const lines = [
      headers.join(','),
      ...filteredAndSorted.map((r) =>
        [
          r.timestamp,
          r.dataSource,
          r.projectId,
          r.projectName,
          r.userId,
          r.agentId,
          r.skuDescription,
          r.inputTokens,
          r.outputTokens,
          r.totalTokens,
          r.costUsd.toFixed(6),
        ]
          .map(escapeCsv)
          .join(',')
      ),
    ];

    const blob = new Blob([lines.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gcp-token-usage-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-slate-600" />;
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-blue-400" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-blue-400" />
    );
  };

  return (
    <section className="rounded-2xl border border-slate-800/90 bg-slate-900/70 p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">
            Granular Usage &amp; Attribution Log
          </h2>
          <p className="text-xs text-slate-400">
            Showing {filteredAndSorted.length.toLocaleString()} aggregated records
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search project, user, agent, SKU..."
              aria-label="Search usage table"
              className="h-9 w-64 rounded-lg border border-slate-700/80 bg-slate-950 pl-8 pr-3 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={filteredAndSorted.length === 0}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-medium text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Download CSV
          </button>
        </div>
      </div>

      {isLoading && rows.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-10 w-full animate-pulse rounded-lg bg-slate-800/50"
            />
          ))}
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 text-center">
          <p className="text-sm font-medium text-slate-300">
            No matching usage records found
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Try clearing your search query or adjusting the top bar filters.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  {(
                    [
                      ['timestamp', 'Date / Time'],
                      ['projectName', 'Project'],
                      ['userId', 'User'],
                      ['agentId', 'Agent'],
                      ['skuDescription', 'Model / SKU'],
                      ['inputTokens', 'Input Tokens'],
                      ['outputTokens', 'Output Tokens'],
                      ['totalTokens', 'Total Tokens'],
                      ['costUsd', 'Cost (USD)'],
                    ] as Array<[SortKey, string]>
                  ).map(([key, title]) => {
                    const isNumeric =
                      key === 'inputTokens' ||
                      key === 'outputTokens' ||
                      key === 'totalTokens' ||
                      key === 'costUsd';
                    return (
                      <th
                        key={key}
                        className={`whitespace-nowrap border-b border-slate-800 px-3.5 py-3 font-medium ${
                          isNumeric ? 'text-right' : 'text-left'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(key)}
                          className={`inline-flex items-center gap-1 hover:text-slate-200 ${
                            isNumeric ? 'flex-row-reverse' : ''
                          }`}
                        >
                          {title}
                          {renderSortIcon(key)}
                        </button>
                      </th>
                    );
                  })}
                  <th className="whitespace-nowrap border-b border-slate-800 px-3.5 py-3 text-left font-medium">
                    Source
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 bg-slate-900/40">
                {pageRows.map((row, idx) => (
                  <tr
                    key={`${row.timestamp}-${row.projectId}-${row.userId}-${row.agentId}-${row.skuDescription}-${idx}`}
                    className="transition hover:bg-slate-800/40"
                  >
                    <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-slate-300">
                      {formatTimestamp(row.timestamp, granularity)}
                    </td>
                    <td className="max-w-[180px] truncate px-3.5 py-2.5 text-slate-200" title={row.projectId}>
                      {row.projectName}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5">
                      {row.userId === 'unassigned' ? (
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-400">
                          unassigned
                        </span>
                      ) : (
                        <span className="text-slate-200">{row.userId}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5">
                      {row.agentId === 'unassigned' ? (
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-400">
                          unassigned
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-300">
                          {row.agentId}
                        </span>
                      )}
                    </td>
                    <td className="max-w-[220px] truncate px-3.5 py-2.5 text-slate-300" title={row.skuDescription}>
                      {row.skuDescription}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-mono text-blue-300">
                      {formatExactNumber(row.inputTokens)}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-mono text-violet-300">
                      {formatExactNumber(row.outputTokens)}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-mono font-semibold text-white">
                      {formatExactNumber(row.totalTokens)}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-mono font-medium text-emerald-300">
                      {formatUsd(row.costUsd)}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5">
                      {row.dataSource === 'realtime_estimated' ? (
                        <span className="inline-flex items-center rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
                          Live Est.
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                          Reconciled
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span>
                Page {safePage} of {totalPages}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
