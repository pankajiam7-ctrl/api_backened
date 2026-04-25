
const { extractGrant } = require("../services/ai.service");
const { processGrant } = require("../services/grant.service");
const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");
const OpenAI = require("openai");
const pdf = require("pdf-parse");
const mongoose = require("mongoose");

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

// ✅ GET ALL (FILTER + PAGINATION)
// ✅ GET ALL (FILTER + PAGINATION + SEARCH)
// exports.getGrants = async (req, res) => {
//     try {
//         let {
//             country,
//             area,
//             budget,
//             status,
//             search,
//             sort,
//             page = 1,
//             limit = 10,
//         } = req.query;

//         // ✅ Safe number conversion
//         page = Math.max(parseInt(page) || 1, 1);
//         limit = Math.max(parseInt(limit) || 10, 1);

//         const query = {};

//         // ─── 🔍 Search ────────────────────────────────────────────────────────
//         if (search && search.trim()) {
//             const regex = new RegExp(search.trim(), 'i');
//             query.$or = [
//                 { title: regex },
//                 { donor: regex },
//                 { 'raw.donor_agency': regex },
//                 { 'raw.description': regex },
//                 { 'ai.inferred_focus_areas': regex },
//             ];
//         }

//         // ─── 🌍 Country filter ────────────────────────────────────────────────
//         if (country && country.trim()) {
//             const c = country.trim();
//             query.$and = query.$and || [];
//             query.$and.push({
//                 $or: [
//                     { 'ai.inferred_focus_country': { $elemMatch: { $regex: new RegExp(`^${c}$`, 'i') } } },
//                     { 'geography.country': { $elemMatch: { $regex: new RegExp(`^${c}$`, 'i') } } },
//                     { 'geography.region_normalized': new RegExp(`^${c}$`, 'i') },
//                     { 'raw.region': new RegExp(`^${c}$`, 'i') },
//                 ]
//             });
//         }

//         // ─── 🎯 Focus area filter ─────────────────────────────────────────────
//         if (area && area.trim()) {
//             query['ai.inferred_focus_areas'] = {
//                 $elemMatch: { $regex: new RegExp(`^${area.trim()}$`, 'i') }
//             };
//         }

//         // ─── 💰 Budget filter ─────────────────────────────────────────────────
//         if (budget && !isNaN(budget)) {
//             query.$and = query.$and || [];
//             query.$and.push({
//                 $or: [
//                     { 'financials.maxAmount': { $lte: Number(budget) } },
//                     { 'financials.maxAmount': null },
//                     { 'financials.maxAmount': { $exists: false } },
//                 ]
//             });
//         }

//         // ─── 🔓 Status filter ─────────────────────────────────────────────────
//         if (status) {
//             if (status.toLowerCase() === 'open') query.isOpen = true;
//             if (status.toLowerCase() === 'closed') query.isOpen = false;
//         }

//         // ─── 📊 Sort ──────────────────────────────────────────────────────────
//         let sortObj = { createdAt: -1 };
//         if (sort === 'deadline') sortObj = { 'raw.deadline': 1 };
//         if (sort === 'amount') sortObj = { 'financials.maxAmount': -1 };

//         // 🧪 DEBUG
//         console.log('FINAL QUERY =>', JSON.stringify(query, null, 2));

//         query.type = 0;

//         // ─── 📅 Today filter ─────────────────────────────────────────────────
//         const startOfToday = new Date();
//         startOfToday.setHours(0, 0, 0, 0);

//         // ─── 📦 Fetch ─────────────────────────────────────────────────────────
//         const grants = await Grant.find({
//             ...query,
//             //createdAt: { $gte: startOfToday }
//         })
//             .sort(sortObj)
//             .skip((page - 1) * limit)
//             .limit(limit)
//             .select('title TitleURL donor financials deadline isOpen imageUrl raw ai geography')
//             .lean();

//         // ─── 🔄 Normalize (ONLY image fix, keep TitleURL as-is) ───────────────
//         const normalizedGrants = grants.map(g => {
//             const resolvedUrl = Array.isArray(g.imageUrl)
//                 ? (g.imageUrl[0] || '')
//                 : (g.imageUrl || '');

//             return {
//                 ...g,
//                 TitleURL: g.TitleURL || null,   // ✅ return DB value only
//                 url: g.TitleURL ? `/grants/${g.TitleURL}` : null, // optional
//                 imageUrl: resolvedUrl,
//                 raw: g.raw
//                     ? { ...g.raw, imageUrl: resolvedUrl }
//                     : { imageUrl: resolvedUrl },
//             };
//         });

//         // ─── 🔢 FIXED COUNT ───────────────────────────────────────────────────
//         const total = await Grant.countDocuments({
//             ...query,
//             //createdAt: { $gte: startOfToday }
//         });

//         // ─── ✅ Response ──────────────────────────────────────────────────────
//         return res.status(200).json({
//             success: true,
//             total,
//             page,
//             totalPages: Math.ceil(total / limit),
//             count: normalizedGrants.length,
//             data: normalizedGrants,
//         });

//     } catch (err) {
//         console.error('getGrants ERROR:', err);
//         return res.status(500).json({
//             success: false,
//             message: err.message
//         });
//     }
// };

