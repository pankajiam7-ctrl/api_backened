const puppeteer = require("puppeteer");
const axios = require("axios");
const cheerio = require("cheerio");
const openai = require("../config/openai"); // adjust path if needed

class GrantScraperService {

    async createGrantScrap(urls) {
        const finalResults = [];
        let browser;

        try {
            browser = await puppeteer.launch({
                headless: "new",
                args: ["--no-sandbox"]
            });

            for (let url of urls) {
                try {
                    console.log(`Fetching: ${url}`);

                    let text = "";

                    // =========================
                    // FETCH CONTENT
                    // =========================
                    try {
                        const response = await axios.get(url, {
                            timeout: 15000,
                            headers: {
                                "User-Agent": "Mozilla/5.0"
                            }
                        });

                        const $ = cheerio.load(response.data);
                        text = $("body").text().replace(/\s+/g, " ").trim();

                    } catch (err) {
                        const page = await browser.newPage();

                        await page.setUserAgent(
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
                        );

                        await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

                        text = await page.evaluate(() => document.body.innerText);

                        await page.close();
                    }

                    if (!text || text.length < 1000) continue;

                    const cleanText = text
                        .replace(/\s+/g, " ")
                        .replace(/ADVERTISEMENT|COOKIE|LOGIN|SIGN UP/gi, "")
                        .trim()
                        .slice(0, 12000);

                    // =========================
                    // GPT PROMPT
                    // =========================
                    const prompt = `
You are an expert grant extraction system.

CURRENT DATE: 2026-03-28

IMPORTANT: Only extract REAL GRANTS.

A REAL GRANT must:
- Provide funding for a project/research
- Require a proposal/application
- Be intended for research, development, or project execution

DO NOT include:
- Awards
- Prizes
- Medals
- Fellowships (unless explicitly project-funded grant-like)
- Internships
- Competitions / challenges
- Recognitions or honors

If an item does not clearly provide project funding → SKIP it.

Return JSON array only.

TEXT:
${cleanText}
`;

                    const gptResponse = await openai.chat.completions.create({
                        model: "gpt-5-mini",
                        messages: [{ role: "user", content: prompt }]
                    });

                    let content = gptResponse.choices[0].message.content;

                    content = content
                        .replace(/```json/gi, "")
                        .replace(/```/g, "")
                        .trim();

                    let grants;
                    try {
                        grants = JSON.parse(content);
                    } catch (e) {
                        console.log("❌ JSON parse failed");
                        continue;
                    }

                    if (!Array.isArray(grants) || grants.length === 0) continue;

                    // =========================
                    // SAFETY FILTER
                    // =========================
                    const bannedKeywords = [
                        "award",
                        "medal",
                        "internship",
                        "fellowship",
                        "challenge",
                        "prize",
                        "recognition"
                    ];

                    const filteredGrants = grants.filter(g => {
                        const name = (g.grant_name || "").toLowerCase();
                        const isBanned = bannedKeywords.some(k => name.includes(k));

                        return (!isBanned && g.type === "grant");
                    });

                    // =========================
                    // FORMAT
                    // =========================
                    const formatted = filteredGrants.map(g => ({
                        grant_name: g.grant_name,
                        deadline: g.deadline || null,
                        amount: g.amount || null,
                        region: g.region || "Unknown",
                        eligibility: g.eligibility || null,
                        short_description: g.short_description || null,
                        donor_agency: g.donor_agency || "Unknown",
                        source_url: url,
                        status: g.status,
                        createdAt: new Date()
                    }));

                    // =========================
                    // DEDUPLICATION
                    // =========================
                    const uniqueMap = new Map();

                    formatted.forEach(g => {
                        const key = g.grant_name.toLowerCase();
                        if (!uniqueMap.has(key)) {
                            uniqueMap.set(key, g);
                        }
                    });

                    const uniqueGrants = Array.from(uniqueMap.values());

                    finalResults.push(...uniqueGrants);

                    console.log(`✅ ${uniqueGrants.length} proper grants from ${url}`);

                } catch (err) {
                    console.error("❌ Error:", url, err.message);
                }
            }

            return finalResults;

        } catch (err) {
            throw err;

        } finally {
            if (browser) await browser.close();
        }
    }
}

module.exports = new GrantScraperService();