import { test, expect } from "../fixtures/tauri-mocks";
import { MOCK_FILE_ENTRIES } from "../fixtures/mock-data";

test.describe("File Explorer", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Tools" }).click();
    await page.getByRole("button", { name: "File Explorer" }).click();
  });

  test("shows empty state prompt", async ({ page }) => {
    await expect(page.getByText("Choose a folder to explore its contents")).toBeVisible();
  });

  test("shows folder picker label", async ({ page }) => {
    await expect(page.getByText("No folder selected")).toBeVisible();
  });

  test("loads profiles on mount and shows in dropdown", async ({ page, tauriMocks }) => {
    const profiles = {
      profiles: [{ name: "My Music", left_path: null, right_path: null, dual_pane: false, layout: "horizontal" }],
      active_profile: "My Music",
    };
    await tauriMocks.override({ get_browse_profiles: profiles });
    await page.goto("/");
    await page.getByRole("button", { name: "Tools" }).click();
    await page.getByRole("button", { name: "File Explorer" }).click();

    // Profile selector is a combobox — check it has the profile selected
    const profileSelect = page.getByRole("combobox").first();
    await expect(profileSelect).toHaveValue("My Music");
  });

  test("shows file list when folder has contents", async ({ page, tauriMocks }) => {
    const profiles = {
      profiles: [{ name: "Test", left_path: "/test/folder", right_path: null, dual_pane: false, layout: "horizontal" }],
      active_profile: "Test",
    };
    await tauriMocks.override({
      get_browse_profiles: profiles,
      list_directory: MOCK_FILE_ENTRIES,
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Tools" }).click();
    await page.getByRole("button", { name: "File Explorer" }).click();

    // Scope to main content to avoid Library tab bleeding
    await expect(page.getByText("readme.txt")).toBeVisible();
    await expect(page.getByText("notes.md")).toBeVisible();
    await expect(page.getByText("Photos")).toBeVisible();
  });

  test("shows Split button when folder is open", async ({ page, tauriMocks }) => {
    const profiles = {
      profiles: [{ name: "Test", left_path: "/test", right_path: null, dual_pane: false, layout: "horizontal" }],
      active_profile: "Test",
    };
    await tauriMocks.override({ get_browse_profiles: profiles, list_directory: [] });
    await page.goto("/");
    await page.getByRole("button", { name: "Tools" }).click();
    await page.getByRole("button", { name: "File Explorer" }).click();

    await expect(page.getByRole("button", { name: "Split" })).toBeVisible();
  });
});