exports.getGrants = async (req, res) => {
    try {
        const mongoose = require('mongoose');

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

        const query = {};

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

        // ─── 🔓 Status filter ─────────────────────────────────────────────────
        if (status) {
            if (status.toLowerCase() === 'open') {
                query.$and = query.$and || [];
                query.$and.push({
                    $or: [
                        { isOpen: true },
                        { deadline: null },
                        { deadline: { $exists: false } },
                    ]
                });
            }
            if (status.toLowerCase() === 'closed') query.isOpen = false;
        }

        // ─── 📅 Deadline filter ───────────────────────────────────────────────
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        query.$and = query.$and || [];
        query.$and.push({
            $or: [
                { deadline: { $gte: startOfToday } },  // future/today deadline
                { deadline: null },                     // rolling — null
                { deadline: { $exists: false } },       // rolling — field nahi
            ]
        });

        query.type = 0;

        console.log('FINAL QUERY =>', JSON.stringify(query, null, 2));

        // ─── 🔢 Total count ───────────────────────────────────────────────────
        const total = await Grant.countDocuments(query);
        const totalPages = Math.ceil(total / limit);

        // ─── 🐛 DEBUG ─────────────────────────────────────────────────────────
        const debugId = new mongoose.Types.ObjectId('69e3bb2db8de3c1956926699');
        const debugRecord = await Grant.findOne({ _id: debugId });
        console.log('RECORD EXISTS =>', !!debugRecord);
        console.log('RECORD DEADLINE =>', debugRecord?.deadline);
        console.log('RECORD TYPE =>', debugRecord?.type);
        console.log('RECORD isOpen =>', debugRecord?.isOpen);

        const matchesQuery = await Grant.countDocuments({ ...query, _id: debugId });
        console.log('MATCHES FULL QUERY =>', matchesQuery);

        const matchesType = await Grant.countDocuments({ _id: debugId, type: 0 });
        console.log('MATCHES TYPE =>', matchesType);

        const matchesDeadline = await Grant.countDocuments({
            _id: debugId,
            $or: [
                { deadline: { $gte: startOfToday } },
                { deadline: null },
                { deadline: { $exists: false } },
            ]
        });
        console.log('MATCHES DEADLINE =>', matchesDeadline);
        // ─────────────────────────────────────────────────────────────────────

        // ─── 📊 Sort + aggregation ────────────────────────────────────────────
        const grants = await Grant.aggregate([
            { $match: query },
            {
                $addFields: {
                    _daysRemaining: {
                        $cond: {
                            if: { $and: [{ $gt: ['$deadline', null] }, { $gt: ['$deadline', false] }] },
                            then: {
                                $divide: [
                                    { $subtract: ['$deadline', startOfToday] },
                                    1000 * 60 * 60 * 24
                                ]
                            },
                            else: -1  // ✅ null/missing = rolling = descending mein sabse last
                        }
                    }
                }
            },
            {
                $sort: sort === 'amount'
                    ? { 'financials.maxAmount': -1 }
                    : sort === 'newest'
                        ? { createdAt: -1 }
                        : { _daysRemaining: -1 },  // ✅ 29 → 26 → 3 → 2 → 1 → rolling(-1)
            },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
                $project: {
                    title: 1,
                    TitleURL: 1,
                    donor: 1,
                    financials: 1,
                    deadline: 1,
                    isOpen: 1,
                    imageUrl: 1,
                    raw: 1,
                    ai: 1,
                    geography: 1,
                    inferred_focus_areas: 1,
                    createdAt: 1,
                    _daysRemaining: 1,
                }
            }
        ]);

        // ─── 🔄 Normalize ─────────────────────────────────────────────────────
        const normalizedGrants = grants.map(g => {
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

        console.log('DB NAME =>', mongoose.connection.db.databaseName);
        console.log('COLLECTION =>', Grant.collection.collectionName);

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

//////////////////////////////////////////////////////////////////////////////
const DEADLINE_PATTERNS = [
    /\b(\d{4}-\d{2}-\d{2})\b/,
    /\b(\d{1,2}(?:st|nd|rd|th)?\s(?:January|February|March|April|May|June|July|August|September|October|November|December),?\s\d{4})\b/i,
    /\b(\d{1,2}(?:st|nd|rd|th)?\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s\d{4})\b/i,
    /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s\d{1,2}(?:st|nd|rd|th)?,?\s\d{4})\b/i,
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s\d{1,2}(?:st|nd|rd|th)?,?\s\d{4})\b/i,
    /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\b/,
];

const YEARLESS_DATE_PATTERNS = [
    /\b(\d{1,2}(?:st|nd|rd|th)?\s(?:January|February|March|April|May|June|July|August|September|October|November|December))\b/i,
    /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s\d{1,2}(?:st|nd|rd|th)?)\b/i,
    /\b(\d{1,2}(?:st|nd|rd|th)?\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)\b/i,
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s\d{1,2}(?:st|nd|rd|th)?)\b/i,
];

const AMOUNT_PATTERNS = [
    /(?:up\s+to\s+)?(?:INR|Rs\.?|₹)\s?[\d,]+(?:\.\d+)?(?:\s*(?:crore|lakh|Cr|L|million|billion|thousand|M|B|K))?/gi,
    /\b(?:INR|USD|EUR|GBP|CHF|CAD|AUD)\s?[\d,]+(?:\.\d+)?(?:\s*(?:crore|lakh|Cr|L|million|billion|thousand|M|B|K))?\b/gi,
    /(?:up\s+to\s+)?(?:\$|€|£)\s?[\d,]+(?:\.\d+)?(?:\s*(?:million|billion|thousand|M|B|K))?/gi,
    /\b[\d]{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:crore|lakh|Cr|L|million|billion|thousand|M|B|K)?\s*(?:INR|rupees?|Rs\.?|₹|US\s)?(?:dollars?|euros?|pounds?)?\b/gi,
];

