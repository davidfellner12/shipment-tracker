// Print report.html to report.pdf with a locally installed Edge or Chrome.
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

let browser;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel }); break; } catch { /* try next */ }
}
if (!browser) throw new Error('No local Edge or Chrome found for PDF printing.');

const page = await browser.newPage();
await page.goto(pathToFileURL(resolve('report.html')).href, { waitUntil: 'load' });
await page.pdf({
  path: 'report.pdf',
  format: 'A4',
  printBackground: true,
  margin: { top: '18mm', bottom: '18mm', left: '18mm', right: '18mm' },
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#64748b;font-family:Georgia,serif">'
    + '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
});
await browser.close();
console.log('Wrote report.pdf');
