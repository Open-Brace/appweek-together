import { defineConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";

mkdirSync(".artifacts", { recursive: true });
export default defineConfig({
  testDir: "./tests",
  outputDir: ".artifacts/test-results",
  timeout: 120000,
  expect: { timeout: 20000 },
  workers: 1,
  use: {
    baseURL: process.env.TEST_URL ?? "http://localhost:3000",
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    },
    trace: "retain-on-failure",
  },
  reporter: [["list"], ["json", { outputFile: ".artifacts/test-results.json" }]],
});