const DETAIL_LINK_PATTERNS = /apply|proposal|call|notice|guideline|rfp|deadline|funding|grant|opportunity|programme|program/i;
const APPLY_LINK_PATTERNS = /apply|register|submit|application|enroll|signup/i;
const BANNED_KEYWORDS = ["award", "medal", "internship", "fellowship", "prize", "recognition", "scholarship", "competition"];
const SKIP_DOMAINS = ["unpartnerportal.org"];


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function inferYear(dateStr) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const withCurrentYear = new Date(`${dateStr} ${currentYear}`);
    if (!isNaN(withCurrentYear)) {
        return withCurrentYear < now ? `${dateStr} ${currentYear + 1}` : `${dateStr} ${currentYear}`;
    }
    return `${dateStr} ${currentYear}`;
}

function extractDeadline(text) {
    if (!text) return null;
    const MONTH_PATTERN = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)/i;

    const contextPatternsWithYear = [
        /(?:deadline|closing\s+date|last\s+date|due\s+date|submission\s+date|apply\s+by|open\s+until|applications?\s+(?:due|close))[:\s\-–]+([^\n\r,\.;]{5,60})/gi,
        /(?:closes?|submit\s+by|applications?\s+accepted\s+until|last\s+date\s+to\s+apply)[:\s\-–]+([^\n\r,\.;]{5,60})/gi,
    ];
    for (let pattern of contextPatternsWithYear) {
        for (let match of [...text.matchAll(pattern)]) {
            const candidate = match[1].trim();
            if (/\d{4}-\d{2}-\d{2}/.test(candidate)) return candidate.match(/\d{4}-\d{2}-\d{2}/)[0];
            if (/\d{4}/.test(candidate) && MONTH_PATTERN.test(candidate)) return candidate.slice(0, 50).trim();
        }
    }

    const contextPatternsNoYear = [
        /(?:deadline|closing\s+date|last\s+date|due\s+date|submission\s+date|apply\s+by|open\s+until|applications?\s+(?:due|close))[:\s\-–]+([^\n\r,\.;]{3,40})/gi,
        /(?:closes?|submit\s+by|last\s+date\s+to\s+apply)[:\s\-–]+([^\n\r,\.;]{3,40})/gi,
    ];
    for (let pattern of contextPatternsNoYear) {
        for (let match of [...text.matchAll(pattern)]) {
            const candidate = match[1].trim();
            if (MONTH_PATTERN.test(candidate) && /\d{1,2}/.test(candidate) && !/\d{4}/.test(candidate)) {
                return inferYear(candidate.slice(0, 25).trim());
            }
        }
    }

    for (let pattern of DEADLINE_PATTERNS) {
        const match = text.match(pattern);
        if (match) return match[1] || match[0];
    }
    for (let pattern of YEARLESS_DATE_PATTERNS) {
        const match = text.match(pattern);
        if (match) return inferYear(match[1]);
    }
    return null;
}

