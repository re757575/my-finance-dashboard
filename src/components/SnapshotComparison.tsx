import { useMemo, useState, type ReactNode } from "react";
import { DeltaText } from "@/components/charts/DeltaText";
import { formatCurrency, formatPercent } from "@/lib/format";
import { compareSnapshots, type ComparisonRow } from "@/lib/snapshotComparison";
import type { Snapshot } from "@/types/schema";

interface SnapshotComparisonProps {
  /** 所有已存檔快照（任意順序皆可，元件內依日期由新到舊排序）；不含今日未存檔的草稿。 */
  snapshots: Snapshot[];
}

const SELECT_CLASS =
  "h-9 rounded-md border border-slate-200 bg-white px-2 text-sm";

function formatPoints(value: number): string {
  return `${value.toFixed(1)} 個百分點`;
}

/** 四捨五入到畫面顯示的精度：金額到元、比例到小數一位。 */
function roundForDisplay(value: number, isRatio: boolean): number {
  return isRatio ? Math.round(value * 10) / 10 : Math.round(value);
}

/**
 * 比較表的一列。增減以「畫面上顯示的兩個數值」相減，讓表格自己對得起來，
 * 也避免浮點誤差或不足 1 元的差異顯示成「▲ $0」。
 * 窄螢幕時改為兩行：第一行項目名稱，第二行「基準日數值 → 對象日數值」與增減（PRD 7 節）。
 */
function ComparisonTableRow({
  row,
  kind = "amount",
}: {
  row: ComparisonRow;
  kind?: "amount" | "ratio";
}) {
  const isRatio = kind === "ratio";
  const formatValue = isRatio ? formatPercent : formatCurrency;
  const displayDelta = roundForDisplay(
    roundForDisplay(row.target ?? 0, isRatio) -
      roundForDisplay(row.base ?? 0, isRatio),
    isRatio
  );

  return (
    <tr
      data-testid={`comparison-row-${row.key}`}
      className="flex flex-wrap items-baseline gap-x-1 py-1.5 sm:table-row sm:py-0"
    >
      <th
        scope="row"
        className="w-full text-left font-normal sm:w-auto sm:py-1.5 sm:pr-2"
      >
        {row.label}
        {row.base === null && (
          <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
            新增
          </span>
        )}
        {row.target === null && (
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            已移除
          </span>
        )}
      </th>
      <td className="text-xs whitespace-nowrap text-slate-500 sm:px-2 sm:py-1.5 sm:text-right sm:text-sm">
        {row.base === null ? "—" : formatValue(row.base)}
      </td>
      <td className="text-xs whitespace-nowrap text-slate-900 before:mr-1 before:text-slate-400 before:content-['→'] sm:px-2 sm:py-1.5 sm:text-right sm:text-sm sm:before:content-none">
        {row.target === null ? "—" : formatValue(row.target)}
      </td>
      <td className="ml-auto text-xs whitespace-nowrap sm:ml-0 sm:py-1.5 sm:pl-2 sm:text-right sm:text-sm">
        <DeltaText
          delta={displayDelta}
          percent={row.percent}
          formatValue={isRatio ? formatPoints : formatCurrency}
        />
      </td>
    </tr>
  );
}

function ComparisonGroup({
  title,
  emptyText,
  children,
}: {
  title: string;
  /** 該組沒有任何列時顯示的文字。 */
  emptyText?: string;
  children: ReactNode[];
}) {
  return (
    <tbody className="block border-t border-slate-100 sm:table-row-group">
      <tr className="block sm:table-row">
        <th
          scope="colgroup"
          colSpan={4}
          className="block pt-3 pb-1 text-left text-xs font-semibold text-slate-500 sm:table-cell"
        >
          {title}
        </th>
      </tr>
      {children.length === 0 && emptyText ? (
        <tr className="block sm:table-row">
          <td colSpan={4} className="block py-1.5 text-slate-400 sm:table-cell">
            {emptyText}
          </td>
        </tr>
      ) : (
        children
      )}
    </tbody>
  );
}

