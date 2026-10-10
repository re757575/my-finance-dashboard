import {
  isThemePreference,
  THEME_PREFERENCE_LABEL,
  THEME_PREFERENCES,
  type ThemePreference,
} from "@/lib/theme";

interface ThemeToggleProps {
  value: ThemePreference;
  onChange: (preference: ThemePreference) => void;
}

/** 頁首的「顯示主題」下拉選單：跟隨系統／淺色／深色（PRD 4.2「深色模式」）。 */
export function ThemeToggle({ value, onChange }: ThemeToggleProps) {
  return (
    <select
      aria-label="顯示主題"
      data-testid="theme-toggle"
      className="h-9 shrink-0 rounded-md border border-slate-200 bg-white px-2 text-base md:text-sm dark:border-input dark:bg-input/30"
      value={value}
      onChange={(e) => {
        if (isThemePreference(e.target.value)) onChange(e.target.value);
      }}
    >
      {THEME_PREFERENCES.map((preference) => (
        <option key={preference} value={preference}>
          {THEME_PREFERENCE_LABEL[preference]}
        </option>
      ))}
    </select>
  );
}
