
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

// ─── LOGGER ──────────────────────────────────────────────────────────────────
const LOG_PREFIX = {
    info:    "ℹ️ ",
    success: "✅ ",
    warn:    "⚠️ ",
    error:   "❌ ",
    skip:    "⏭️ ",
    save:    "💾 ",
    ai:      "🤖 ",
    focus:   "🎯 ",
    url:     "🌐 ",
    memory:  "🧠 ",
    time:    "⏱️ ",
    money:   "💰 ",
    db:      "🗄️ ",
    search:  "🔍 ",
    country: "🌍 ",
};

function log(type, ...args) {
    const prefix = LOG_PREFIX[type] || "   ";
    console.log(`${prefix}`, ...args);
}

function logSeparator(label = "") {
    const line = "─".repeat(60);
    if (label) {
        const pad = Math.max(0, Math.floor((58 - label.length) / 2));
        console.log(`\n┌${line}┐`);
        console.log(`│${" ".repeat(pad)}${label}${" ".repeat(60 - pad - label.length)}│`);
        console.log(`└${line}┘`);
    } else {
        console.log(`\n${line}`);
    }
}

// ─── SLEEP ───────────────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── INFER YEAR ──────────────────────────────────────────────────────────────
function inferYear(dateStr) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const withCurrentYear = new Date(`${dateStr} ${currentYear}`);
    if (!isNaN(withCurrentYear)) {
        return withCurrentYear < now
            ? `${dateStr} ${currentYear + 1}`
            : `${dateStr} ${currentYear}`;
    }
    return `${dateStr} ${currentYear}`;
}

// ─── EXTRACT DEADLINE ────────────────────────────────────────────────────────
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

// ─── EXTRACT HIDDEN DATES ────────────────────────────────────────────────────
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

// ─── EXTRACT AMOUNT ──────────────────────────────────────────────────────────
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
            if (/\d/.test(candidate)) {
                result = candidate.replace(/\s+/g, " ").slice(0, 60).trim();
                break;
            }
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

// ─── PARSE MAX AMOUNT ────────────────────────────────────────────────────────
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

// ─── PARSE CURRENCY ──────────────────────────────────────────────────────────
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

// ─── PARSE ELIGIBILITY ───────────────────────────────────────────────────────
function parseEligibility(eligibility) {
    if (!eligibility) return [];
    if (Array.isArray(eligibility)) return eligibility.slice(0, 5);
    return eligibility
        .split(/[.;]/)
        .map(s => s.trim())
        .filter(s => s.length > 5)
        .slice(0, 5);
}

// ─── PARSE FOCUS AREAS ───────────────────────────────────────────────────────
function parseFocusAreas(focusAreas, grantName = "") {
    const tag = grantName ? `[${grantName.slice(0, 30)}]` : "";

    if (!focusAreas) {
        log("warn", `${tag} inferred_focus_areas: null/undefined received from AI`);
        return [];
    }

    if (Array.isArray(focusAreas)) {
        const result = focusAreas
            .map(f => String(f).toLowerCase().trim())
            .filter(f => f.length > 1)
            .slice(0, 5);
        log("focus", `${tag} focus_areas (array path): [${result.join(", ")}]`);
        return result;
    }

    if (typeof focusAreas === "string") {
        if (focusAreas.trim().startsWith("[")) {
            try {
                const parsed = JSON.parse(focusAreas);
                if (Array.isArray(parsed)) {
                    const result = parsed
                        .map(f => String(f).toLowerCase().trim())
                        .filter(f => f.length > 1)
                        .slice(0, 5);
                    log("focus", `${tag} focus_areas (parsed string JSON): [${result.join(", ")}]`);
                    return result;
                }
            } catch (e) {
                log("warn", `${tag} Failed to JSON.parse string focus_areas: ${e.message}`);
            }
        }
        const result = focusAreas
            .split(/[,;]/)
            .map(s => s.trim().toLowerCase())
            .filter(s => s.length > 1)
            .slice(0, 5);
        log("focus", `${tag} focus_areas (split string): [${result.join(", ")}]`);
        return result;
    }

    log("warn", `${tag} inferred_focus_areas unexpected type: "${typeof focusAreas}"`);
    return [];
}

// ─── PARSE COUNTRIES ─────────────────────────────────────────────────────────
function parseCountries(countries, grantName = "") {
    const tag = grantName ? `[${grantName.slice(0, 30)}]` : "";

    if (!countries) {
        log("warn", `${tag} inferred_countries: null/undefined received from AI`);
        return [];
    }

    if (Array.isArray(countries)) {
        const result = countries
            .map(c => String(c).trim())
            .filter(c => c.length > 1)
            .slice(0, 10);
        log("country", `${tag} countries (array path): [${result.join(", ")}]`);
        return result;
    }

    if (typeof countries === "string") {
        if (countries.trim().startsWith("[")) {
            try {
                const parsed = JSON.parse(countries);
                if (Array.isArray(parsed)) {
                    const result = parsed
                        .map(c => String(c).trim())
                        .filter(c => c.length > 1)
                        .slice(0, 10);
                    log("country", `${tag} countries (parsed string JSON): [${result.join(", ")}]`);
                    return result;
                }
            } catch (e) {
                log("warn", `${tag} Failed to JSON.parse string countries: ${e.message}`);
            }
        }
        const result = countries
            .split(/[,;]/)
            .map(s => s.trim())
            .filter(s => s.length > 1)
            .slice(0, 10);
        log("country", `${tag} countries (split string): [${result.join(", ")}]`);
        return result;
    }

    log("warn", `${tag} inferred_countries unexpected type: "${typeof countries}"`);
    return [];
}

