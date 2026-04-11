const OpenAI = require("openai");

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function processGrant(grant) {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {
                role: "system",
                content: `You are a senior grant analyst and proposal writer.
Your job is to analyze grant data and return a structured JSON response.
You MUST always populate every field — empty arrays are NOT acceptable.
Use your knowledge of geography and grant themes to infer all values.`
            },
            {
                role: "user",
                content: buildPrompt(grant)
            }
        ],
        temperature: 0.3,
        max_tokens: 3000,
        response_format: { type: "json_object" }
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    return validateAndClean(parsed, grant);
}

/* ─── Prompt builder ──────────────────────────────────────────────────────── */
function buildPrompt(grant) {
return `
Analyze this grant and generate a HIGH-QUALITY, DONOR-READY proposal in JSON format.

The output must be extremely detailed, persuasive, and similar to UN / World Bank / large NGO proposals.

GRANT INPUT:
- Name: ${grant.grant_name}
- Region: ${grant.region}
- Donor: ${grant.donor_agency}
- Amount: ${grant.amount}
- Eligibility: ${grant.eligibility}
- Description: ${grant.short_description}

RETURN THIS EXACT JSON STRUCTURE:
{
  "country": [],
  "region_normalized": "",
  "donor_agency": "",
  "donor_agency_normalized": "",
  "focus_area": [],
  "proposal_title": "",
  "short_description": "",
  "long_description": "",
  "amount": "",

  "executive_summary": "",
  "problem_statement": "",
  "objectives": [],
  "methodology": {
    "phase_1": "",
    "phase_2": "",
    "phase_3": "",
    "phase_4": ""
  },
  "target_beneficiaries": "",
  "budget": {
    "total_amount": 1,
    "currency": "USD",
    "duration": "",
    "breakdown": [
      {
        "category": "",
        "year_1": 1,
        "year_2": 1,
        "year_3": 1,
        "total": 1
      }
    ]
  }
}

========================
RULES FOR EACH FIELD
========================

"country"
- Array of country names (never empty)
- Convert region → most relevant country(s)

"region_normalized"
- Lowercase standardized region (e.g. "europe", "sub-saharan africa")

"donor_agency"
- Full official name

"donor_agency_normalized"
- Short common name (e.g. "UNDP", "World Bank")

"focus_area"
- 4 to 6 specific sectors (e.g. "women economic empowerment", "climate resilience")
- Never empty

"proposal_title"
- 15–20 words
- Highly compelling and donor-focused

"short_description"
- 200–300 words
- Include: problem + solution + beneficiaries + funding + impact

"long_description"
- 3000–5000 words
- Must strictly follow structured donor format below

========================
MANDATORY STRUCTURE INSIDE long_description
========================

1. Executive Summary (300–400 words)
2. Background & Context (400–500 words)
3. Problem Analysis (500–700 words with statistics and %)
4. Objectives (6–8 SMART measurable goals)
5. Target Beneficiaries (300–400 words with numbers)
6. Sustainability Plan (300–400 words)
7. Proposed Solution (400–500 words)
8. Implementation Plan (600–800 words)
   - Phase 1 to Phase 4
   - Activities, timelines, stakeholders
9. Monitoring & Evaluation (300–400 words)
   - KPIs, baseline, midline, endline
10. Expected Outcomes (300–400 words with measurable impact)
11. Budget 
12. Risk Assessment (200–300 words)
13. Conclusion (200–300 words)

========================
WRITING STYLE
========================
- UN / World Bank level professionalism
- Data-driven (use %, numbers, projections)
- Avoid generic content
- Use realistic development language

========================
AMOUNT
========================
- Extract from input
- If missing → "Not specified"

========================
BUDGET (VERY STRICT – CRITICAL SECTION)
========================

- DO NOT use null or 0 anywhere
- ALL values must be realistic positive numbers

"total_amount"
- Must be numeric
- Must align with grant amount (if given)
- Must be > 0

"duration"
- MUST be either "24 months" OR "36 months"

"breakdown"
- MUST contain EXACTLY these 6 categories:

  1. Program Implementation
  2. Training & Capacity Building
  3. Operations & Staffing
  4. Monitoring & Evaluation
  5. Technology / Infrastructure
  6. Administration

FOR EACH CATEGORY:
- year_1 MUST be highest
- year_2 MUST be lower than year_1
- year_3 MUST be lowest
- total = year_1 + year_2 + year_3

========================
STRICT FINANCIAL VALIDATION
========================

- Sum of ALL category totals MUST equal total_amount
- No mismatches allowed

========================
COST DISTRIBUTION (MANDATORY)
========================

- Operations & Staffing → 30% to 40% (largest share)
- Program Implementation → 20% to 25%
- Training & Capacity Building → 10% to 15%
- Technology / Infrastructure → 10% to 15%
- Monitoring & Evaluation → 5% to 10%
- Administration → 5% to 8% (smallest share)

========================
REALISM RULES
========================

- Do NOT use equal numbers
- Do NOT use rounded numbers like 100000 or 50000
- Use uneven realistic values (e.g. 84250, 126780, 97340)
- Budget must look like a real UN / World Bank financial table

========================
GLOBAL RULES
========================

- No empty fields
- No empty arrays
- Do not shorten content
- Ensure JSON is valid and complete

========================
CRITICAL
========================

Return ONLY valid JSON.
No explanation.
No extra text.
`;
}

