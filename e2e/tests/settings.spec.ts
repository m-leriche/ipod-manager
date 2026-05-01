import { test, expect } from "../fixtures/tauri-mocks";

test.describe("Settings Modal", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("opens settings modal via open-settings event", async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__TAURI_MOCK_EMIT__("open-settings", null);
    });

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByText("Library Location")).toBeVisible();
  });

  test("shows library location with path when configured", async ({ page, tauriMocks }) => {
    await tauriMocks.setResponses({ get_library_location: "/music/library" });

    await page.evaluate(() => {
      (window as any).__TAURI_MOCK_EMIT__("open-settings", null);
    });

    await expect(page.getByText("/music/library")).toBeVisible();
    await expect(page.getByText("Change")).toBeVisible();
  });

  test("shows 'Not configured' when no library set", async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__TAURI_MOCK_EMIT__("open-settings", null);
    });

    await expect(page.getByText("Not configured")).toBeVisible();
  });

  test("shows theme selector with theme options", async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__TAURI_MOCK_EMIT__("open-settings", null);
    });

    await expect(page.getByText("Theme", { exact: true })).toBeVisible();
    // Theme buttons have format: "ThemeName Description"
    await expect(page.getByRole("button", { name: /Dark/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Windows 95/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Winamp/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Terminal/ })).toBeVisible();
  });

  test("closes on Escape key", async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__TAURI_MOCK_EMIT__("open-settings", null);
    });

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Settings" })).not.toBeVisible();
  });

  test("closes on X button click", async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__TAURI_MOCK_EMIT__("open-settings", null);
    });

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    // Click the X close button
    await page.getByRole("button", { name: "×" }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).not.toBeVisible();
  });
});