// ─── EXTRACT APPLY URL ───────────────────────────────────────────────────────
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

// ─── CLEAN TEXT ──────────────────────────────────────────────────────────────
function cleanText(text) {
    return text
        .replace(/\s+/g, " ")
        .replace(/ADVERTISEMENT|COOKIE POLICY|SIGN UP|LOG IN|SUBSCRIBE/gi, "")
        .trim()
        .slice(0, 18000);
}

// ─── IS GRANT ALLOWED ────────────────────────────────────────────────────────
function isGrantAllowed(g) {
    if (g.type !== "grant") {
        log("skip", `Not type=grant (type="${g.type}"): ${g.grant_name}`);
        return false;
    }
    const name = (g.grant_name || "").toLowerCase();
    const hasGrantSignal = /grant|fund|funding|scheme|programme|program|support|subsidy/.test(name);
    if (hasGrantSignal) return true;
    const banned = BANNED_KEYWORDS.find(k => name.includes(k));
    if (banned) {
        log("skip", `Banned keyword "${banned}": ${g.grant_name}`);
        return false;
    }
    return true;
}

// ─── FETCH PAGE TEXT ─────────────────────────────────────────────────────────
async function fetchPageText(url, browser) {
    let text = "", links = [], rawHtml = "";

    try {
        log("url", `Fetching via Axios: ${url}`);
        const response = await axios.get(url, {
            timeout: 20000,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Connection": "keep-alive",
                "Cache-Control": "max-age=0",
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

        if (text.length > 300) {
            log("success", `Axios OK — text: ${text.length} chars, links: ${links.length}`);
            return { text, rawHtml, links: [...new Set(links)] };
        }
        log("warn", `Axios returned too little text (${text.length} chars), falling back to Puppeteer`);
    } catch (err) {
        log("warn", `Axios failed (${err.message}), falling back to Puppeteer`);
    }

    let page;
    try {
        log("url", `Fetching via Puppeteer: ${url}`);
        page = await browser.newPage();
        await page.setExtraHTTPHeaders({
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        });
        await page.setViewport({ width: 1920, height: 1080 });
        await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
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

        log("success", `Puppeteer OK — text: ${text.length} chars, links: ${links.length}`);
    } catch (puppeteerErr) {
        log("error", `Puppeteer also failed: ${puppeteerErr.message}`);
    } finally {
        if (page) await page.close();
    }

    return { text, rawHtml, links: [...new Set(links)] };
}

// ─── EXTRACT PDF TEXT ────────────────────────────────────────────────────────
async function extractPDFText(pdfUrl) {
    try {
        log("url", `Extracting PDF: ${pdfUrl}`);
        const res = await axios.get(pdfUrl, { responseType: "arraybuffer", timeout: 30000, headers: { "User-Agent": "Mozilla/5.0" } });
        const data = await pdf(res.data);
        log("success", `PDF extracted: ${(data.text || "").length} chars`);
        return data.text || "";
    } catch (e) {
        log("warn", `PDF extraction failed: ${e.message}`);
        return "";
    }
}

// ─── DEEP CRAWL FOR MISSING FIELDS ───────────────────────────────────────────
async function deepCrawlForMissingFields(links, browser, currentDeadline, currentAmount, maxLinks = 5) {
    let deadline = currentDeadline, amount = currentAmount;
    if (deadline && amount) return { deadline, amount };

    log("info", `Deep crawl needed — deadline: ${deadline || "MISSING"}, amount: ${amount || "MISSING"}`);

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
                subText = result.text;
                subHtml = result.rawHtml;
            }
            if (subText.length < 200) continue;
            if (!deadline) {
                deadline = extractDeadline(subText) || extractHiddenDates(subHtml);
                if (deadline) log("time", `Deadline found in sub-page: "${deadline}" — ${link}`);
            }
            if (!amount) {
                amount = extractAmount(subText);
                if (amount) log("money", `Amount found in sub-page: "${amount}" — ${link}`);
            }
        } catch (err) {
            log("warn", `Sub-page error: ${link} — ${err.message}`);
        }
    }

    return { deadline, amount };
}

