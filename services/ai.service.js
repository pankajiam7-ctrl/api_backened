const client = require("../config/openai");

exports.extractGrant = async (text) => {
    try {
        const res = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `
Extract ONLY grant data in JSON array format.
Fields:
- grant_name
- focus_area
- country
- donor
- deadline
- url

Return ONLY JSON array.
`
                },
                {
                    role: "user",
                    content: text
                }
            ]
        });

        return JSON.parse(res.choices[0].message.content);
    } catch (err) {
        console.error("AI Error:", err.message);
        return [];
    }
};


