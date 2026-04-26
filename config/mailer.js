const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host:   "smtp.hostinger.com",
  port:   465,
  secure: true,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// ✅ Connection test karo
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Mailer connection failed:", error.message);
  } else {
    console.log("✅ Mailer connected successfully!");
  }
});

module.exports = transporter;