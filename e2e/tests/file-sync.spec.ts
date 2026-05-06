import { test, expect } from "../fixtures/tauri-mocks";
import { MOCK_FILE_MANAGER_SYNC_PROFILES, MOCK_COMPARE_ENTRIES } from "../fixtures/mock-data";

test.describe("File Sync (Sync mode)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Tools" }).click();
    await page.getByRole("button", { name: "File Manager" }).click();
  });

  test("shows empty state when no profile selected", async ({ page }) => {
    await expect(page.getByText("Select or create a profile to get started")).toBeVisible();
  });

  test("loads saved sync profile and switches to sync mode", async ({ page, tauriMocks }) => {
    await tauriMocks.override({
      get_file_manager_profiles: { ...MOCK_FILE_MANAGER_SYNC_PROFILES, active_profile: "iPod Sync" },
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Tools" }).click();
    await page.getByRole("button", { name: "File Manager" }).click();

    const profileSelect = page.getByRole("combobox").first();
    await expect(profileSelect).toHaveValue("iPod Sync");
    await expect(page.getByText("/music", { exact: true })).toBeVisible();
    await expect(page.getByText("/Volumes/IPOD/Music")).toBeVisible();
  });

  test("shows Source and Target labels in sync mode", async ({ page, tauriMocks }) => {
    await tauriMocks.override({
      get_file_manager_profiles: { ...MOCK_FILE_MANAGER_SYNC_PROFILES, active_profile: "iPod Sync" },
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Tools" }).click();
    await page.getByRole("button", { name: "File Manager" }).click();

    await expect(page.getByText("Source")).toBeVisible();
    await expect(page.getByText("Target")).toBeVisible();
  });

  test("Compare button is enabled when both paths are set", async ({ page, tauriMocks }) => {
    await tauriMocks.override({
      get_file_manager_profiles: { ...MOCK_FILE_MANAGER_SYNC_PROFILES, active_profile: "iPod Sync" },
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Tools" }).click();
    await page.getByRole("button", { name: "File Manager" }).click();

    const compareBtn = page.getByRole("button", { name: "Compare Folders" });
    await expect(compareBtn).toBeVisible();
    await expect(compareBtn).toBeEnabled();
  });

  test("shows comparison view after clicking Compare", async ({ page, tauriMocks }) => {
    await tauriMocks.override({
      get_file_manager_profiles: { ...MOCK_FILE_MANAGER_SYNC_PROFILES, active_profile: "iPod Sync" },
      compare_directories: MOCK_COMPARE_ENTRIES,
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Tools" }).click();
    await page.getByRole("button", { name: "File Manager" }).click();

    await page.getByRole("button", { name: "Compare Folders" }).click();

    await expect(page.getByRole("button", { name: "Tree" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Split" })).toBeVisible();
  });
});
