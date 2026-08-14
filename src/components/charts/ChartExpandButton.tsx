import { Maximize2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ChartExpandButtonProps {
  title: string;
  children: React.ReactNode;
}

/** 圖表卡片右上角的全螢幕展開按鈕，以 Dialog 放大顯示圖表（PRD 4.2、7 節）。 */
export function ChartExpandButton({ title, children }: ChartExpandButtonProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${title}全螢幕檢視`}
        >
          <Maximize2 className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
