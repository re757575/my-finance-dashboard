/** 畫面底部版本號，方便使用者回報問題時附上目前版本。 */
export function Footer() {
  return (
    <footer className="mt-8 text-center text-xs text-slate-400">
      個人資產負債儀表板 v{__APP_VERSION__}
    </footer>
  );
}
