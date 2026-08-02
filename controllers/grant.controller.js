
const { extractGrant } = require("../services/ai.service");
const { processGrant } = require("../services/grant.service");
const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");
const OpenAI = require("openai");
const pdf = require("pdf-parse");
const mongoose = require("mongoose");
const chrono = require('chrono-node');


// ✅ FIXED: Sahi import — GrantScrap ko Grant ke naam se use karein
const { GrantScrap: Grant, GrantMemory: GrantMemoryModel } = require("../models/grantScrap.model");


const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

exports.saveGrantJSON = async (req, res) => {
    try {
        const data = req.body;

        if (!Array.isArray(data)) {
            return res.status(400).json({
                success: false,
                message: "Expected an array of grants"
            });
        }

        // 🔥 slug generator
        const createSlug = (text) => {
            return text
                ?.toLowerCase()
                .trim()
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-');
        };

        // 🔥 convert comma string → array
        const parseArray = (value) => {
            if (!value) return [];
            return value.split(',').map(v => v.trim()).filter(Boolean);
        };

        // 🔥 convert DD-MM-YYYY → Date
        const parseDate = (dateStr) => {
            if (!dateStr) return null;
            const [day, month, year] = dateStr.split('-');
            return new Date(`${year}-${month}-${day}`);
        };

        const formattedData = data.map(item => {
            const countries = parseArray(item.country || item.region);
            const categories = parseArray(item.category);

            return {
                // ✅ REQUIRED FIELD (fixes "title is required")
                title: item.grant_name,

                // slug
                TitleURL: item.TitleURL || createSlug(item.grant_name || ''),

                // date fix
                deadline: parseDate(item.deadline),

                // geography mapping
                geography: {
                    ...item.geography,
                    country: countries
                },

                // ✅ IMPORTANT: category mapped here (NOT saved separately)
                ai: {
                    ...item.ai,
                    inferred_focus_areas: categories
                },

                // raw data
                raw: {
                    ...item.raw,
                    source_url: item.source_url || item.apply_url || item.raw?.source_url || '',
                    grant_name: item.grant_name,
                    deadline: item.deadline,
                    amount: item.amount,
                    region: item.region,
                    donor_agency: item.donor_agency
                },

                // optional fields (keep if needed)
                amount: item.amount,
                donor_agency: item.donor_agency
            };
        });

        console.log(formattedData);

        const savedData = await Grant.insertMany(formattedData);

        return res.status(201).json({
            success: true,
            message: "Grants saved successfully",
            count: savedData.length,
            data: savedData
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Server Error",
            error: error.message
        });
    }
};
// ✅ CREATE (ADMIN)
exports.createGrant = async (req, res) => {
    try {
        const data = req.body;
        //Calling AI Modal Return Grant Collection then Save Create Prompt then 

        const grant = await Grant.create({
            title: data.grantCollection.grant_basic_info.grant_name,
            category: data.grantCollection.grant_basic_info.grant_category,
            donor: data.grantCollection.grant_basic_info.donor_agency,

            country: data.grantCollection.eligible_regions.project_location,
            focusAreas: data.grantCollection.research_focus_areas,

            maxAmount: data.grantCollection.funding_details.maximum_amount_usd,
            currency: data.grantCollection.funding_details.currency,

            deadlineText: data.grantCollection.important_dates.application_deadline,
            deadline: new Date("2026-02-27T23:59:00Z"), // fix parsing later

            isOpen: data.grantCollection.status.currently_open,

            searchText: JSON.stringify(data),
            content: data
        });

        res.status(201).json(grant);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.searchGrant = async (req, res) => {
    try {
        const { data, type } = req.query;

        if (!data) {
            return res.status(400).json({ success: false, message: "data is required" });
        }

        // ✅ Escape special regex characters
        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const decoded = decodeURIComponent(data).trim();
        const words = decoded.split(/\s+/);

        console.log("Raw data param:", data);
        console.log("Decoded:", decoded);
        console.log("Words:", words);
        console.log("Word lengths:", words.map(w => ({ word: w, length: w.length, chars: [...w].map(c => c.charCodeAt(0)) })));

        const regexConditions = words.map(word => ({
            "ai.inferred_focus_areas": {
                $elemMatch: { $regex: escapeRegex(word), $options: 'i' }
            }
        }));

        const query = { $or: regexConditions };

        if (type !== undefined) {
            query["type"] = Number(type);
        }

        console.log("Final Query:", JSON.stringify(query));

        const grants = await Grant.find(query);
        console.log("Found:", grants.length);

        if (!grants.length) {
            return res.status(404).json({ success: false, message: "Grant not found" });
        }

        const regexArray = words.map(word => new RegExp(escapeRegex(word), 'i'));

        const scored = grants.map(grant => {
            const areas = grant.ai?.inferred_focus_areas || [];
            const score = areas.reduce((acc, area) => {
                return acc + regexArray.filter(r => r.test(area)).length;
            }, 0);
            return { ...grant.toObject(), _score: score };
        });

        scored.sort((a, b) => b._score - a._score);

        return res.status(200).json({ success: true, count: scored.length, data: scored });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.latestGrant = async (req, res) => {
    try {
        const { type } = req.params;

        let filter = {};

        if (type !== undefined) {
            filter.type = Number(type);
        }

        const grants = await Grant.aggregate([
            { $match: filter },
            { $sample: { size: 10 } }
        ]);

        res.status(200).json({
            success: true,
            data: grants
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.typeSearch = async (req, res) => {
    try {
        const { search } = req.query;

        console.log(search);

        if (!search || search.trim().length < 4) {
            return res.status(400).json({
                success: false,
                message: "Search must be at least 4 characters"
            });
        }

        const keyword = search.trim();

        const grants = await Grant.find({
            $or: [
                { searchText: { $regex: keyword, $options: "i" } },
                { "ai.inferred_focus_areas": { $regex: keyword, $options: "i" } },
                { "ai.inferred_focus_country": { $regex: keyword, $options: "i" } }
            ]
        }).sort({ createdAt: -1 });

        if (!grants.length) {
            return res.status(404).json({
                success: false,
                message: "Grant not found"
            });
        }

        res.status(200).json({
            success: true,
            data: grants
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// ─── Robust flexible date parser ────────────────────────────────────────
function parseFlexibleDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;

    let cleaned = dateStr.trim();

    // remove parenthetical notes like "(New York time)"
    cleaned = cleaned.replace(/\([^)]*\)/g, '').trim();

    // remove ordinal suffixes: 1st, 2nd, 3rd, 4th...
    cleaned = cleaned.replace(/(\d+)(st|nd|rd|th)/gi, '$1');

    // fix concatenated date+time like "23-Jul-2608:00 AM" -> "23-Jul-26 08:00 AM"
    cleaned = cleaned.replace(/(\d{2})(\d{1,2}:\d{2}\s*[AP]M)/i, '$1 $2');

    // expand 2-digit year at end (e.g. "-26" -> "-2026") when preceded by a dash
    cleaned = cleaned.replace(/-(\d{2})(\s|$)/, (match, yy, tail) => {
        const year = Number(yy) < 50 ? `20${yy}` : `19${yy}`;
        return `-${year}${tail}`;
    });

    // explicit DD-MM-YYYY handling (Spanish/European format) — JS Date
    // misreads this as MM-DD-YYYY and fails when day > 12
    const ddmmyyyy = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (ddmmyyyy) {
        const [, dd, mm, yyyy] = ddmmyyyy;
        const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
        return isNaN(parsed.getTime()) ? null : parsed;
    }

    // fallback: chrono-node handles weekday names, "Month DD YYYY",
    // "DD Month YYYY", times, and most messy natural-language dates
    const result = chrono.parseDate(cleaned);
    return result || null;
}

// ─── Get the real/effective deadline for a grant ────────────────────────
function getEffectiveDeadline(grant) {
    if (grant.deadline) {
        const d = new Date(grant.deadline);
        if (!isNaN(d.getTime())) return d;
    }
    return parseFlexibleDate(grant.raw?.deadline);
}

exports.getGrants = async (req, res) => {
    try {
        let {
            country,
            area,
            budget,
            status,
            search,
            sort,
            page = 1,
            limit = 10,
        } = req.query;

        page = Math.max(parseInt(page) || 1, 1);
        limit = Math.max(parseInt(limit) || 10, 1);

        const query = { type: 0 };

        // ─── 🔍 Search ────────────────────────────────────────────────────────
        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), 'i');
            query.$or = [
                { title: regex },
                { donor: regex },
                { 'raw.donor_agency': regex },
                { 'raw.description': regex },
                { 'ai.inferred_focus_areas': regex },
                { searchText: regex },
            ];
        }

        // ─── 🌍 Country filter ────────────────────────────────────────────────
        if (country && country.trim()) {
            const c = country.trim();
            query.$and = query.$and || [];
            query.$and.push({
                $or: [
                    { 'ai.inferred_focus_country': { $elemMatch: { $regex: new RegExp(`^${c}$`, 'i') } } },
                    { 'geography.country': { $elemMatch: { $regex: new RegExp(`^${c}$`, 'i') } } },
                    { 'geography.region_normalized': new RegExp(`^${c}$`, 'i') },
                    { 'raw.region': new RegExp(`^${c}$`, 'i') },
                ]
            });
        }

        // ─── 🎯 Focus area filter ─────────────────────────────────────────────
        if (area && area.trim()) {
            query.$and = query.$and || [];
            query.$and.push({
                $or: [
                    { 'ai.inferred_focus_areas': { $elemMatch: { $regex: new RegExp(`^${area.trim()}$`, 'i') } } },
                    { 'inferred_focus_areas': { $elemMatch: { $regex: new RegExp(`^${area.trim()}$`, 'i') } } },
                ]
            });
        }

        // ─── 💰 Budget filter ─────────────────────────────────────────────────
        if (budget && !isNaN(budget)) {
            query.$and = query.$and || [];
            query.$and.push({
                $or: [
                    { 'financials.maxAmount': { $lte: Number(budget) } },
                    { 'financials.maxAmount': null },
                    { 'financials.maxAmount': { $exists: false } },
                ]
            });
        }

        // ─── 🔓 Status filter (open/closed via isOpen flag) ────────────────────
        if (status) {
            if (status.toLowerCase() === 'open') query.isOpen = true;
            if (status.toLowerCase() === 'closed') query.isOpen = false;
        }

        // ─── 📥 Fetch ALL matching candidates ──────────────────────────────────
        const candidates = await Grant.find(query).lean();

        // ─── 📅 Compute effective deadline + filter ─────────────────────────────
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const withDeadline = candidates.map(g => ({
            ...g,
            _effectiveDeadline: getEffectiveDeadline(g),
        }));

        const filtered = withDeadline.filter(g => {
            // ✅ ONLY keep grants with a valid, parseable deadline that's today or future
            // ❌ exclude: missing deadline, unparseable deadline, or expired deadline
            if (!g._effectiveDeadline) return false;
            return g._effectiveDeadline >= startOfToday;
        });

        // ─── 🔢 Total count ──────────────────────────────────────────────────
        const total = filtered.length;
        const totalPages = Math.ceil(total / limit);

        // ─── 📊 Sort ─────────────────────────────────────────────────────────
        filtered.sort((a, b) => {
            if (sort === 'amount') {
                return (b.financials?.maxAmount || 0) - (a.financials?.maxAmount || 0);
            }
            if (sort === 'newest') {
                return new Date(b.createdAt) - new Date(a.createdAt);
            }
            // default: soonest deadline first
            return b._effectiveDeadline.getTime() - a._effectiveDeadline.getTime();
        });

        // ─── 📄 Paginate ─────────────────────────────────────────────────────
        const start = (page - 1) * limit;
        const paginated = filtered.slice(start, start + limit);

        // ─── 🔄 Normalize ─────────────────────────────────────────────────────
        const normalizedGrants = paginated.map(g => {
            const resolvedUrl = Array.isArray(g.imageUrl)
                ? (g.imageUrl[0] || '')
                : (g.imageUrl || '');

            return {
                ...g,
                TitleURL: g.TitleURL || null,
                url: g.TitleURL ? `/grants/${g.TitleURL}` : null,
                imageUrl: resolvedUrl,
                raw: g.raw
                    ? { ...g.raw, imageUrl: resolvedUrl }
                    : { imageUrl: resolvedUrl },
            };
        });

        // ─── ✅ Response ──────────────────────────────────────────────────────
        return res.status(200).json({
            success: true,
            total,
            page,
            totalPages,
            count: normalizedGrants.length,
            data: normalizedGrants,
        });

    } catch (err) {
        console.error('getGrants ERROR:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ✅ GET SINGLE
exports.getGrantById = async (req, res) => {
    try {
        const grant = await Grant.findById(req.params.id);

        if (!grant) {
            return res.status(404).json({ message: "Grant not found" });
        }

        res.json(grant); // ✅ full data
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getGrantById = async (req, res) => {
    try {
        const grant = await Grant.findById(req.params.id);

        if (!grant) {
            return res.status(404).json({ message: "Grant not found" });
        }

        res.json(grant); // ✅ full data
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getGrantsByTitleURL = async (req, res) => {
    try {
        const grant = await Grant.findOne({
            TitleURL: req.params.titleUrl
        });

        if (!grant) {
            return res.status(404).json({ message: "Grant not found" });
        }

        res.json(grant);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ✅ SEARCH
exports.searchGrants = async (req, res) => {
    try {
        const q = req.query.q;

        const grants = await Grant.find({
            $text: { $search: q }
        });

        res.json(grants);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// ✅ FILTER META
exports.getFiltersMeta = async (req, res) => {
    try {
        const countries = await Grant.distinct("country");
        const areas = await Grant.distinct("focusAreas");

        res.json({
            countries,
            areas,
            budgets: [1000, 5000, 10000, 50000]
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// ✅ FEATURED
exports.getFeatured = async (req, res) => {
    try {
        const grants = await Grant.find({ featured: true }).limit(6);
        res.json(grants);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// ✅ EXPIRING SOON (7 DAYS)
exports.expiringSoon = async (req, res) => {
    try {
        const now = new Date();
        const next7Days = new Date();
        next7Days.setDate(now.getDate() + 7);

        const grants = await Grant.find({
            deadline: { $gte: now, $lte: next7Days }
        });

        res.json(grants);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// ✅ UPDATE (ADMIN)
exports.updateGrant = async (req, res) => {
    try {
        const grant = await Grant.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );

        res.json(grant);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// ✅ DELETE (ADMIN)
exports.deleteGrant = async (req, res) => {
    try {
        await Grant.findByIdAndDelete(req.params.id);
        res.json({ message: "Grant deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.updateSingleField = async (req, res) => {
    try {
        const { field, value } = req.body;

        // ❌ basic validation
        if (!field) {
            return res.status(400).json({ message: "Field name required" });
        }

        // ❌ block dangerous fields
        const blocked = ["_id", "createdAt", "updatedAt"];
        if (blocked.includes(field)) {
            return res.status(400).json({ message: "Not allowed field" });
        }

        // 🔥 dynamic update
        const updateQuery = {};
        updateQuery[field] = value;

        const grant = await Grant.findByIdAndUpdate(
            req.params.id,
            { $set: updateQuery },
            { new: true }
        );
        if (!grant) {
            return res.status(404).json({ message: "Grant not found" });
        }

        res.json({
            message: "Field updated",
            field,
            value,
            grant
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};



exports.updateGrantDetails = async (req, res) => {
    try {
        const { title, summary, long_description, imageUrl, type } = req.body;

        const newGrant = new Grant({
            title: title, // required field (adjust as needed)

            ai: {
                summary,
                long_description
            },

            imageUrl,
            type // default 0 agar nahi bheja
        });

        const savedGrant = await newGrant.save();

        res.status(201).json({
            message: "Grant created successfully",
            grant: savedGrant
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.createGrant = async (req, res) => {
    try {
        const { summary, long_description, imageUrl, type } = req.body;

        const newGrant = new Grant({
            title: "Manual Entry", // required field (adjust as needed)

            ai: {
                summary,
                long_description
            },

            imageUrl,
            type // default 0 agar nahi bheja
        });

        const savedGrant = await newGrant.save();

        res.status(201).json({
            message: "Grant created successfully",
            grant: savedGrant
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.addPdfURL = async (req, res) => {
    try {
        const { TitleName, TitleURL, PDFURL } = req.body;

        const newGrant = new Grant({
            title: TitleName, // required field
            TitleName,
            TitleURL,
            PDFURL,
            type: 1
        });

        await newGrant.save();

        res.status(201).json({
            success: true,
            message: "Inserted successfully",
            data: newGrant
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


exports.getPdf = async (req, res) => {
    try {

        const data = await Grant.find({ type: 1 })
            .select("TitleURL PDFURL title imageUrl") // optional fields
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: data.length,
            data
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

//////////////////////////

// ─── Helpers ─────────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parseFlexibleDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const cleaned = dateStr.replace(/\([^)]*\)/g, '').trim();
    const result = chrono.parseDate(cleaned);
    return result || null;
}

function parseMaxAmount(rawAmount) {
    if (!rawAmount) return null;
    const cleaned = rawAmount.replace(/,/g, '').toLowerCase();
    const match = cleaned.match(/([\d.]+)\s*(crore|lakh|million|billion|thousand|cr|m|b|k)?/);
    if (!match) return null;
    let num = parseFloat(match[1]);
    const unit = match[2] || '';
    if (unit.startsWith('crore') || unit === 'cr') num *= 10000000;
    else if (unit.startsWith('lakh')) num *= 100000;
    else if (unit.startsWith('million') || unit === 'm') num *= 1000000;
    else if (unit.startsWith('billion') || unit === 'b') num *= 1000000000;
    else if (unit.startsWith('thousand') || unit === 'k') num *= 1000;
    return Math.round(num);
}

function parseCurrency(rawAmount) {
    if (!rawAmount) return 'Unknown';
    if (/INR|Rs|₹|crore|lakh/i.test(rawAmount)) return 'INR';
    if (/USD|\$/i.test(rawAmount)) return 'USD';
    if (/EUR|€/i.test(rawAmount)) return 'EUR';
    if (/GBP|£/i.test(rawAmount)) return 'GBP';
    return 'Unknown';
}

// ─── Fetch page text (simple: axios, fallback puppeteer) ───────────────────
async function fetchPageText(url, browser) {
    try {
        const response = await axios.get(url, {
            timeout: 15000,
            maxRedirects: 5,
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
                "Accept":
                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Referer": "https://www.google.com/",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
                "Upgrade-Insecure-Requests": "1"
            }
        });

        const $ = cheerio.load(response.data);
        $('script, style, nav, footer, header').remove();

        const text = $('body')
            .text()
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 15000);

        if (text.length > 300) return text;
    } catch (e) {
        console.log(`Axios failed for ${url}: ${e.message}`);
    }

    // fallback to puppeteer only if axios fails/insufficient
    let page;
    try {
        page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        const text = await page.evaluate(() => document.body.innerText);
        return text.replace(/\s+/g, ' ').trim().slice(0, 15000);
    } catch (e) {
        console.log(`Puppeteer also failed for ${url}: ${e.message}`);
        return '';
    } finally {
        if (page) await page.close();
    }
}

// ─── Single AI call: extract grant info ─────────────────────────────────────
async function extractGrantInfo(text, url) {
    const prompt = `You are a grant extraction system. Extract real funding opportunities (grants) from this text.

RULES:
- Skip if this is just an award, medal, scholarship, or internship (no cash funding).
- deadline: extract in ISO format YYYY-MM-DD if you can determine it. If truly no deadline (rolling), return null.
- amount: the funding amount as a string (e.g. "$50,000", "up to £2000"). null if not found.
- inferred_focus_areas: 3-5 short lowercase tags.
- inferred_countries: array of eligible countries, or ["Global"].
- eligibility: exactly 5 short bullet points.

Return ONLY a JSON array, no markdown:
[{
  "grant_name": "string",
  "deadline": "YYYY-MM-DD or null",
  "amount": "string or null",
  "region": "string",
  "inferred_countries": ["..."],
  "donor_agency": "string",
  "eligibility": ["...", "...", "...", "...", "..."],
  "inferred_focus_areas": ["...", "...", "..."],
  "short_description": "1-2 sentences",
  "apply_url": "string or null"
}]

TEXT:
${text}`;

    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
    });

    const raw = response.choices[0].message.content
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

    try {
        return JSON.parse(raw);
    } catch {
        const match = raw.match(/\[[\s\S]*\]/);
        return match ? JSON.parse(match[0]) : [];
    }
}

// ─── Main controller ─────────────────────────────────────────────────────────
exports.createGrantScrap = async (req, res) => {
    let browser;
    const finalResults = [];
    const seen = new Set();
    const MIN_DAYS_LEFT = 10;

    try {
        // Step 1: get URLs
        const apiRes = await axios.get('http://localhost:7777/api/admin/getUrlLink', { timeout: 10000 });
        const urls = [...new Set(
            apiRes.data.flatMap(item => item.links.map(l => l.replace(/,$/, '').trim()).filter(l => l.startsWith('http')))
        )];

        if (urls.length === 0) {
            return res.status(400).json({ success: false, message: 'No URLs found' });
        }

        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        // Step 2: process each URL
        for (const url of urls) {
            console.log(`Processing: ${url}`);

            const text = await fetchPageText(url, browser);
            if (!text || text.length < 300) {
                console.log(`Skipping (too little text): ${url}`);
                continue;
            }

            await sleep(2000); // avoid rate limits

            let grants;
            try {
                grants = await extractGrantInfo(text, url);
            } catch (e) {
                console.log(`AI extraction failed for ${url}: ${e.message}`);
                continue;
            }

            const now = new Date();

            for (const g of grants) {
                if (!g.grant_name || g.grant_name.trim().split(' ').length < 3) continue;

                const UNKNOWN_DONOR = ['unknown', 'not specified', 'n/a', 'na', 'tbd', ''];
                if (!g.donor_agency || UNKNOWN_DONOR.includes(g.donor_agency.toLowerCase().trim())) continue;

                // ✅ parse deadline reliably, require a VALID FUTURE deadline
                const parsedDeadline = g.deadline
                    ? (chrono.parseDate(g.deadline) || parseFlexibleDate(g.deadline))
                    : null;

                if (!parsedDeadline) {
                    console.log(`Skipping (no valid deadline): ${g.grant_name}`);
                    continue; // no rolling grants — must have a real future deadline
                }

                const daysLeft = Math.ceil((parsedDeadline - now) / (1000 * 60 * 60 * 24));
                if (daysLeft < MIN_DAYS_LEFT) {
                    console.log(`Skipping (expired/too close, ${daysLeft} days): ${g.grant_name}`);
                    continue;
                }

                const key = g.grant_name.toLowerCase().trim();
                if (seen.has(key)) continue;
                seen.add(key);

                const grant = {
                    title: g.grant_name,
                    donor: g.donor_agency,
                    category: 'grant',
                    inferred_focus_areas: g.inferred_focus_areas || [],
                    inferred_countries: g.inferred_countries || [],
                    geography: {
                        region: g.region || null,
                        region_normalized: g.region ? g.region.toLowerCase().trim() : null,
                        countries: g.inferred_countries || [],
                    },
                    financials: {
                        raw: g.amount,
                        maxAmount: parseMaxAmount(g.amount),
                        currency: parseCurrency(g.amount),
                    },
                    deadline: parsedDeadline,
                    status: 'active',
                    isOpen: true,
                    eligibility: g.eligibility || [],
                    shortDescription: g.short_description || null,
                    applyUrl: g.apply_url || url,
                    ai: {
                        inferred_focus_areas: g.inferred_focus_areas || [],
                        inferred_focus_country: g.inferred_countries || [],
                        summary: g.short_description || null,
                    },
                    raw: {
                        grant_name: g.grant_name,
                        deadline: g.deadline,
                        amount: g.amount,
                        region: g.region,
                        donor_agency: g.donor_agency,
                        eligibility: g.eligibility,
                        source_url: url,
                        apply_url: g.apply_url || url,
                    },
                    searchText: [
                        g.grant_name, g.donor_agency, g.region,
                        (g.inferred_countries || []).join(' '),
                        (g.inferred_focus_areas || []).join(' '),
                    ].filter(Boolean).join(' ').toLowerCase(),
                    type: 0,
                };

                finalResults.push(grant);
                console.log(`✅ SAVED: ${grant.title} (${daysLeft} days left)`);
            }
        }

        // Step 3: save to DB
        if (finalResults.length > 0) {
            await Grant.bulkWrite(
                finalResults.map(g => ({
                    updateOne: {
                        filter: { title: g.title },
                        update: { $set: g },
                        upsert: true,
                    }
                }))
            );
        }

        return res.json({
            success: true,
            total: finalResults.length,
            data: finalResults,
        });

    } catch (err) {
        console.error('createGrantScrap ERROR:', err);
        return res.status(500).json({ success: false, message: err.message });
    } finally {
        if (browser) await browser.close();
    }
};

// ─── OTHER EXPORTS (unchanged) ────────────────────────────────────────────────
exports.searchGrants = async (req, res) => {
    try {
        const grants = await Grant.find({ $text: { $search: req.query.q } });
        res.json(grants);
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getFiltersMeta = async (req, res) => {
    try {
        const countries = await Grant.distinct("country");
        const areas = await Grant.distinct("focusAreas");
        res.json({ countries, areas, budgets: [1000, 5000, 10000, 50000] });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getFeatured = async (req, res) => {
    try {
        const grants = await Grant.find({ featured: true }).limit(6);
        res.json(grants);
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.expiringSoon = async (req, res) => {
    try {
        const now = new Date();
        const next7Days = new Date();
        next7Days.setDate(now.getDate() + 7);
        const grants = await Grant.find({ deadline: { $gte: now, $lte: next7Days } });
        res.json(grants);
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateGrant = async (req, res) => {
    try {
        const grant = await Grant.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(grant);
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.deleteGrant = async (req, res) => {
    try {
        await Grant.findByIdAndDelete(req.params.id);
        res.json({ message: "Grant deleted" });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateSingleField = async (req, res) => {
    try {
        const { field, value } = req.body;
        if (!field) return res.status(400).json({ message: "Field name required" });
        const blocked = ["_id", "createdAt", "updatedAt"];
        if (blocked.includes(field)) return res.status(400).json({ message: "Not allowed field" });
        const updateQuery = {};
        updateQuery[field] = value;
        const grant = await Grant.findByIdAndUpdate(req.params.id, { $set: updateQuery }, { new: true });
        if (!grant) return res.status(404).json({ message: "Grant not found" });
        res.json({ message: "Field updated", field, value, grant });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateGrantDetails = async (req, res) => {
    try {
        const { title, summary, long_description, imageUrl, type } = req.body;
        const newGrant = new Grant({ title, ai: { summary, long_description }, imageUrl, type });
        const savedGrant = await newGrant.save();
        res.status(201).json({ message: "Grant created successfully", grant: savedGrant });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.createGrant = async (req, res) => {
    try {
        const { summary, long_description, imageUrl, type } = req.body;
        const newGrant = new Grant({ title: "Manual Entry", ai: { summary, long_description }, imageUrl, type });
        const savedGrant = await newGrant.save();
        res.status(201).json({ message: "Grant created successfully", grant: savedGrant });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.addPdfURL = async (req, res) => {
    try {
        const { TitleName, TitleURL, PDFURL } = req.body;
        const newGrant = new Grant({ title: TitleName, TitleName, TitleURL, PDFURL, type: 1 });
        await newGrant.save();
        res.status(201).json({ success: true, message: "Inserted successfully", data: newGrant });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getPdf = async (req, res) => {
    try {
        const data = await Grant.find({ type: 1 }).select("TitleURL PDFURL title imageUrl").sort({ createdAt: -1 });
        res.json({ success: true, count: data.length, data });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.createGrantsDetail = async (req, res) => {
    try {
        const grant = req.body;
        const rawId = grant?._id?.$oid ?? grant?._id ?? null;
        const grantId = rawId && mongoose.Types.ObjectId.isValid(rawId) ? new mongoose.Types.ObjectId(rawId) : null;
        if (!grant?.grant_name) return res.status(400).json({ success: false, message: "grant_name is required" });

        const result = await processGrant(grant);
        if (!result) return res.status(500).json({ success: false, message: "AI processing failed" });

        result.country = Array.isArray(result.country) && result.country.length > 0
            ? result.country.filter(Boolean)
            : [grant.region || "Unknown"];
        result.focus_area = Array.isArray(result.focus_area) && result.focus_area.length > 0
            ? result.focus_area.filter(Boolean)
            : ["Community Development"];
        result.region_normalized = (result.region_normalized || grant.region || "").toLowerCase().trim();
        result.donor_agency = result.donor_agency || grant.donor_agency || "Unknown";
        result.donor_agency_normalized = result.donor_agency_normalized || result.donor_agency;
        result.amount = result.amount?.trim() || grant.amount || "Not specified";

        // ✅ Parse countries from processGrant result
        const inferredCountries = parseCountries(result.country || grant.inferred_countries, grant.grant_name);

        // ✅ Generate enhanced about (~200 words) if missing
        let aboutText = result.long_description || result.about || null;
        if (!aboutText || aboutText.length < 100) {
            try {
                const aboutPrompt = `Write a detailed, informative 150-200 word description for this grant opportunity. Cover: what the grant funds, who the funder is, what types of projects/organizations are eligible, geographic and sector focus, and why this matters for applicants. Make it professional and useful.

Grant Name: ${grant.grant_name}
Donor: ${result.donor_agency}
Region: ${grant.region}
Countries: ${inferredCountries.join(", ") || "Global"}
Amount: ${result.amount}
Focus Areas: ${result.focus_area?.join(", ")}
Short Description: ${result.short_description || ""}

Return ONLY the about text, no labels or JSON.`;

                await sleep(1500);
                const aboutResponse = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [{ role: "user", content: aboutPrompt }],
                    temperature: 0.3,
                });
                aboutText = aboutResponse.choices[0].message.content?.trim() || null;
                log("ai", `Generated about text: ${(aboutText || "").length} chars`);
            } catch (aboutErr) {
                log("warn", `About generation failed: ${aboutErr.message}`);
            }
        }

        let updatedDoc = null;
        if (grantId) {
            updatedDoc = await Grant.findByIdAndUpdate(grantId, {
                $set: {
                    // ✅ AI subdoc — all fields
                    "ai.inferred_focus_areas": result.focus_area,
                    "ai.inferred_focus_country": inferredCountries,      // ✅ countries array
                    "ai.inferred_region": result.region_normalized,
                    "ai.inferred_donor": result.donor_agency_normalized,
                    "ai.summary": result.short_description || "",
                    "ai.long_description": aboutText || result.short_description || "",

                    // ✅ Geography
                    "geography.region_normalized": result.region_normalized,
                    "geography.country": result.country,
                    "geography.countries": inferredCountries,    // ✅ specific countries

                    // ✅ Top-level fields
                    "financials.raw": result.amount,
                    donor: result.donor_agency,
                    shortDescription: result.short_description || "",
                    about: aboutText || "",       // ✅ enhanced about
                    inferred_countries: inferredCountries,     // ✅ top-level
                    hasAiDetail: true,
                }
            }, { new: true, runValidators: false }).lean();

            if (!updatedDoc) return res.status(404).json({ success: false, message: `Grant not found: ${grantId}` });
        }

        return res.status(200).json({
            success: true,
            data: { ...result, inferred_countries: inferredCountries, about: aboutText },
            updatedDoc: updatedDoc || null
        });
    } catch (error) {
        console.error("❌ createGrantsDetail error:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal Server Error" });
    }
};
/////////////////////////////////////////////////////////////////

// exports.createGrantScrap = async (req, res) => {

//     const urls = [
//         "https://lac.unwomen.org/es/programme-implementation/2026/03/segundo-llamado-para-propuestas-de-pequenas-subvenciones-genero-y-ambiente-2026-bolivia",
//         "https://wtgrantfoundation.org/funding/william-t-grant-scholars-program",
//         "https://www.undp.org/maldives/publications/call-proposals",
//         "https://procurement-notices.undp.org/view_notice.cfm?notice_id=98802",
//         "https://www.irf.ua/contest/konkurs-pidgotovka-do-vstupu-u-yes-na-rivni-gromad-2-0/",
//         "https://www.irf.ua/contest/konkurs-mosty-solidarnosti-z-ukrayinoyu/",
//         "https://www.irf.ua/contest/konkurs-na-pidtrymku-veteranskyh-inicziatyv-trymajmo-strij-pyata-hvylya/",
//         "https://ua.mfa.lt/ua/novini/56/zaproshuiemo-podavati-zayavki-proiektiv-shchodo-rozvitku-spivpratsi:2134",
//         "https://www.artexplora.org/en/the-art-explora-academie-des-beaux-arts-european-award",
//         "https://al.usembassy.gov/english-access-scholarship-program/",
//         "https://fundoecos.org.br/edital/edital-47-ticcas/",
//         "https://grantplus.unops.org/funding-opportunity/39",
//         "https://www.ontario.ca/page/available-funding-opportunities-ontario-government#section-2",
//         "https://www.ontario.ca/page/available-funding-opportunities-ontario-government#section-4",
//         "https://www.coe.int/en/web/yerevan/call-for-tender1/-/asset_publisher/Zli1DESt6rRL/content/micro-project-for-a-non-profit-organisation-to-produce-and-disseminate-awareness-raising-materials-on-combating-technology-facilitated-violence-against-women",
//         "https://www.unpartnerportal.org/landing/opportunities/",
//         "https://www.unpartnerportal.org/landing/opportunities/",
//         "https://www.unpartnerportal.org/landing/opportunities/",
//         "https://www.unpartnerportal.org/landing/opportunities/",
//         "https://www.unpartnerportal.org/landing/opportunities/",
//         "https://one-community.org.uk/how-to-apply-for-funding-grants-available/",
//         "https://one-community.org.uk/how-to-apply-for-funding-grants-available/",
//         "https://www.unpartnerportal.org/landing/opportunities/",
//         "https://www.unpartnerportal.org/landing/opportunities/",
//         "https://www.unpartnerportal.org/landing/opportunities/",
//         "https://frrr.org.au/funding/rebuilding-futures/",
//         "https://frrr.org.au/funding/src-prepare-recover/",
//         "https://frrr.org.au/funding/src-small-vital/",
//         "https://www.artfund.org/professional/get-funding/programmes/student-opportunities",
//         "https://www.mercury.co.nz/about-us/partnerships/community-funds/waipipi-community-fund",
//         "https://perth.wa.gov.au/community/sponsorship-and-grants",
//         "https://www.museumsassociation.org/funding/health-and-wellbeing/",
//         "https://www.instagram.com/p/DWYSqXtEoZc/",
//         "https://grantsnt.nt.gov.au/grants/arts-nt-arts-equipment-2025-26",
//         "https://www.amazon.science/research-awards/call-for-proposals/amazon-2030-call-for-proposals-spring-2026",
//         "https://www.unidu.hr/competition-for-the-2027-2028-academic-year-is-now-open/",
//         "https://www.oneyoungworld.com/scholarship/roche-scholarship-2026",
//         "https://www.oneyoungworld.com/scholarship/sandoz-scholarship-2026",
//         "https://proprogressione.com/en/news/open-call-for-artistic-activism-training-academy-for-actors-of-social-change-focusing-on-artivism-2026/",
//         "https://visapourlimage.com/en/prix-et-bourses/bourse-canon-du-documentaire-video-court-metrage/",
//         "https://ampsychfdn.org/funding/brehm-undergraduate-scholarships/",
//         "https://ampsychfdn.org/funding/cogdop/",
//         "https://www.risingtide-foundation.org/clinical-cancer-research-how-to-apply/",
//         "https://nias.knaw.nl/fellowships/golestan-fellowship/",
//         "https://ijp.org/en/programmes/middleeast/",
//         "https://ijp.org/en/programmes/israel/",
//         "https://www.yamawards.org/post/the-yamawards-2026-are-here",
//         "https://awards.gov.in/Home/Awardpedia",
//         "https://nawa.gov.pl/en/naukowcy/program-imienia-bekkera/ogloszenie",
//         "https://www.copyright.com.au/culturalfund/fellowship/copyright-agency-frank-moorhouse-fellowship-for-young-writers/",
//         "https://www.mandelarhodes.org/scholarship/apply/",
//         "https://www.cancerresearch.org/cri-irvington-postdoctoral-fellowship",
//         "https://www.cancerresearch.org/immuno-informatics-postdoctoral-fellowship",
//         "https://investigate.submittable.com/submit",
//         "https://luxinnovation.lu/news/bpf-up-to-%E2%82%AC300,000-in-co-funding",
//         "https://apply-for-innovation-funding.service.gov.uk/competition/2436/overview/97d03e1a-7760-4939-97b4-4f230c84a6aa",
//         "https://apply-for-innovation-funding.service.gov.uk/competition/2435/overview/592ea5c1-f713-4654-bb5e-d6894cd06d86",
//         "https://apply-for-innovation-funding.service.gov.uk/competition/2434/overview/f4a8b70b-ff7f-4943-9c8a-76c212b445a8",
//         "https://perth.wa.gov.au/community/sponsorship-and-grants",
//         "https://www.energyideas.eu/",
//         "https://inspiringsa.org.au/grants/",
//         "https://thegapinbetween.com/startup-challenge",
//         "https://grantsnt.nt.gov.au/grants/cyber-invest-business-program-1",
//         "https://www.linkedin.com/posts/fluorishafrica_transform-your-business-in-four-months-applications-activity-7441790334285750272-uKKq?utm_source=share&utm_medium=member_desktop&rcm=ACoAAEHEQWQBdeeCk50Y9buygT4gtJpoFSowtKM",
//         "https://tihan.iith.ac.in/callforproposalstartup.html",
//         "https://www.excitelab.co/en/apply-now",
//         "https://next.startwithhex.com/asean-australian/generation-next/",
//         "https://futureslab.com.vn/innoboost/",
//         "https://si.se/en/apply/si-leadership-programmes/impact-pioneers/",
//         "https://india.socialimpactaward.net/about-application-host/",
//         "https://business.gov.au/grants-and-programs/prawn-fishers-financial-guidance-and-training-support-program-nsw",
//         "https://business.gov.au/grants-and-programs/community-development-fund-vic",
//         "https://business.gov.au/grants-and-programs/inland-river-flood-event-freight-subsidy-sa",
//         "https://www.ihfc.co.in/important-announcements/medtech-revolution-starts-here/"
//     ];

//     const finalResults = [];
//     let browser;

//     try {
//         browser = await puppeteer.launch({
//             headless: "new",
//             args: ["--no-sandbox"]
//         });

//         for (let url of urls) {
//             try {
//                 console.log(`Fetching: ${url}`);

//                 let text = "";

//                 // =========================
//                 // FETCH CONTENT
//                 // =========================
//                 try {
//                     const response = await axios.get(url, {
//                         timeout: 15000,
//                         headers: {
//                             "User-Agent": "Mozilla/5.0"
//                         }
//                     });

//                     const $ = cheerio.load(response.data);
//                     text = $("body").text().replace(/\s+/g, " ").trim();

//                 } catch (err) {
//                     const page = await browser.newPage();

//                     await page.setUserAgent(
//                         "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
//                     );

//                     await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

//                     text = await page.evaluate(() => document.body.innerText);

//                     await page.close();
//                 }

//                 if (!text || text.length < 1000) continue;

//                 const cleanText = text
//                     .replace(/\s+/g, " ")
//                     .replace(/ADVERTISEMENT|COOKIE|LOGIN|SIGN UP/gi, "")
//                     .trim()
//                     .slice(0, 12000);

//                 // =========================
//                 // GPT PROMPT (STRICT FILTER)
//                 // =========================
//                 const prompt = `
// You are an expert grant extraction system.

// CURRENT DATE: 2026-03-28

// IMPORTANT: Only extract REAL GRANTS.

// A REAL GRANT must:
// - Provide funding for a project/research
// - Require a proposal/application
// - Be intended for research, development, or project execution

// DO NOT include:
// - Awards
// - Prizes
// - Medals
// - Fellowships (unless explicitly project-funded grant-like)
// - Internships
// - Competitions / challenges
// - Recognitions or honors

// If an item does not clearly provide project funding → SKIP it.

// ---

// Tasks:
// 1. Extract only VALID GRANTS from the text.
// 2. Normalize deadline to YYYY-MM-DD.
// 3. Classify status:
//    - active → deadline >= current date
//    - rolling → no fixed deadline
//    - expired → ignore completely

// 4. Return ONLY:
//    - active
//    - rolling grants

// 5. Ignore expired or unclear items.

// ---

// Return JSON array only with this schema:

// {
//   "grant_name": string,
//   "deadline": string or null,
//   "amount": string or null,
//   "region": string,
//   "donor_agency": string,
//   "eligibility": string,
//   "short_description": string,
//   "status": "active" | "rolling",
//   "type": "grant"
// }

// TEXT:
// ${cleanText}
// `;

//                 const gptResponse = await openai.chat.completions.create({
//                     model: "gpt-5-mini",
//                     messages: [{ role: "user", content: prompt }]
//                 });

//                 let content = gptResponse.choices[0].message.content;

//                 content = content
//                     .replace(/```json/gi, "")
//                     .replace(/```/g, "")
//                     .trim();

//                 let grants;
//                 try {
//                     grants = JSON.parse(content);
//                 } catch (e) {
//                     console.log("❌ JSON parse failed");
//                     continue;
//                 }

//                 if (!Array.isArray(grants) || grants.length === 0) continue;

//                 // =========================
//                 // SERVER-SIDE SAFETY FILTER
//                 // =========================
//                 const bannedKeywords = [
//                     "award",
//                     "medal",
//                     "internship",
//                     "fellowship",
//                     "challenge",
//                     "prize",
//                     "recognition"
//                 ];

//                 const filteredGrants = grants.filter(g => {
//                     const name = (g.grant_name || "").toLowerCase();

//                     const isBanned = bannedKeywords.some(k => name.includes(k));

//                     return (
//                         !isBanned &&
//                         g.type === "grant"
//                     );
//                 });

//                 // =========================
//                 // FORMAT
//                 // =========================
//                 const formatted = filteredGrants.map(g => ({
//                     grant_name: g.grant_name,
//                     deadline: g.deadline || null,
//                     amount: g.amount || null,
//                     region: g.region || "Unknown",
//                     eligibility: g.eligibility || null,
//                     short_description: g.short_description || null,
//                     donor_agency: g.donor_agency || "Unknown",
//                     source_url: url,
//                     status: g.status,
//                     createdAt: new Date()
//                 }));

//                 // =========================
//                 // DEDUPLICATION
//                 // =========================
//                 const uniqueMap = new Map();

//                 formatted.forEach(g => {
//                     const key = g.grant_name.toLowerCase();
//                     if (!uniqueMap.has(key)) {
//                         uniqueMap.set(key, g);
//                     }
//                 });

//                 const uniqueGrants = Array.from(uniqueMap.values());

//                 finalResults.push(...uniqueGrants);

//                 console.log(`✅ ${uniqueGrants.length} proper grants from ${url}`);

//             } catch (err) {
//                 console.error("❌ Error:", url, err.message);
//             }
//         }
//         // Data Save In DB

//         await Grant.bulkWrite(
//             finalResults.map(g => ({
//                 updateOne: {
//                     filter: { "raw.grant_name": g.grant_name }, // duplicate control
//                     update: {
//                         $set: {
//                             raw: {
//                                 grant_name: g.grant_name,
//                                 deadline: g.deadline ? new Date(g.deadline) : null,
//                                 amount: g.amount,
//                                 region: g.region,
//                                 donor_agency: g.donor_agency,
//                                 eligibility: g.eligibility,
//                                 short_description: g.short_description,
//                                 source_url: g.source_url
//                             },

//                             // minimal required fields
//                             title: g.grant_name,
//                             donor: g.donor_agency,
//                             deadline: g.deadline ? new Date(g.deadline) : null,
//                             status: g.status,
//                             eligibility: g.eligibility,
//                             shortDescription: g.short_description
//                         }
//                     },
//                     upsert: true
//                 }
//             }))
//         );
//         return res.json({
//             success: true,
//             total: finalResults.length,
//             data: finalResults
//         });

//     } catch (err) {
//         console.error("❌ Fatal Error:", err.message);

//         return res.status(500).json({
//             success: false,
//             message: err.message
//         });

//     } finally {
//         if (browser) await browser.close();
//     }
// };