function extractHiddenDates(rawHtml) {
    if (!rawHtml) return null;
    const checks = [
        /"(?:deadline|endDate|validThrough|dateDeadline|closingDate|applicationDeadline)":\s*"([^"]+)"/gi,
        /<time[^>]*datetime=["']([^"']+)["']/gi,
        /(?:data-deadline|data-date|data-closing|data-end)[=\s:]["']([^"']{5,30})["']/gi,
        /<input[^>]*type=["']date["'][^>]*value=["']([^"']+)["']/gi,
        /<input[^>]*value=["']([^"']+)["'][^>]*type=["']date["']/gi,
        /<meta[^>]*(?:name|property)=["'][^"']*(?:deadline|date|closing)[^"']*["'][^>]*content=["']([^"']+)["']/gi,
        /<meta[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["'][^"']*(?:deadline|date)[^"']*["']/gi,
    ];
    for (let pattern of checks) {
        for (let match of [...rawHtml.matchAll(pattern)]) {
            const candidate = match[1].trim();
            if (
                /\d{4}-\d{2}-\d{2}/.test(candidate) ||
                /\d{1,2}\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(candidate) ||
                /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s\d{1,2}/i.test(candidate)
            ) return candidate;
        }
    }
    return null;
}

function extractAmount(text) {
    if (!text) return null;
    const contextPatterns = [
        /(?:grant\s+amount|award\s+amount|total\s+(?:grant|award|funding|budget)|(?:maximum|max|up\s+to)\s+(?:grant|award|funding|amount)?)[:\s\-–]+([^\n\r,\.;]{3,60})/gi,
        /(?:funding\s+(?:amount|range|up\s+to|of)|budget\s+(?:of|up\s+to))[:\s\-–]+([^\n\r,\.;]{3,60})/gi,
        /(?:grants?\s+(?:ranging|of|up\s+to|between)|awards?\s+(?:of|up\s+to))[:\s\-–]+([^\n\r,\.;]{3,60})/gi,
        /(?:prize\s+money|funding\s+support|grant\s+support|financial\s+support)[:\s\-–]+([^\n\r,\.;]{3,60})/gi,
    ];
    let result = null;
    for (let pattern of contextPatterns) {
        for (let match of [...text.matchAll(pattern)]) {
            const candidate = match[1].trim();
            if (/\d/.test(candidate)) { result = candidate.replace(/\s+/g, " ").slice(0, 60).trim(); break; }
        }
        if (result) break;
    }
    if (!result) {
        for (let pattern of AMOUNT_PATTERNS) {
            pattern.lastIndex = 0;
            const match = pattern.exec(text);
            if (match) { result = match[0].trim(); break; }
        }
    }
    if (result && (!/\d/.test(result) || result.trim().length < 3)) return null;
    return result || null;
}

function parseMaxAmount(rawAmount) {
    if (!rawAmount) return null;
    const cleaned = rawAmount.replace(/,/g, "").toLowerCase();
    const match = cleaned.match(/([\d.]+)\s*(crore|lakh|million|billion|thousand|cr|m|b|k)?/);
    if (!match) return null;
    let num = parseFloat(match[1]);
    const unit = match[2] || "";
    if (unit.startsWith("crore") || unit === "cr") num *= 10000000;
    else if (unit.startsWith("lakh")) num *= 100000;
    else if (unit.startsWith("million") || unit === "m") num *= 1000000;
    else if (unit.startsWith("billion") || unit === "b") num *= 1000000000;
    else if (unit.startsWith("thousand") || unit === "k") num *= 1000;
    return Math.round(num);
}

function parseCurrency(rawAmount) {
    if (!rawAmount) return "Unknown";
    if (/INR|Rs|₹|crore|lakh/i.test(rawAmount)) return "INR";
    if (/USD|\$/i.test(rawAmount)) return "USD";
    if (/EUR|€/i.test(rawAmount)) return "EUR";
    if (/GBP|£/i.test(rawAmount)) return "GBP";
    if (/CAD/i.test(rawAmount)) return "CAD";
    if (/AUD/i.test(rawAmount)) return "AUD";
    return "Unknown";
}

function parseEligibility(eligibility) {
    if (!eligibility) return [];
    if (Array.isArray(eligibility)) return eligibility.slice(0, 5);
    return eligibility
        .split(/[.;]/)
        .map(s => s.trim())
        .filter(s => s.length > 5)
        .slice(0, 5);
}

// ─── FIX: parse inferred_focus_areas safely ───────────────────────────────────
function parseFocusAreas(focusAreas) {
    if (!focusAreas) return [];
    if (Array.isArray(focusAreas)) return focusAreas.slice(0, 5).map(f => String(f).toLowerCase().trim());
    if (typeof focusAreas === "string") {
        return focusAreas
            .split(/[,;]/)
            .map(s => s.trim().toLowerCase())
            .filter(s => s.length > 1)
            .slice(0, 5);
    }
    return [];
}

function extractApplyUrl(links, rawHtml, sourceUrl) {
    const applyLink = links.find(l => APPLY_LINK_PATTERNS.test(l));
    if (applyLink) return applyLink;
    const applyPatterns = [
        /href=["']([^"']+)["'][^>]*>[\s\S]{0,50}(?:apply\s*now|apply\s*here|submit\s*application|register\s*now)/gi,
    ];
    for (let pattern of applyPatterns) {
        const match = rawHtml.match(pattern);
        if (match) {
            const urlMatch = match[0].match(/href=["']([^"']+)["']/i);
            if (urlMatch) {
                try { return new URL(urlMatch[1], sourceUrl).href; } catch { }
            }
        }
    }
    return sourceUrl;
}

function cleanText(text) {
    return text
        .replace(/\s+/g, " ")
        .replace(/ADVERTISEMENT|COOKIE POLICY|SIGN UP|LOG IN|SUBSCRIBE/gi, "")
        .trim()
        .slice(0, 18000);
}

function isGrantAllowed(g) {
    if (g.type !== "grant") return false;
    const name = (g.grant_name || "").toLowerCase();
    const hasGrantSignal = /grant|fund|funding|scheme|programme|program|support|subsidy/.test(name);
    if (hasGrantSignal) return true;
    return !BANNED_KEYWORDS.some(k => name.includes(k));
}

async function fetchPageText(url, browser) {
    let text = "", links = [], rawHtml = "";

    // Axios with strong headers
    try {
        const response = await axios.get(url, {
            timeout: 20000,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Connection": "keep-alive",
                "Cache-Control": "max-age=0",
                "sec-ch-ua": '"Chromium";v="122", "Not(A:Brand";v="24"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
                "sec-fetch-dest": "document",
                "sec-fetch-mode": "navigate",
                "sec-fetch-site": "none",
                "sec-fetch-user": "?1",
                "Upgrade-Insecure-Requests": "1",
            }
        });
        rawHtml = response.data;
        const $ = cheerio.load(rawHtml);
        const jsonLdBlocks = [];
        $('script[type="application/ld+json"]').each((i, el) => jsonLdBlocks.push($(el).html() || ""));
        if (jsonLdBlocks.length > 0) rawHtml += "\n" + jsonLdBlocks.join("\n");
        $("script, style, nav, footer, header, .advertisement, .cookie, #cookie").remove();
        text = $("body").text();
        $("a").each((i, el) => {
            const href = $(el).attr("href");
            const linkText = $(el).text().toLowerCase();
            if (!href || href.startsWith("#")) return;
            try {
                const fullUrl = new URL(href, url).href;
                if (fullUrl.split("#")[0] === url.split("#")[0]) return;
                if (DETAIL_LINK_PATTERNS.test(href) || DETAIL_LINK_PATTERNS.test(linkText)) links.push(fullUrl);
            } catch { }
        });

        if (text.length > 300) return { text, rawHtml, links: [...new Set(links)] };
    } catch (err) {
        console.log(`  ↩ Axios failed, using Puppeteer: ${url}`);
    }

    // Stealth Puppeteer fallback
    let page;
    try {
        page = await browser.newPage();
        await page.setExtraHTTPHeaders({
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        });
        await page.setViewport({ width: 1920, height: 1080 });
        await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

        // SPA render wait
        await new Promise(resolve => setTimeout(resolve, 3000));
        await Promise.race([
            page.waitForSelector("main, article, .content, body"),
            new Promise(resolve => setTimeout(resolve, 8000))
        ]);
        text = await page.evaluate(() => document.body.innerText);
        rawHtml = await page.content();

        const $ = cheerio.load(rawHtml);
        const jsonLdBlocks = [];
        $('script[type="application/ld+json"]').each((i, el) => jsonLdBlocks.push($(el).html() || ""));
        if (jsonLdBlocks.length > 0) rawHtml += "\n" + jsonLdBlocks.join("\n");

        links = await page.evaluate((patternSource) => {
            return Array.from(document.querySelectorAll("a"))
                .map(a => ({ href: a.href, text: a.innerText.toLowerCase() }))
                .filter(a => {
                    if (!a.href || a.href.startsWith("#")) return false;
                    const re = new RegExp(patternSource, "i");
                    return re.test(a.href) || re.test(a.text);
                })
                .map(a => a.href).filter(Boolean);
        }, DETAIL_LINK_PATTERNS.source);

    } catch (puppeteerErr) {
        console.error(`  ❌ Puppeteer also failed: ${url}`, puppeteerErr.message);
    } finally {
        if (page) await page.close();
    }

    return { text, rawHtml, links: [...new Set(links)] };
}

async function extractPDFText(pdfUrl) {
    try {
        const res = await axios.get(pdfUrl, { responseType: "arraybuffer", timeout: 30000, headers: { "User-Agent": "Mozilla/5.0" } });
        const data = await pdf(res.data);
        return data.text || "";
    } catch { return ""; }
}

async function deepCrawlForMissingFields(links, browser, currentDeadline, currentAmount, maxLinks = 5) {
    let deadline = currentDeadline, amount = currentAmount;
    if (deadline && amount) return { deadline, amount };
    const prioritizedLinks = links
        .filter(l => !l.endsWith(".jpg") && !l.endsWith(".png") && !l.endsWith(".css"))
        .slice(0, maxLinks);
    for (let link of prioritizedLinks) {
        if (deadline && amount) break;
        try {
            let subText = "", subHtml = "";
            if (link.endsWith(".pdf")) {
                subText = await extractPDFText(link);
            } else {
                const result = await fetchPageText(link, browser);
                subText = result.text; subHtml = result.rawHtml;
            }
            if (subText.length < 200) continue;
            if (!deadline) deadline = extractDeadline(subText) || extractHiddenDates(subHtml);
            if (!amount) amount = extractAmount(subText);
        } catch (err) {
            console.log(`  ⚠ Sub-page error: ${link} - ${err.message}`);
        }
    }
    return { deadline, amount };
}

// ─── FIX: buildPrompt now requests inferred_focus_areas ──────────────────────
function buildPrompt(text, detectedDeadline, detectedAmount) {
    return `You are an expert grant extraction system for NGOs and startups globally, including India.

Pre-detected values:
- Deadline: ${detectedDeadline || "NOT FOUND - search carefully"}
- Amount: ${detectedAmount || "NOT FOUND - search carefully"}

RULES:
1. Extract ONLY real funding: grants, challenge grants, innovation grants, startup grants, government schemes with financial support
2. Do NOT extract: honorary awards/medals, internships, academic fellowships, scholarships, honorary prizes with no cash
3. "Challenge" is OK if it provides real funding to winners
4. For deadline: look for "deadline", "last date", "closing date", "due date", "submit by", "apply by", "open until"
5. For amount: look for "$", "USD", "EUR", "INR", "Rs", "₹", "Cr", "Lakh", "up to", "maximum", "prize money"
6. If deadline not found use pre-detected deadline
7. If amount not found use pre-detected amount
8. status: if deadline is null OR not found, set status to "rolling", else "active"
9. type: always "grant"
10. eligibility: Extract EXACTLY 5 short bullet points, max 10 words each. Return as JSON array.
    Example: ["Must be Indian citizen", "Registered startup only", "Less than 5 years old", "Turnover under 1Cr", "Not listed on exchange"]
11. inferred_focus_areas: Extract 3 to 5 short thematic tags (lowercase) describing what sector or theme this grant targets.
    Example: ["climate tech", "women founders", "rural india", "seed stage", "edtech"]
    Return as JSON array of short lowercase strings. If unclear, infer from context.
12. apply_url: Find "Apply Now", "Apply Here", "Submit", "Register" links. If not found return null.

Return ONLY valid JSON array, no markdown:
[{
  "grant_name": "string",
  "deadline": "string or null",
  "amount": "string or null",
  "region": "string",
  "donor_agency": "string",
  "eligibility": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "inferred_focus_areas": ["tag1", "tag2", "tag3"],
  "short_description": "string",
  "apply_url": "string or null",
  "status": "active" | "rolling",
  "type": "grant"
}]

TEXT:
${text}`;
}

async function callOpenAIWithRetry(prompt, retries = 4, delayMs = 15000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const gptResponse = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.1,
            });
            return gptResponse.choices[0].message.content;
        } catch (err) {
            const is429 = err?.status === 429 || err?.message?.includes("429");
            const isLast = attempt === retries;
            if (is429 && !isLast) {
                const retryAfter = err?.headers?.["retry-after"];
                const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : delayMs * attempt;
                console.log(`  ⏳ Rate limited. Waiting ${waitMs / 1000}s...`);
                await sleep(waitMs);
            } else throw err;
        }
    }
}

