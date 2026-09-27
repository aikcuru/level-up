const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  retries: 0,
  reporter: "list",

  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
      },
    },
    {
      name: "webkit",
      use: {
        browserName: "webkit",
      },
    },
  ],

  webServer: {
    command: "python -m http.server 4173 --bind 127.0.0.1",
    url: "http://127.0.0.1:4173/index.html",
    reuseExistingServer: false,
    timeout: 15000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
