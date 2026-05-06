import { test, expect } from "../fixtures/tauri-mocks";
import { MOCK_FILE_ENTRIES } from "../fixtures/mock-data";

test.describe("File Explorer (Browse mode)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Tools" }).click();
    await page.getByRole("button", { name: "File Manager" }).click();
  });

  test("shows empty state prompt when no profile selected", async ({ page }) => {
    await expect(page.getByText("Choose a folder to explore")).toBeVisible();
  });

  test("loads profiles on mount and shows in dropdown", async ({ page, tauriMocks }) => {
    const profiles = {
      profiles: [
        { name: "My Music", mode: "browse", left_path: null, right_path: null, dual_pane: false, layout: "horizontal", exclusions: [] },
      ],
      active_profile: "My Music",
    };
    await tauriMocks.override({ get_file_manager_profiles: profiles });
    await page.goto("/");
    await page.getByRole("button", { name: "Tools" }).click();
    await page.getByRole("button", { name: "File Manager" }).click();

    const profileSelect = page.getByRole("combobox").first();
    await expect(profileSelect).toHaveValue("My Music");
  });

  test("shows file list when folder has contents", async ({ page, tauriMocks }) => {
    const profiles = {
      profiles: [
        { name: "Test", mode: "browse", left_path: "/test/folder", right_path: null, dual_pane: false, layout: "horizontal", exclusions: [] },
      ],
      active_profile: "Test",
    };
    await tauriMocks.override({
      get_file_manager_profiles: profiles,
      list_directory: MOCK_FILE_ENTRIES,
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Tools" }).click();
    await page.getByRole("button", { name: "File Manager" }).click();

    await expect(page.getByText("readme.txt")).toBeVisible();
    await expect(page.getByText("notes.md")).toBeVisible();
    await expect(page.getByText("Photos")).toBeVisible();
  });

  test("shows Split button when folder is open", async ({ page, tauriMocks }) => {
    const profiles = {
      profiles: [
        { name: "Test", mode: "browse", left_path: "/test", right_path: null, dual_pane: false, layout: "horizontal", exclusions: [] },
      ],
      active_profile: "Test",
    };
    await tauriMocks.override({ get_file_manager_profiles: profiles, list_directory: [] });
    await page.goto("/");
    await page.getByRole("button", { name: "Tools" }).click();
    await page.getByRole("button", { name: "File Manager" }).click();

    await expect(page.getByRole("button", { name: "Split" })).toBeVisible();
  });
});
