/**
 * confirmacion.js (Firebase v9 compat)
 * - Muestra detalle del pedido en confirmacion.html
 * - Fuente preferida: Firestore (colección "pedidos")
 * - Fallback: localStorage("fyz_confirmacion_pago")
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function formatMoneyCRC(v) {
    const n = Number(v);
    if (!isFinite(n)) return "₡0";
    return (typeof window.formatCRC === "function") ? window.formatCRC(n) : ("₡" + n.toLocaleString("es-CR"));
  }

  function formatMoneyUSD(v) {
    const n = Number(v);
    if (!isFinite(n)) return "$0.00";
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(v) {
    try {
      if (!v) return new Date().toLocaleString("es-CR");
      if (typeof v === "object" && v.toDate) return v.toDate().toLocaleString("es-CR"); // Timestamp compat
      const d = new Date(v);
      return isNaN(d.getTime()) ? new Date().toLocaleString("es-CR") : d.toLocaleString("es-CR");
    } catch {
      return new Date().toLocaleString("es-CR");
    }
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  function getOrderIdFromUrlOrStorage() {
    const p = new URLSearchParams(window.location.search);
    const fromUrl = p.get("id") || p.get("pedido") || p.get("pedidoId") || p.get("orderId");
    if (fromUrl) return fromUrl;

    try {
      const data = JSON.parse(localStorage.getItem("fyz_confirmacion_pago") || "{}");
      return data.pedidoId || data.pedido || data.id || data.orderId || "";
    } catch {
      return "";
    }
  }

  function getLocalConfirmData() {
    try {
      return JSON.parse(localStorage.getItem("fyz_confirmacion_pago") || "{}");
    } catch {
      return {};
    }
  }

  function renderProductos(items) {
    const box = $("order-products");
    if (!box) return;

    if (!Array.isArray(items) || items.length === 0) {
      box.innerHTML = `<p class="empty-products">No hay productos para mostrar.</p>`;
      return;
    }

    const rows = items.map((it) => {
      const qty = Math.max(1, parseInt(it.cantidad, 10) || 1);
      const price = Number(it.precio) || 0;

      const po = (it.precioOriginal != null) ? Number(it.precioOriginal) : null;
      const tiene = (po != null && po > price);
      const desc = Number(it.descuento) || 0;

      const unitHtml = tiene
        ? `<div class="prod-prices">
              <span class="price-original">${formatMoneyCRC(po)}</span>
              <span class="price-final">${formatMoneyCRC(price)} c/u</span>
              ${desc > 0 ? `<span class="discount-badge">-${desc}%</span>` : ``}
           </div>`
        : `<div class="prod-prices"><span class="price-final">${formatMoneyCRC(price)} c/u</span></div>`;

      const lineTotal = price * qty;

      return `
        <div class="product-item">
          <img src="${esc(it.imagen || "https://via.placeholder.com/80")}" alt="${esc(it.nombre)}" onerror="this.src='https://via.placeholder.com/80'">
          <div class="product-details">
            <h4>${esc(it.nombre || "Producto")}</h4>
            ${unitHtml}
            <p class="product-qty">Cantidad: ${qty}</p>
          </div>
          <div class="product-subtotal">${formatMoneyCRC(lineTotal)}</div>
        </div>
      `;
    }).join("");

    box.innerHTML = rows;
  }

  function renderEnvio(pedido, localData) {
    const box = $("shipping-details");
    if (!box) return;

    const shipping = pedido?.shipping || pedido?.envio || localData?.shipping || localData?.envio || null;

    const nombre = shipping?.nombre || [shipping?.firstName, shipping?.lastName].filter(Boolean).join(" ") || "";
    const direccion = shipping?.direccion || shipping?.address || shipping?.direccionCompleta || "";
    const telefono = shipping?.telefono || shipping?.phone || "";

    const safe = (s) => (s ? String(s) : "—");

    box.innerHTML = `
      <div class="ship-grid">
        <div><span class="ship-label">Nombre</span><div class="ship-value">${safe(nombre)}</div></div>
        <div><span class="ship-label">Teléfono</span><div class="ship-value">${safe(telefono)}</div></div>
        <div class="ship-full"><span class="ship-label">Dirección</span><div class="ship-value">${safe(direccion)}</div></div>
      </div>
      <div class="delivery-note"><i class="fas fa-truck"></i> Entrega estimada: 24–48 horas.</div>
    `;
  }

  function renderPedido(pedido, localData, id) {
    const number = $("order-number");
    const date = $("order-date");
    const total = $("order-total");
    const method = $("payment-method");
    const status = $("order-status");

    if (number) number.textContent = pedido?.numero || pedido?.numeroPedido || id || "—";
    if (date) date.textContent = formatDate(pedido?.fecha || pedido?.createdAt || localData?.fecha || localData?.createdAt);

    const totalCRC = (pedido?.totalCRC ?? pedido?.total ?? localData?.totalCRC ?? localData?.total);
    const totalUSD = (pedido?.totalUSD ?? localData?.totalUSD);

    if (total) {
      const crcTxt = formatMoneyCRC(totalCRC);
      const usdTxt = (totalUSD != null) ? ` (${formatMoneyUSD(totalUSD)} USD)` : "";
      total.textContent = crcTxt + usdTxt;
    }

    if (method) method.textContent = String((pedido?.metodoPago || localData?.metodoPago || localData?.metodo || "N/A")).toUpperCase();

    if (status) {
      const raw = String(pedido?.estado || localData?.estado || "pendiente").toLowerCase();
      const map = {
        "pago_completado": "Pagado",
        "pagado": "Pagado",
        "paid": "Pagado",
        "pendiente": "Pendiente",
        "solicitando_envio": "Solicitando envío",
        "enviado": "Enviado",
        "envio_hecho": "Enviado",
        "completado": "Completado"
      };
      status.textContent = map[raw] || raw;
      status.classList.remove("paid", "pending");
      status.classList.add((raw.includes("pago") || raw === "pagado" || raw === "paid") ? "paid" : "pending");
    }

    const items = pedido?.items || pedido?.carrito || localData?.items || localData?.carrito || [];
    renderProductos(items);
    renderEnvio(pedido, localData);
  }

  function showNotFound() {
    const container = document.querySelector(".confirmation-container");
    if (!container) return;
    container.innerHTML = `
      <div class="confirmation-content">
        <div class="confirmation-icon error">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h1 class="confirmation-title">Pedido no encontrado</h1>
        <p class="confirmation-subtitle">
          No pude cargar tu pedido. Probá recargar la página o revisá “Mis pedidos”.
        </p>
        <div style="margin-top:16px; display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
          <a class="btn primary" href="mis_pedidos.html">Ir a mis pedidos</a>
          <a class="btn secondary" href="index.html">Volver al inicio</a>
        </div>
      </div>
    `;
  }

  async function load() {
    console.log("🚀 confirmacion.js cargando...");
    
    const localData = getLocalConfirmData();
    const id = getOrderIdFromUrlOrStorage();

    console.log("📍 URL params:", window.location.search);
    console.log("🔍 ID extraído:", id);
    console.log("💾 localStorage keys:", Object.keys(localStorage));
    console.log("📦 localData:", JSON.stringify(localData).substring(0, 200));

    // ✅ MOSTRAR DEBUG EN PÁGINA
    const debugEl = document.getElementById("debug-storage");
    if (debugEl) {
      const debugInfo = {
        "URL search params": window.location.search,
        "ID extraído": id,
        "localStorage keys": Object.keys(localStorage),
        "fyz_confirmacion_pago": localStorage.getItem("fyz_confirmacion_pago") ? "SÍ (tiene datos)" : "NO",
        "fyz_carrito": localStorage.getItem("fyz_carrito") ? "SÍ" : "NO",
        "localData keys": Object.keys(localData),
        "localData.items": Array.isArray(localData.items) ? `SÍ (${localData.items.length} items)` : "NO",
        "localData.totalCRC": localData.totalCRC ? `SÍ (${ localData.totalCRC})` : "NO"
      };
      debugEl.textContent = JSON.stringify(debugInfo, null, 2);
    }

    // Prioridad 1: localStorage (siempre tiene los datos más frescos después de PayPal)
    if (localData && (localData.totalCRC || localData.total || (localData.items && Array.isArray(localData.items) && localData.items.length > 0))) {
      console.log("✅ ENCONTRADO EN LOCALSTORAGE - Renderizando...");
      renderPedido(null, localData, id || localData.id || "");
      attachPrintListener();
      attachTrackListener();
      
      // ✅ AHORA limpiar localStorage DESPUÉS de renderizar
      setTimeout(() => {
        console.log("🧹 Limpiando localStorage");
        localStorage.removeItem("fyz_confirmacion_pago");
        localStorage.removeItem("fyz_carrito");
        localStorage.removeItem("fyz_checkout_step");
        localStorage.removeItem("fyz_checkout_shipping");
      }, 1000);
      
      return;
    }

    console.log("⚠️ NO encontrado en localStorage, intentando Firestore...");

    // Prioridad 2: Si tenemos ID, intenta Firestore
    if (id && window.db) {
      try {
        console.log("🔍 Buscando en Firestore con ID:", id);
        const doc = await window.db.collection("pedidos").doc(id).get();
        if (doc.exists) {
          console.log("✅ ENCONTRADO EN FIRESTORE - Renderizando...");
          const pedido = { id: doc.id, ...doc.data() };
          renderPedido(pedido, localData, id);
          localStorage.setItem("fyz_last_pedido_id", id);
          attachPrintListener();
          attachTrackListener();
          
          // ✅ Limpiar localStorage DESPUÉS de renderizar
          setTimeout(() => {
            console.log("🧹 Limpiando localStorage");
            localStorage.removeItem("fyz_confirmacion_pago");
            localStorage.removeItem("fyz_carrito");
            localStorage.removeItem("fyz_checkout_step");
            localStorage.removeItem("fyz_checkout_shipping");
          }, 1000);
          
          return;
        }
      } catch (e) {
        console.warn("⚠️ Error accediendo Firestore:", e);
      }
    }

    // Prioridad 3: Mostrar error si nada funciona
    console.error("❌ NO SE ENCONTRÓ PEDIDO");
    showNotFound();
  }

  // Agregar listeners de botones
  function attachPrintListener() {
    const printBtn = $("print-order");
    if (printBtn) {
      printBtn.addEventListener("click", (e) => {
        e.preventDefault();
        window.print();
      });
    }
  }

  function attachTrackListener() {
    const trackBtn = $("track-order");
    if (trackBtn) {
      trackBtn.addEventListener("click", (e) => {
        e.preventDefault();
        alert("📦 Seguimiento próximamente.\n\nVerifica tu email para el estado de tu orden.");
      });
    }
  }

  document.addEventListener("DOMContentLoaded", load);
})();
