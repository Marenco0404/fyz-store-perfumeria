/**
 * CONFIGURACIÓN DE FIREBASE - F&Z STORE (FIX PERMISOS)
 * ---------------------------------------------------
 * - Inicializa Firebase (v9 compat)
 * - Expone: window.auth y window.db
 * - Funciones: verificarConexionFirebase, verificarEsAdmin, verificarPermiso, sanitizarDatos, validarProducto
 *
 * FIX CLAVE:
 * Antes se intentaba leer la colección "test" y con reglas seguras eso da permission-denied.
 * Ahora se prueba conexión con "productos" (o "categorias") que deben ser públicas en read.
 */

// ============================================
// 1) CONFIG (TU PROYECTO)
// ============================================
const firebaseConfig = {
  apiKey: "AIzaSyDNLz18xckgQqqrsUzmd9WL1E_LTxF-ggg",
  authDomain: "fyzperfumeria.firebaseapp.com",
  projectId: "fyzperfumeria",
  storageBucket: "fyzperfumeria.appspot.com",
  messagingSenderId: "265036139520",
  appId: "1:265036139520:web:b9ca91893f2de57a5c1ce5",
  measurementId: "G-7XHKT5QK89"
};

// ============================================
// 2) INIT
// ============================================
let firebaseApp;
let auth;
let db;

try {
  if (!firebase.apps || firebase.apps.length === 0) {
    firebaseApp = firebase.initializeApp(firebaseConfig);
    console.log("✅ Firebase inicializado");
  } else {
    firebaseApp = firebase.app();
    console.log("✅ Firebase ya estaba inicializado");
  }

  auth = firebase.auth();
  db = firebase.firestore();

  // idioma
  auth.useDeviceLanguage();

  // Persistencia (no es obligatoria, pero ayuda)
  if (typeof db.enablePersistence === "function") {
    db.enablePersistence().catch((err) => {
      if (err.code === "failed-precondition") {
        console.warn("⚠️ Persistencia no disponible (múltiples tabs)");
      } else if (err.code === "unimplemented") {
        console.warn("⚠️ Persistencia no soportada por navegador");
      } else {
        console.warn("⚠️ Persistencia error:", err);
      }
    });
  }

  window.firebaseApp = firebaseApp;
  window.auth = auth;
  window.db = db;

} catch (error) {
  console.error("❌ ERROR CRÍTICO INICIALIZANDO FIREBASE:", error);
  mostrarErrorFirebase("Error conectando con la base de datos. Recargá la página.");
}

// ============================================
// 3) CHECK CONEXIÓN (FIX)
// ============================================
async function verificarConexionFirebase() {
  try {
    // ✅ IMPORTANTE: No usar colección "test" con reglas seguras.
    // Usamos una colección pública en lectura.
    await db.collection("productos").limit(1).get();
    return true;
  } catch (error) {
    console.warn("⚠️ Verificación Firebase falló:", error);

    // Solo avisamos bonito si es algo serio.
    if (error && error.code === "unavailable") {
      mostrarErrorUsuario("La base de datos no está disponible. Intenta más tarde.");
    }

    // OJO: permission-denied aquí suele indicar reglas MUY cerradas (o colecciones sin read).
    // Ya no debería pasar si productos/categorias tienen read público.
    return false;
  }
}

// ============================================
// 4) SEGURIDAD: ROLES/PERMISOS
// ============================================
async function verificarEsAdmin(userId) {
  try {
    const userDoc = await db.collection("usuarios").doc(userId).get();
    if (!userDoc.exists) return false;
    const userData = userDoc.data() || {};
    return userData.rol === "admin" || userData.rol === "superadmin";
  } catch (err) {
    console.warn("⚠️ verificarEsAdmin error:", err);
    return false;
  }
}

async function verificarPermiso(userId, permiso) {
  try {
    const userDoc = await db.collection("usuarios").doc(userId).get();
    if (!userDoc.exists) return false;

    const u = userDoc.data() || {};
    if (u.rol === "superadmin") return true;

    if (u.rol === "admin") {
      const permisosAdmin = [
        "ver_panel",
        "gestionar_productos",
        "gestionar_categorias",
        "ver_pedidos",
        "gestionar_usuarios",
        "ver_estadisticas"
      ];
      return permisosAdmin.includes(permiso);
    }

    if (u.rol === "cliente") {
      const permisosCliente = ["ver_perfil", "ver_pedidos_propios", "realizar_compras"];
      return permisosCliente.includes(permiso);
    }

    return false;
  } catch (err) {
    console.warn("⚠️ verificarPermiso error:", err);
    return false;
  }
}

