import puppeteer from 'puppeteer';
import fs from 'fs';
import cron from 'node-cron';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import twilio from 'twilio';
import dotenv from 'dotenv';

// Load the variables from .env file
dotenv.config();

const NINTENOD_URL = 'https://store.nintendo.com/nintendo-64-controller.html';

/**
 * Configure the Twilio Client
 */
const accountSid = process.env.ACCOUNT_SID;
const authToken = process.env.AUTH_TOKEN;
const phoneNumber = process.env.TO_PHONE_NUMBER;
const messagingServiceSid = process.env.MESSAGING_SERVICE_SID;
const client = twilio(accountSid, authToken);

/**
 * Send kick off message!
 */
client.messages
    .create({
        body: 'Launching the bot!',
        messagingServiceSid,
        to: phoneNumber,
    })
    .then(message => console.log(message.sid))
    .done();

const processIDs = [];

// create `__dirname` as it does not exist in Node's "module" mode
const __dirname = dirname(fileURLToPath(import.meta.url));

const createBrowser = async () => {
    const browser = await puppeteer.launch({ headless: true });
    processIDs.push(browser.process().pid);
    return browser;
};

const closeBrowser = async browser => {
    await browser.close();
    for (let i = 0; i < processIDs.length; i++) {
        execute(`echo ${process.env.PASSWD} | sudo -S kill -9 ${processIDs[i]}`);
    }
};

const run = async ({ url }) => {
    const browser = await createBrowser();
    const [page] = await browser.pages();
    await page.goto(url);

    try {
        const element = await page.$('.stock');
        const value = await page.evaluate(el => el.textContent, element);
        console.log(value);
        if (value.trim().toLowerCase() !== 'out of stock') {
            throw new Error('Out of stock message could not be found!');
        }
    } catch (error) {
        console.log(`${error?.message} Check ${NINTENOD_URL} for stock`);
        client.messages
            .create({
                body: `N64 controller might be in stock! ${NINTENOD_URL}`,
                messagingServiceSid,
                to: phoneNumber,
            })
            .then(message => console.log(`Sent message with id: ${message.sid}`))
            .done();

        /**
         * Attempt to capture screenshot of current stock
         */
        try {
            const dir = path.join(__dirname, 'screenshots');
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            await page.screenshot({
                path: path.resolve(dir, 'screenshot_' + Date.now() + '.png'),
                fullPage: true,
            });
        } catch (error) {
            console.log('failed to capture screenshot', error);
        }
    }

    await page.close();
    await closeBrowser(browser);
};

/**
 * Run the job every 3 minutes
 */
cron.schedule('*/3 * * * *', async () => {
    await run({ url: NINTENOD_URL });
});
