const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const User = require("../models/user.model");


// =====================================================
// 💳 GET PLANS
// =====================================================
exports.getPlans = async (req, res) => {
    try {
        res.json([
            {
                name: "Free",
                price: 0,
                priceId: null,
                features: ["Basic access"]
            },
            {
                name: "Pro",
                price: 29,
                priceId: "price_pro_id", // 🔥 Replace with Stripe Price ID
                features: ["Unlimited AI proposals"]
            },
            {
                name: "Enterprise",
                price: 99,
                priceId: "price_enterprise_id",
                features: ["Team + advanced analytics"]
            }
        ]);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// =====================================================
// 💳 CREATE CHECKOUT SESSION
// =====================================================
exports.createCheckoutSession = async (req, res) => {
    try {
        const { priceId } = req.body;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "subscription",
            line_items: [
                {
                    price: priceId,
                    quantity: 1
                }
            ],
            success_url: `${process.env.CLIENT_URL}/success`,
            cancel_url: `${process.env.CLIENT_URL}/cancel`,
            client_reference_id: req.user
        });

        res.json({ url: session.url });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// =====================================================
// ❌ CANCEL SUBSCRIPTION
// =====================================================
exports.cancelSubscription = async (req, res) => {
    try {
        const user = await User.findById(req.user);

        if (!user.stripeSubscriptionId) {
            return res.status(400).json({ message: "No active subscription" });
        }

        await stripe.subscriptions.del(user.stripeSubscriptionId);

        user.subscription = {
            plan: "Free",
            status: "cancelled"
        };

        user.stripeSubscriptionId = null;

        await user.save();

        res.json({ message: "Subscription cancelled" });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// =====================================================
// 📄 GET INVOICES
// =====================================================
exports.getInvoices = async (req, res) => {
    try {
        const user = await User.findById(req.user);

        if (!user.stripeCustomerId) {
            return res.json([]);
        }

        const invoices = await stripe.invoices.list({
            customer: user.stripeCustomerId
        });

        res.json(invoices.data);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// =====================================================
// 🔔 STRIPE WEBHOOK (IMPORTANT)
// =====================================================
exports.stripeWebhook = async (req, res) => {
    let event;

    try {
        const sig = req.headers["stripe-signature"];

        event = stripe.webhooks.constructEvent(
            req.rawBody,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        // ===============================
        // ✅ CHECKOUT COMPLETED
        // ===============================
        if (event.type === "checkout.session.completed") {
            const session = event.data.object;

            const user = await User.findById(session.client_reference_id);

            // Create customer if not exists
            if (!user.stripeCustomerId) {
                user.stripeCustomerId = session.customer;
            }

            user.subscription = {
                plan: "Pro", // 🔥 detect dynamically later
                status: "active"
            };

            user.stripeSubscriptionId = session.subscription;

            await user.save();
        }

        // ===============================
        // ❌ SUBSCRIPTION CANCELLED
        // ===============================
        if (event.type === "customer.subscription.deleted") {
            const sub = event.data.object;

            const user = await User.findOne({
                stripeSubscriptionId: sub.id
            });

            if (user) {
                user.subscription = {
                    plan: "Free",
                    status: "cancelled"
                };
                user.stripeSubscriptionId = null;

                await user.save();
            }
        }

        res.json({ received: true });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};