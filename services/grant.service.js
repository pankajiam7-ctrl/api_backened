const OpenAI = require("openai");

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function processGrant(grant) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [
                {
                    role: "system",
                    content: `You are a senior grant analyst and proposal writer.

You generate HIGHLY DETAILED, DONOR-READY proposals similar to UN, World Bank, and large NGO submissions.

STRICT RULES:
- Never generate short or generic content
- Always include numbers, statistics, and measurable impact
- Use professional, persuasive language
- Fill ALL fields (no empty arrays or empty strings)`
                },
                {
                    role: "user",
                    content: buildPrompt(grant)
                }
            ],
            temperature: 0.2,
            max_tokens: 7000,
            response_format: { type: "json_object" }
        });

        const parsed = JSON.parse(response.choices[0].message.content);
        return validateAndClean(parsed, grant);

    } catch (error) {
        console.error("OpenAI Error:", error.message);
        return fallbackResponse(grant);
    }
}

/* ─── Prompt builder ───────────────────────────────────────── */
function buildPrompt(grant) {
    return `
Analyze this grant and generate a COMPLETE, HIGH-QUALITY proposal.

GRANT INPUT:
- Name: ${grant.grant_name}
- Region: ${grant.region}
- Donor: ${grant.donor_agency}
- Amount: ${grant.amount}
- Eligibility: ${grant.eligibility}
- Description: ${grant.short_description}

RETURN JSON:
{
  "country": [],
  "region_normalized": "",
  "donor_agency": "",
  "donor_agency_normalized": "",
  "focus_area": [],
  "proposal_title": "",
  "short_description": "",
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
    "total_amount": "",
    "currency": "USD",
    "duration": "",
    "breakdown": [
      {
        "category": "",
        "year_1": "",
        "year_2": "",
        "year_3": "",
        "total": ""
      }
    ]
  },
  "project_timeline": "",
  "expected_impact": "",
  "monitoring_evaluation": "",
  "sustainability": "",
  "conclusion": ""
}

CONTENT RULES:
- executive_summary: 250+ words
- problem_statement: 500+ words with statistics
- objectives: 5–7 measurable points
- methodology: each phase detailed
- budget: realistic numbers
- expected_impact: measurable KPIs
- sustainability: long-term impact

STRICT:
- No empty arrays
- No empty strings
- Include numbers everywhere

Return ONLY JSON.
`;
}

/* ─── Validation ───────────────────────────────────────── */
function validateAndClean(result, grant) {

    if (!Array.isArray(result.country) || result.country.length === 0) {
        result.country = extractCountryFromText(grant.region, grant);
    }

    if (!Array.isArray(result.focus_area) || result.focus_area.length === 0) {
        result.focus_area = extractFocusFromText(grant);
    }

    if (!Array.isArray(result.objectives) || result.objectives.length === 0) {
        result.objectives = [
            "Increase income levels by 30%",
            "Improve financial inclusion access",
            "Strengthen community resilience",
            "Enhance skills and employability",
            "Promote gender equality"
        ];
    }

    if (!result.methodology) {
        result.methodology = {
            phase_1: "Assessment and planning phase",
            phase_2: "Implementation and training",
            phase_3: "Scaling and partnerships",
            phase_4: "Evaluation and sustainability"
        };
    }

    if (!result.budget || !Array.isArray(result.budget.breakdown) || result.budget.breakdown.length === 0) {
        result.budget = {
            total_amount: grant.amount || "Not specified",
            currency: "USD",
            duration: "36 months",
            breakdown: [
                {
                    category: "Program Implementation",
                    year_1: "30%",
                    year_2: "40%",
                    year_3: "30%",
                    total: grant.amount || "Not specified"
                }
            ]
        };
    }

    // sanitize
    result.region_normalized = (result.region_normalized || grant.region || "").toLowerCase().trim();
    result.donor_agency = result.donor_agency || grant.donor_agency || "Unknown";
    result.donor_agency_normalized = result.donor_agency_normalized || result.donor_agency;
    result.amount = result.amount || grant.amount || "Not specified";
    result.proposal_title = result.proposal_title || grant.grant_name || "";
    result.short_description = result.short_description || grant.short_description || "";

    return result;
}

/* ─── Fallback ───────────────────────────────────────── */
function fallbackResponse(grant) {
    return {
        country: [grant.region || "Unknown"],
        region_normalized: (grant.region || "").toLowerCase(),
        donor_agency: grant.donor_agency || "Unknown",
        donor_agency_normalized: grant.donor_agency || "Unknown",
        focus_area: ["Community Development"],
        proposal_title: grant.grant_name || "",
        short_description: grant.short_description || "",
        amount: grant.amount || "Not specified"
    };
}

/* ─── Country extraction ───────────────────────── */
function extractCountryFromText(regionText, grant) {
    const text = (regionText + " " + grant.grant_name).toLowerCase();

    if (text.includes("india")) return ["India"];
    if (text.includes("africa")) return ["Nigeria", "Kenya", "South Africa"];
    if (text.includes("asia")) return ["India", "Indonesia", "Vietnam"];

    return [grant.region || "Unknown"];
}

/* ─── Focus extraction ───────────────────────── */
function extractFocusFromText(grant) {
    const text = (grant.grant_name + " " + grant.short_description).toLowerCase();

    const areas = [];

    if (text.includes("women")) areas.push("Gender Equity");
    if (text.includes("finance")) areas.push("Financial Inclusion");
    if (text.includes("business")) areas.push("Entrepreneurship Development");
    if (text.includes("skill")) areas.push("Skills Development");
    if (text.includes("climate")) areas.push("Climate Resilience");

    return areas.length ? areas : ["Economic Empowerment", "Community Development"];
}

module.exports = { processGrant };