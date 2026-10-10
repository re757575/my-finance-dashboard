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
  "h-9 rounded-md border border-slate-200 bg-white dark:border-input dark:bg-input/30 px-2 text-base md:text-sm";

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
 * null 預設代表「該筆快照沒有這個項目」（標示新增／已移除、以 0 計算增減）；
 * nullMeans 為 "unavailable" 時代表「該筆快照算不出這個數值」，不標示也不計算增減。
 */
function ComparisonTableRow({
  row,
  kind = "amount",
  nullMeans = "missing-item",
}: {
  row: ComparisonRow;
  kind?: "amount" | "ratio";
  nullMeans?: "missing-item" | "unavailable";
}) {
  const isRatio = kind === "ratio";
  const showItemBadges = nullMeans === "missing-item";
  const isComparable =
    showItemBadges || (row.base !== null && row.target !== null);
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
        {showItemBadges && row.base === null && (
          <span className="ml-2 rounded-full bg-sky-50 dark:bg-sky-950 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
            新增
          </span>
        )}
        {showItemBadges && row.target === null && (
          <span className="ml-2 rounded-full bg-slate-100 dark:bg-muted px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-neutral-300">
            已移除
          </span>
        )}
      </th>
      <td className="text-xs whitespace-nowrap text-slate-500 dark:text-neutral-400 sm:px-2 sm:py-1.5 sm:text-right sm:text-sm">
        {row.base === null ? "—" : formatValue(row.base)}
      </td>
      <td className="text-xs whitespace-nowrap text-slate-900 dark:text-neutral-50 before:mr-1 before:text-slate-400 dark:before:text-neutral-400 before:content-['→'] sm:px-2 sm:py-1.5 sm:text-right sm:text-sm sm:before:content-none">
        {row.target === null ? "—" : formatValue(row.target)}
      </td>
      <td className="ml-auto text-xs whitespace-nowrap sm:ml-0 sm:py-1.5 sm:pl-2 sm:text-right sm:text-sm">
        {isComparable ? (
          <DeltaText
            delta={displayDelta}
            percent={row.percent}
            formatValue={isRatio ? formatPoints : formatCurrency}
          />
        ) : (
          <span className="text-slate-400 dark:text-neutral-400">—</span>
        )}
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
    <tbody className="block border-t border-slate-100 dark:border-border sm:table-row-group">
      <tr className="block sm:table-row">
        <th
          scope="colgroup"
          colSpan={4}
          className="block pt-3 pb-1 text-left text-xs font-semibold text-slate-500 dark:text-neutral-400 sm:table-cell"
        >
          {title}
        </th>
      </tr>
      {children.length === 0 && emptyText ? (
        <tr className="block sm:table-row">
          <td
            colSpan={4}
            className="block py-1.5 text-slate-400 dark:text-neutral-400 sm:table-cell"
          >
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
        <h2 className="text-lg font-semibold text-slate-800 dark:text-neutral-100">
          快照比較
        </h2>
        {base && target && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-neutral-300">
            {/* 每組「標籤＋選單」各自成對，窄螢幕換行時不會把標籤與選單拆開 */}
            <span className="flex items-center gap-2">
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
            </span>
            <span className="flex items-center gap-2">
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
            </span>
          </div>
        )}
      </div>

      {!base || !target ? (
        <p
          data-testid="snapshot-comparison-empty"
          className="rounded-xl bg-white dark:bg-card p-4 text-sm text-slate-400 dark:text-neutral-400 shadow-sm"
        >
          至少需要 2 筆已存檔的快照才能比較
        </p>
      ) : comparison === null ? (
        <p
          data-testid="snapshot-comparison-same-date"
          className="rounded-xl bg-white dark:bg-card p-4 text-sm text-slate-400 dark:text-neutral-400 shadow-sm"
        >
          請選擇兩筆不同的快照
        </p>
      ) : (
        <div className="rounded-xl bg-white dark:bg-card p-4 shadow-sm">
          <table
            data-testid="snapshot-comparison-table"
            className="block w-full text-sm text-slate-700 dark:text-neutral-200 sm:table"
          >
            {/* 窄螢幕不顯示欄位標題：兩個日期已在上方的下拉選單 */}
            <thead className="hidden sm:table-header-group">
              <tr className="text-xs text-slate-500 dark:text-neutral-400">
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
            {/* 負債組只比本金，質押未還本時恆為持平；擔保品與維持率的變化另列一組，兩筆皆無質押負債時整組不顯示 */}
            {comparison.pledgeCollaterals.length > 0 && (
              <ComparisonGroup title="質押">
                {[
                  <ComparisonTableRow
                    key={comparison.pledgeMaintenanceRatio.key}
                    row={comparison.pledgeMaintenanceRatio}
                    kind="ratio"
                    nullMeans="unavailable"
                  />,
                  <ComparisonTableRow
                    key={comparison.pledgeCollateralTotal.key}
                    row={comparison.pledgeCollateralTotal}
                  />,
                  ...comparison.pledgeCollaterals.map((row) => (
                    <ComparisonTableRow key={row.key} row={row} />
                  )),
                ]}
              </ComparisonGroup>
            )}
            {/* 比較的是每月投入金額的調整，不是期間累計投入；兩筆皆無定期定額時整組不顯示 */}
            {comparison.recurringInvestments.length > 0 && (
              <ComparisonGroup title="每月定期定額">
                {[
                  <ComparisonTableRow
                    key={comparison.recurringInvestmentTotal.key}
                    row={comparison.recurringInvestmentTotal}
                  />,
                  ...comparison.recurringInvestments.map((row) => (
                    <ComparisonTableRow key={row.key} row={row} />
                  )),
                ]}
              </ComparisonGroup>
            )}
          </table>
        </div>
      )}
    </section>
  );
}
