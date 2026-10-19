import { defineConfig, devices } from '@playwright/test';

// E2E_PORT : autre port si 4173 est déjà pris sur la machine (un autre serveur y serait réutilisé à tort).
const PORT = Number(process.env.E2E_PORT ?? 4173);

// Les tests tournent sur le build de production (npm run build), servi dans un sous-dossier.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/presidentielle-2027/`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx tsx e2e/static-server.ts`,
    url: `http://localhost:${PORT}/presidentielle-2027/`,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT) },
  },
  projects: [
    {
      name: 'desktop',
      testMatch: /quiz\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'mobile',
      testMatch: /quiz\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'screenshots',
      testMatch: /screenshots\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
