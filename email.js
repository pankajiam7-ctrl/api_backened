require('dotenv').config();
const { BrevoClient } = require('@getbrevo/brevo');

const client = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY
});

async function sendEmail() {
  try {
    const response = await client.transactionalEmails.sendTransacEmail({
      subject: "Welcome to GrantHub!",
      htmlContent: "<h1>Hello!</h1><p>Brevo se email aaya!</p>",
      sender: { 
        name: "GrantHub Support", 
        email: "users@support.granthubngo.com"
      },
      to: [{ 
        email: "pankaj.iam7@gmail.com"
      }]
    });
    console.log("✅ Email sent!");
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

sendEmail();