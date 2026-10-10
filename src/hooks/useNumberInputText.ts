import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

/** 數值 → 編輯中的純數字文字：0 顯示空字串，方便直接覆蓋輸入。 */
function toPlainText(value: number): string {
  return value === 0 ? "" : String(value);
}

/**
 * 數值 → 未聚焦時顯示的文字：整數部分加千分位（如 5,487,138.5），小數部分原樣保留
 * （PRD 4.2「金額千分位顯示」）。
 */
export function formatGroupedNumberText(value: number): string {
  const plain = toPlainText(value);
  // 科學記號（極大／極小值）無從分組，原樣顯示
  if (plain === "" || plain.includes("e")) return plain;
  const [integer, fraction] = plain.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
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
 *
 * 未聚焦時以千分位顯示，方便核對位數；聚焦時還原成純數字再全選，編輯過程不會有逗號
 * 干擾游標位置（貼上含逗號的數字時，逗號會被上面的過濾規則去掉）。
 */
export function useNumberInputText({
  value,
  onChange,
  min,
}: UseNumberInputTextOptions) {
  const allowNegative = min === undefined || min < 0;
  const [text, setText] = useState(() => formatGroupedNumberText(value));
  const isFocused = useRef(false);
  // 聚焦時若文字由千分位換成純數字，要等重新渲染後才能全選（否則選取範圍會被新的 value 沖掉）
  const pendingSelect = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isFocused.current) {
      setText(formatGroupedNumberText(value));
    }
  }, [value]);

  useLayoutEffect(() => {
    pendingSelect.current?.select();
    pendingSelect.current = null;
  }, [text]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const sanitized = sanitizeNumericText(e.target.value, allowNegative);
    setText(sanitized);
    const next = toSafeNumber(sanitized);
    onChange(min !== undefined ? Math.max(min, next) : next);
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    isFocused.current = true;
    const plain = toPlainText(value);
    if (plain === text) {
      e.target.select();
      return;
    }
    pendingSelect.current = e.target;
    setText(plain);
  }

  function handleBlur() {
    isFocused.current = false;
    setText(formatGroupedNumberText(value));
  }

  return { text, handleChange, handleFocus, handleBlur };
}