async function agentPlanUrls(urls) {
    console.log("🧠 Agent: Planning URLs...");
    try {
        const prompt = `Analyze these URLs. Rank by likelihood of containing real grant/funding opportunities.
Return ONLY JSON array:
[{"url": "...", "priority": 1-5, "strategy": "shallow|deep|skip", "reason": "short"}]
Priority 5=definitely grants, 1=unlikely. skip=not grant related.
URLs: ${JSON.stringify(urls.slice(0, 60))}`;

        const result = await callOpenAIWithRetry(prompt);
        const ranked = JSON.parse(result.replace(/```json/gi, "").replace(/```/g, "").trim());
        console.log(`🧠 Planner: ${ranked.filter(u => u.strategy !== "skip").length} queued, ${ranked.filter(u => u.strategy === "skip").length} skipped`);
        return ranked
            .filter(u => u.strategy !== "skip")
            .sort((a, b) => b.priority - a.priority)
            .map(u => ({ url: u.url, strategy: u.strategy }));
    } catch (err) {
        console.warn("⚠ Planner failed, original order:", err.message);
        return urls.map(u => ({ url: u, strategy: "shallow" }));
    }
}

// ─── FIX: agentEvaluateGrant now scores inferred_focus_areas ─────────────────
async function agentEvaluateGrant(grant) {
    try {
        const prompt = `Rate this grant 0-100 for completeness.
+25 grant_name meaningful, +25 deadline future date, +20 amount exists, +10 donor known, +10 eligibility 5 points, +5 description, +5 inferred_focus_areas exists
Return ONLY JSON: {"score": number, "issues": ["..."], "is_valid": true|false}
Grant: ${JSON.stringify(grant)}`;

        const result = await callOpenAIWithRetry(prompt);
        return JSON.parse(result.replace(/```json/gi, "").replace(/```/g, "").trim());
    } catch (err) {
        const score =
            (grant.grant_name ? 25 : 0) +
            (grant.deadline ? 25 : 0) +
            (grant.amount ? 20 : 0) +
            (grant.donor_agency ? 10 : 0) +
            (grant.eligibility?.length > 0 ? 10 : 0) +
            (grant.short_description ? 5 : 0) +
            (grant.inferred_focus_areas?.length > 0 ? 5 : 0); // FIX: added
        return { score, issues: [], is_valid: score >= 40 };
    }
}

