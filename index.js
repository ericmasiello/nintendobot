import puppeteer from 'puppeteer';
import fs from 'fs';
import cron from 'node-cron';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import twilio from 'twilio';
import dotenv from 'dotenv';
import chalk from 'chalk';

// Load the variables from .env file
dotenv.config();

console.log(chalk.grey('Starting...'));
const NINTENDO_64_CONTROLLER_URL = 'https://store.nintendo.com/nintendo-64-controller.html';
const EXPANSION_PACK_URL = 'https://www.nintendo.com/switch/online-service/#expansion-pack';

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

const run = async ({ url, callback }) => {
    const browser = await createBrowser();
    const [page] = await browser.pages();
    await page.goto(url);

    await callback(page);

    await page.close();
    await closeBrowser(browser);
};

const JOBS = [
    [
        NINTENDO_64_CONTROLLER_URL,
        async page => {
            console.log(chalk.grey(`Running ${NINTENDO_64_CONTROLLER_URL}`));
            try {
                const element = await page.$('.stock');
                const value = await page.evaluate(el => el.textContent, element);

                if (value.trim().toLowerCase() !== 'out of stock') {
                    console.log(chalk.greenBright(value));
                    throw new Error('Out of stock message could not be found!');
                } else {
                    console.log(chalk.yellowBright(value?.trim()));
                }
            } catch (error) {
                console.log(chalk.greenBright(`${error?.message} Check ${NINTENDO_64_CONTROLLER_URL} for stock`));
                client.messages
                    .create({
                        body: `N64 controller might be in stock! ${NINTENDO_64_CONTROLLER_URL}`,
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
                    console.log(chalk.redBright('failed to capture screenshot', error));
                }
            }
        },
    ],
    [
        EXPANSION_PACK_URL,
        async page => {
            console.log(chalk.grey(`Running ${EXPANSION_PACK_URL}`));
            try {
                const element = await page.$('#plans .story-module:nth-child(2)');
                const hasBuyNow = await page.evaluate(el => el.textContent.match(/buy now/i), element);

                if (hasBuyNow) {
                    console.log(chalk.greenBright('Expansion pack is available'));
                    client.messages
                        .create({
                            body: `You can buy the expansion pack now! ${EXPANSION_PACK_URL}`,
                            messagingServiceSid,
                            to: phoneNumber,
                        })
                        .then(message => console.log(`Sent message with id: ${message.sid}`))
                        .done();
                } else {
                    console.log(chalk.yellowBright('Expansion pack is not available'));
                }
            } catch (error) {
                console.log(
                    chalk.redBright(
                        `Error when checking url ${EXPANSION_PACK_URL}. Failed with error ${error?.message}`
                    )
                );
            }
        },
    ],
];

let i = 0;

/**
 * Run the job every minute
 * alternating between two sites
 */
cron.schedule('*/2 * * * *', async () => {
    const [url, callback] = JOBS[i++ % 2];

    await run({ url: url, callback });
});
