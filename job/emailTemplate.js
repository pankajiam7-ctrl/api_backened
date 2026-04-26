/**
 * buildEmailHtml(userEmail, grants)
 * grants[] come from GrantCron model — raw nested object
 */
function buildEmailHtml(userEmail, grants) {
  const grantCards = grants
    .map((g, index) => {
      const raw = g.raw || g;

      const name        = raw.grant_name        || "Unnamed Grant";
      const deadline    = raw.deadline          || "";
      const amount      = raw.amount            || "Rolling Basis";
      const region      = raw.region            || "N/A";
      const agency      = raw.donor_agency      || "N/A";
      const eligibility = Array.isArray(raw.eligibility)
                            ? raw.eligibility.join(", ")
                            : (raw.eligibility || "N/A");
      const desc        = raw.short_description || "";
      const url         = "https://granthubngo.com/grants";

      // Clean deadline
      const cleanDeadline = deadline
        .replace(/\d{2}:\d{2}:\d{2}\s*GMT[^\s]*/gi, "")
        .replace(/\(.*?\)/g, "")
        .trim() || "Rolling";

      return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
  <tr>
    <td style="
      background:#ffffff;
      border-radius:14px;
      overflow:hidden;
      box-shadow:0 2px 10px rgba(15,52,96,0.09);
      border:1px solid #dde8f5;
      font-family:Arial,sans-serif;
    ">
      <!-- Card Header -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="
            background:linear-gradient(135deg,#0f3460,#1a6eb5);
            padding:10px 14px;
          ">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle;">
                  <span style="
                    background:#16a34a;
                    color:#fff;
                    font-size:9px;
                    font-weight:700;
                    letter-spacing:1px;
                    padding:3px 9px;
                    border-radius:20px;
                    text-transform:uppercase;
                  ">✓ Active</span>
                </td>
                <td style="text-align:right;vertical-align:middle;">
                  <span style="
                    color:#fde68a;
                    font-size:10px;
                    font-weight:600;
                  ">⏳ ${cleanDeadline}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Card Body -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding:14px 16px 16px;">

            <!-- Grant # -->
            <div style="
              display:inline-block;
              background:#eff6ff;
              color:#1a6eb5;
              font-size:9px;
              font-weight:700;
              letter-spacing:1px;
              padding:2px 8px;
              border-radius:4px;
              margin-bottom:8px;
              text-transform:uppercase;
            ">Grant #${String(index + 1).padStart(2, "0")}</div>

            <!-- Grant Name    -->
            <div style="
              font-size:15px;
              font-weight:700;
              color:#0f2744;
              line-height:1.4;
              margin-bottom:6px;
              font-family:Arial,sans-serif;
            ">${name}</div>

            <!-- Agency -->
            <div style="
              color:#4a7aaa;
              font-size:12px;
              font-weight:500;
              margin-bottom:10px;
            ">🏛️ ${agency}</div>

            <!-- Description -->
            ${desc ? `
            <div style="
              color:#3d5a73;
              font-size:12px;
              line-height:1.6;
              background:#f5f9ff;
              padding:9px 12px;
              border-radius:8px;
              border-left:3px solid #1a6eb5;
              margin-bottom:12px;
              font-style:italic;
            ">${desc}</div>` : ""}

            <!-- Amount + Region — stacked table for mobile -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
              <tr>
                <td width="49%" style="
                  background:#fffbeb;
                  border:1px solid #fcd34d;
                  border-radius:10px;
                  padding:10px 12px;
                  vertical-align:top;
                ">
                  <div style="color:#92400e;font-size:9px;font-weight:700;letter-spacing:0.8px;margin-bottom:4px;text-transform:uppercase;">💰 Amount</div>
                  <div style="color:#b45309;font-size:15px;font-weight:800;">${amount}</div>
                </td>
                <td width="2%"></td>
                <td width="49%" style="
                  background:#eff6ff;
                  border:1px solid #93c5fd;
                  border-radius:10px;
                  padding:10px 12px;
                  vertical-align:top;
                ">
                  <div style="color:#1e3a5f;font-size:9px;font-weight:700;letter-spacing:0.8px;margin-bottom:4px;text-transform:uppercase;">📍 Region</div>
                  <div style="color:#1a6eb5;font-size:13px;font-weight:700;">${region}</div>
                </td>
              </tr>
            </table>

            <!-- Eligibility -->
            <div style="
              background:#f0fdf4;
              border:1px solid #86efac;
              border-radius:8px;
              padding:9px 12px;
              margin-bottom:14px;
              font-size:11px;
              color:#166534;
              line-height:1.6;
            "><strong>✅ Who Can Apply:</strong> ${eligibility}</div>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="text-align:center;">
                  <a href="${url}" style="
                    display:inline-block;
                    background:linear-gradient(135deg,#0f3460,#1a6eb5);
                    color:#ffffff;
                    text-decoration:none;
                    padding:11px 32px;
                    border-radius:8px;
                    font-size:13px;
                    font-weight:700;
                    letter-spacing:0.3px;
                  ">Explore This Grant →</a>
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
    })
    .join("");

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>New Grant Opportunities – GrantHub NGO</title>
</head>
<body style="margin:0;padding:0;background:#e8eef6;font-family:Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding:16px 10px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

        <!-- ── Header ── -->
        <tr>
          <td style="
            background:linear-gradient(135deg,#0a2540,#1a6eb5);
            border-radius:14px;
            padding:20px 20px 16px;
            text-align:center;
            margin-bottom:16px;
          ">
            <div style="font-size:30px;margin-bottom:6px;">🌍</div>
            <div style="
              color:#ffffff;
              font-size:18px;
              font-weight:800;
              margin-bottom:4px;
              font-family:Arial,sans-serif;
            ">New Funding Opportunities</div>
            <div style="color:#93c5fd;font-size:11px;margin-bottom:10px;">
              GrantHub NGO — Your Trusted Grant Partner
            </div>
            <div style="
              display:inline-block;
              background:rgba(255,255,255,0.12);
              border:1px solid rgba(255,255,255,0.2);
              color:#e0f2fe;
              font-size:10px;
              padding:4px 12px;
              border-radius:20px;
            ">📬 ${today}</div>
          </td>
        </tr>

        <tr><td style="height:14px;"></td></tr>

        <!-- ── Intro ── -->
        <tr>
          <td style="
            background:#ffffff;
            border-radius:12px;
            padding:16px 18px;
            border-left:4px solid #1a6eb5;
            box-shadow:0 2px 8px rgba(15,52,96,0.07);
            margin-bottom:16px;
          ">
            <div style="font-size:14px;font-weight:700;color:#0f2744;margin-bottom:6px;">Dear Changemaker,</div>
            <div style="font-size:12px;color:#3d5a73;line-height:1.7;">
              We have identified <strong style="color:#1a6eb5;">${grants.length} high-impact funding opportunities</strong>
              this week for NGOs, social enterprises, and community-driven organizations.
              Review each opportunity and submit your proposal before the deadline.
              <strong style="color:#0f3460;">Act today.</strong>
            </div>
          </td>
        </tr>

        <tr><td style="height:16px;"></td></tr>

        <!-- ── Grant Cards ── -->
        <tr>
          <td>${grantCards}</td>
        </tr>

        <!-- ── CTA Banner ── -->
        <tr>
          <td style="
            background:linear-gradient(135deg,#0f3460,#1a6eb5);
            border-radius:12px;
            padding:20px 16px;
            text-align:center;
          ">
            <div style="color:#bfdbfe;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">Don't Miss Out</div>
            <div style="color:#ffffff;font-size:15px;font-weight:700;margin-bottom:12px;">Explore All Active Grants on GrantHub</div>
            <a href="https://granthubngo.com/grants" style="
              display:inline-block;
              background:#ffffff;
              color:#0f3460;
              text-decoration:none;
              padding:10px 28px;
              border-radius:8px;
              font-size:13px;
              font-weight:800;
            ">Browse All Grants →</a>
          </td>
        </tr>

        <tr><td style="height:14px;"></td></tr>

        <!-- ── Footer ── -->
        <tr>
          <td style="text-align:center;padding:10px;color:#6b8aaa;font-size:10px;line-height:1.9;">
            <div style="font-weight:700;color:#3d5a73;">GrantHub NGO</div>
            <div>Empowering communities through access to funding.</div>
            <div>You received this because you subscribed to GrantHub NGO alerts.</div>
            <div>© ${new Date().getFullYear()} GrantHub NGO. All rights reserved.</div>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;
}

module.exports = buildEmailHtml;