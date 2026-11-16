const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

module.exports = async function ({ base, campaignId, student, lecturer }) {
  const browser = await require('puppeteer').launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/health');
    await page.evaluate((token) => sessionStorage.setItem('access_token', token), student.token);
    await page.goto(base + '/#thesis-topics');
    await page.waitForSelector('[data-prep-campaign]');
    await page.select('[data-prep-campaign]', campaignId);
    await page.waitForSelector('form[data-prep="topic"]');
    const label = await page.$eval(
      '[data-prep-campaign]',
      (select) => select.selectedOptions[0].textContent,
    );
    assert.ok(label.includes('2092–2093'), label);
    const title = 'Ứng dụng luyện tập từ vựng qua hình ảnh';
    const form = 'form[data-prep="topic"]';
    await page.type(`${form} [name="title_vi"]`, title);
    await page.type(`${form} [name="research_field"]`, 'Giáo dục');
    await page.type(`${form} [name="description"]`, 'Học và ôn từ vựng dựa trên ảnh minh họa.');
    await page.select(`${form} [name="supervisor_id"]`, lecturer.id);
    for (const width of [375, 1440]) {
      await page.setViewport({ width, height: 1000 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
    }
    const [submitted] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith(`/campaigns/${campaignId}/topics`) &&
          response.request().method() === 'POST',
      ),
      page.click(`${form} [type="submit"]`),
    ]);
    assert.equal(submitted.status(), 201);
    const topic = await submitted.json();
    assert.equal(topic.status, 'PENDING_APPROVAL');
    await page.waitForFunction(
      (title) =>
        [...document.querySelectorAll('details summary')].some((el) =>
          el.textContent.includes(title),
        ),
      {},
      title,
    );
    await page.evaluate((token) => sessionStorage.setItem('access_token', token), lecturer.token);
    await page.reload();
    const review = `form[data-prep="review"][data-id="${topic.id}"]`;
    await page.waitForSelector(review);
    await page.$eval(review, (form) => form.closest('details').querySelector('summary').click());
    await page.waitForSelector(`${review} button[value="approve"]`, { visible: true });
    assert.equal(await page.$(`${review} button[value="endorse"]`), null);
    for (const width of [375, 1440]) {
      await page.setViewport({ width, height: 1000 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      await page.screenshot({
        path: path.join(os.tmpdir(), `ccpm-sprint3-complete-${width}.png`),
        fullPage: true,
      });
    }
    const [approved] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith(`/topics/${topic.id}/review`) &&
          response.request().method() === 'POST',
      ),
      page.click(`${review} button[value="approve"]`),
    ]);
    assert.equal(approved.status(), 200);
    assert.equal((await approved.json()).status, 'APPROVED');
    await page.waitForFunction(
      (title) =>
        [...document.querySelectorAll('details summary')].some(
          (el) => el.textContent.includes(title) && el.textContent.includes('Đã duyệt'),
        ),
      {},
      title,
    );
    await page.evaluate((token) => sessionStorage.setItem('access_token', token), student.token);
    await page.reload();
    await page.waitForFunction(
      (title) =>
        [...document.querySelectorAll('details summary')].some(
          (el) => el.textContent.includes(title) && el.textContent.includes('Đã duyệt'),
        ),
      {},
      title,
    );
    assert.deepEqual(errors, []);
    assert.equal(await page.$('#page-content .screen-error'), null);
    console.log(
      'Sprint 3 browser: student submission, lecturer final approval, student result, semester labels and 375/1440px layouts passed.',
    );
  } finally {
    await browser.close();
  }
};
