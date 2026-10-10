import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SnapshotNoteInput } from "@/components/SnapshotNoteInput";

// PRD 4.2「快照備註」第 1、2 點
describe("SnapshotNoteInput", () => {
  it("顯示欄位標籤、提示文字與用途說明", () => {
    render(<SnapshotNoteInput value="" onChange={vi.fn()} />);

    const input = screen.getByLabelText("快照備註（選填）");
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("placeholder", "例如：買房、換工作");
    // 說明是輸入框的描述，不併入名稱
    expect(input).toHaveAccessibleName("快照備註（選填）");
    expect(input).toHaveAccessibleDescription(
      "記下這一天發生的事，會顯示在趨勢圖節點與歷史快照。"
    );
  });

  it("顯示目前的備註", () => {
    render(<SnapshotNoteInput value="買房" onChange={vi.fn()} />);

    expect(screen.getByLabelText("快照備註（選填）")).toHaveValue("買房");
  });

  it("輸入時把內容原樣交給 onChange，不在輸入過程中修剪空白", () => {
    const onChange = vi.fn();
    render(<SnapshotNoteInput value="" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("快照備註（選填）"), {
      target: { value: "換工作 " },
    });

    expect(onChange).toHaveBeenCalledWith("換工作 ");
  });

  // PRD 第 9 節 #72d
  it("是單行文字輸入框，長度上限 50 字", () => {
    render(<SnapshotNoteInput value="" onChange={vi.fn()} />);

    const input = screen.getByLabelText("快照備註（選填）");
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("maxlength", "50");
  });
});