async function agentLoadMemory() {
    try {
        const memory = await GrantMemoryModel.find({});
        const skipUrls = new Set(memory.filter(m => m.skip).map(m => m.url));
        console.log(`🧠 Memory: ${memory.length} tracked, ${skipUrls.size} will skip`);
        return skipUrls;
    } catch (err) {
        console.warn("⚠ Memory load failed:", err.message);
        return new Set();
    }
}

// ─── FIX: agentUpdateMemory defined once with 3-fail logic ───────────────────
async function agentUpdateMemory(url, grantsFound, avgScore) {
    try {
        const existing = await GrantMemoryModel.findOne({ url });
        const currentFailCount = existing?.fail_count || 0;
        const newFailCount = grantsFound === 0 ? currentFailCount + 1 : 0;

        await GrantMemoryModel.findOneAndUpdate(
            { url },
            {
                $set: {
                    url,
                    last_scraped: new Date(),
                    grants_found: grantsFound,
                    avg_score: avgScore,
                    fail_count: newFailCount,
                    skip: newFailCount >= 3,
                    skip_reason: newFailCount >= 3 ? "Failed 3 times consecutively" : null,
                },
            },
            { upsert: true }
        );
    } catch (err) {
        console.warn(`⚠ Memory update failed ${url}:`, err.message);
    }
}

