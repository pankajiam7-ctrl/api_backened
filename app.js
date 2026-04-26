const express = require("express");
const cors = require("cors"); // 👈 add this
const { startCronJobs } = require("./job/emailCronjob");

const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const grantRoutes = require("./routes/grant.routes");
const proposalRoutes = require("./routes/proposal.routes");
const adminRoutes = require("./routes/admin.routes");
const paymentRoutes =  require("./routes/payment.routes")



const app = express();

// ✅ CORS enable karo
app.use(cors());

// Agar specific origin allow karna ho:
app.use(cors({ origin: '*' }))

app.use(
    "/api/webhooks/stripe",
    require("express").raw({ type: "application/json" })
);

app.use(express.json());

app.use((req, res, next) => {
    console.log("👉 Content-Type:", req.headers["content-type"]);
    next();
});

app.use("/api/auth", authRoutes);
app.use("/api/otp", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/grants", grantRoutes);
app.use("/api/proposals", proposalRoutes);
app.use("/api/admin", adminRoutes);
app.use('/api/payment',paymentRoutes);

//startCronJobs();

module.exports = app;
