import { useEffect, useRef, useState } from "react";
import { toSafeNumber } from "@/lib/calculations";

interface UseNumberInputTextOptions {
  value: number;
  onChange: (value: number) => void;
  min?: number;
}

/** 過濾成合法的數字字串：只保留數字、最多一個開頭負號（若允許）、最多一個小數點。 */
function sanitizeNumericText(raw: string, allowNegative: boolean): string {
  let s = raw.replaceAll(/[^0-9.-]/g, "");
  s = s.startsWith("-")
    ? "-" + s.slice(1).replaceAll("-", "")
    : s.replaceAll("-", "");
  if (!allowNegative) s = s.replaceAll("-", "");

  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replaceAll(".", "");
  }
  return s;
}

/**
 * 數字輸入框的受控文字狀態管理。
 *
 * 若直接把 `value`（數字）當成 <input> 的 value，欄位顯示 0 時使用者從頭打字，
 * 游標容易插在既有的「0」前面，導致輸入 1000 卻變成 01000。改為維護獨立的
 * 文字字串狀態：數值為 0 時顯示空字串、聚焦時全選內容，確保打字一律是覆蓋而非插入。
 *
 * 顯示文字本身也即時過濾非數字字元，並在 `min >= 0` 時擋掉負號——不只是把最終算出的
 * 數值 clamp 到 0，而是連畫面上都不該讓使用者看到自己「打得出」負數或文字。
 */
export function useNumberInputText({
  value,
  onChange,
  min,
}: UseNumberInputTextOptions) {
  const allowNegative = min === undefined || min < 0;
  const [text, setText] = useState(() => (value === 0 ? "" : String(value)));
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) {
      setText(value === 0 ? "" : String(value));
    }
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const sanitized = sanitizeNumericText(e.target.value, allowNegative);
    setText(sanitized);
    const next = toSafeNumber(sanitized);
    onChange(min !== undefined ? Math.max(min, next) : next);
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    isFocused.current = true;
    e.target.select();
  }

  function handleBlur() {
    isFocused.current = false;
    setText(value === 0 ? "" : String(value));
  }

  return { text, handleChange, handleFocus, handleBlur };
}
