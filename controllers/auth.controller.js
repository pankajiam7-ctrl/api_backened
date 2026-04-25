const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const generateToken = require("../utils/generateToken");
require("dotenv").config();
const nodemailer = require('nodemailer')
const otpStore = new Map() // { email -> { otp, expiresAt } }




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

    // ❌ Invalid user
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // ❌ Wrong password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // ✅ Create Token
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES || "7d"
      }
    );

    // ❌ password remove before sending
    const userData = user.toObject();
    delete userData.password;

    // ✅ Response
    res.json({
      success: true,
      token,
      user: userData
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
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


// ── Nodemailer Transporter (Hostinger) ───────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   'smtp.hostinger.com',
  port:   465,
  secure: true,
  auth: {
    user: process.env.MAIL_USER,  // users@support.granthubngo.com
    pass: process.env.MAIL_PASS,  // your hostinger email password
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/send-otp
// Body: { email, name }
// ─────────────────────────────────────────────────────────────────────────────
exports.sendOtp = async (req, res) => {
  try {
    const { email, name } = req.body

    if (!email) return res.status(400).json({ message: 'Email is required' })

    // Check if email already registered
    const existing = await User.findOne({ email })
    if (existing) return res.status(400).json({ message: 'Email already registered' })

    // Generate 6-digit OTP
    const otp       = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = Date.now() + 10 * 60 * 1000 // 10 minutes

    // Store OTP
    otpStore.set(email, { otp, expiresAt })

    console.log(`OTP for ${email}: ${otp}`) // Remove in production

    // Send Email
    await transporter.sendMail({
      from:    `"GrantHub" <${process.env.MAIL_USER}>`,
      to:      email,
      subject: 'Your GrantHub Verification Code',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#f9fafb;border-radius:12px;">
          
          <div style="text-align:center;margin-bottom:24px;">
            <div style="background:#0f2d57;color:#fff;font-size:24px;font-weight:900;width:52px;height:52px;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;">G</div>
            <h2 style="color:#0f2d57;margin:12px 0 4px;">GrantFlow</h2>
            <p style="color:#6b7280;margin:0;font-size:14px;">Email Verification</p>
          </div>

          <p style="color:#374151;font-size:15px;">Hi <strong>${name || 'there'}</strong>,</p>
          <p style="color:#374151;font-size:15px;">
            Use the verification code below to complete your registration. 
            This code expires in <strong>10 minutes</strong>.
          </p>

          <div style="text-align:center;margin:32px 0;">
            <div style="display:inline-block;background:#0f2d57;color:#fff;font-size:36px;font-weight:900;letter-spacing:12px;padding:18px 36px;border-radius:12px;">
              ${otp}
            </div>
          </div>

          <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px 16px;margin-bottom:24px;">
            <p style="margin:0;color:#856404;font-size:13px;">
              ⚠️ Never share this code with anyone. GrantFlow will never ask for your OTP.
            </p>
          </div>

          <p style="color:#9ca3af;font-size:12px;text-align:center;">
            If you didn't request this, you can safely ignore this email.<br/>
            This code will expire automatically.
          </p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
          <p style="color:#9ca3af;font-size:11px;text-align:center;margin:0;">
            Sent from GrantFlow · support.granthubngo.com
          </p>
        </div>
      `,
    })

    res.status(200).json({ message: 'OTP sent successfully to ' + email })

  } catch (err) {
    console.error('sendOtp error:', err.message)
    res.status(500).json({ message: 'Failed to send OTP', error: err.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/verify-otp
// Body: { email, otp }
// ─────────────────────────────────────────────────────────────────────────────
exports.verifyOtp = (req, res) => {
  try {
    const { email, otp } = req.body

    if (!email || !otp) 
      return res.status(400).json({ message: 'Email and OTP are required' })

    const record = otpStore.get(email)

    // OTP not found
    if (!record) 
      return res.status(400).json({ message: 'OTP not found. Please request a new one.' })

    // OTP expired
    if (Date.now() > record.expiresAt) {
      otpStore.delete(email)
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' })
    }

    // OTP wrong
    if (record.otp !== otp) 
      return res.status(400).json({ message: 'Invalid OTP. Please try again.' })

    // ✅ OTP valid — delete so it can't be reused
    otpStore.delete(email)

    res.status(200).json({ message: 'OTP verified successfully', verified: true })

  } catch (err) {
    console.error('verifyOtp error:', err.message)
    res.status(500).json({ message: 'OTP verification failed', error: err.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register  ← called AFTER verifyOtp succeeds
// Body: { name, email, password, confirmPassword, otp }
// ─────────────────────────────────────────────────────────────────────────────
exports.OtpValidation = async (req, res) => {
  try {
    const { name, email, password, confirmPassword, otp } = req.body

    // Validation
    if (!name || !email || !password || !otp)
      return res.status(400).json({ message: 'All fields are required' })

    if (password !== confirmPassword)
      return res.status(400).json({ message: 'Passwords do not match' })

    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' })

    // Verify OTP
    const record = otpStore.get(email)

    if (!record)
      return res.status(400).json({ message: 'OTP not found. Please request a new one.' })

    if (Date.now() > record.expiresAt) {
      otpStore.delete(email)
      return res.status(400).json({ message: 'OTP expired. Please request a new one.' })
    }

    if (record.otp !== otp)
      return res.status(400).json({ message: 'Invalid OTP. Please try again.' })

    // ✅ OTP valid — clear it
    otpStore.delete(email)

    // Check duplicate user
    const existing = await User.findOne({ email })
    if (existing)
      return res.status(400).json({ message: 'Email already registered' })

    // Hash password & create user
    const bcrypt = require('bcryptjs')
    const jwt    = require('jsonwebtoken')

    const hashed = await bcrypt.hash(password, 10)
    const user   = await User.create({ name, email, password: hashed })

    // Generate token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' })

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        _id:   user._id,
        name:  user.name,
        email: user.email,
      },
    })

  } catch (err) {
    console.error('OtpValidation error:', err.message)
    res.status(500).json({ message: 'Registration failed', error: err.message })
  }
}