require("dotenv").config(); // ← MUST be line 1, before everything

const cron = require("node-cron");
const transporter = require("../config/mailer");
const buildEmailHtml = require("./emailTemplate");

// ── Static test user ─────────────────────────────────────────────────────────
const TEST_USERS = [
  {
    name: "Lachu Bhai...",
    email: "pankaj16289@gmail.com",
  },
];

// ── Dummy grant data for testing ─────────────────────────────────────────────
const TEST_GRANTS = [
  {
    title: "Toyota Foundation Asia Practitioners",
    donor: "Toyota Foundation",
    amount: "Up to JPY ¥10,000,000 per project",
    deadline: "30 May 2026",
    region: "East, Southeast & South Asia",
    category: "Cross-Cutting",
    status: "Open",
    link: "https://granthubngo.com/grants",
  },
  {
    title: "IBRO Neuroscience Training Schools",
    donor: "IBRO",
    amount: "Up to USD $50,000 per school",
    deadline: "31 May 2026",
    region: "Global",
    category: "Global Health & WASH",
    status: "Open",
    link: "https://granthubngo.com/grants",
  },
  {
    title: "DayOne Healthtech Accelerator 2026",
    donor: "DayOne / Basel Area",
    amount: "CHF 50,000 non-dilutive + support",
    deadline: "31 May 2026",
    region: "Global",
    category: "Global Health & WASH",
    status: "Open",
    link: "https://granthubngo.com/grants",
  },
];

// ── Core send logic ──────────────────────────────────────────────────────────
async function sendGrantEmails(label = "Cron") {
  console.log(`\n[${label}] Starting email job at ${new Date().toISOString()}`);
  console.log("MAIL_USER:", process.env.MAIL_USER); // ← debug line, remove after fix

  let sent = 0, failed = 0;

  const users  = TEST_USERS;
  const grants = TEST_GRANTS;

  for (const user of users) {
    try {
      await transporter.sendMail({
        from:    `"${process.env.SENDER_NAME || "GrantHub NGO"}" <${process.env.MAIL_USER}>`, // ← MAIL_USER not SMTP_USER
        to:      `"${user.name}" <${user.email}>`,
        subject: "🌍 [TEST] New Grant Opportunities – GrantHub NGO",
        html:    buildEmailHtml(user.name, grants),
      });
      console.log(`  ✅ Sent → ${user.name} <${user.email}>`);
      sent++;
    } catch (err) {
      console.error(`  ❌ Failed → ${user.email}: ${err.message}`);
      failed++;
    }
  }

  console.log(`[${label}] Done — Sent: ${sent} | Failed: ${failed}\n`);
}

// ── Register all cron schedules ──────────────────────────────────────────────
function startCronJobs() {

  // ← Remove this after testing
  cron.schedule("* * * * *", () => {
    sendGrantEmails("TEST-EVERY-MINUTE");
  });

  // Every day at 8:00 AM
  cron.schedule("0 8 * * *", () => {
    sendGrantEmails("Daily-8AM");
  }, { timezone: "Asia/Kolkata" });

  // Every Monday at 9:00 AM
  cron.schedule("0 9 * * 1", () => {
    sendGrantEmails("Weekly-Monday");
  }, { timezone: "Asia/Kolkata" });

  // 1st of every month at 8:00 AM
  cron.schedule("0 8 1 * *", () => {
    sendGrantEmails("Monthly-1st");
  }, { timezone: "Asia/Kolkata" });

  console.log("Cron jobs registered: Daily 8AM | Monday 9AM | Monthly 1st");
}

module.exports = { startCronJobs, sendGrantEmails };