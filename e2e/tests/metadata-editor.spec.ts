import { test, expect } from "../fixtures/tauri-mocks";

test.describe("MetadataEditor", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Tools" }).click();
    await page.getByRole("button", { name: "Metadata" }).click();
  });

  test("shows idle state with folder picker and drop zone", async ({ page }) => {
    await expect(page.getByText("Drag from Finder to scan metadata")).toBeVisible();
    await expect(page.getByText(/Drop audio files or folders here/)).toBeVisible();
  });

  test("shows scan button in toolbar", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Scan" })).toBeVisible();
  });

  test("shows browse button in toolbar", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Browse" })).toBeVisible();
  });

  test("remains on metadata tab after switching away and back", async ({ page }) => {
    // Switch to another tab
    await page.getByRole("button", { name: "File Manager" }).click();
    await expect(page.getByText("Choose a folder to explore")).toBeVisible();

    // Switch back to Metadata
    await page.getByRole("button", { name: "Metadata" }).click();
    await expect(page.getByText("Drag from Finder to scan metadata")).toBeVisible();
  });
});
