import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BackupReminderBanner } from "@/components/BackupReminderBanner";

describe("BackupReminderBanner", () => {
  // PRD 第 9 節 #46a、#46e
  it("未達提醒條件時不渲染任何內容", () => {
    const { container } = render(
      <BackupReminderBanner
        reminder={{ shouldRemind: false, neverBackedUp: false, days: 30 }}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  // PRD 第 9 節 #46
  it("有備份紀錄且超過門檻：顯示距上次備份天數與建議", () => {
    render(
      <BackupReminderBanner
        reminder={{ shouldRemind: true, neverBackedUp: false, days: 31 }}
      />
    );

    const banner = screen.getByTestId("backup-reminder");
    expect(banner).toHaveTextContent("距上次備份已 31 天");
    expect(banner).toHaveTextContent("建議至左側「資料管理」匯出備份");
    expect(banner).not.toHaveTextContent("尚未備份過");
  });

  // PRD 第 9 節 #46b
  it("從未備份過：顯示「尚未備份過（第一筆資料已存在 N 天）」", () => {
    render(
      <BackupReminderBanner
        reminder={{ shouldRemind: true, neverBackedUp: true, days: 45 }}
      />
    );

    expect(screen.getByTestId("backup-reminder")).toHaveTextContent(
      "尚未備份過（第一筆資料已存在 45 天）"
    );
    expect(screen.getByTestId("backup-reminder")).not.toHaveTextContent(
      "距上次備份"
    );
  });

  it("以 status 角色呈現，方便輔助科技朗讀", () => {
    render(
      <BackupReminderBanner
        reminder={{ shouldRemind: true, neverBackedUp: false, days: 40 }}
      />
    );
    expect(screen.getByRole("status")).toBe(
      screen.getByTestId("backup-reminder")
    );
  });

  it("不提供永久關閉的按鈕（完成匯出後才會消失）", () => {
    render(
      <BackupReminderBanner
        reminder={{ shouldRemind: true, neverBackedUp: false, days: 40 }}
      />
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
