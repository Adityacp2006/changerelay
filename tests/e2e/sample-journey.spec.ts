import { expect, test } from '@playwright/test';

// NOTE: written but not executed in the authoring environment (no browser could be installed there). Run: npx playwright install chromium && npm run test:e2e

test.describe('Sample workspace journey', () => {
  test('reschedule with a known conflict, partial failure, targeted recovery', async ({ page }) => {
    await page.goto('/sample');
    await expect(page.getByText('Sample workspace').first()).toBeVisible();
    await page.getByLabel('New start').fill('16:00');
    await page.getByRole('button', { name: 'Create impact preview' }).click();

    await expect(page.getByText(/Preview only/)).toBeVisible();
    await expect(page.getByRole('region', {name:'Conflicts and availability checks'}).getByText('Rohan Desai has another assignment')).toBeVisible();
    const approve = page.getByRole('button', { name: 'Approve exact change and update' });
    await expect(approve).toBeDisabled();                                  // unacknowledged warning blocks approval
    await page.getByLabel('I understand this conflict and want to continue').first().check();
    await expect(approve).toBeEnabled();

    await approve.dblclick();                                              // double click must create one run
    await expect(page.getByText('Needs your attention').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Update the Calendar event').locator('..').getByText('Update verified')).toBeVisible();

    await page.reload();                                                   // status survives a refresh
    await expect(page.getByText('Needs your attention').first()).toBeVisible();

    await page.getByRole('button', { name: 'Check and try again' }).first().click();
    await expect(page.getByText('Confirmed in your Sent folder after a timeout.')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Check and try again' }).first().click();
    await expect(page.getByText('Everything is verified')).toBeVisible({ timeout: 30_000 });
  });

  test('natural-language request only fills the form', async ({ page }) => {
    await page.goto('/sample');
    await page.getByText('Or describe the change in a sentence').click();
    await page.getByLabel('Describe the change').fill("Move tomorrow's AI workshop from 2 p.m. to 4 p.m.");
    await page.getByRole('button', { name: 'Fill the form' }).click();
    await expect(page.getByLabel('New start')).toHaveValue('16:00');
    await expect(page.getByLabel('Email the people on the roster about this')).toBeChecked();
    await expect(page.getByText(/Preview only/)).toBeVisible();
  });

  test('form edits invalidate the preview until a fresh review', async ({ page }) => {
    await page.goto('/sample');
    await page.getByLabel('New start').fill('16:00');
    await page.getByRole('button', { name: 'Create impact preview' }).click();
    await expect(page.getByText(/Preview only/)).toBeVisible();
    await page.getByLabel('New start').fill('17:00');
    await expect(page.getByText('This preview is out of date')).toBeVisible();
    await expect(page.getByRole('button', { name: /Review the updated change first/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Review updated change' }).click();
    await expect(page.getByText('This preview is out of date')).toHaveCount(0);
    await expect(page.getByLabel('New start')).toHaveValue('17:00');
  });

  test('mobile layout offers the list view of the impact', async ({ page, isMobile }) => {
    test.skip(!isMobile);
    await page.goto('/sample');
    await page.getByLabel('New start').fill('16:00');
    await page.getByRole('button', { name: 'Create impact preview' }).click();
    await expect(page.getByRole('region', {name:'See what changes'}).locator('li').filter({ hasText: 'Schedule sheet' }).first()).toBeVisible();
  });
});
