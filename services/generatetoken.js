const jwt = require("jsonwebtoken");

/**
 * Generates a signed JWT token for a user.
 * Throws a clear error if JWT_SECRET is missing from .env
 */
function generateToken(userId) {
    const secret = process.env.JWT_SECRET;

    // ✅ Guard — fail fast with a clear message
    if (!secret) {
        throw new Error(
            "JWT_SECRET is not defined. Add JWT_SECRET=your_secret_key to your .env file."
        );
    }

    return jwt.sign(
        { id: userId },
        secret,
        { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );
}

module.exports = generateToken;