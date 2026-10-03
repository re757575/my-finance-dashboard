import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function renderTabs(defaultValue = "a") {
  render(
    <Tabs defaultValue={defaultValue}>
      <TabsList aria-label="測試分頁">
        <TabsTrigger value="a">甲</TabsTrigger>
        <TabsTrigger value="b">乙</TabsTrigger>
        <TabsTrigger value="c" className="extra-class">
          丙
        </TabsTrigger>
      </TabsList>
      <TabsContent value="a">甲的內容</TabsContent>
      <TabsContent value="b">乙的內容</TabsContent>
      <TabsContent value="c">丙的內容</TabsContent>
    </Tabs>
  );
}

const tab = (name: string) => screen.getByRole("tab", { name });

describe("Tabs", () => {
  it("提供 tablist／tab／tabpanel 語意，並以 aria-selected 標示選取中的分頁", () => {
    renderTabs();

    expect(
      screen.getByRole("tablist", { name: "測試分頁" })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(tab("甲")).toHaveAttribute("aria-selected", "true");
    expect(tab("乙")).toHaveAttribute("aria-selected", "false");
    expect(tab("丙")).toHaveAttribute("aria-selected", "false");
    // tabpanel 以選取中的分頁作為無障礙名稱
    expect(screen.getByRole("tabpanel", { name: "甲" })).toHaveTextContent(
      "甲的內容"
    );
  });

  it("只渲染選取中分頁的內容，其他分頁的內容不在 DOM 中", () => {
    renderTabs();

    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.queryByText("乙的內容")).not.toBeInTheDocument();
    expect(screen.queryByText("丙的內容")).not.toBeInTheDocument();
  });

  // Radix 的分頁在 mousedown（而非 click）時切換
  it("點選分頁後切換內容與 aria-selected", () => {
    renderTabs();

    fireEvent.mouseDown(tab("乙"));

    expect(tab("乙")).toHaveAttribute("aria-selected", "true");
    expect(tab("甲")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tabpanel", { name: "乙" })).toHaveTextContent(
      "乙的內容"
    );
    expect(screen.queryByText("甲的內容")).not.toBeInTheDocument();
  });

  it("左右方向鍵切換分頁並移動焦點，到頭尾時循環", async () => {
    renderTabs();

    tab("甲").focus();
    fireEvent.keyDown(tab("甲"), { key: "ArrowRight" });
    await waitFor(() =>
      expect(tab("乙")).toHaveAttribute("aria-selected", "true")
    );
    expect(tab("乙")).toHaveFocus();

    fireEvent.keyDown(tab("乙"), { key: "ArrowLeft" });
    await waitFor(() =>
      expect(tab("甲")).toHaveAttribute("aria-selected", "true")
    );
    expect(tab("甲")).toHaveFocus();

    // 在第一個分頁按左鍵會繞到最後一個
    fireEvent.keyDown(tab("甲"), { key: "ArrowLeft" });
    await waitFor(() =>
      expect(tab("丙")).toHaveAttribute("aria-selected", "true")
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent("丙的內容");
  });

  it("Home／End 跳到第一個／最後一個分頁", async () => {
    renderTabs();

    tab("甲").focus();
    fireEvent.keyDown(tab("甲"), { key: "End" });
    await waitFor(() =>
      expect(tab("丙")).toHaveAttribute("aria-selected", "true")
    );

    fireEvent.keyDown(tab("丙"), { key: "Home" });
    await waitFor(() =>
      expect(tab("甲")).toHaveAttribute("aria-selected", "true")
    );
  });

  // 分頁列在 Tab 鍵順序內只佔一站：焦點進入時落在選取中的分頁，而不是第一個
  it("鍵盤焦點進入分頁列時，落在選取中的分頁", () => {
    renderTabs("b");

    screen.getByRole("tablist").focus();

    expect(tab("乙")).toHaveFocus();
    expect(tab("乙")).toHaveAttribute("aria-selected", "true");
  });

  it("可透過 className 追加樣式", () => {
    renderTabs();

    expect(tab("丙")).toHaveClass("extra-class");
    expect(tab("丙")).toHaveAttribute("data-slot", "tabs-trigger");
  });
});
