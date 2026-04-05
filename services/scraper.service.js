exports.scrapeSite = async (url, browser) => {
    try {
        const page = await browser.newPage();

        await page.goto(url, { waitUntil: "networkidle2", timeout: 0 });

        const text = await page.evaluate(() => {
            return document.body.innerText.slice(0, 12000);
        });

        await page.close();

        return text;
    } catch (err) {
        console.error("Scrape Error:", url, err.message);
        return "";
    }
};