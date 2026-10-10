import { useEffect, useState } from "react";
import type { InputSectionKey } from "@/lib/inputSections";

type InputSectionState = Record<InputSectionKey, boolean>;

const ALL_OPEN: InputSectionState = {
  assets: true,
  debts: true,
  cashFlow: true,
  goals: true,
};

interface UseInputSectionsOptions {
  /** 初次讀取 LocalStorage 是否已完成；完成前無從判斷是不是回訪。 */
  hasLoaded: boolean;
  /** 是否已有已存檔快照（回訪）。 */
  hasSnapshots: boolean;
  /** 表單的負債清單是否含「質押」類別。 */
  hasPledgeDebt: boolean;
}

/**
 * 輸入區分段收合的展開狀態（PRD 4.2「輸入區分段收合」）：只存在 React state，不寫入 LocalStorage。
 *
 * 預設值在讀取完成時決定一次：首次使用（沒有快照）全部展開；回訪只展開「資產」，
 * 有質押負債時「負債」也展開（質押股票市值會隨股價變動，每次都要更新）。
 * 之後除了使用者自己切換，只有「清空到沒有任何快照」會把四個區塊全部展開——
 * 存下第一筆快照、匯入、載入範例資料都不會讓表單在操作當下突然變短。
 */
export function useInputSections({
  hasLoaded,
  hasSnapshots,
  hasPledgeDebt,
}: UseInputSectionsOptions) {
  // null：讀取完成前尚未決定，畫面上先全部展開
  const [open, setOpen] = useState<InputSectionState | null>(null);

  // 在讀取完成的同一次 render 內決定預設值，避免先畫出載入後的完整表單再收合
  if (hasLoaded && open === null) {
    setOpen(
      hasSnapshots
        ? { assets: true, debts: hasPledgeDebt, cashFlow: false, goals: false }
        : ALL_OPEN
    );
  }

  // 清空資料後每一欄都要重填
  useEffect(() => {
    if (hasLoaded && !hasSnapshots) setOpen(ALL_OPEN);
  }, [hasLoaded, hasSnapshots]);

  function toggle(key: InputSectionKey) {
    setOpen((prev) => {
      const current = prev ?? ALL_OPEN;
      return { ...current, [key]: !current[key] };
    });
  }

  return { open: open ?? ALL_OPEN, toggle };
}