// ─── ✅ NEW: AGENTIC WEB SEARCH FOR MISSING DEADLINE + AMOUNT ────────────────
// Uses OpenAI web_search tool to globally find deadline/amount when all local methods fail
async function agentWebSearchMissingFields(grantName, donorAgency, region, currentDeadline, currentAmount) {
    const missingDeadline = !currentDeadline;
    const missingAmount = !currentAmount;

    if (!missingDeadline && !missingAmount) return { deadline: currentDeadline, amount: currentAmount };

    logSeparator("AGENT WEB SEARCH: MISSING FIELDS");
    log("search", `Grant: "${grantName}" | Donor: "${donorAgency}"`);
    log("search", `Missing → deadline: ${missingDeadline}, amount: ${missingAmount}`);

    const searchTerms = [grantName, donorAgency, region].filter(Boolean).join(" ");
    const missingFields = [
        missingDeadline ? "application deadline / closing date / last date to apply" : null,
        missingAmount ? "grant amount / funding amount / prize money / budget" : null,
    ].filter(Boolean).join(" AND ");

    const searchPrompt = `You are a grant research assistant with access to real-time web search.

Search the web globally for the following grant and find the MISSING information:

Grant Name: "${grantName}"
Donor / Organization: "${donorAgency}"
Region: "${region || "Global"}"
Search Terms: "${searchTerms}"

You MUST search the web for: ${missingFields}

Search strategy:
1. Search: "${grantName} ${donorAgency} deadline 2024 2025"
2. Search: "${grantName} application deadline closing date"
3. Search: "${grantName} grant amount funding"
4. Check official donor website, press releases, grant databases (Candid, GrantWatch, fundsforNGOs, etc.)

Return ONLY this JSON (no markdown, no preamble):
{
  "deadline": "found deadline string or null",
  "amount": "found amount string or null",
  "deadline_source": "URL where deadline was found or null",
  "amount_source": "URL where amount was found or null",
  "confidence": "high|medium|low"
}`;

    try {
        await sleep(2000);
        log("ai", `Calling OpenAI with web search for missing fields...`);
        const gptResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: searchPrompt }],
            temperature: 0.1,
            tools: [{
                type: "function",
                function: {
                    name: "web_search",
                    description: "Search the web for current grant information",
                    parameters: {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "Search query" }
                        },
                        required: ["query"]
                    }
                }
            }],
        });

        const result = gptResponse.choices[0].message.content || "";
        log("ai", `Web search response: ${result.slice(0, 300)}`);

        const clean = result.replace(/```json/gi, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(clean);

        const foundDeadline = missingDeadline ? (parsed.deadline || null) : currentDeadline;
        const foundAmount = missingAmount ? (parsed.amount || null) : currentAmount;

        if (foundDeadline) log("time", `Web search found deadline: "${foundDeadline}" (confidence: ${parsed.confidence})`);
        if (foundAmount) log("money", `Web search found amount: "${foundAmount}" (confidence: ${parsed.confidence})`);

        return { deadline: foundDeadline, amount: foundAmount };
    } catch (err) {
        log("warn", `agentWebSearchMissingFields failed: ${err.message}`);

        // ── Fallback: pure text prompt search (no tools) ──────────────────
        try {
            log("search", `Fallback: plain text web search prompt...`);
            const fallbackPrompt = `Search your knowledge and any available information for this grant:

Grant: "${grantName}"
Organization: "${donorAgency}"
Region: "${region || "Global"}"

Find:
${missingDeadline ? "- Application DEADLINE (closing date, last date to apply, due date)" : ""}
${missingAmount ? "- Grant AMOUNT (funding amount, prize money, maximum award, budget)" : ""}

If you know the grant, provide the information. If unsure, return nulls.

Return ONLY JSON:
{
  "deadline": "date string or null",
  "amount": "amount string or null",
  "confidence": "high|medium|low"
}`;

            const fallbackResponse = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: fallbackPrompt }],
                temperature: 0.1,
            });

            const fallbackResult = fallbackResponse.choices[0].message.content || "";
            const fallbackClean = fallbackResult.replace(/```json/gi, "").replace(/```/g, "").trim();
            const fallbackParsed = JSON.parse(fallbackClean);

            const foundDeadline = missingDeadline ? (fallbackParsed.deadline || null) : currentDeadline;
            const foundAmount = missingAmount ? (fallbackParsed.amount || null) : currentAmount;

            if (foundDeadline) log("time", `Fallback found deadline: "${foundDeadline}"`);
            if (foundAmount) log("money", `Fallback found amount: "${foundAmount}"`);

            return { deadline: foundDeadline, amount: foundAmount };
        } catch (fallbackErr) {
            log("error", `Fallback web search also failed: ${fallbackErr.message}`);
            return { deadline: currentDeadline, amount: currentAmount };
        }
    }
}

// ─── BUILD PROMPT ─────────────────────────────────────────────────────────────
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
10. eligibility: Extract EXACTLY 5 short bullet points, max 10 words each. Return as JSON array of strings.
    Example: ["Must be Indian citizen", "Registered startup only", "Less than 5 years old", "Turnover under 1Cr", "Not listed on exchange"]
11. inferred_focus_areas: REQUIRED. Extract 3 to 5 short thematic tags (lowercase strings).
    MUST be a JSON array of strings — never null.
    Example: ["climate tech", "women founders", "rural india", "seed stage", "edtech"]
12. inferred_countries: REQUIRED. Extract ALL countries or regions eligible to apply.
    Return as JSON array of country name strings (Title Case). If global/worldwide, return ["Global"].
    Example: ["India", "Bangladesh", "Nepal", "Sri Lanka"] or ["Global"] or ["United States", "Canada"]
    This is DIFFERENT from region — region is a broad area, countries are specific nations.
13. apply_url: Find "Apply Now", "Apply Here", "Submit", "Register" links. If not found return null.
14. about: Write a detailed, informative description of this grant in 150-200 words. Cover:
    - What the grant is for (mission/purpose)
    - Who the funder/donor is and their background
    - What types of projects or organizations are supported
    - Geographic focus and sector focus
    - Why this grant matters for applicants
    - Any unique features or requirements
    Make it professional, engaging, and useful for potential applicants.

CRITICAL: Return ONLY a valid JSON array. No markdown, no backticks, no preamble.
[{
  "grant_name": "string",
  "deadline": "string or null",
  "amount": "string or null",
  "region": "string",
  "inferred_countries": ["Country1", "Country2"],
  "donor_agency": "string",
  "eligibility": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "inferred_focus_areas": ["tag1", "tag2", "tag3"],
  "short_description": "string (1-2 sentences)",
  "about": "string (150-200 words detailed description)",
  "apply_url": "string or null",
  "status": "active",
  "type": "grant"
}]

TEXT:
${text}`;
}

