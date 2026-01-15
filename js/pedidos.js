/**
 * pedidos.js - Mis pedidos (Firebase v9 compat)
 * Lee pedidos del usuario actual y muestra progreso
 */

const PedidosSystem = {
  init() {
    document.addEventListener("DOMContentLoaded", () => {
      // Esperar auth
      if (!window.auth || !window.db) {
        console.error("❌ Firebase no disponible");
        return;
      }

      auth.onAuthStateChanged(async (user) => {
        if (!user) {
          window.location.href = "login.html";
          return;
        }
        await this.cargarPedidos(user.uid);
      });
    });
  },

  _labelEstado(estado) {
    const map = {
      pendiente: "Pago completado", // legacy
      pago_completado: "Pago completado",
      solicitando_envio: "Solicitando envío",
      envio_hecho: "Envío hecho",
      completado: "Completado",
      cancelado: "Cancelado"
    };
    return map[estado] || (estado || "N/A");
  },

  _progreso(estado) {
    // pasos: pago -> solicitando -> envio
    // completado => todo activo
    // cancelado => nada
    const s = (estado || "pago_completado");
    if (s === "cancelado") return {a:false,b:false,c:false};
    if (s === "solicitando_envio") return {a:true,b:true,c:false};
    if (s === "envio_hecho") return {a:true,b:true,c:true};
    if (s === "completado") return {a:true,b:true,c:true};
    // pendiente/ pago_completado
    return {a:true,b:false,c:false};
  },

  async cargarPedidos(uid) {
    const container = document.getElementById("pedidos-list");
    if (!container) return;

    container.innerHTML = "<div class='pedido-empty'>Cargando pedidos…</div>";

    try {
      const snap = await db.collection("pedidos").where("usuarioId", "==", uid).get();
      const pedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Ordenar por fecha (desc)
      pedidos.sort((a,b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));

      if (pedidos.length === 0) {
        container.innerHTML = "<div class='pedido-empty'>Todavía no tenés pedidos. Cuando comprés algo, te salen acá ✨</div>";
        return;
      }

      container.innerHTML = pedidos.map(p => this._renderPedido(p)).join("");
    } catch (e) {
      console.error("❌ Error cargando pedidos:", e);
      container.innerHTML = "<div class='pedido-empty'>No se pudieron cargar tus pedidos. Probá recargando.</div>";
    }
  },

  _renderPedido(p) {
    const fecha = p.fecha ? new Date(p.fecha).toLocaleString("es-CR") : "—";
    const tcrc = (p.totalCRC ?? p.total);
    const total = (typeof tcrc === "number") ? `${formatCRC(tcrc)}` : (tcrc ? `${formatCRC(Number(tcrc))}` : "—");
    const items = Array.isArray(p.items) ? p.items : [];
    const cant = items.reduce((s,i) => s + (Number(i.cantidad)||0), 0);
    const estado = p.estado || "pago_completado";
    const label = this._labelEstado(estado);
    const prog = this._progreso(estado);

    const note = (estado === "envio_hecho")
      ? "<div class='pedido-note'><i class='fas fa-truck'></i> Entrega estimada: 24–48 horas.</div>"
      : "";

    const itemsTxt = items.slice(0, 3).map(i => `${i.nombre} x${i.cantidad}`).join(" • ");
    const more = items.length > 3 ? ` • +${items.length-3} más` : "";

    const progressHtml = (estado === "cancelado")
      ? "<div class='pedido-note'><i class='fas fa-ban'></i> Pedido cancelado.</div>"
      : `
        <div class="progress">
          <div class="progress-steps">
            <div class="step ${prog.a ? "active":""}">
              <span class="dot"></span><span class="label">Pago completado</span>
            </div>
            <div class="connector ${prog.a && prog.b ? "active":""}"></div>
            <div class="step ${prog.b ? "active":""}">
              <span class="dot"></span><span class="label">Solicitando envío</span>
            </div>
            <div class="connector ${prog.b && prog.c ? "active":""}"></div>
            <div class="step ${prog.c ? "active":""}">
              <span class="dot"></span><span class="label">Envío hecho</span>
            </div>
          </div>
          ${note}
        </div>
      `;

    return `
      <div class="pedido-card">
        <div class="pedido-top">
          <div>
            <div class="pedido-meta">
              <span><strong>Pedido:</strong> ${String(p.id).substring(0,8)}…</span>
              <span><strong>Fecha:</strong> ${fecha}</span>
              <span><strong>Total:</strong> ${total}</span>
              <span><strong>Items:</strong> ${cant}</span>
            </div>
          </div>
          <div class="pedido-estado">${label}</div>
        </div>

        ${items.length ? `<div class="pedido-items"><i class="fas fa-bag-shopping"></i> ${itemsTxt}${more}</div>` : ""}

        ${progressHtml}
      </div>
    `;
  }
};

window.PedidosSystem = PedidosSystem;
PedidosSystem.init();
