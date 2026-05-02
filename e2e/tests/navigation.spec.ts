import { test, expect } from "../fixtures/tauri-mocks";

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("app loads and shows header", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Crate" })).toBeVisible();
  });

  test("shows Library and Tools top-level tabs", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Library", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tools" })).toBeVisible();
  });

  test("defaults to Library tab", async ({ page }) => {
    await expect(page.getByText("Add your music library")).toBeVisible();
  });

  test("switches to Tools tab and shows sub-tabs", async ({ page }) => {
    await page.getByRole("button", { name: "Tools" }).click();

    await expect(page.getByRole("button", { name: "iPod" })).toBeVisible();
    await expect(page.getByRole("button", { name: "File Explorer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "File Sync" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Metadata" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Audio Extractor" })).toBeVisible();
  });

  test("switches between tool sub-tabs", async ({ page }) => {
    await page.getByRole("button", { name: "Tools" }).click();

    // Default tool tab is File Explorer (browse)
    await expect(page.getByText("Choose a folder to explore its contents")).toBeVisible();

    // Switch to File Sync
    await page.getByRole("button", { name: "File Sync" }).click();
    await expect(page.getByRole("button", { name: "File Sync" })).toBeVisible();

    // Switch to Metadata
    await page.getByRole("button", { name: "Metadata" }).click();
    await expect(page.getByText("Drag from Finder to scan metadata")).toBeVisible();

    // Switch to Audio Extractor
    await page.getByRole("button", { name: "Audio Extractor" }).click();
    await expect(page.getByRole("button", { name: "Audio Extractor" })).toBeVisible();

    // Switch to iPod
    await page.getByRole("button", { name: "iPod" }).click();
    await expect(page.getByRole("button", { name: "iPod" })).toBeVisible();
  });

  test("can switch back to Library from Tools", async ({ page }) => {
    await page.getByRole("button", { name: "Tools" }).click();
    await expect(page.getByRole("button", { name: "File Explorer" })).toBeVisible();

    await page.getByRole("button", { name: "Library", exact: true }).click();
    await expect(page.getByText("Add your music library")).toBeVisible();
  });

  test("keyboard shortcut opens shortcuts dialog", async ({ page }) => {
    // Dispatch a keydown event matching the app's handler (metaKey || ctrlKey) + "/"
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "/", ctrlKey: true, bubbles: true }));
    });
    await expect(page.getByText("Keyboard Shortcuts")).toBeVisible();
  });
});
