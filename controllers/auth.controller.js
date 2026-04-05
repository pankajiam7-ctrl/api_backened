const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const generateToken = require("../utils/generateToken");
require("dotenv").config();



// REGISTER
exports.register = async (req, res) => {
    try {
        const { name, email, password, confirmPassword } = req.body;

        // ── Validation ────────────────────────────────────────────────────────
        if (!name || !email || !password || !confirmPassword) {
            return res.status(400).json({ message: "All fields required" });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ message: "Passwords do not match" });
        }

        const exists = await User.findOne({ email });
        if (exists) {
            return res.status(400).json({ message: "User already exists" });
        }

        // ── Create user ───────────────────────────────────────────────────────
        const hashed = await bcrypt.hash(password, 10);
        const user   = await User.create({ name, email, password: hashed });

        // ── Respond ───────────────────────────────────────────────────────────
        return res.status(201).json({
            message: "Registered successfully",
            token:   generateToken(user._id),
            user: {
                _id:   user._id,
                name:  user.name,
                email: user.email,
            },
        });

    } catch (err) {
        console.error("Register error:", err.message);
        return res.status(500).json({ message: err.message });
    }
};
// LOGIN
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        res.json({
            user
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// OTHER APIs (Basic)
exports.logout = (req, res) => {
    res.json({ message: "Logged out" });
};

exports.refreshToken = (req, res) => {
    res.json({ message: "Token refreshed" });
};

exports.forgotPassword = (req, res) => {
    res.json({ message: "Email sent" });
};

exports.resetPassword = (req, res) => {
    res.json({ message: "Password reset success" });
};

exports.googleAuth = (req, res) => {
    res.json({ message: "Google login" });
};

exports.microsoftAuth = (req, res) => {
    res.json({ message: "Microsoft login" });
};