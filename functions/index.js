const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

admin.initializeApp();

// Stripe secret se define en Functions config:
// firebase functions:config:set stripe.secret="sk_test_..."
const stripeSecret =
  (functions.config().stripe && functions.config().stripe.secret) || null;

const stripe = stripeSecret ? require("stripe")(stripeSecret) : null;

exports.createPaymentIntent = functions.region("us-central1").https.onRequest((req, res) => {
  // Permitir preflight requests (OPTIONS)
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(204).send("");
  }

  cors(req, res, async () => {
    try {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      if (!stripe) return res.status(500).json({ error: "Stripe secret no configurado en Functions." });

      const { amountCents, currency, totalCRC, fxRate, items } = req.body || {};

      const amt = Number(amountCents);
      if (!Number.isFinite(amt) || amt < 50) { // Stripe mínimo típico (USD 0.50)
        return res.status(400).json({ error: "amountCents inválido o muy bajo." });
      }

      const cur = String(currency || "usd").toLowerCase();

      // metadata útil para auditoría
      const meta = {
        totalCRC: String(Number(totalCRC) || 0),
        fxRate: String(Number(fxRate) || 0),
        itemsCount: String(Array.isArray(items) ? items.length : 0),
      };

      const intent = await stripe.paymentIntents.create({
        amount: Math.round(amt),
        currency: cur,
        automatic_payment_methods: { enabled: true },
        metadata: meta,
      });

      return res.json({ clientSecret: intent.client_secret });
    } catch (e) {
      console.error("createPaymentIntent error:", e);
      return res.status(500).json({ error: e.message || "Error creando PaymentIntent" });
    }
  });
});