// ─── CALL OPENAI WITH RETRY ───────────────────────────────────────────────────
async function callOpenAIWithRetry(prompt, retries = 4, delayMs = 15000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            log("ai", `OpenAI call attempt ${attempt}/${retries}...`);
            const gptResponse = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.1,
            });
            const result = gptResponse.choices[0].message.content;
            log("ai", `OpenAI responded — ${result.length} chars`);
            return result;
        } catch (err) {
            const is429 = err?.status === 429 || err?.message?.includes("429");
            const isLast = attempt === retries;
            if (is429 && !isLast) {
                const retryAfter = err?.headers?.["retry-after"];
                const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : delayMs * attempt;
                log("warn", `Rate limited (429). Waiting ${waitMs / 1000}s before retry ${attempt + 1}...`);
                await sleep(waitMs);
            } else {
                log("error", `OpenAI failed (attempt ${attempt}): ${err.message}`);
                throw err;
            }
        }
    }
}

// ─── PARSE GRANTS FROM AI CONTENT ────────────────────────────────────────────
function parseGrantsFromContent(content, url) {
    log("ai", `Parsing AI response — ${content.length} chars`);

    let grants;
    try {
        grants = JSON.parse(content);
        log("success", `JSON parsed directly — ${grants.length} grant(s) found`);
    } catch (e1) {
        log("warn", `Direct JSON.parse failed: ${e1.message} — trying regex fallback...`);
        const match = content.match(/\[[\s\S]*\]/);
        if (match) {
            try {
                grants = JSON.parse(match[0]);
                log("success", `JSON extracted via regex — ${grants.length} grant(s)`);
            } catch (e2) {
                log("error", `Regex JSON.parse also failed: ${e2.message}`);
                return null;
            }
        } else {
            log("error", `No JSON array found in AI response for: ${url}`);
            return null;
        }
    }

    if (!Array.isArray(grants)) {
        log("error", `Parsed value is not an array (got: ${typeof grants})`);
        return null;
    }

    grants.forEach((g, i) => {
        log("focus", `Grant[${i}] "${g.grant_name?.slice(0, 40)}" → focus: ${JSON.stringify(g.inferred_focus_areas)}`);
        log("country", `Grant[${i}] "${g.grant_name?.slice(0, 40)}" → countries: ${JSON.stringify(g.inferred_countries)}`);
    });

    return grants;
}

// ─── AGENT: PLAN URLs ─────────────────────────────────────────────────────────
async function agentPlanUrls(urls) {
    logSeparator("AGENT: URL PLANNER");
    log("memory", `Planning ${urls.length} URLs...`);
    try {
        const prompt = `Analyze these URLs. Rank by likelihood of containing real grant/funding opportunities.
Return ONLY JSON array:
[{"url": "...", "priority": 1-5, "strategy": "shallow|deep|skip", "reason": "short"}]
Priority 5=definitely grants, 1=unlikely. skip=not grant related.
URLs: ${JSON.stringify(urls.slice(0, 60))}`;

        const result = await callOpenAIWithRetry(prompt);
        const ranked = JSON.parse(result.replace(/```json/gi, "").replace(/```/g, "").trim());
        const queued = ranked.filter(u => u.strategy !== "skip");
        const skipped = ranked.filter(u => u.strategy === "skip");
        log("success", `Planner done — Queued: ${queued.length}, Skipped: ${skipped.length}`);
        return queued
            .sort((a, b) => b.priority - a.priority)
            .map(u => ({ url: u.url, strategy: u.strategy, priority: u.priority }));
    } catch (err) {
        log("warn", `Planner failed (${err.message}) — using original order`);
        return urls.map(u => ({ url: u, strategy: "shallow", priority: 3 }));
    }
}

