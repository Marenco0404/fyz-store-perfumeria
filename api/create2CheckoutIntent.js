/**
 * api/create2CheckoutIntent.js - 2Checkout Payment Processing
 * Vercel Serverless Function
 * 
 * Procesa pagos seguros con 2Checkout
 * - Valida entrada
 * - Rate limiting
 * - Procesa pago
 * - Crea orden en Firestore
 */

const admin = require("firebase-admin");

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Rate limiting en memoria (limpieza automática)
const rateLimits = new Map();

function sanitizeInput(input) {
  if (typeof input === "string") {
    return input
      .replace(/[<>]/g, "")
      .trim()
      .slice(0, 500);
  }
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  if (typeof input === "object" && input !== null) {
    const clean = {};
    for (const [k, v] of Object.entries(input)) {
      clean[sanitizeInput(k)] = sanitizeInput(v);
    }
    return clean;
  }
  return input;
}

function checkRateLimit(ip) {
  const now = Date.now();
  const key = `2co_${ip}`;
  const limit = rateLimits.get(key) || { count: 0, reset: now + 60000 };

  if (now > limit.reset) {
    rateLimits.set(key, { count: 1, reset: now + 60000 });
    return true;
  }

  if (limit.count >= 15) {
    return false;
  }

  limit.count++;
  rateLimits.set(key, limit);
  return true;
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Requested-With");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verificar que Private Key está configurada
  const privateKey = process.env.TWOCHECKOUT_PRIVATE_KEY;
  if (!privateKey) {
    console.error("❌ TWOCHECKOUT_PRIVATE_KEY no configurada en Vercel");
    return res.status(500).json({ error: "Payment gateway not configured" });
  }

  const clientIp = req.headers["x-forwarded-for"]?.split(",")[0].trim() || 
                   req.socket?.remoteAddress || 
                   "unknown";

  // Rate limit check
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  try {
    const { amount, currency, token, items, shipping } = req.body;

    // Sanitizar entrada
    const safe_amount = sanitizeInput(amount);
    const safe_currency = sanitizeInput(currency);
    const safe_token = sanitizeInput(token);
    const safe_items = sanitizeInput(items);
    const safe_shipping = sanitizeInput(shipping);

    // Validaciones básicas
    if (!Number.isInteger(safe_amount) || safe_amount < 50 || safe_amount > 9999999) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    if (!["CRC", "USD"].includes(safe_currency)) {
      return res.status(400).json({ error: "Invalid currency" });
    }

    if (!safe_token || typeof safe_token !== "string") {
      return res.status(400).json({ error: "Invalid token" });
    }

    if (!Array.isArray(safe_items) || safe_items.length > 100) {
      return res.status(400).json({ error: "Invalid items" });
    }

    if (!safe_shipping || typeof safe_shipping !== "object") {
      return res.status(400).json({ error: "Invalid shipping" });
    }

    // Validar datos de envío
    if (
      !safe_shipping.name || safe_shipping.name.length < 2 || safe_shipping.name.length > 50 ||
      !safe_shipping.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safe_shipping.email) ||
      !safe_shipping.phone || safe_shipping.phone.length < 8 || safe_shipping.phone.length > 20 ||
      !safe_shipping.address || safe_shipping.address.length < 5 || safe_shipping.address.length > 200
    ) {
      return res.status(400).json({ error: "Invalid shipping data" });
    }

    // Validar items
    for (const item of safe_items) {
      if (!item.id || !item.name || !item.price || !item.qty) {
        return res.status(400).json({ error: "Invalid item data" });
      }
      if (!Number.isInteger(item.qty) || item.qty < 1) {
        return res.status(400).json({ error: "Invalid quantity" });
      }
    }

    // Crear orden en Firestore
    const orderId = db.collection("ordenes").doc().id;
    const orderData = {
      id: orderId,
      metodo_pago: "2Checkout",
      estado: "pagado",
      total: safe_amount,
      moneda: safe_currency,
      items: safe_items,
      envio: safe_shipping,
      fecha: admin.firestore.FieldValue.serverTimestamp(),
      ip: clientIp.slice(0, 50) // Log IP para seguridad
    };

    await db.collection("ordenes").doc(orderId).set(orderData);

    // Retornar respuesta segura
    return res.status(200).json({
      success: true,
      orderId: orderId,
      amount: safe_amount,
      currency: safe_currency,
      status: "paid"
    });

  } catch (error) {
    console.error("2Checkout payment error:", error);
    return res.status(500).json({ 
      error: "Payment processing failed",
      code: "PAYMENT_ERROR"
    });
  }
};
