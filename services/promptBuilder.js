exports.buildProposalPrompt = ({ title, focus, budget, section }) => {
    return `
You are an expert grant proposal writer.

Generate a professional proposal section.

Details:
- Title: ${title}
- Focus Area: ${focus}
- Budget: ${budget}
- Section: ${section}

Instructions:
- Write only the "${section}" section
- Keep it clear, professional, and detailed
- Use simple language
- Avoid repetition
- Keep within 200-300 words
`;
};