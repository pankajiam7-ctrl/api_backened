require("dotenv").config(); // ← MUST be line 1

const cron           = require("node-cron");
const transporter    = require("../config/mailer");
const buildEmailHtml = require("./emailTemplate");
const LeadUser       = require("../models/leaduser.model");
const { GrantCron }  = require("../models/grantScrap.model");

// ── Helper: sleep N milliseconds ──────────────────────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Process single user ────────────────────────────────────────────────────────
async function processUser(user, grants, label) {
  try {
    await transporter.sendMail({
      from:    `"${process.env.SENDER_NAME || "GrantHub NGO"}" <${process.env.MAIL_USER}>`,
      to:        process.env.TEST_EMAIL || user.user_email, // ← TEST_EMAIL set karo .env mein test k liye
      subject: "🌍 New Grant Opportunities – GrantHub NGO",
      html:    buildEmailHtml(user.user_email, grants),
    });

    // ✅ Success → increment sent_email by 1
    const updated = await LeadUser.findByIdAndUpdate(
      user._id,
      { $set: { sent_email: user.sent_email + 1 } },
      { new: true }
    );

    console.log(`  ✅ [${label}] Sent → ${user.user_email} | sent_email: ${updated.sent_email}`);
    return "sent";

  } catch (err) {
    // ❌ Fail → reset sent_email to 0
    await LeadUser.findByIdAndUpdate(
      user._id,
      { $set: { sent_email: 0 } },
      { new: true }
    );

    console.error(`  ❌ [${label}] Failed → ${user.user_email}: ${err.message} | sent_email reset: 0`);
    return "failed";
  }
}

// ── Core job ───────────────────────────────────────────────────────────────────
async function sendGrantEmails(label = "Cron") {
  try {
    console.log(`\n[${label}] Starting at ${new Date().toISOString()}`);

    const [users, grants] = await Promise.all([
      LeadUser.find().limit(43).lean(),

      // ✅ type:0, proper deadline + amount (no N/A/Rolling/empty), recently added top 7
      GrantCron.find({
        type: 0,
        "raw.deadline": { $exists: true, $nin: ["", "N/A",  null], $regex: /\d/ },
        "raw.amount":   { $exists: true, $nin: ["", "N/A", null], $regex: /\d/ },
      })
        .sort({ createdAt: -1 })
        .limit(7)
        .lean(),
    ]);

    if (!users.length)  return console.log(`[${label}] No users. Aborting.\n`);
    if (!grants.length) return console.log(`[${label}] No grants. Aborting.\n`);

    console.log(`[${label}] ${users.length} users | ${grants.length} grants`);

    let sent = 0, failed = 0;

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      console.log(`\n  [${i + 1}/${users.length}] ${user.user_email} (${user.user_country}) | sent_email: ${user.sent_email}`);

      const result = await processUser(user, grants, label);
      result === "sent" ? sent++ : failed++;

      // 5 second gap between every user
      if (i < users.length - 1) {
        console.log(`  ⏳ Waiting 5s...`);
        await sleep(5000);
      }
    }

    console.log(`\n[${label}] Done — ✅ Sent: ${sent} | ❌ Failed: ${failed}\n`);

  } catch (error) {
    console.error(`[${label}] Job error: ${error.message}`);
  }
}

// ── Cron schedules ─────────────────────────────────────────────────────────────
function startCronJobs() {

  // ← TEST: har minute trigger, test hone ke baad comment kar do
   //cron.schedule("* * * * *", () => sendGrantEmails("TEST-EVERY-MINUTE"));

  // // Daily 8AM IST
  // cron.schedule("0 8 * * *", () => sendGrantEmails("Daily-8AM"),
  //   { timezone: "Asia/Kolkata" });

  // // Every Monday 9AM IST
  // cron.schedule("0 9 * * 1", () => sendGrantEmails("Weekly-Monday"),
  //   { timezone: "Asia/Kolkata" });

  // // 1st of month 8AM IST
  // cron.schedule("0 8 1 * *", () => sendGrantEmails("Monthly-1st"),
  //   { timezone: "Asia/Kolkata" });

  console.log("✅ Cron jobs registered: Daily 8AM | Monday 9AM | Monthly 1st");
}

module.exports = { startCronJobs, sendGrantEmails };