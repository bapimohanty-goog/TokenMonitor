import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { FilterOption } from '../types/analytics';

interface MultiSelectDropdownProps {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

export function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  disabled = false,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const filteredOptions = options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(search.toLowerCase()) ||
      opt.id.toLowerCase().includes(search.toLowerCase())
  );

  const toggleOption = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((item) => item !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const summaryText =
    selected.length === 0
      ? `All ${label}s`
      : selected.length === 1
        ? options.find((o) => o.id === selected[0])?.label ?? selected[0]
        : `${selected.length} ${label}s`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-9 items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900 px-3 text-sm text-slate-200 transition hover:border-slate-600 hover:bg-slate-800/80 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="text-xs font-medium text-slate-400">{label}:</span>
        <span className="max-w-[140px] truncate font-medium text-slate-100">
          {summaryText}
        </span>
        {selected.length > 0 && (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Clear ${label} filter`}
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                onChange([]);
              }
            }}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-700 hover:text-slate-100"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute left-0 z-50 mt-2 w-72 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl shadow-black/50"
        >
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Filter ${label.toLowerCase()}s...`}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="mb-1.5 flex items-center justify-between px-1 text-[11px] text-slate-400">
            <span>{options.length} available</span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="font-medium text-blue-400 hover:text-blue-300"
              >
                Clear ({selected.length})
              </button>
            )}
          </div>

          <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
            {filteredOptions.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-500">
                No matching {label.toLowerCase()}s
              </p>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selected.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleOption(opt.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                      isSelected
                        ? 'bg-blue-500/15 text-blue-200'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="truncate pr-2">
                      {opt.label}
                      {opt.id === 'unassigned' && (
                        <span className="ml-1.5 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                          unlabelled
                        </span>
                      )}
                    </span>
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        isSelected
                          ? 'border-blue-500 bg-blue-500 text-white'
                          : 'border-slate-600 bg-slate-950'
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
