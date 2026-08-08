const express = require("express");
const cors = require("cors"); // 👈 add this


const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const grantRoutes = require("./routes/grant.routes");
const proposalRoutes = require("./routes/proposal.routes");
const adminRoutes = require("./routes/admin.routes");
const paymentRoutes =  require("./routes/payment.routes");
const razorpayRoutes = require("./routes/razorpay.routes");
const coverLoiRoutes =  require("./routes/coverLoiRoutes");
const logFrameRoutes =  require("./routes/logFrameRoutes");
const budgetRoutes =  require("./routes/budgetRoutes");
const proposalRequestRoutes = require("./routes/proposalRequest.routes");


const { startCronJobs } = require("./job/email.cron");



const app = express();

// ✅ CORS enable karo
app.use(cors());

// Agar specific origin allow karna ho:
app.use(cors({ origin: '*' }))

app.use(
    "/api/webhooks/stripe",
    require("express").raw({ type: "application/json" })
);

// ⚠️ Webhook routes below verify a signature over the RAW request body,
// so they must NOT go through express.json() first. Skip json parsing
// for those exact paths, apply it to everything else.
const RAW_BODY_PATHS = ["/api/payment/razorpay/webhook", "/api/payment/webhook"];
app.use((req, res, next) => {
    if (RAW_BODY_PATHS.includes(req.originalUrl.split("?")[0])) {
        return next();
    }
    express.json()(req, res, next);
});

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
app.use('/api/payment/razorpay', razorpayRoutes);
app.use('/api/coverLoi',coverLoiRoutes );
app.use('/api/budget',budgetRoutes );
app.use('/api/logFrame',logFrameRoutes );
app.use("/api/proposal", proposalRequestRoutes);



startCronJobs()


module.exports = app;