/* ─── Post-processing: validate every field, never return empty arrays ─────── */
function validateAndClean(result, grant) {

    // country — must be non-empty array of strings
    if (!Array.isArray(result.country) || result.country.length === 0 ||
        result.country.every(c => !c || c.trim() === "")) {
        const regionText = result.region_normalized || grant.region || ""
        result.country = extractCountryFromText(regionText, grant)
    }

    // focus_area — must be non-empty array of strings
    if (!Array.isArray(result.focus_area) || result.focus_area.length === 0 ||
        result.focus_area.every(f => !f || f.trim() === "")) {
        result.focus_area = extractFocusFromText(grant)
    }

    // Sanitize all string fields
    result.region_normalized = (result.region_normalized || grant.region || "").toLowerCase().trim()
    result.donor_agency = result.donor_agency || grant.donor_agency || "Unknown"
    result.donor_agency_normalized = result.donor_agency_normalized || result.donor_agency || "Unknown"
    result.amount = result.amount || grant.amount || "Not specified"
    result.proposal_title = result.proposal_title || grant.grant_name || ""
    result.short_description = result.short_description || grant.short_description || ""
    result.long_description = result.long_description || ""

    // Remove empty strings from arrays
    result.country = result.country.filter(c => c && c.trim())
    result.focus_area = result.focus_area.filter(f => f && f.trim())

    return result
}

/* ─── Dynamic country extraction — checks known sovereign nations in text ─── */
function extractCountryFromText(regionText, grant) {
    const allText = [
        regionText,
        grant.region,
        grant.donor_agency,
        grant.short_description,
        grant.grant_name,
    ].filter(Boolean).join(" ")

    // Sovereign country list — geography knowledge, not domain-specific hardcoding
    const knownCountries = [
        "Australia", "India", "United States", "United Kingdom", "Canada", "Germany",
        "France", "Brazil", "South Africa", "Nigeria", "Kenya", "Ethiopia", "Ghana",
        "Bangladesh", "Pakistan", "Indonesia", "Philippines", "Vietnam", "Thailand",
        "Mexico", "Colombia", "Argentina", "Chile", "Peru", "Ecuador", "Bolivia",
        "Uganda", "Tanzania", "Rwanda", "Malawi", "Zimbabwe", "Zambia", "Mozambique",
        "Senegal", "Mali", "Niger", "Chad", "Cameroon", "Ivory Coast", "Sierra Leone",
        "Nepal", "Sri Lanka", "Myanmar", "Cambodia", "Laos", "Mongolia", "Kazakhstan",
        "Ukraine", "Poland", "Romania", "Hungary", "Portugal", "Spain", "Italy", "Greece",
        "Egypt", "Morocco", "Tunisia", "Algeria", "Libya", "Jordan", "Lebanon", "Iraq",
        "Afghanistan", "Yemen", "Syria", "Turkey", "Iran", "Saudi Arabia", "UAE",
        "New Zealand", "Papua New Guinea", "Fiji", "Solomon Islands", "Vanuatu",
    ]

    for (const country of knownCountries) {
        if (allText.toLowerCase().includes(country.toLowerCase())) {
            return [country]
        }
    }

    // Last resort: use the raw region string
    const fallback = (grant.region || regionText || "").trim()
    return fallback ? [fallback] : ["Unknown"]
}

/* ─── Dynamic focus area extraction — keyword groups, no hardcoded themes ─── */
function extractFocusFromText(grant) {
    const text = [
        grant.grant_name,
        grant.eligibility,
        grant.short_description,
    ].filter(Boolean).join(" ").toLowerCase()

    const themeGroups = [
        { keywords: ["flood", "cyclone", "disaster", "emergency", "relief", "storm", "drought"], label: "Disaster Relief & Recovery" },
        { keywords: ["freight", "transport", "logistics", "shipping", "supply chain"], label: "Freight & Logistics" },
        { keywords: ["farmer", "farm", "agriculture", "crop", "livestock", "primary producer"], label: "Agriculture & Primary Industries" },
        { keywords: ["rural", "remote", "regional", "outback", "village"], label: "Rural Development" },
        { keywords: ["health", "medtech", "medical", "hospital", "clinic", "healthcare"], label: "Health & MedTech" },
        { keywords: ["startup", "entrepreneur", "incubator", "accelerator", "venture"], label: "Startup & Innovation" },
        { keywords: ["climate", "environment", "green", "renewable", "sustainability", "carbon"], label: "Climate & Environment" },
        { keywords: ["education", "school", "training", "skill", "learning", "scholarship"], label: "Education & Skills" },
        { keywords: ["women", "gender", "girl", "female", "empowerment"], label: "Gender Equity" },
        { keywords: ["digital", "tech", "software", "ai", "data", "cyber", "ict"], label: "Digital & Technology" },
        { keywords: ["food", "nutrition", "hunger", "malnutrition", "food security"], label: "Food Security & Nutrition" },
        { keywords: ["water", "sanitation", "wash", "irrigation"], label: "Water & Sanitation" },
        { keywords: ["housing", "shelter", "infrastructure", "construction"], label: "Housing & Infrastructure" },
        { keywords: ["finance", "microfinance", "loan", "credit", "banking", "fintech"], label: "Financial Inclusion" },
        { keywords: ["youth", "child", "adolescent", "student", "young people"], label: "Youth Development" },
        { keywords: ["energy", "solar", "wind", "power", "electricity", "off-grid"], label: "Energy Access" },
        { keywords: ["research", "r&d", "laboratory", "science", "innovation"], label: "Research & Development" },
    ]

    const matched = themeGroups
        .filter(g => g.keywords.some(kw => text.includes(kw)))
        .map(g => g.label)
        .slice(0, 6)

    if (matched.length === 0) {
        // Derive labels from meaningful words in grant name
        const words = (grant.grant_name || "")
            .split(" ")
            .filter(w => w.length > 4)
            .slice(0, 3)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        return words.length > 0 ? words : ["Community Development", "Economic Empowerment"]
    }

    return matched
}

module.exports = { processGrant }
