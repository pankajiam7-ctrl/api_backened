require("dotenv").config();  // ✅ FIRST LINE

const mongoose = require("mongoose");
const app = require("./app");

console.log("ENV CHECK:", process.env.MONGO_URI); // 👈 debug

mongoose.connect("mongodb+srv://pankaj16289_db_user:vtPtwrjJc1OInVY6@cluster0.wdrf7ce.mongodb.net/gnodb?retryWrites=true&w=majority&appName=Cluster0")
    .then(() => console.log("✅ DB Connected"))
    .catch(err => console.error("❌ DB Error:", err.messages));


    app.listen(7777, "0.0.0.0",() => {
    console.log("🚀 Server running on port 7777");
});

