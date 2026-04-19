const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// -----------------------------
// CREATE CUSTOMER
// -----------------------------
const createCustomer = async (email) => {
    const customer = await stripe.customers.create({ email });
    return customer.id;
};

// -----------------------------
// CREATE SUBSCRIPTION
// -----------------------------
exports.createSubscription = async (req, res) => {
    try {
        const { email, planType } = req.body;

        let priceId =
            planType === "monthly"
                ? process.env.PRICE_MONTHLY
                : process.env.PRICE_YEARLY;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "subscription",
            customer_email: email,
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            success_url: "http://localhost:3000/success",
            cancel_url: "http://localhost:3000/cancel",
        });

        res.json({ url: session.url });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// -----------------------------
// CANCEL SUBSCRIPTION
// -----------------------------
exports.cancelSubscription = async (req, res) => {
    try {
        const { subscriptionId } = req.body;

        const deleted = await stripe.subscriptions.del(subscriptionId);

        res.json({ success: true, data: deleted });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// -----------------------------
// WEBHOOK
// -----------------------------
exports.webhookHandler = (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.log("Webhook error:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
        case "invoice.payment_succeeded":
            console.log("✅ Payment success");
            break;

        case "invoice.payment_failed":
            console.log("❌ Payment failed");
            break;

        case "customer.subscription.created":
            console.log("📦 Subscription created");
            break;

        case "customer.subscription.deleted":
            console.log("🛑 Subscription cancelled");
            break;

        default:
            console.log(`Unhandled event: ${event.type}`);
    }

    res.sendStatus(200);
};


const axios = require('axios')

// ─── Config ──────────────────────────────────────────────────────────────────

const PAYPAL_BASE =
  process.env.PAYPAL_ENV === 'production'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'

const PLAN_IDS = {
  monthly: process.env.PAYPAL_PLAN_ID_MONTHLY,
  yearly:  process.env.PAYPAL_PLAN_ID_YEARLY,
}

// ─── OAuth token (cached) ────────────────────────────────────────────────────

let _token = null
let _tokenExpiry = 0

async function getAccessToken() {
  if (_token && Date.now() < _tokenExpiry) return _token

  const { data } = await axios.post(
    `${PAYPAL_BASE}/v1/oauth2/token`,
    'grant_type=client_credentials',
    {
      auth: {
        username: process.env.PAYPAL_CLIENT_ID,
        password: process.env.PAYPAL_CLIENT_SECRET,
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  )

  _token = data.access_token
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  return _token
}

function paypalClient() {
  return {
    async get(path) {
      const token = await getAccessToken()
      return axios.get(`${PAYPAL_BASE}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    },
    async post(path, body) {
      const token = await getAccessToken()
      return axios.post(`${PAYPAL_BASE}${path}`, body, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
    },
  }
}

// ─── Controllers ─────────────────────────────────────────────────────────────

exports.getPlan = async (req, res) => {
  res.json({
    monthly: { planId: PLAN_IDS.monthly, price: 4.99,  period: 'month' },
    yearly:  { planId: PLAN_IDS.yearly,  price: 24.99, period: 'year'  },
  })
}

exports.subscriptionVerify = async (req, res) => {
  try {
    const { subscriptionId, plan, userId } = req.body

    if (!subscriptionId || !plan || !userId) {
      return res.status(400).json({ error: 'subscriptionId, plan, and userId are required' })
    }

    const client = paypalClient()
    const { data: subscription } = await client.get(
      `/v1/billing/subscriptions/${subscriptionId}`
    )

    if (subscription.plan_id !== PLAN_IDS[plan]) {
      return res.status(400).json({ error: 'Plan mismatch — possible tampering detected' })
    }

    if (subscription.status !== 'ACTIVE') {
      return res.status(402).json({
        error: `Subscription is ${subscription.status}, expected ACTIVE`,
      })
    }

    // TODO: save to DB
    // await db.users.update({ id: userId }, {
    //   plan,
    //   subscriptionId,
    //   subscriptionStatus: 'active',
    //   currentPeriodEnd: subscription.billing_info?.next_billing_time,
    // })

    res.json({
      success: true,
      subscriptionId: subscription.id,
      plan,
      status: subscription.status,
      nextBillingTime: subscription.billing_info?.next_billing_time,
      subscriber: {
        email: subscription.subscriber?.email_address,
        name:  subscription.subscriber?.name,
      },
    })
  } catch (err) {
    console.error('Subscription verify error:', err?.response?.data ?? err.message)
    res.status(500).json({ error: 'Failed to verify subscription' })
  }
}

exports.getSubscription = async (req, res) => {
  try {
    const client = paypalClient()
    const { data } = await client.get(
      `/v1/billing/subscriptions/${req.params.subscriptionId}`
    )
    res.json(data)
  } catch (err) {
    console.error('Subscription fetch error:', err?.response?.data ?? err.message)
    res.status(500).json({ error: 'Failed to fetch subscription' })
  }
}

exports.cancel = async (req, res) => {
  try {
    const { reason = 'User requested cancellation' } = req.body
    const token = await getAccessToken()

    await axios.post(
      `${PAYPAL_BASE}/v1/billing/subscriptions/${req.params.subscriptionId}/cancel`,
      { reason },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    )

    // TODO: update your DB — mark user plan as cancelled

    res.json({ success: true, message: 'Subscription cancelled' })
  } catch (err) {
    console.error('Cancel error:', err?.response?.data ?? err.message)
    res.status(500).json({ error: 'Failed to cancel subscription' })
  }
}

exports.webhook = async (req, res) => {
  try {
    const event = req.body
    console.log('PayPal webhook received:', event.event_type, event.resource?.id)

    // ── Optional: verify PayPal signature ────────────────────────────────────
    // const token = await getAccessToken()
    // await axios.post(`${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`, {
    //   auth_algo:         req.headers['paypal-auth-algo'],
    //   cert_url:          req.headers['paypal-cert-url'],
    //   transmission_id:   req.headers['paypal-transmission-id'],
    //   transmission_sig:  req.headers['paypal-transmission-sig'],
    //   transmission_time: req.headers['paypal-transmission-time'],
    //   webhook_id:        process.env.PAYPAL_WEBHOOK_ID,
    //   webhook_event:     event,
    // }, { headers: { Authorization: `Bearer ${token}` } })
    // ─────────────────────────────────────────────────────────────────────────

    switch (event.event_type) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED': {
        const sub = event.resource
        console.log('✅ Subscription activated:', sub.id, '| Plan:', sub.plan_id)
        // TODO: db.users.update where subscriptionId = sub.id → status: 'active'
        break
      }
      case 'BILLING.SUBSCRIPTION.CANCELLED': {
        const sub = event.resource
        console.log('❌ Subscription cancelled:', sub.id)
        // TODO: db.users.update where subscriptionId = sub.id → status: 'cancelled'
        break
      }
      case 'BILLING.SUBSCRIPTION.SUSPENDED': {
        const sub = event.resource
        console.log('⏸  Subscription suspended:', sub.id)
        // TODO: restrict access for this user
        break
      }
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED': {
        const sub = event.resource
        console.log('💳 Payment failed for subscription:', sub.id)
        // TODO: send dunning email
        break
      }
      case 'PAYMENT.SALE.COMPLETED': {
        const sale = event.resource
        console.log('💰 Payment received:', sale.amount?.total, sale.amount?.currency)
        // TODO: log payment record
        break
      }
      default:
        console.log('Unhandled event type:', event.event_type)
    }

    res.sendStatus(200)
  } catch (err) {
    console.error('Webhook error:', err.message)
    res.sendStatus(500)
  }
}