// ============================================
// 5) UTILIDADES
// ============================================
function sanitizarDatos(data) {
  if (typeof data === "string") {
    return data
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .replace(/\//g, "&#x2F;");
  }
  if (Array.isArray(data)) return data.map(sanitizarDatos);
  if (typeof data === "object" && data !== null) {
    const out = {};
    for (const k in data) out[k] = sanitizarDatos(data[k]);
    return out;
  }
  return data;
}

function validarProducto(producto) {
  const errores = [];

  if (!producto || typeof producto !== "object") {
    return { valido: false, errores: ["Producto inválido"] };
  }

  if (!producto.nombre || producto.nombre.trim().length < 2) errores.push("Nombre inválido");
  if (!producto.categoria || producto.categoria.trim().length < 2) errores.push("Categoría inválida");

  const precio = Number(producto.precio);
  if (!Number.isFinite(precio) || precio <= 0) errores.push("Precio inválido");

  // stock opcional
  if (producto.stock !== undefined && producto.stock !== null) {
    const stock = parseInt(producto.stock, 10);
    if (Number.isNaN(stock) || stock < 0) errores.push("Stock inválido");
  }

  // imagen opcional
  if (producto.imagen) {
    try {
      new URL(producto.imagen);
    } catch {
      errores.push("La URL de la imagen no es válida");
    }
  }

  return { valido: errores.length === 0, errores };
}

// ============================================
// 6) UI: ERRORES
// ============================================
function mostrarErrorFirebase(mensaje) {
  const errorDiv = document.createElement("div");
  errorDiv.id = "firebase-error";
  errorDiv.className = "firebase-error-alert";
  errorDiv.innerHTML = `
    <div class="error-content">
      <i class="fas fa-exclamation-triangle"></i>
      <div class="error-text">
        <strong>Error del Sistema</strong>
        <p>${mensaje}</p>
      </div>
      <button onclick="document.getElementById('firebase-error').remove()">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `;

  errorDiv.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0;
    background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
    color: white; padding: 15px 20px; z-index: 99999;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
  `;
  document.body.prepend(errorDiv);

  setTimeout(() => {
    if (errorDiv.parentNode) errorDiv.remove();
  }, 10000);
}

function mostrarErrorUsuario(mensaje) {
  // si tu AuthSystem está cargado, usamos su toast
  if (window.AuthSystem && typeof AuthSystem.mostrarNotificacion === "function") {
    AuthSystem.mostrarNotificacion(mensaje, "error");
    return;
  }
  alert(mensaje);
}

// ============================================


// ====================
// 6.5) STORAGE (para subir imágenes)
// ====================
try {
  if (window.firebase && typeof window.firebase.storage === 'function') {
    window.storage = window.firebase.storage();
  }
} catch (e) {
  console.warn('⚠️ Storage no disponible:', e);
}
// 7) EXPORTS
// ============================================
window.verificarConexionFirebase = verificarConexionFirebase;
window.verificarEsAdmin = verificarEsAdmin;
window.verificarPermiso = verificarPermiso;
window.sanitizarDatos = sanitizarDatos;
window.validarProducto = validarProducto;

console.log("✅ firebase-config.js listo");

// Check suave al cargar
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => verificarConexionFirebase(), 2000);
});


// ============================================
// 8) CONFIG DE PAGOS (FRONT)
// ============================================
// IMPORTANTÍSIMO:
// - Stripe: aquí SOLO va la PUBLISHABLE KEY (pk_...). La secret key va en Cloud Functions.
// - PayPal: aquí va el Client ID (live o sandbox). No es secreto.
window.PAYMENTS_CONFIG = {
  currency: "CRC",
  // PayPal NO soporta CRC; se procesa en USD (o la moneda que pongas aquí)
  paypalCurrency: "USD",
  // Tipo de cambio aproximado para convertir CRC -> USD (ajustalo si querés)
  paypalFxRate: 520,
  paypalClientId: "AVmvQ-COQxwhMn1z2ZaINicjRADGcUVuHiequWY3yHPquWBEyzsz89pCKykfGcqCP9boVhQftXdgOovy",
  // "sandbox" o "production"
  paypalEnv: "sandbox",
  stripePublishableKey: "pk_test_51SpWYYEKWY4tPfQc6X4TLo0gy98PI6OTjhp9E3wQyRZ0bUy49CoVxg7mch7MaD8G3Sy0ZVjs9aHSV81VVz9AmYKD00JcLe1oRp",
  // 2Checkout credentials (público en cliente, privado en servidor)
  twoCheckoutMerchantCode: "255873012978",
  twoCheckoutPublicKey: "0F495E75-1E67-4137-BFE3-6BFFCF8E5769",
  // NOTA: twoCheckoutPrivateKey debe estar en variables de entorno de Vercel, NO aquí
  // region donde vas a desplegar tus functions (por defecto suele ser us-central1)
  functionsRegion: "us-central1"
};
