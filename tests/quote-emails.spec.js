import { test, expect } from '@playwright/test';
import { quoteReceiptEmail, quoteCodeEmail } from '../worker/quote-emails.js';

const row = {
  number: 'ORC-2026-DEMO', token: 'a'.repeat(64), receipt_hash: '1234567890abcdef'.repeat(4),
  document: JSON.stringify({ totalCents: 32039, delivery: 'pickup', deliveryDetails: 'Retirada com agendamento pelo WhatsApp.', payment: 'Pix ou cartão, conforme combinado.' }),
  response: JSON.stringify({ action: 'accepted', name: 'Cliente de demonstração', at: 1788721200, code: 'ACE-DEMO1234', message: '' }),
};
test('branded emails stay readable at desktop and mobile widths, including without images', async ({ page }) => {
  for (const width of [800, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.setContent(quoteReceiptEmail(row).html);
    await expect(page.getByRole('heading', { name: 'Seu orçamento foi aprovado.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver orçamento e comprovante' })).toHaveAttribute('href', `https://forgecon.com.br/proposta/#${row.token}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/forgecon-email-approved-${width}.png`, fullPage: true });
    await page.setContent(quoteCodeEmail(row, '012345').html);
    await expect(page.getByText('012345', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/forgecon-email-code-${width}.png`, fullPage: true });
  }
  await page.route('**/*.png', route => route.abort());
  await page.setContent(quoteReceiptEmail(row).html);
  await expect(page.getByText('FORGECON', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver orçamento e comprovante' })).toBeVisible();
});
