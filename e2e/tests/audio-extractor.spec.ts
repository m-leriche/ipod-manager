import { test, expect } from "../fixtures/tauri-mocks";

test.describe("AudioExtractor", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Tools" }).click();
    await page.getByRole("button", { name: "Audio Extractor" }).click();
  });

  test("shows YouTube and Local Video toggle buttons", async ({ page }) => {
    await expect(page.getByRole("button", { name: "YouTube" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Local Video" })).toBeVisible();
  });

  test("defaults to YouTube mode", async ({ page }) => {
    await expect(page.getByText("Paste a YouTube URL to download audio")).toBeVisible();
  });

  test("YouTube mode shows URL input", async ({ page }) => {
    await expect(page.getByPlaceholder(/youtube\.com/i)).toBeVisible();
  });

  test("switches to Local Video mode", async ({ page }) => {
    await page.getByRole("button", { name: "Local Video" }).click();
    await expect(page.getByText("Select a video file to extract audio")).toBeVisible();
  });

  test("Local Video mode shows file picker prompt", async ({ page }) => {
    await page.getByRole("button", { name: "Local Video" }).click();
    await expect(page.getByText("No file selected")).toBeVisible();
  });

  test("switches back to YouTube from Local Video", async ({ page }) => {
    await page.getByRole("button", { name: "Local Video" }).click();
    await expect(page.getByText("Select a video file to extract audio")).toBeVisible();

    await page.getByRole("button", { name: "YouTube" }).click();
    await expect(page.getByText("Paste a YouTube URL to download audio")).toBeVisible();
  });

  test("YouTube mode shows format toggle", async ({ page }) => {
    await expect(page.getByRole("button", { name: "FLAC" })).toBeVisible();
    await expect(page.getByRole("button", { name: "MP3" })).toBeVisible();
  });

  test("Local Video mode shows format toggle", async ({ page }) => {
    await page.getByRole("button", { name: "Local Video" }).click();
    await expect(page.getByRole("button", { name: "FLAC" })).toBeVisible();
    await expect(page.getByRole("button", { name: "MP3" })).toBeVisible();
  });
});
