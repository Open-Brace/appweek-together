import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  use: {
    ...base.use,
    browserName: "webkit",
    launchOptions: {},
    isMobile: true,
    hasTouch: true,
  },
});