exports.createGrantScrap = async (req, res) => {

    const finalResults = [];
    const globalUniqueMap = new Map();
    const OPENAI_DELAY_MS = 3000;
    const MIN_QUALITY_SCORE = 55;
    const MIN_DAYS_LEFT = 10;
    let browser, urls = [];

    const agentStats = {
        totalUrls: 0,
        skippedByMemory: 0,
        skippedByPlanner: 0,
        expiredDiscarded: 0,
        lowDeadlineDiscarded: 0,
        nullDeadlineDiscarded: 0,
        noAmountDiscarded: 0,
        unknownDonorDiscarded: 0,
        vagueNameDiscarded: 0,
        lowQualityDiscarded: 0,
        duplicateSkipped: 0,
        saved: 0,
    };

    try {

        // STEP 0: URLs fetch
        try {
            const apiRes = await axios.get("http://localhost:7777/api/admin/getUrlLink", { timeout: 10000 });
            const dynamicUrls = apiRes.data.flatMap(item =>
                item.links.map(link => link.replace(/,$/, "").trim()).filter(link => link.startsWith("http"))
            );
            urls = [...new Set(dynamicUrls)];
            agentStats.totalUrls = urls.length;
            console.log(`🌐 Total URLs: ${urls.length}`);
        } catch (err) {
            console.error("❌ URL fetch failed:", err.message);
            return res.status(500).json({ success: false, message: "URL fetch failed" });
        }

        if (urls.length === 0) return res.status(400).json({ success: false, message: "No URLs found" });

        // AGENT: Memory
        const skipUrlsFromMemory = await agentLoadMemory();
        const urlsToProcess = urls.filter(u => !skipUrlsFromMemory.has(u));
        agentStats.skippedByMemory = urls.length - urlsToProcess.length;
        console.log(`🧠 Memory skip: ${agentStats.skippedByMemory}`);

        // AGENT: Planner
        const plannedUrls = await agentPlanUrls(urlsToProcess);
        agentStats.skippedByPlanner = urlsToProcess.length - plannedUrls.length;
        console.log(`🧠 Queued: ${plannedUrls.length}`);

        browser = await puppeteer.launch({
            headless: "new",
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--window-size=1920,1080",
                "--disable-blink-features=AutomationControlled",
            ]
        });

        // MAIN LOOP
        for (let { url, strategy } of plannedUrls) {
            try {
                const domain = new URL(url).hostname;
                if (SKIP_DOMAINS.some(d => domain.includes(d))) continue;

                console.log(`\n🌐 [${strategy.toUpperCase()}] ${url}`);

                const { text: rawText, rawHtml, links } = await fetchPageText(url, browser);

                if (!rawText || rawText.length < 300) {
                    await agentUpdateMemory(url, 0, 0);
                    continue;
                }

                const mainText = cleanText(rawText);
                let detectedDeadline = extractDeadline(mainText) || extractHiddenDates(rawHtml);
                let detectedAmount = extractAmount(mainText);

                if (!detectedDeadline || !detectedAmount) {
                    const deepResult = await deepCrawlForMissingFields(links, browser, detectedDeadline, detectedAmount);
                    detectedDeadline = deepResult.deadline;
                    detectedAmount = deepResult.amount;
                }

                const pageApplyUrl = extractApplyUrl(links, rawHtml, url);

                await sleep(OPENAI_DELAY_MS);

                let content;
                try {
                    content = await callOpenAIWithRetry(buildPrompt(mainText, detectedDeadline, detectedAmount));
                } catch (err) {
                    console.error(`❌ OpenAI failed: ${url}`);
                    await agentUpdateMemory(url, 0, 0);
                    continue;
                }

                content = content.replace(/```json/gi, "").replace(/```/g, "").trim();

                let grants;
                try {
                    grants = JSON.parse(content);
                } catch {
                    const match = content.match(/\[[\s\S]*\]/);
                    if (match) { try { grants = JSON.parse(match[0]); } catch { continue; } }
                    else continue;
                }

                if (!Array.isArray(grants)) continue;

                const now = new Date();
                let urlScores = [];
                let savedFromThisUrl = 0;

                for (const g of grants) {

                    if (!isGrantAllowed(g)) continue;

                    const resolvedDeadline = g.deadline || detectedDeadline;
                    const resolvedAmount = g.amount || detectedAmount || null;
                    const parsedDeadline = resolvedDeadline ? new Date(resolvedDeadline) : null;
                    const isValidDate = parsedDeadline && !isNaN(parsedDeadline);
                    const isOpen = isValidDate ? parsedDeadline > now : true;
                    const daysLeft = isValidDate ? Math.ceil((parsedDeadline - now) / (1000 * 60 * 60 * 24)) : null;

                    const status = isValidDate
                        ? (parsedDeadline > now ? "active" : "expired")
                        : (g.status === "rolling" ? "rolling" : "rolling");

                    const eligibilityPoints = parseEligibility(g.eligibility);

                    // ─── FIX: parse inferred_focus_areas from AI response ─────────
                    const inferredFocusAreas = parseFocusAreas(g.inferred_focus_areas);

                    const applyUrl = g.apply_url || pageApplyUrl || url;

                    const grant = {
                        raw: {
                            grant_name: g.grant_name,
                            deadline: resolvedDeadline || null,
                            amount: resolvedAmount,
                            region: g.region || null,
                            donor_agency: g.donor_agency || null,
                            eligibility: eligibilityPoints,
                            inferred_focus_areas: inferredFocusAreas,   // FIX: added to raw
                            short_description: g.short_description || null,
                            source_url: url,
                            apply_url: applyUrl,
                        },
                        title: g.grant_name,
                        donor: g.donor_agency || "Unknown",
                        category: "grant",
                        inferred_focus_areas: inferredFocusAreas,        // FIX: added top-level for filtering/search
                        geography: {
                            region: g.region || null,
                            region_normalized: g.region ? g.region.toLowerCase().trim() : null,
                        },
                        financials: {
                            raw: resolvedAmount,
                            maxAmount: parseMaxAmount(resolvedAmount),
                            currency: parseCurrency(resolvedAmount),
                        },
                        deadline: isValidDate ? parsedDeadline : null,
                        status,
                        isOpen,
                        eligibility: eligibilityPoints,
                        shortDescription: g.short_description || null,
                        applyUrl,
                        // FIX: inferred_focus_areas included in searchText for full-text search
                        searchText: [
                            g.grant_name,
                            g.donor_agency,
                            g.region,
                            eligibilityPoints.join(" "),
                            inferredFocusAreas.join(" "),
                        ].filter(Boolean).join(" ").toLowerCase(),
                    };

                    // 1. Expired
                    if (!grant.isOpen) {
                        console.log(`  ⏰ Expired: ${grant.title}`);
                        agentStats.expiredDiscarded++; continue;
                    }

                    // 2. Deadline too close (rolling safe)
                    if (grant.status !== "rolling" && grant.deadline && daysLeft < MIN_DAYS_LEFT) {
                        console.log(`  ⏳ Only ${daysLeft} days left: ${grant.title}`);
                        agentStats.lowDeadlineDiscarded++; continue;
                    }

                    // 3. Expired (double-check)
                    if (grant.status === "expired") {
                        console.log(`  ⏰ Expired (condition 3): ${grant.title}`);
                        agentStats.nullDeadlineDiscarded++; continue;
                    }

                    // 4. No amount — log but keep
                    if (!grant.raw.amount) {
                        console.log(`  ⚠ No amount (keeping): ${grant.title}`);
                    }

                    // 5. Unknown donor
                    // BAAD MEIN
                    const UNKNOWN_DONOR_VALUES = ["unknown", "not specified", "n/a", "na",
                        "unspecified", "not available", "tbd", "none", ""];

                    if (!grant.donor || UNKNOWN_DONOR_VALUES.includes(grant.donor.toLowerCase().trim())) {
                        console.log(`  ❌ Unknown donor: ${grant.title}`);
                        agentStats.unknownDonorDiscarded++; continue;
                    }

                    // 6. Vague name
                    if (grant.title.trim().split(" ").length < 3) {
                        console.log(`  ❌ Vague name: ${grant.title}`);
                        agentStats.vagueNameDiscarded++; continue;
                    }

                    // 7. AI quality score
                    const evaluation = await agentEvaluateGrant(grant.raw);
                    urlScores.push(evaluation.score);
                    if (evaluation.score < MIN_QUALITY_SCORE) {
                        console.log(`  ❌ Low score (${evaluation.score}/100): ${grant.title}`);
                        agentStats.lowQualityDiscarded++; continue;
                    }

                    // 8. Global duplicate
                    const key = grant.title.toLowerCase().trim();
                    if (globalUniqueMap.has(key)) {
                        console.log(`  🔁 Duplicate: ${grant.title}`);
                        agentStats.duplicateSkipped++; continue;
                    }

                    // ALL PASS — SAVE
                    console.log(`  ✅ SAVED (${evaluation.score}/100) | ${daysLeft || "rolling"} days | focus: [${inferredFocusAreas.join(", ")}] | ${applyUrl}`);
                    globalUniqueMap.set(key, grant);
                    finalResults.push(grant);
                    savedFromThisUrl++;
                }

                const avgScore = urlScores.length > 0
                    ? Math.round(urlScores.reduce((a, b) => a + b, 0) / urlScores.length) : 0;

                await agentUpdateMemory(url, savedFromThisUrl, avgScore);
                console.log(`📊 ${savedFromThisUrl} saved from ${url}`);

            } catch (err) {
                console.error(`❌ URL error ${url}:`, err.message);
                await agentUpdateMemory(url, 0, 0);
            }
        }

        // STEP 9: Save DB
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

        agentStats.saved = finalResults.length;

        console.log("\n========== AGENT REPORT ==========");
        Object.entries(agentStats).forEach(([k, v]) => console.log(`${k.padEnd(25)}: ${v}`));
        console.log("===================================\n");

        return res.json({ success: true, total: finalResults.length, agentStats, data: finalResults });

    } catch (err) {
        console.error("❌ Fatal Error:", err.message);
        return res.status(500).json({ success: false, message: err.message });
    } finally {
        if (browser) await browser.close();
    }
};


