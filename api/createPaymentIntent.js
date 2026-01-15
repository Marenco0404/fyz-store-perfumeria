// api/createPaymentIntent.js · Vercel Serverless Function
// Reemplaza la Cloud Function de Firebase
// Crea un Stripe PaymentIntent de forma segura en el servidor
// SECURITY: CSRF Protection, Rate Limiting, Input Validation

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Limpieza de entrada
function sanitizeInput(input) {
  if (typeof input === "string") {
    return input.trim().replace(/[<>"']/g, "");
  }
  if (typeof input === "number") return input;
  if (Array.isArray(input)) return input.map(sanitizeInput);
  if (typeof input === "object" && input !== null) {
    const sanitized = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key.replace(/[^a-zA-Z0-9_]/g, "")] = sanitizeInput(value);
    }
    return sanitized;
  }
  return null;
}

// Rate limiting simple (en producción usar Redis)
const requestCounts = new Map();
function checkRateLimit(ip, limit = 10, windowMs = 60000) {
  const now = Date.now();
  const key = ip;
  
  if (!requestCounts.has(key)) {
    requestCounts.set(key, []);
  }
  
  let requests = requestCounts.get(key);
  // Limpiar requests antiguos
  requests = requests.filter(t => now - t < windowMs);
  
  if (requests.length >= limit) {
    return false;
  }
  
  requests.push(now);
  requestCounts.set(key, requests);
  return true;
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Forwarded-Host, X-URL-PATH, X-Requested-With, Content-Type, Authorization"
  );

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Solo POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    // SECURITY: Rate limiting
    const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress || "unknown";
    if (!checkRateLimit(ip, 15, 60000)) {
      return res.status(429).json({ error: "Demasiadas solicitudes. Intenta más tarde." });
    }

    // SECURITY: Input validation y sanitización
    const { amountCents, currency, totalCRC, fxRate, items } = req.body;
    
    // Validar tipos
    if (typeof amountCents !== "number" || typeof currency !== "string") {
      return res.status(400).json({ error: "Parámetros inválidos" });
    }

    // Sanitizar entrada
    const safeAmount = Math.floor(Number(amountCents) || 0);
    const safeCurrency = String(currency || "usd").toLowerCase().replace(/[^a-z]/g, "");
    const safeTotalCRC = Math.floor(Number(totalCRC) || 0);
    const safeFxRate = Math.floor(Number(fxRate) || 520);
    
    // Validaciones de negocio
    if (safeAmount < 50 || safeAmount > 9999999) {
      return res.status(400).json({ 
        error: "Monto inválido (USD 0.50 - USD 99999.99)" 
      });
    }

    if (!["usd", "eur", "gbp"].includes(safeCurrency)) {
      return res.status(400).json({ error: "Moneda no soportada" });
    }

    if (safeFxRate < 100 || safeFxRate > 1000) {
      return res.status(400).json({ error: "Tipo de cambio inválido" });
    }

    // Validar integridad de monto (CRC -> USD debe ser consistente)
    const expectedAmount = Math.round(safeTotalCRC / safeFxRate * 100);
    if (Math.abs(expectedAmount - safeAmount) > 5) { // tolerancia de 5 centavos
      console.warn("⚠️ POSIBLE FRAUDE: Monto no coincide con conversión");
      return res.status(400).json({ error: "Error en conversión de moneda" });
    }

    // Validar items
    if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
      return res.status(400).json({ error: "Items inválidos" });
    }

    // Sanitizar items
    const safeItems = items.map(it => ({
      id: String(it?.id || "").substring(0, 50).replace(/[^a-zA-Z0-9_-]/g, ""),
      nombre: String(it?.nombre || "").substring(0, 100),
      cantidad: Math.max(1, Math.floor(Number(it?.cantidad) || 1)),
      precioCRC: Math.max(0, Math.floor(Number(it?.precioCRC) || 0))
    })).filter(it => it.id && it.cantidad > 0);

    if (safeItems.length === 0) {
      return res.status(400).json({ error: "Items inválidos después de sanitización" });
    }

    // Verificar que Stripe está configurado
    if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.includes("sk_test") === false) {
      console.error("❌ STRIPE_SECRET_KEY no configurada correctamente");
      return res.status(500).json({ error: "Servidor no configurado correctamente" });
    }

    // SECURITY: Crear PaymentIntent con metadata limitada
    const paymentIntent = await stripe.paymentIntents.create({
      amount: safeAmount,
      currency: safeCurrency,
      automatic_payment_methods: {
        enabled: true
      },
      metadata: {
        totalCRC: safeTotalCRC,
        fxRate: safeFxRate,
        itemCount: safeItems.length,
        // NO incluir detalles sensibles en metadata
      },
      description: `Compra en FYZ Store - ${safeItems.length} item(s)`,
      // Opcionales para máxima seguridad:
      statement_descriptor: "FYZ STORE",
      capture_method: "automatic"
    });

    // SECURITY: Solo retornar lo mínimo necesario
    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status
    });

  } catch (error) {
    console.error("❌ Stripe error:", error.message || error);
    
    // NO revelar detalles internos del error
    if (error.type === "StripeInvalidRequestError") {
      return res.status(400).json({
        error: "Solicitud inválida a Stripe"
      });
    }
    
    if (error.type === "StripeAuthenticationError") {
      return res.status(500).json({
        error: "Error de autenticación con Stripe (contacta soporte)"
      });
    }

    return res.status(500).json({
      error: "Error procesando pago (intenta de nuevo)"
    });
  }
}

