import { test, expect } from "../fixtures/tauri-mocks";
import { MOCK_BROWSER_DATA, MOCK_TRACKS } from "../fixtures/mock-data";

test.describe("Library — empty state", () => {
  test("shows empty state when no library is set", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Add your music library")).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose Folder" })).toBeVisible();
  });
});

test.describe("Library — with data", () => {
  test.beforeEach(async ({ page, tauriMocks }) => {
    await tauriMocks.override({
      get_library_location: "/music",
      get_library_browser_data: MOCK_BROWSER_DATA,
      get_library_tracks: MOCK_TRACKS,
    });
    await page.goto("/");
  });

  test("renders track table with tracks", async ({ page }) => {
    await expect(page.getByText("First Song")).toBeVisible();
    await expect(page.getByText("Second Song")).toBeVisible();
    await expect(page.getByText("Third Song")).toBeVisible();
  });

  test("shows track count", async ({ page }) => {
    await expect(page.getByText("5 tracks")).toBeVisible();
  });

  test("renders column browser with genres, artists, albums", async ({ page }) => {
    await expect(page.getByText("All Genres (2)")).toBeVisible();
    await expect(page.getByText("All Artists (3)")).toBeVisible();
    await expect(page.getByText("All Albums (3)")).toBeVisible();

    // Individual genre entries in column browser (buttons, not table cells)
    await expect(page.getByRole("button", { name: "Electronic" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rock" })).toBeVisible();
  });

  test("column browser filters by genre", async ({ page, tauriMocks }) => {
    // Set filtered response at runtime before the click triggers a re-fetch
    const filteredData = {
      tracks: MOCK_TRACKS.filter((t) => t.genre === "Rock"),
      genres: MOCK_BROWSER_DATA.genres,
      artists: [{ name: "Artist B", track_count: 2, album_count: 1 }],
      albums: [
        { name: "Album Two", artist: "Artist B", year: 2022, track_count: 2, folder_path: "/music/Artist B/Album Two" },
      ],
    };
    await tauriMocks.setResponses({ get_library_browser_data: filteredData });

    // Click the Rock genre in the column browser
    await page.getByRole("button", { name: "Rock" }).click();

    // Should show filtered artists and albums
    await expect(page.getByText("All Artists (1)")).toBeVisible();
    await expect(page.getByText("All Albums (1)")).toBeVisible();
    await expect(page.getByText("2 tracks")).toBeVisible();
  });

  test("search input filters tracks", async ({ page, tauriMocks }) => {
    const filteredData = {
      tracks: MOCK_TRACKS.filter((t) => t.title?.toLowerCase().includes("first")),
      genres: MOCK_BROWSER_DATA.genres,
      artists: MOCK_BROWSER_DATA.artists,
      albums: MOCK_BROWSER_DATA.albums,
    };
    await tauriMocks.setResponses({ get_library_browser_data: filteredData });

    await page.getByPlaceholder("Search...").fill("first");
    // After debounce, should re-fetch with search filter
    await expect(page.getByText("1 tracks")).toBeVisible({ timeout: 2000 });
  });

  test("shows search input with keyboard shortcut hint", async ({ page }) => {
    await expect(page.getByPlaceholder("Search... (⌘F)")).toBeVisible();
  });

  test("shows column headers in track table", async ({ page }) => {
    // Use columnheader role to target headers specifically
    await expect(page.getByRole("columnheader", { name: "Title" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Artist/ })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Album/ })).toBeVisible();
  });
});
