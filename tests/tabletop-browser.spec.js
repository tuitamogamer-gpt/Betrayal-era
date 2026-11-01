import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';

test('tabletop combat uses real moves and dice, preserves choices and reloads its own save', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { Math.random = () => 0.4; });
  await page.goto('/tabletop.html');
  await expect(page.locator('.hex-group')).toHaveCount(33);
  await expect(page.locator('.cooldown-slot')).toHaveCount(26);
  await expect(page.locator('.enemy-profiles')).toContainText('Enfeeble 1');
  await page.locator('[data-action="begin-turn"]').click();
  await page.locator('[data-hex="4,2"]').click();
  await page.locator('.battle-map [data-target="high-elf-bandit"]').click();
  for (const button of await page.locator('[data-die]').all()) await button.click();
  await page.locator('[data-action="engage"]').click();
  await expect(page.locator('[data-resolve]')).toHaveCount(3);
  const firstDie = await page.locator('[data-resolve]').first().getAttribute('data-resolve');
  await page.locator('[data-resolve]').first().uncheck();
  await page.locator('[data-roll-up]').nth(2).click();
  await expect(page.locator(`[data-resolve="${firstDie}"]`)).not.toBeChecked();
  await page.locator(`[data-resolve="${firstDie}"]`).check();
  await page.locator('[data-action="resolve"]').click();
  await expect(page.locator('[data-action="end-turn"]')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('betrayal.tabletop.jailbreak.v1')).state);
  expect(saved.heroes[0].position).toBe('4,2');
  expect(saved.heroes[0].dice.filter(die => die.state === 'active')).toHaveLength(2);
  await page.reload();
  await expect(page.locator('[data-action="end-turn"]')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('betrayal.tabletop.jailbreak.v1')).state.heroes[0].position)).toBe('4,2');
  expect(errors).toEqual([]);
});

test('mobile tabletop fits the viewport and describes unavailable online play honestly', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/tabletop?operation=status', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ onlineAvailable: false, reason: 'A private room store is required.' }),
  }));
  await page.goto('/tabletop.html');
  await expect(page.locator('.battle-map')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-action="network"]').click();
  await expect(page.locator('.modal')).toContainText('Online co-op is not connected');
  await expect(page.locator('[data-action="create-room"]')).toBeDisabled();
  await page.locator('[data-action="close-modal"]').click();
  await page.locator('[data-action="begin-turn"]').click();
  await expect(page.locator('.hex-group.reachable').first()).toBeVisible();
});

test('malformed saved roll restores a fresh playable encounter', async ({ page }) => {
  await page.goto('/tabletop.html');
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('betrayal.tabletop.jailbreak.v1'));
    saved.state.phase = 'roll';
    saved.state.pending = null;
    localStorage.setItem('betrayal.tabletop.jailbreak.v1', JSON.stringify(saved));
  });
  await page.reload();
  await expect(page.locator('[data-action="begin-turn"]')).toBeVisible();
  await expect(page.locator('.notice')).toContainText('fresh encounter');
});

test.describe('authoritative shared tabletop in two browsers', () => {
  let ownedServer;

  test.beforeAll(async () => {
    const running = await fetch('http://127.0.0.1:3001/api/tabletop?operation=status')
      .then(response => response.ok).catch(() => false);
    if (running) return;
    ownedServer = spawn(process.execPath, ['server/tabletop/dev-server.js', '--memory'], {
      cwd: process.cwd(), env: { ...process.env, TABLETOP_API_PORT: '3001' }, stdio: 'pipe',
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Local tabletop test server did not start.')), 10000);
      ownedServer.stdout.on('data', chunk => {
        if (chunk.toString().includes('Local tabletop API:')) { clearTimeout(timeout); resolve(); }
      });
      ownedServer.once('error', error => { clearTimeout(timeout); reject(error); });
      ownedServer.once('exit', code => { if (code !== null) { clearTimeout(timeout); reject(new Error(`Tabletop server exited ${code}`)); } });
    });
  });

  test.afterAll(() => { ownedServer?.kill('SIGTERM'); });

  test('invite, join, turn ownership and authenticated reload share the same encounter', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    const errors = [];
    for (const page of [host, guest]) page.on('pageerror', error => errors.push(error.message));
    try {
      await host.goto('http://127.0.0.1:5173/tabletop.html');
      await host.locator('[data-action="network"]').click();
      await host.locator('#player-name').fill('Host');
      await host.locator('[data-action="create-room"]').click();
      await expect(host.locator('#invite-link')).toBeVisible();
      const invite = await host.locator('#invite-link').inputValue();
      expect(new URL(invite).searchParams.has('token')).toBe(false);
      await guest.goto(invite);
      await guest.locator('#player-name').fill('Guest');
      await guest.locator('[data-action="join-room"]').click();
      await expect(guest.locator('#invite-link')).toBeVisible();
      await host.locator('[data-action="start-room"]').click();
      await expect(host.locator('.modal')).toBeHidden();
      await guest.locator('[data-action="close-modal"]').click();
      await expect(guest.locator('[data-action="begin-turn"]')).toBeDisabled();
      await host.locator('[data-action="begin-turn"]').click();
      await host.locator('[data-action="end-turn"]').click();
      await expect(guest.locator('[data-action="begin-turn"]')).toBeEnabled({ timeout: 8000 });
      await guest.locator('[data-action="begin-turn"]').click();
      await expect(guest.locator('[data-action="end-turn"]')).toBeVisible();
      await guest.reload();
      await expect(guest.locator('.network-tag')).toContainText('Shared table');
      await expect(guest.locator('[data-action="end-turn"]')).toBeEnabled();
      let releasePoll;
      let markPollSeen;
      const pollSeen = new Promise(resolve => { markPollSeen = resolve; });
      const pollRelease = new Promise(resolve => { releasePoll = resolve; });
      await guest.route('**/api/tabletop?roomId=*', async route => {
        const response = await route.fetch();
        markPollSeen();
        await pollRelease;
        await route.fulfill({ response });
      });
      await pollSeen;
      await guest.locator('[data-action="network"]').click();
      await guest.locator('[data-action="leave-room"]').click();
      releasePoll();
      await expect(guest.locator('.network-tag')).toContainText('Local table');
      await guest.waitForTimeout(250);
      await expect(guest.locator('.network-tag')).toContainText('Local table');
      expect(errors).toEqual([]);
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
});
