import { expect, test } from '@playwright/test';

test('production denies anonymous reporting and omits the development provider', async ({
  page,
}) => {
  const response = await page.request.get('/', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toContain('/signin');

  await page.goto('/');
  await expect(page).toHaveURL(/\/signin/);
  await expect(page.locator('#dev-email')).toHaveCount(0);
  await expect(page.locator('#email')).toHaveCount(0);

  const providers = await page.request.get('/api/auth/providers');
  expect(providers.ok()).toBeTruthy();
  expect(await providers.json()).toEqual({});
});
