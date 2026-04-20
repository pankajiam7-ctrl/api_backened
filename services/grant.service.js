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
                content: `You are a world-class grant proposal writer with 20+ years of experience writing 
winning proposals for USAID, UNDP, World Bank, Gates Foundation, and EU funding bodies.

You write with:
- Deep human empathy and storytelling
- Hard-hitting statistics and evidence
- Persuasive, natural language (NOT robotic or generic)
- A voice that makes donors FEEL the urgency and BELIEVE in the solution

Your proposals have secured over $500M in funding. Every word you write is intentional.
Never use filler. Never be vague. Every sentence must earn its place.

CRITICAL: Return ONLY valid JSON. No explanation. No markdown. No extra text.`
            },
            {
                role: "user",
                content: buildPrompt(grant)
            }
        ],
        temperature: 0.4,
        max_tokens: 8000,
        response_format: { type: "json_object" }
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    return validateAndClean(parsed, grant);
}

/* ─── Prompt builder ──────────────────────────────────────────────────────── */
function buildPrompt(grant) {
    return `
You are writing a REAL, WINNING grant proposal — not a template, not a summary.
This must read like it was written by a passionate expert who deeply understands the problem.

GRANT INPUT:
- Name: ${grant.grant_name}
- Region: ${grant.region}
- Donor: ${grant.donor_agency}
- Amount: ${grant.amount}
- Eligibility: ${grant.eligibility}
- Description: ${grant.short_description}

========================
RETURN THIS EXACT JSON STRUCTURE
========================
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
FIELD-BY-FIELD RULES
========================

"country"
- Array of country names based on region
- Never empty

"region_normalized"
- Lowercase standardized (e.g. "sub-saharan africa", "south asia")

"donor_agency" → Full official name
"donor_agency_normalized" → Short name (e.g. "UNDP", "Gates Foundation")

"focus_area"
- 4–6 highly specific sectors
- Examples: "adolescent girl education", "last-mile healthcare delivery"
- NEVER generic like "development" or "support"

"proposal_title"
- 15–20 words
- Must be EMOTIONALLY compelling and donor-aligned
- Example: "Breaking the Cycle: Empowering 50,000 Rural Women Through Climate-Resilient Livelihoods in Sub-Saharan Africa"

"short_description"
- 200–300 words
- Open with a POWERFUL human story or shocking statistic
- Cover: problem → solution → who benefits → funding ask → expected impact
- End with a sentence that makes the donor feel they CANNOT say no

"long_description"
- MINIMUM 5000 words
- Must feel like a REAL proposal written by a human expert
- Use natural transitions, varied sentence lengths, storytelling + data
- NEVER use robotic language like "This project aims to..."
- USE language like "At the heart of this initiative lies a simple truth..." or "The data is sobering..."

========================
MANDATORY SECTIONS INSIDE long_description
========================

## 1. Executive Summary (500–600 words)
- Open with 1–2 sentences that capture the HUMAN REALITY of the problem
- Summarize: context, problem, solution, beneficiaries, total ask, key outcomes
- Close with why THIS donor, THIS project, THIS moment

## 2. Background & Context (800–900 words)
- Paint a vivid picture of the region/community
- Use historical context, policy gaps, failed past efforts
- Include 3–5 specific statistics with sources (World Bank, WHO, UNDP, etc.)
- Show deep understanding of root causes — not just symptoms

## 3. Problem Analysis (600–800 words)
- Lead with a real or composite story of ONE affected person
- Break down the problem into 3–4 interconnected dimensions
- Use %, numbers, trends (e.g. "Between 2015 and 2023, X increased by 47%")
- Show urgency: what happens if nothing is done?

## 4. Objectives (6–8 SMART Goals)
- Each must be: Specific, Measurable, Achievable, Relevant, Time-bound
- Format: "By [Month Year], [verb] [number] [specific group] in [location] through [method]"
- Example: "By Month 18, train 2,400 smallholder farmers in climate-adaptive agriculture across 3 districts"

## 5. Target Beneficiaries (400–500 words)
- Primary: exact numbers, demographics, location
- Secondary: indirect beneficiaries (families, communities)
- Include selection criteria and how they were identified
- Add 1 human detail that makes them real (not just statistics)

## 6. Proposed Solution (500–400 words)
- Explain the INNOVATION — what makes this different from past efforts?
- Use a clear theory of change: "If [inputs] → then [outputs] → leading to [outcomes] → resulting in [impact]"
- Show evidence base: what similar interventions have worked elsewhere?

## 7. Implementation Plan (900–1000 words)
- Phase 1 (Months 1–6): Foundation & Setup
- Phase 2 (Months 7–12): Pilot & Learn
- Phase 3 (Months 13–24): Scale & Strengthen  
- Phase 4 (Months 25–36): Consolidate & Sustain
- For each phase: key activities, who does what, milestones
- Use action verbs: deploy, establish, train, mobilize, validate, scale

## 8. Monitoring & Evaluation (400–500 words)
- 5–7 specific KPIs with baseline, midline, endline targets
- Data collection methods (surveys, FGDs, administrative data)
- Who is responsible for M&E
- How findings feed back into program adaptation
- External evaluation at endline

## 9. Expected Outcomes (400–500 words)
- Short-term (0–12 months): immediate outputs
- Medium-term (12–24 months): behavioral/systemic changes
- Long-term (24–36 months): lasting impact
- Use numbers: "X% increase in Y among Z group"

## 10. Sustainability Plan (400–500 words)
- Financial sustainability: how does the program continue after grant ends?
- Institutional sustainability: government buy-in, policy integration
- Community ownership: local champions, community-led structures
- Be SPECIFIC — not "we will seek further funding" (too vague)

## 11. Budget Narrative (200–300 words)
- Justify each budget category in plain language
- Show cost-effectiveness: "This equals just $47 per beneficiary per year"
- Highlight value for money

## 12. Risk Assessment (300–400 words)
- 4–5 realistic risks (political instability, community resistance, staff turnover, weather)
- For each: Likelihood (H/M/L), Impact (H/M/L), Mitigation strategy
- Show the donor you have thought ahead

## 13. Conclusion (300–400 words)
- Return to the human story from Problem Analysis
- Remind the donor of the scale of opportunity
- Make a direct, confident ask
- End with 1 powerful sentence that stays with the reader

========================
WRITING RULES (CRITICAL)
========================

✅ USE:
- Varied sentence length (mix short punchy + longer analytical)
- Specific numbers: "47,000 households" not "thousands of households"
- Active voice: "We will train" not "Training will be provided"
- Emotional anchoring: start sections with human reality, then data
- Transition phrases: "Building on this foundation...", "The evidence is clear...", "What sets this initiative apart..."
- Donor-speak: "return on investment", "systems change", "leverage", "catalytic funding"

❌ NEVER USE:
- "This project aims to..." (robotic opener)
- "In conclusion..." (weak closer)
- Round numbers like 10,000 or 50,000 (use 9,847 or 51,200)
- Generic phrases: "help the community", "raise awareness", "improve lives"
- Passive voice throughout
- Identical sentence structure paragraph after paragraph

========================
AMOUNT
========================
- Extract numeric value from grant input
- If missing → "Not specified"

========================
BUDGET (STRICT — CRITICAL)
========================

"total_amount" → numeric, must match grant amount, always > 0

"duration" → MUST be "24 months" OR "36 months"

"breakdown" → EXACTLY these 6 categories:
  1. Program Implementation       → 20–25% of total
  2. Training & Capacity Building → 10–15% of total
  3. Operations & Staffing        → 30–40% of total (LARGEST)
  4. Monitoring & Evaluation      → 5–10% of total
  5. Technology / Infrastructure  → 10–15% of total
  6. Administration               → 5–8% of total (SMALLEST)

FOR EACH CATEGORY:
- year_1 > year_2 > year_3 (ALWAYS decreasing)
- total = year_1 + year_2 + year_3
- Use UNEVEN realistic numbers (e.g. 84,250 not 80,000)
- Sum of ALL totals MUST equal total_amount EXACTLY

========================
GLOBAL RULES
========================
- No empty fields, no empty arrays
- No null values anywhere
- Minimum 4000 words in long_description
- JSON must be 100% valid and complete
- Return ONLY JSON — no explanation, no markdown fences
`;
}