// ─── AGENT: EVALUATE GRANT ────────────────────────────────────────────────────
async function agentEvaluateGrant(grant) {
    try {
        const prompt = `Rate this grant 0-100 for completeness and quality.
+25 grant_name meaningful and specific
+25 deadline is a valid future date
+20 amount exists and is specific
+10 donor_agency is a known/real organization
+10 eligibility has 5 clear points
+5 short_description is informative
+5 inferred_focus_areas has 2+ tags
Return ONLY JSON: {"score": number, "issues": ["issue1", "issue2"], "is_valid": true|false}
Grant: ${JSON.stringify(grant)}`;

        const result = await callOpenAIWithRetry(prompt);
        const parsed = JSON.parse(result.replace(/```json/gi, "").replace(/```/g, "").trim());
        log("ai", `Quality score: ${parsed.score}/100 | issues: ${parsed.issues?.join("; ") || "none"}`);
        return parsed;
    } catch (err) {
        log("warn", `agentEvaluateGrant failed (${err.message}), using fallback scoring`);
        const score =
            (grant.grant_name ? 25 : 0) +
            (grant.deadline ? 25 : 0) +
            (grant.amount ? 20 : 0) +
            (grant.donor_agency ? 10 : 0) +
            (grant.eligibility?.length > 0 ? 10 : 0) +
            (grant.short_description ? 5 : 0) +
            (grant.inferred_focus_areas?.length > 0 ? 5 : 0);
        return { score, issues: ["Scored by fallback logic"], is_valid: score >= 40 };
    }
}

// ─── AGENT: LOAD MEMORY ───────────────────────────────────────────────────────
async function agentLoadMemory() {
    try {
        const memory = await GrantMemoryModel.find({});
        const skipUrls = new Set(memory.filter(m => m.skip).map(m => m.url));
        log("memory", `Loaded ${memory.length} memory records — ${skipUrls.size} flagged to skip`);
        return skipUrls;
    } catch (err) {
        log("warn", `Memory load failed: ${err.message}`);
        return new Set();
    }
}

// ─── AGENT: UPDATE MEMORY ─────────────────────────────────────────────────────
async function agentUpdateMemory(url, grantsFound, avgScore) {
    try {
        const existing = await GrantMemoryModel.findOne({ url });
        const currentFailCount = existing?.fail_count || 0;
        const newFailCount = grantsFound === 0 ? currentFailCount + 1 : 0;
        const willSkip = newFailCount >= 3;

        await GrantMemoryModel.findOneAndUpdate(
            { url },
            {
                $set: {
                    url,
                    last_scraped: new Date(),
                    grants_found: grantsFound,
                    avg_score: avgScore,
                    fail_count: newFailCount,
                    skip: willSkip,
                    skip_reason: willSkip ? "Failed 3 times consecutively" : null,
                },
            },
            { upsert: true }
        );

        if (willSkip) {
            log("memory", `URL flagged to SKIP (3 consecutive failures): ${url}`);
        } else {
            log("memory", `Memory updated — grants: ${grantsFound}, failCount: ${newFailCount}, avgScore: ${avgScore}`);
        }
    } catch (err) {
        log("warn", `Memory update failed for ${url}: ${err.message}`);
    }
}

// ─── SAVE GRANTS TO DB ────────────────────────────────────────────────────────
async function saveGrantsToDB(finalResults) {
    if (finalResults.length === 0) {
        log("save", "No grants to save — skipping DB write");
        return;
    }

    logSeparator("DB SAVE");
    log("save", `Saving ${finalResults.length} grants to MongoDB...`);

    finalResults.forEach((g, i) => {
        log("db", `[${i + 1}/${finalResults.length}] "${g.title}"`);
        log("db", `     status               : ${g.status}`);
        log("db", `     donor                : ${g.donor}`);
        log("db", `     deadline             : ${g.deadline || "null"}`);
        log("db", `     amount               : ${g.financials?.raw || "null"}`);
        log("db", `     inferred_focus_areas : [${(g.inferred_focus_areas || []).join(", ")}]`);
        log("db", `     inferred_countries   : [${(g.inferred_countries || []).join(", ")}]`);
        log("db", `     eligibility count    : ${(g.eligibility || []).length}`);
        log("db", `     about length         : ${(g.about || "").length} chars`);
        log("db", `     applyUrl             : ${g.applyUrl}`);
    });

    try {
        const result = await Grant.bulkWrite(
            finalResults.map(g => ({
                updateOne: {
                    filter: { title: g.title },
                    update: { $set: g },
                    upsert: true,
                }
            }))
        );
        log("success", `DB bulkWrite complete!`);
        log("db", `  Matched  : ${result.matchedCount}`);
        log("db", `  Modified : ${result.modifiedCount}`);
        log("db", `  Upserted : ${result.upsertedCount}`);
    } catch (err) {
        log("error", `DB bulkWrite FAILED: ${err.message}`);
        throw err;
    }
}

