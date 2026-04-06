require("dotenv").config();  // ✅ FIRST LINE

const mongoose = require("mongoose");
const app = require("./app");

console.log("ENV CHECK:", process.env.MONGO_URI); // 👈 debug

mongoose.connect("mongodb://grant_user:Pankaj%40123456@ac-0z3u6qk-shard-00-00.3l6pzzy.mongodb.net:27017,ac-0z3u6qk-shard-00-01.3l6pzzy.mongodb.net:27017,ac-0z3u6qk-shard-00-02.3l6pzzy.mongodb.net:27017/gr?ssl=true&replicaSet=atlas-11azkw-shard-0&authSource=admin&retryWrites=true&w=majority")
    .then(() => console.log("✅ DB Connected"))
    .catch(err => console.error("❌ DB Error:", err.messages));


    app.listen(7777, "0.0.0.0",() => {
    console.log("🚀 Server running on port 7777");
});

