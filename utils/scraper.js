const puppeteer = require("puppeteer");

const launchBrowser = async () => {
    return await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
};

const scrapeSite = async (url, browser) => {
    const page = await browser.newPage();

    try {
        await page.goto(url, {
            waitUntil: "networkidle2",
            timeout: 60000
        });

        // 🔥 wait for dynamic content
        await new Promise(res => setTimeout(res, 5000));

        const text = await page.evaluate(() => document.body.innerText);

        return text;

    } catch (err) {
        console.error("❌ Scrape Error:", err.message);
        return null;

    } finally {
        await page.close();
    }
};

module.exports = { launchBrowser, scrapeSite };