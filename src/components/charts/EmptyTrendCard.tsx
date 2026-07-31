/** 快照筆數 < 2 時的空狀態提示（PRD 4.2 節，決策 Q7 選項 B）。 */
export function EmptyTrendCard({ title }: { title: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{title}</p>
      <div className="mt-2 flex h-24 items-center justify-center rounded-lg bg-slate-50 px-4 text-center text-sm text-slate-400">
        持續使用滿 2 天即可查看趨勢
      </div>
    </div>
  );
}
