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
Analyze this grant and return a complete JSON proposal.

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
  "amount": ""
}

RULES FOR EACH FIELD:

"country"
- Type: array of strings
- Derive the sovereign country/countries from the region value
- "South Australia" → ["Australia"], "Maharashtra" → ["India"], "Bavaria" → ["Germany"]
- For global or multi-country grants list all relevant countries
- NEVER return []

"region_normalized"
- Type: string, lowercase
- Standardized region name e.g. "south australia", "west africa", "northern india"

"donor_agency"
- Full official name of the funding organization

"donor_agency_normalized"
- Short recognizable name e.g. "World Bank", "USAID", "Govt. of South Australia"

"focus_area"
- Type: array of 4 to 6 strings
- Specific thematic areas this grant addresses
- Derive from the grant name, eligibility criteria, and description
- Use precise domain terms e.g. "Flood Recovery", "AgriTech", "Rural Livelihoods",
  "MedTech Innovation", "Climate Resilience", "Women Empowerment", "Digital Health"
- NEVER use generic terms like "Development" or "Support" alone
- NEVER return []

"proposal_title"
- 15 to 20 words, compelling and funding-ready

"short_description"
- 150 to 200 words executive summary

"long_description"
- 1000 to 1500 words full proposal
- Sections: Executive Summary, Background, Objectives, Target Beneficiaries,
  Problem Analysis, Proposed Solution, Implementation Plan,
  Monitoring & Evaluation, Expected Outcomes, Risk Assessment,
  Sustainability Plan, Conclusion
- Formal professional language

"amount"
- Extract from input amount field
- Return "Not specified" if unclear

CRITICAL: Return ONLY the JSON object. No markdown, no explanation.
`
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
    result.region_normalized       = (result.region_normalized       || grant.region       || "").toLowerCase().trim()
    result.donor_agency            =  result.donor_agency            || grant.donor_agency  || "Unknown"
    result.donor_agency_normalized =  result.donor_agency_normalized || result.donor_agency || "Unknown"
    result.amount                  =  result.amount                  || grant.amount        || "Not specified"
    result.proposal_title          =  result.proposal_title          || grant.grant_name    || ""
    result.short_description       =  result.short_description       || grant.short_description || ""
    result.long_description        =  result.long_description        || ""

    // Remove empty strings from arrays
    result.country    = result.country.filter(c => c && c.trim())
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
        "Australia","India","United States","United Kingdom","Canada","Germany",
        "France","Brazil","South Africa","Nigeria","Kenya","Ethiopia","Ghana",
        "Bangladesh","Pakistan","Indonesia","Philippines","Vietnam","Thailand",
        "Mexico","Colombia","Argentina","Chile","Peru","Ecuador","Bolivia",
        "Uganda","Tanzania","Rwanda","Malawi","Zimbabwe","Zambia","Mozambique",
        "Senegal","Mali","Niger","Chad","Cameroon","Ivory Coast","Sierra Leone",
        "Nepal","Sri Lanka","Myanmar","Cambodia","Laos","Mongolia","Kazakhstan",
        "Ukraine","Poland","Romania","Hungary","Portugal","Spain","Italy","Greece",
        "Egypt","Morocco","Tunisia","Algeria","Libya","Jordan","Lebanon","Iraq",
        "Afghanistan","Yemen","Syria","Turkey","Iran","Saudi Arabia","UAE",
        "New Zealand","Papua New Guinea","Fiji","Solomon Islands","Vanuatu",
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
        { keywords: ["flood","cyclone","disaster","emergency","relief","storm","drought"],    label: "Disaster Relief & Recovery" },
        { keywords: ["freight","transport","logistics","shipping","supply chain"],             label: "Freight & Logistics" },
        { keywords: ["farmer","farm","agriculture","crop","livestock","primary producer"],    label: "Agriculture & Primary Industries" },
        { keywords: ["rural","remote","regional","outback","village"],                        label: "Rural Development" },
        { keywords: ["health","medtech","medical","hospital","clinic","healthcare"],          label: "Health & MedTech" },
        { keywords: ["startup","entrepreneur","incubator","accelerator","venture"],           label: "Startup & Innovation" },
        { keywords: ["climate","environment","green","renewable","sustainability","carbon"],  label: "Climate & Environment" },
        { keywords: ["education","school","training","skill","learning","scholarship"],       label: "Education & Skills" },
        { keywords: ["women","gender","girl","female","empowerment"],                         label: "Gender Equity" },
        { keywords: ["digital","tech","software","ai","data","cyber","ict"],                 label: "Digital & Technology" },
        { keywords: ["food","nutrition","hunger","malnutrition","food security"],             label: "Food Security & Nutrition" },
        { keywords: ["water","sanitation","wash","irrigation"],                               label: "Water & Sanitation" },
        { keywords: ["housing","shelter","infrastructure","construction"],                    label: "Housing & Infrastructure" },
        { keywords: ["finance","microfinance","loan","credit","banking","fintech"],           label: "Financial Inclusion" },
        { keywords: ["youth","child","adolescent","student","young people"],                  label: "Youth Development" },
        { keywords: ["energy","solar","wind","power","electricity","off-grid"],               label: "Energy Access" },
        { keywords: ["research","r&d","laboratory","science","innovation"],                   label: "Research & Development" },
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
