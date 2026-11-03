import React, { useLayoutEffect, useRef, useState } from 'react';
import { niceTicks } from '../lib/statsFormat';

// Chart colors, validated with the dataviz palette checker on the white card
// surface: blue/orange pass every categorical check; the context gray clears
// 3:1 and is CVD-separable from blue (it is a de-emphasis gray, not a series).
export const CHART = {
  blue: '#2a78d6',
  orange: '#eb6834',
  context: '#8f8e88',
  neutral: '#c3c2b7',
  grid: '#e1e0d9',
  baseline: '#c3c2b7',
  axisText: '#64748b',
  surface: '#ffffff',
  hover: '#f1f5f9',
};

function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setWidth(el.clientWidth || fallback);
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [fallback]);
  return [ref, width] as const;
}

// ---------------------------------------------------------------------------
// Card with title, legend and a table-view toggle (the accessible twin).

export interface LegendItem {
  label: string;
  color: string;
}

export interface TableData {
  columns: string[];
  rows: Array<Array<string | number>>;
}

export const DataTable: React.FC<{ table: TableData; caption?: string }> = ({ table, caption }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm text-left">
      {caption ? <caption className="sr-only">{caption}</caption> : null}
      <thead>
        <tr className="border-b border-slate-200 text-slate-500">
          {table.columns.map((column, i) => (
            <th key={column} scope="col" className={`py-2 pr-4 font-semibold ${i > 0 ? 'text-right' : ''}`}>
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="[font-variant-numeric:tabular-nums]">
        {table.rows.map((row) => (
          <tr key={String(row[0])} className="border-b border-slate-100 last:border-0">
            {row.map((cell, i) => (
              <td key={i} className={`py-2 pr-4 ${i > 0 ? 'text-right text-slate-700' : 'text-slate-900'}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const ChartCard: React.FC<{
  title: string;
  subtitle?: string;
  legend?: LegendItem[];
  table?: TableData;
  children: React.ReactNode;
}> = ({ title, subtitle, legend, table, children }) => {
  const [showTable, setShowTable] = useState(false);
  return (
    <figure className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 m-0 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <figcaption>
          <h2 className="text-xl font-black text-slate-900">{title}</h2>
          {subtitle ? <p className="text-sm text-slate-500 mt-1">{subtitle}</p> : null}
        </figcaption>
        {table ? (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
            className="text-sm font-semibold text-[#173A45] border border-slate-300 rounded-full px-4 py-1.5 hover:border-[#173A45]"
          >
            {showTable ? 'Show chart' : 'Show table'}
          </button>
        ) : null}
      </div>
      {legend && legend.length > 1 ? (
        <ul className="flex flex-wrap gap-x-5 gap-y-1 mb-3 text-sm text-slate-600" aria-label="Legend">
          {legend.map((item) => (
            <li key={item.label} className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="inline-block w-3 h-3 rounded-sm" style={{ background: item.color }} />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
      {showTable && table ? <DataTable table={table} caption={title} /> : children}
    </figure>
  );
};

// ---------------------------------------------------------------------------
// Column chart: one or more stacked segments per column.

export interface ColumnSegment {
  label: string;
  value: number;
  color: string;
}

export interface Column {
  key: string;
  label: string;
  axisLabel: string;
  segments: ColumnSegment[];
}

function roundedTopPath(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.max(0, Math.min(r, w / 2, h));
  return [
    `M${x},${y + h}`,
    `L${x},${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `L${x + w - radius},${y}`,
    `Q${x + w},${y} ${x + w},${y + radius}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ');
}

interface TooltipState {
  x: number;
  y: number;
  column: Column;
}

export const ColumnChart: React.FC<{
  columns: Column[];
  height?: number;
  valueName: string;
  ariaLabel: string;
}> = ({ columns, height = 220, valueName, ariaLabel }) => {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<TooltipState | null>(null);

  const margin = { top: 20, right: 8, bottom: 28, left: 36 };
  const plotW = Math.max(40, width - margin.left - margin.right);
  const plotH = height;
  const totals = columns.map((c) => c.segments.reduce((sum, s) => sum + s.value, 0));
  const max = Math.max(0, ...totals);
  const ticks = niceTicks(max);
  const yMax = ticks[ticks.length - 1] || 1;
  const band = columns.length > 0 ? plotW / columns.length : plotW;
  const barW = Math.min(24, Math.max(2, band * 0.66));
  const y = (v: number) => margin.top + plotH - (v / yMax) * plotH;
  const maxIndex = totals.indexOf(max);
  const labelEvery = Math.max(1, Math.ceil(64 / band));
  const gap = 2;

  return (
    <div ref={ref} className="relative w-full" onPointerLeave={() => setTip(null)}>
      <svg
        width={width}
        height={margin.top + plotH + margin.bottom}
        role="img"
        aria-label={ariaLabel}
        className="block overflow-visible"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={margin.left}
              x2={margin.left + plotW}
              y1={y(t)}
              y2={y(t)}
              stroke={t === 0 ? CHART.baseline : CHART.grid}
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
            <text
              x={margin.left - 8}
              y={y(t)}
              dy="0.32em"
              textAnchor="end"
              fontSize={11}
              fill={CHART.axisText}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {t.toLocaleString('en-US')}
            </text>
          </g>
        ))}
        {columns.map((column, i) => {
          const cx = margin.left + band * i + band / 2;
          const x = cx - barW / 2;
          const nonZero = column.segments.filter((s) => s.value > 0);
          let base = 0;
          const hovered = tip?.column.key === column.key;
          return (
            <g key={column.key}>
              {hovered ? (
                <rect x={margin.left + band * i} y={margin.top} width={band} height={plotH} fill={CHART.hover} />
              ) : null}
              {nonZero.map((segment, s) => {
                const top = s === nonZero.length - 1;
                const y0 = y(base);
                const y1 = y(base + segment.value);
                base += segment.value;
                const h = Math.max(0, y0 - y1 - (s > 0 ? gap : 0));
                const yTop = y1;
                return top ? (
                  <path key={segment.label} d={roundedTopPath(x, yTop, barW, h, 4)} fill={segment.color} />
                ) : (
                  <rect key={segment.label} x={x} y={yTop} width={barW} height={h} fill={segment.color} />
                );
              })}
              {i === maxIndex && max > 0 ? (
                <text
                  x={cx}
                  y={y(max) - 6}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={600}
                  fill="#0f172a"
                >
                  {max.toLocaleString('en-US')}
                </text>
              ) : null}
              {i % labelEvery === 0 ? (
                <text x={cx} y={margin.top + plotH + 18} textAnchor="middle" fontSize={11} fill={CHART.axisText}>
                  {column.axisLabel}
                </text>
              ) : null}
              <rect
                x={margin.left + band * i}
                y={margin.top}
                width={band}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                role="graphics-symbol"
                aria-label={`${column.label}: ${totals[i]} ${valueName}${column.segments.length > 1 ? ` (${column.segments.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(', ')})` : ''}`}
                onPointerEnter={() => setTip({ x: cx, y: y(totals[i]), column })}
                onFocus={() => setTip({ x: cx, y: y(totals[i]), column })}
                onBlur={() => setTip(null)}
                className="outline-none focus:stroke-[#173A45] focus:stroke-2"
              />
            </g>
          );
        })}
      </svg>
      {tip ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 bg-white border border-slate-200 shadow-lg rounded-xl px-3 py-2 text-sm"
          style={{
            left: Math.min(Math.max(tip.x, 70), width - 70),
            top: Math.max(0, tip.y - 12),
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="text-slate-500 text-xs mb-1 whitespace-nowrap">{tip.column.label}</div>
          {tip.column.segments.map((segment) => (
            <div key={segment.label} className="flex items-center gap-2 whitespace-nowrap">
              <span aria-hidden="true" className="inline-block w-3 h-0.5" style={{ background: segment.color }} />
              <span className="font-bold text-slate-900">{segment.value.toLocaleString('en-US')}</span>
              <span className="text-slate-500">{segment.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tall segmented bar: one whole split into a few parts, shares printed inside.

export interface Part {
  label: string;
  value: number;
  color: string;
  ink: string; // label color inside the fill
}

export const SegmentedBar: React.FC<{ parts: Part[]; ariaLabel: string }> = ({ parts, ariaLabel }) => {
  const [ref, width] = useWidth<HTMLDivElement>();
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  const visible = parts.filter((p) => p.value > 0);
  const gaps = Math.max(0, visible.length - 1) * 2;
  return (
    <div ref={ref} role="group" aria-label={ariaLabel}>
      <div className="flex gap-[2px] h-7">
        {visible.map((part) => {
          const share = total > 0 ? part.value / total : 0;
          const px = share * (width - gaps);
          const text = `${Math.round(share * 100)}%`;
          return (
            <div
              key={part.label}
              tabIndex={0}
              title={`${part.label}: ${part.value} (${text})`}
              aria-label={`${part.label}: ${part.value} (${text})`}
              className="h-7 rounded flex items-center px-2 text-xs font-bold outline-none focus:ring-2 focus:ring-[#173A45] focus:ring-offset-1"
              style={{ flexGrow: part.value, flexBasis: 0, background: part.color, color: part.ink }}
            >
              {px >= text.length * 8 + 16 ? text : null}
            </div>
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-sm text-slate-600" aria-label="Legend">
        {parts.map((part) => (
          <li key={part.label} className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="inline-block w-3 h-3 rounded-sm" style={{ background: part.color }} />
            {part.label}
          </li>
        ))}
      </ul>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Stat tile and hero figure.

export const StatTile: React.FC<{ label: string; value: string; note?: string }> = ({ label, value, note }) => (
  <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
    <div className="text-sm font-semibold text-slate-500">{label}</div>
    <div className="text-3xl font-black text-slate-900 mt-1">{value}</div>
    {note ? <div className="text-sm text-slate-500 mt-1">{note}</div> : null}
  </div>
);
