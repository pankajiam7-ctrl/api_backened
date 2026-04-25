/**
 * buildEmailHtml(recipientName, grants)
 * Returns a fully-inlined HTML string ready to send via any mailer.
 */
function buildEmailHtml(recipientName, grants) {
    const grantCards = grants
        .map(
            (g) => `
    <tr>
      <td style="padding:0 0 20px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#ffffff;border-radius:12px;border:1px solid #e8ecf0;overflow:hidden;">
          <tr>
            <td style="background:#1a3c5e;padding:10px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="background:#27ae60;color:#fff;font-size:11px;font-weight:700;
                                 padding:3px 10px;border-radius:20px;letter-spacing:0.5px;">
                      ✅ ${g.status.toUpperCase()}
                    </span>
                  </td>
                  <td align="right" style="color:#a8c4e0;font-size:12px;font-family:'Courier New',monospace;">
                    📅 Deadline: <strong style="color:#fff;">${g.deadline}</strong>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 20px 6px 20px;">
              <h3 style="margin:0 0 4px 0;font-size:17px;font-weight:700;color:#1a3c5e;
                         font-family:Georgia,serif;line-height:1.3;">
                ${g.title}
              </h3>
              <p style="margin:0;font-size:13px;color:#6b7c93;">🏛 ${g.donor}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 20px;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right:20px;">
                    <p style="margin:0;font-size:11px;color:#8899aa;text-transform:uppercase;
                               letter-spacing:0.8px;font-weight:600;">Amount</p>
                    <p style="margin:4px 0 0 0;font-size:14px;font-weight:700;color:#e67e22;">
                      💰 ${g.amount}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 20px 18px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="display:inline-block;background:#eef2f7;color:#4a6fa5;
                                 font-size:11px;padding:4px 10px;border-radius:4px;margin-right:6px;">
                      📍 ${g.region}
                    </span>
                    <span style="display:inline-block;background:#fef9ec;color:#b07d00;
                                 font-size:11px;padding:4px 10px;border-radius:4px;">
                      ${g.category}
                    </span>
                  </td>
                  <td align="right">
                    <a href="${g.link}"
                       style="background:#1a3c5e;color:#ffffff;font-size:12px;font-weight:600;
                              padding:8px 16px;border-radius:6px;text-decoration:none;
                              letter-spacing:0.3px;">
                      View Details →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
        )
        .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Grant Opportunities – GrantHub NGO</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Helvetica Neue',Arial,sans-serif;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#f0f4f8;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" border="0"
               style="max-width:620px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a3c5e 0%,#2d6a9f 100%);
                       border-radius:16px 16px 0 0;padding:36px 40px 30px 40px;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:12px;color:#a8d4f5;letter-spacing:2px;
                        text-transform:uppercase;font-weight:600;">GrantHub NGO</p>
              <h1 style="margin:0 0 10px 0;font-size:28px;font-weight:800;color:#ffffff;
                         font-family:Georgia,serif;line-height:1.2;">
                🌍 New Grant Opportunities
              </h1>
              <p style="margin:0;font-size:14px;color:#c8dff0;line-height:1.6;">
                Curated open grants — updated for you this week
              </p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="background:#ffffff;padding:28px 40px 10px 40px;">
              <p style="margin:0;font-size:15px;color:#344563;line-height:1.7;">
                Dear <strong>${recipientName}</strong>,
              </p>
              <p style="margin:12px 0 0 0;font-size:14px;color:#5e6e82;line-height:1.8;">
                Here are the latest <strong>open grant opportunities</strong> curated from
                <a href="https://granthubngo.com/grants" style="color:#2d6a9f;font-weight:600;">
                  GrantHub NGO
                </a>.
                Review each listing carefully and apply before the deadline.
              </p>
            </td>
          </tr>

          <!-- Grant Cards -->
          <tr>
            <td style="background:#ffffff;padding:20px 40px 10px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${grantCards}
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="background:#ffffff;padding:10px 40px 30px 40px;text-align:center;">
              <a href="https://granthubngo.com/grants"
                 style="display:inline-block;background:#e67e22;color:#ffffff;font-size:15px;
                        font-weight:700;padding:14px 36px;border-radius:8px;
                        text-decoration:none;letter-spacing:0.4px;">
                Browse All Open Grants →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#1a3c5e;border-radius:0 0 16px 16px;
                       padding:24px 40px;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:13px;color:#a8c4e0;">
                You are receiving this because you subscribed to grant alerts.
              </p>
              <p style="margin:0;font-size:12px;color:#6a8aaa;">
                © 2026 GrantHub NGO &nbsp;|&nbsp;
                <a href="#" style="color:#a8c4e0;text-decoration:underline;">Unsubscribe</a>
              </p>
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