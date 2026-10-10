import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * 各清單標題列右側的「+ 新增…」按鈕。觸控裝置（`pointer: coarse`）上加高到 40px
 * （PRD 第 7 節「觸控目標」），滑鼠操作維持精簡尺寸。
 */
export function AddRowButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      className="pointer-coarse:h-10 pointer-coarse:px-3 pointer-coarse:text-sm"
    >
      {children}
    </Button>
  );
}
