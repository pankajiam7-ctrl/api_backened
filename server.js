require("dotenv").config();  // ✅ FIRST LINE

const mongoose = require("mongoose");
const app = require("./app");

console.log("ENV CHECK:", process.env.MONGO_URI); // 👈 debug

mongoose.connect("mongodb+srv://grant_user:Pankaj%40123456@cluster0.3l6pzzy.mongodb.net/gr?retryWrites=true&w=majority")
    .then(() => console.log("✅ DB Connected"))
    .catch(err => console.error("❌ DB Error:", err.messages));


app.listen(7777, "0.0.0.0", () => {
    console.log("🚀 Server running on port 7777");
    const https = require('https');
    setInterval(() => {
        https.get('https://api-backened-1.onrender.com', (res) => {
            console.log(`Self-ping: ${res.statusCode}`);
        }).on('error', (err) => {
            console.error('Self-ping failed:', err.message);
        });
    }, 10 * 60 * 1000);
});