/* ─── Post-processing ─────────────────────────────────────────────────────── */
function validateAndClean(result, grant) {

    if (!Array.isArray(result.country) || result.country.length === 0 ||
        result.country.every(c => !c || c.trim() === "")) {
        result.country = extractCountryFromText(result.region_normalized || grant.region || "", grant);
    }

    if (!Array.isArray(result.focus_area) || result.focus_area.length === 0 ||
        result.focus_area.every(f => !f || f.trim() === "")) {
        result.focus_area = extractFocusFromText(grant);
    }

    result.region_normalized = (result.region_normalized || grant.region || "").toLowerCase().trim();
    result.donor_agency = result.donor_agency || grant.donor_agency || "Unknown";
    result.donor_agency_normalized = result.donor_agency_normalized || result.donor_agency || "Unknown";
    result.amount = result.amount || grant.amount || "Not specified";
    result.proposal_title = result.proposal_title || grant.grant_name || "";
    result.short_description = result.short_description || grant.short_description || "";
    result.long_description = result.long_description || "";

    result.country = result.country.filter(c => c && c.trim());
    result.focus_area = result.focus_area.filter(f => f && f.trim());

    return result;
}

/* ─── Country extractor ───────────────────────────────────────────────────── */
function extractCountryFromText(regionText, grant) {
    const allText = [
        regionText,
        grant.region,
        grant.donor_agency,
        grant.short_description,
        grant.grant_name,
    ].filter(Boolean).join(" ");

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
    ];

    for (const country of knownCountries) {
        if (allText.toLowerCase().includes(country.toLowerCase())) {
            return [country];
        }
    }

    const fallback = (grant.region || regionText || "").trim();
    return fallback ? [fallback] : ["Unknown"];
}

/* ─── Focus area extractor ────────────────────────────────────────────────── */
function extractFocusFromText(grant) {
    const text = [
        grant.grant_name,
        grant.eligibility,
        grant.short_description,
    ].filter(Boolean).join(" ").toLowerCase();

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
    ];

    const matched = themeGroups
        .filter(g => g.keywords.some(kw => text.includes(kw)))
        .map(g => g.label)
        .slice(0, 6);

    if (matched.length === 0) {
        const words = (grant.grant_name || "")
            .split(" ")
            .filter(w => w.length > 4)
            .slice(0, 3)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
        return words.length > 0 ? words : ["Community Development", "Economic Empowerment"];
    }

    return matched;
}

module.exports = { processGrant };