/**
 * 快照比較區（PRD 4.2「快照比較」、5.10 節）：任選兩筆已存檔快照，逐項列出增減（對象日 − 基準日）。
 * 純即時計算，不寫入任何資料；比較結果只在選取的兩筆快照改變時重算，
 * 表單輸入造成的重新渲染不會觸發重算。
 */
export function SnapshotComparison({ snapshots }: SnapshotComparisonProps) {
  const [selectedBase, setSelectedBase] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...snapshots].sort((a, b) => b.date.localeCompare(a.date)),
    [snapshots]
  );

  // 預設比較最新兩筆；使用者選定的日期若已被刪除則回到預設值
  const findByDate = (date: string | null) =>
    date === null ? undefined : sorted.find((s) => s.date === date);
  const base = findByDate(selectedBase) ?? sorted[1];
  const target = findByDate(selectedTarget) ?? sorted[0];

  const comparison = useMemo(
    () =>
      base && target && base.date !== target.date
        ? compareSnapshots(base, target)
        : null,
    [base, target]
  );

  return (
    <section className="space-y-3" data-testid="snapshot-comparison">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-800">快照比較</h2>
        {base && target && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>從</span>
            <select
              aria-label="比較基準日"
              value={base.date}
              onChange={(e) => setSelectedBase(e.target.value)}
              className={SELECT_CLASS}
            >
              {sorted.map((s) => (
                <option key={s.date} value={s.date}>
                  {s.date}
                </option>
              ))}
            </select>
            <span>到</span>
            <select
              aria-label="比較對象日"
              value={target.date}
              onChange={(e) => setSelectedTarget(e.target.value)}
              className={SELECT_CLASS}
            >
              {sorted.map((s) => (
                <option key={s.date} value={s.date}>
                  {s.date}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!base || !target ? (
        <p
          data-testid="snapshot-comparison-empty"
          className="rounded-xl bg-white p-4 text-sm text-slate-400 shadow-sm"
        >
          至少需要 2 筆已存檔的快照才能比較
        </p>
      ) : comparison === null ? (
        <p
          data-testid="snapshot-comparison-same-date"
          className="rounded-xl bg-white p-4 text-sm text-slate-400 shadow-sm"
        >
          請選擇兩筆不同的快照
        </p>
      ) : (
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <table
            data-testid="snapshot-comparison-table"
            className="block w-full text-sm text-slate-700 sm:table"
          >
            {/* 窄螢幕不顯示欄位標題：兩個日期已在上方的下拉選單 */}
            <thead className="hidden sm:table-header-group">
              <tr className="text-xs text-slate-500">
                <th scope="col" className="pr-2 pb-1 text-left font-medium">
                  項目
                </th>
                <th scope="col" className="px-2 pb-1 text-right font-medium">
                  {comparison.baseDate}
                </th>
                <th scope="col" className="px-2 pb-1 text-right font-medium">
                  {comparison.targetDate}
                </th>
                <th scope="col" className="pb-1 pl-2 text-right font-medium">
                  增減
                </th>
              </tr>
            </thead>
            <ComparisonGroup title="總覽">
              {[
                ...comparison.summary.map((row) => (
                  <ComparisonTableRow key={row.key} row={row} />
                )),
                <ComparisonTableRow
                  key={comparison.debtRatio.key}
                  row={comparison.debtRatio}
                  kind="ratio"
                />,
              ]}
            </ComparisonGroup>
            <ComparisonGroup title="資產">
              {comparison.assets.map((row) => (
                <ComparisonTableRow key={row.key} row={row} />
              ))}
            </ComparisonGroup>
            <ComparisonGroup title="現金來源" emptyText="兩筆快照皆無現金來源">
              {comparison.cashSources.map((row) => (
                <ComparisonTableRow key={row.key} row={row} />
              ))}
            </ComparisonGroup>
            <ComparisonGroup title="負債" emptyText="兩筆快照皆無負債">
              {comparison.debts.map((row) => (
                <ComparisonTableRow key={row.key} row={row} />
              ))}
            </ComparisonGroup>
          </table>
        </div>
      )}
    </section>
  );
}
