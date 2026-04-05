const OpenAI = require("openai");

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const callOpenAI = async (rawText) => {
    try {
        const prompt = `
Extract grant opportunities from the text below.

Return ONLY valid JSON array.
No markdown. No explanation.

Format:
[
  {
    "title": "",
    "organization": "",
    "deadline": "",
    "link": ""
  }
]

Text:
${rawText.slice(0, 12000)}
`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2
        });

        return response.choices[0].message.content;

    } catch (err) {
        console.error("❌ OpenAI Error:", err.message);
        return null;
    }
};

const extractGrantSafe = async (rawText) => {
    try {
        const aiResponse = await callOpenAI(rawText);

        if (!aiResponse) return [];

        let cleaned = aiResponse.trim();

        // 🔥 remove markdown
        cleaned = cleaned
            .replace(/```json/gi, "")
            .replace(/```/g, "")
            .trim();

        // 🔥 extract JSON part only
        const start = cleaned.indexOf("[");
        const end = cleaned.lastIndexOf("]");

        if (start !== -1 && end !== -1) {
            cleaned = cleaned.substring(start, end + 1);
        }

        return JSON.parse(cleaned);

    } catch (err) {
        console.error("❌ AI Parse Error:", err.message);
        return [];
    }
};

module.exports = { extractGrantSafe };