//////////////////////////////////////////////////////////////////////////////////////////
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

        result.country = Array.isArray(result.country) && result.country.length > 0 ? result.country.filter(Boolean) : [grant.region || "Unknown"];
        result.focus_area = Array.isArray(result.focus_area) && result.focus_area.length > 0 ? result.focus_area.filter(Boolean) : ["Community Development"];
        result.region_normalized = (result.region_normalized || grant.region || "").toLowerCase().trim();
        result.donor_agency = result.donor_agency || grant.donor_agency || "Unknown";
        result.donor_agency_normalized = result.donor_agency_normalized || result.donor_agency;
        result.amount = result.amount?.trim() || grant.amount || "Not specified";

        let updatedDoc = null;
        if (grantId) {
            updatedDoc = await Grant.findByIdAndUpdate(grantId, {
                $set: {
                    "ai.inferred_focus_areas": result.focus_area,
                    "ai.inferred_focus_country": result.country,
                    "ai.inferred_region": result.region_normalized,
                    "ai.inferred_donor": result.donor_agency_normalized,
                    "ai.summary": result.short_description || "",
                    "ai.long_description": result.long_description || "",
                    "geography.region_normalized": result.region_normalized,
                    "geography.country": result.country,
                    "financials.raw": result.amount,
                    donor: result.donor_agency,
                    shortDescription: result.short_description || "",
                    hasAiDetail: true,
                }
            }, { new: true, runValidators: false }).lean();
            if (!updatedDoc) return res.status(404).json({ success: false, message: `Grant not found: ${grantId}` });
        }

        return res.status(200).json({ success: true, data: result, updatedDoc: updatedDoc || null });
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