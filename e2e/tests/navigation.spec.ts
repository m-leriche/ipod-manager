import { test, expect } from "../fixtures/tauri-mocks";

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("app loads and shows header", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Crate" })).toBeVisible();
  });

  test("shows Library and Tools top-level tabs", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Library", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Tools" })).toBeVisible();
  });

  test("defaults to Library tab", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Library", exact: true })).toHaveAttribute("aria-selected", "true");
  });

  test("switches to Tools tab and shows sub-tabs", async ({ page }) => {
    await page.getByRole("tab", { name: "Tools" }).click();

    await expect(page.getByRole("tab", { name: "iPod" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "File Manager" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Metadata" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Audio Extractor" })).toBeVisible();
  });

  test("switches between tool sub-tabs", async ({ page }) => {
    await page.getByRole("tab", { name: "Tools" }).click();

    // Default tool tab is File Manager
    await expect(page.getByText("Choose a folder to explore")).toBeVisible();

    // Switch to Metadata
    await page.getByRole("tab", { name: "Metadata" }).click();
    await expect(page.getByText("Drag from Finder to scan metadata")).toBeVisible();

    // Switch to Audio Extractor
    await page.getByRole("tab", { name: "Audio Extractor" }).click();
    await expect(page.getByRole("tab", { name: "Audio Extractor" })).toBeVisible();

    // Switch to iPod
    await page.getByRole("tab", { name: "iPod" }).click();
    await expect(page.getByRole("tab", { name: "iPod" })).toBeVisible();
  });

  test("can switch back to Library from Tools", async ({ page }) => {
    await page.getByRole("tab", { name: "Tools" }).click();
    await expect(page.getByRole("tab", { name: "File Manager" })).toBeVisible();

    await page.getByRole("tab", { name: "Library", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Library", exact: true })).toHaveAttribute("aria-selected", "true");
  });

  test("keyboard shortcut opens shortcuts dialog", async ({ page }) => {
    // Dispatch a keydown matching the shortcut registry's default binding
    // (mod + Slash). The registry matches on KeyboardEvent.code.
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "/", code: "Slash", ctrlKey: true, bubbles: true }));
    });
    await expect(page.getByText("Keyboard Shortcuts")).toBeVisible();
  });
});
