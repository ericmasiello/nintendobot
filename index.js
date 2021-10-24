import puppeteer from 'puppeteer';
import fs from 'fs'
import cron from 'node-cron';
import path, { dirname } from 'path'
import { fileURLToPath } from 'url';

const processIDs = []

// create __dirname as it does not exist in node module mode
const __dirname = dirname(fileURLToPath(import.meta.url));

const createBrowser = async () => {
  const browser = await puppeteer.launch({ headless: true });
  processIDs.push(browser.process().pid);
  return browser;
}

const closeBrowser = async (browser) => {
  await browser.close();
  for (let i = 0; i < processIDs.length; i++) {
      execute(`echo ${process.env.PASSWD} | sudo -S kill -9 ${processIDs[i]}`)
  }
}

const run = async ({ url }) => {
  const browser = await createBrowser();
  const [page] = await browser.pages();
  await page.goto(url);

  try {
    const element = await page.$('.stock');
    console.log('got the element')
    const value = await page.evaluate(el => el.textContent, element)
    // console.log(element);
    console.log(value)
  } catch (error) {
    console.log('failing to find element')
  }

  const dir = path.join(__dirname, 'screenshots');

  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
  }

  await page.screenshot({
      path: path.resolve(dir, 'screenshot_' + Date.now() + '.png'),
      fullPage: true,
  });
  await page.close();
  await closeBrowser(browser);
}

// cron.schedule('*/5 * * * *', () => {

// run every minute
cron.schedule('* * * * *', async () => {
  console.log('running :)')
  await run({ url: 'https://store.nintendo.com/nintendo-64-controller.html' })
})