// ─── MAIN CONTROLLER ─────────────────────────────────────────────────────────
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
        typeRejected: 0,
        webSearchUsed: 0,        // ✅ NEW: track agentic web searches
        webSearchDeadlineFound: 0,
        webSearchAmountFound: 0,
        saved: 0,
    };

    const startTime = Date.now();

    try {
        logSeparator("GRANT SCRAPER STARTED");

        // ── STEP 0: Fetch URLs ──────────────────────────────────────────────
        logSeparator("STEP 0: FETCH URLS");
        try {
            const apiRes = await axios.get("http://localhost:7777/api/admin/getUrlLink", { timeout: 10000 });
            const dynamicUrls = apiRes.data.flatMap(item =>
                item.links.map(link => link.replace(/,$/, "").trim()).filter(link => link.startsWith("http"))
            );
            urls = [...new Set(dynamicUrls)];
            agentStats.totalUrls = urls.length;
            log("success", `Fetched ${urls.length} unique URLs`);
        } catch (err) {
            log("error", `URL fetch failed: ${err.message}`);
            return res.status(500).json({ success: false, message: "URL fetch failed" });
        }

        if (urls.length === 0) {
            log("warn", "No URLs found — aborting");
            return res.status(400).json({ success: false, message: "No URLs found" });
        }

        // ── STEP 1: Memory filter ───────────────────────────────────────────
        logSeparator("STEP 1: MEMORY FILTER");
        const skipUrlsFromMemory = await agentLoadMemory();
        const urlsToProcess = urls.filter(u => !skipUrlsFromMemory.has(u));
        agentStats.skippedByMemory = urls.length - urlsToProcess.length;
        log("info", `After memory filter: ${urlsToProcess.length} remaining (${agentStats.skippedByMemory} skipped)`);

        // ── STEP 2: Planner ─────────────────────────────────────────────────
        const plannedUrls = await agentPlanUrls(urlsToProcess);
        agentStats.skippedByPlanner = urlsToProcess.length - plannedUrls.length;
        log("info", `After planner: ${plannedUrls.length} queued`);

        // ── STEP 3: Launch Browser ──────────────────────────────────────────
        logSeparator("STEP 3: BROWSER LAUNCH");
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
        log("success", "Puppeteer browser launched");

        // ── STEP 4: Main scrape loop ────────────────────────────────────────
        logSeparator("STEP 4: MAIN SCRAPE LOOP");

        for (let idx = 0; idx < plannedUrls.length; idx++) {
            const { url, strategy, priority } = plannedUrls[idx];

            try {
                const domain = new URL(url).hostname;
                if (SKIP_DOMAINS.some(d => domain.includes(d))) {
                    log("skip", `Domain blocked: ${domain}`);
                    continue;
                }

                logSeparator(`[${idx + 1}/${plannedUrls.length}] ${strategy.toUpperCase()} | P${priority}`);
                log("url", url);

                const { text: rawText, rawHtml, links } = await fetchPageText(url, browser);

                if (!rawText || rawText.length < 300) {
                    log("warn", `Page text too short (${rawText?.length || 0} chars) — skipping`);
                    await agentUpdateMemory(url, 0, 0);
                    continue;
                }

                const mainText = cleanText(rawText);
                log("info", `Cleaned text: ${mainText.length} chars`);

                let detectedDeadline = extractDeadline(mainText) || extractHiddenDates(rawHtml);
                let detectedAmount = extractAmount(mainText);
                log("time", `Local deadline: ${detectedDeadline || "NOT FOUND"}`);
                log("money", `Local amount  : ${detectedAmount || "NOT FOUND"}`);

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
                    log("error", `OpenAI call failed for ${url}: ${err.message}`);
                    await agentUpdateMemory(url, 0, 0);
                    continue;
                }

                content = content.replace(/```json/gi, "").replace(/```/g, "").trim();

                const grants = parseGrantsFromContent(content, url);
                if (!grants) {
                    await agentUpdateMemory(url, 0, 0);
                    continue;
                }

                const now = new Date();
                let urlScores = [];
                let savedFromThisUrl = 0;

                for (const g of grants) {
                    logSeparator(`GRANT: ${(g.grant_name || "Unnamed").slice(0, 50)}`);

                    if (!isGrantAllowed(g)) {
                        agentStats.typeRejected++;
                        continue;
                    }

                    let resolvedDeadline = g.deadline || detectedDeadline;
                    let resolvedAmount = g.amount || detectedAmount || null;

                    // ── ✅ AGENTIC WEB SEARCH for still-missing deadline/amount ──────
                    if (!resolvedDeadline || !resolvedAmount) {
                        log("search", `Still missing fields — triggering global web search...`);
                        agentStats.webSearchUsed++;

                        const webResult = await agentWebSearchMissingFields(
                            g.grant_name,
                            g.donor_agency,
                            g.region,
                            resolvedDeadline,
                            resolvedAmount
                        );

                        if (!resolvedDeadline && webResult.deadline) {
                            resolvedDeadline = webResult.deadline;
                            agentStats.webSearchDeadlineFound++;
                            log("time", `✅ Web search deadline: "${resolvedDeadline}"`);
                        }
                        if (!resolvedAmount && webResult.amount) {
                            resolvedAmount = webResult.amount;
                            agentStats.webSearchAmountFound++;
                            log("money", `✅ Web search amount: "${resolvedAmount}"`);
                        }
                    }

                    const parsedDeadline = resolvedDeadline ? new Date(resolvedDeadline) : null;
                    const isValidDate = parsedDeadline && !isNaN(parsedDeadline);
                    const isOpen = isValidDate ? parsedDeadline > now : true;
                    const daysLeft = isValidDate
                        ? Math.ceil((parsedDeadline - now) / (1000 * 60 * 60 * 24))
                        : null;

                    const status = isValidDate
                        ? (parsedDeadline > now ? "active" : "expired")
                        : "rolling";

                    const eligibilityPoints = parseEligibility(g.eligibility);
                    const inferredFocusAreas = parseFocusAreas(g.inferred_focus_areas, g.grant_name);

                    // ✅ Parse countries
                    const inferredCountries = parseCountries(g.inferred_countries, g.grant_name);

                    const applyUrl = g.apply_url || pageApplyUrl || url;

                    // ✅ About section (enhanced ~200 words)
                    const aboutText = g.about || g.short_description || null;

                    log("info", `Deadline    : ${resolvedDeadline || "null"} → status: ${status}, daysLeft: ${daysLeft ?? "N/A"}`);
                    log("info", `Amount      : ${resolvedAmount || "null"}`);
                    log("info", `Donor       : ${g.donor_agency || "null"}`);
                    log("country", `Countries   : [${inferredCountries.join(", ")}]`);
                    log("focus", `Focus areas : [${inferredFocusAreas.join(", ")}]`);
                    log("info", `About length: ${(aboutText || "").length} chars`);

                    // ── BUILD GRANT OBJECT ───────────────────────────────────────────
                    const grant = {
                        raw: {
                            grant_name: g.grant_name,
                            deadline: resolvedDeadline || null,
                            amount: resolvedAmount,
                            region: g.region || null,
                            donor_agency: g.donor_agency || null,
                            eligibility: eligibilityPoints,
                            inferred_focus_areas: inferredFocusAreas,
                            inferred_countries: inferredCountries,        // ✅ saved in raw
                            short_description: g.short_description || null,
                            about: aboutText,                              // ✅ enhanced about
                            source_url: url,
                            apply_url: applyUrl,
                        },
                        title: g.grant_name,
                        donor: g.donor_agency || "Unknown",
                        category: "grant",
                        inferred_focus_areas: inferredFocusAreas,
                        inferred_countries: inferredCountries,             // ✅ top-level countries
                        geography: {
                            region: g.region || null,
                            region_normalized: g.region ? g.region.toLowerCase().trim() : null,
                            countries: inferredCountries,                  // ✅ countries in geography
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
                        about: aboutText,                                  // ✅ top-level about
                        applyUrl,
                        // ✅ AI subdocument fields (for modal)
                        ai: {
                            inferred_focus_areas: inferredFocusAreas,
                            inferred_focus_country: inferredCountries,     // ✅ matches model schema
                            summary: g.short_description || null,
                            long_description: aboutText,                   // ✅ about as long_description
                        },
                        searchText: [
                            g.grant_name,
                            g.donor_agency,
                            g.region,
                            inferredCountries.join(" "),
                            eligibilityPoints.join(" "),
                            inferredFocusAreas.join(" "),
                        ].filter(Boolean).join(" ").toLowerCase(),
                    };

                    // ── FILTER CHECKS ─────────────────────────────────────────────

                    if (!grant.isOpen) {
                        log("skip", `EXPIRED: ${grant.title}`);
                        agentStats.expiredDiscarded++;
                        continue;
                    }

                    if (grant.status !== "rolling" && grant.deadline && daysLeft < MIN_DAYS_LEFT) {
                        log("skip", `TOO CLOSE (${daysLeft} days left): ${grant.title}`);
                        agentStats.lowDeadlineDiscarded++;
                        continue;
                    }

                    if (grant.status === "expired") {
                        log("skip", `EXPIRED (double-check): ${grant.title}`);
                        agentStats.nullDeadlineDiscarded++;
                        continue;
                    }

                    if (!grant.raw.amount) {
                        log("warn", `No amount found (keeping anyway): ${grant.title}`);
                    }

                    const UNKNOWN_DONOR_VALUES = ["unknown", "not specified", "n/a", "na",
                        "unspecified", "not available", "tbd", "none", ""];
                    if (!grant.donor || UNKNOWN_DONOR_VALUES.includes(grant.donor.toLowerCase().trim())) {
                        log("skip", `UNKNOWN DONOR: ${grant.title}`);
                        agentStats.unknownDonorDiscarded++;
                        continue;
                    }

                    if (grant.title.trim().split(" ").length < 3) {
                        log("skip", `VAGUE NAME (< 3 words): "${grant.title}"`);
                        agentStats.vagueNameDiscarded++;
                        continue;
                    }

                    const evaluation = await agentEvaluateGrant(grant.raw);
                    urlScores.push(evaluation.score);
                    if (evaluation.score < MIN_QUALITY_SCORE) {
                        log("skip", `LOW QUALITY (${evaluation.score}/100): ${grant.title}`);
                        agentStats.lowQualityDiscarded++;
                        continue;
                    }

                    const key = grant.title.toLowerCase().trim();
                    if (globalUniqueMap.has(key)) {
                        log("skip", `DUPLICATE: ${grant.title}`);
                        agentStats.duplicateSkipped++;
                        continue;
                    }

                    log("success",
                        `SAVED ✅ | Score: ${evaluation.score}/100 | Days: ${daysLeft ?? "rolling"} | ` +
                        `Countries: [${inferredCountries.join(", ")}] | Focus: [${inferredFocusAreas.join(", ")}]`
                    );
                    globalUniqueMap.set(key, grant);
                    finalResults.push(grant);
                    savedFromThisUrl++;
                }

                const avgScore = urlScores.length > 0
                    ? Math.round(urlScores.reduce((a, b) => a + b, 0) / urlScores.length)
                    : 0;

                await agentUpdateMemory(url, savedFromThisUrl, avgScore);
                log("save", `${savedFromThisUrl} grant(s) saved from this URL (avg score: ${avgScore})`);

            } catch (err) {
                log("error", `URL processing failed: ${url} — ${err.message}`);
                console.error(err.stack);
                await agentUpdateMemory(url, 0, 0);
            }
        }

        // ── STEP 5: Save to DB ──────────────────────────────────────────────
        await saveGrantsToDB(finalResults);

        agentStats.saved = finalResults.length;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        logSeparator("AGENT FINAL REPORT");
        const reportRows = [
            ["Total URLs fetched",        agentStats.totalUrls],
            ["Skipped by memory",         agentStats.skippedByMemory],
            ["Skipped by planner",        agentStats.skippedByPlanner],
            ["Type rejected",             agentStats.typeRejected],
            ["Expired discarded",         agentStats.expiredDiscarded],
            ["Deadline too close",        agentStats.lowDeadlineDiscarded],
            ["Null deadline discard",     agentStats.nullDeadlineDiscarded],
            ["Unknown donor",             agentStats.unknownDonorDiscarded],
            ["Vague name",                agentStats.vagueNameDiscarded],
            ["Low quality score",         agentStats.lowQualityDiscarded],
            ["Duplicates skipped",        agentStats.duplicateSkipped],
            ["🔍 Web searches triggered", agentStats.webSearchUsed],
            ["🔍 Deadlines via web",      agentStats.webSearchDeadlineFound],
            ["🔍 Amounts via web",        agentStats.webSearchAmountFound],
            ["✅ SAVED TO DB",            agentStats.saved],
            ["⏱️  Total time (s)",        elapsed],
        ];
        reportRows.forEach(([k, v]) => console.log(`  ${k.padEnd(30)}: ${v}`));
        logSeparator();

        return res.json({
            success: true,
            total: finalResults.length,
            elapsed_seconds: parseFloat(elapsed),
            agentStats,
            data: finalResults,
        });

    } catch (err) {
        log("error", `FATAL ERROR: ${err.message}`);
        console.error(err.stack);
        return res.status(500).json({ success: false, message: err.message });
    } finally {
        if (browser) {
            await browser.close();
            log("info", "Browser closed");
        }
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
                    "ai.inferred_focus_areas":   result.focus_area,
                    "ai.inferred_focus_country": inferredCountries,      // ✅ countries array
                    "ai.inferred_region":        result.region_normalized,
                    "ai.inferred_donor":         result.donor_agency_normalized,
                    "ai.summary":                result.short_description || "",
                    "ai.long_description":       aboutText || result.short_description || "",

                    // ✅ Geography
                    "geography.region_normalized": result.region_normalized,
                    "geography.country":           result.country,
                    "geography.countries":         inferredCountries,    // ✅ specific countries

                    // ✅ Top-level fields
                    "financials.raw":             result.amount,
                    donor:                        result.donor_agency,
                    shortDescription:             result.short_description || "",
                    about:                        aboutText || "",       // ✅ enhanced about
                    inferred_countries:           inferredCountries,     // ✅ top-level
                    hasAiDetail:                  true,
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