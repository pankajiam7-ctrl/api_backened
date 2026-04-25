require("dotenv").config();
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host:   "smtp.hostinger.com",
  port:   465,
  secure: true,                  // true for port 465
  auth: {
    user: process.env.MAIL_USER, // users@support.granthubngo.com
    pass: process.env.MAIL_PASS, // your hostinger email password
  },
});

module.exports = transporter;