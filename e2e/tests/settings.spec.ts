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
    await expect(page.getByRole("button", { name: "Change", exact: true })).toBeVisible();
  });

  test("shows 'Not configured' when no library set", async ({ page, tauriMocks }) => {
    // Override library location to null and reload so the settings modal
    // can open (the welcome screen doesn't have settings access).
    // We still need a library location for the app to boot past the
    // welcome screen, so we set it, open settings, then clear it at runtime.
    await tauriMocks.setResponses({ get_library_location: null });

    await page.evaluate(() => {
      (window as any).__TAURI_MOCK_EMIT__("open-settings", null);
    });

    await expect(page.getByText("Not configured")).toBeVisible();
  });

  test("shows theme selector with theme options in the Appearance section", async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__TAURI_MOCK_EMIT__("open-settings", null);
    });

    await page.getByTestId("settings-nav-appearance").click();

    await expect(page.getByText("Theme", { exact: true })).toBeVisible();
    // Theme buttons have format: "ThemeName Description"
    await expect(page.getByRole("button", { name: /Dark/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Windows 95/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Winamp/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Spotify/ })).toBeVisible();
  });

  test("navigates between settings sections", async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__TAURI_MOCK_EMIT__("open-settings", null);
    });

    // General is the default section
    await expect(page.getByText("Library Location")).toBeVisible();
    await expect(page.getByTestId("resume-queue-toggle")).toBeVisible();

    await page.getByTestId("settings-nav-playback").click();
    await expect(page.getByTestId("crossfade-slider")).toBeVisible();

    await page.getByTestId("settings-nav-library").click();
    await expect(page.getByText("Default Sort")).toBeVisible();
    await expect(page.getByText("Tag Format")).toBeVisible();

    await page.getByTestId("settings-nav-shortcuts").click();
    await expect(page.getByTestId("shortcut-playPause")).toBeVisible();

    await page.getByTestId("settings-nav-connections").click();
    await expect(page.getByTestId("discover-toggle")).toBeVisible();
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
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).not.toBeVisible();
  });
});
