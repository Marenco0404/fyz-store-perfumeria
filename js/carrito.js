/**
 * carrito.js (v11 · LOCAL ONLY)
 * ----------------------------
 * ✅ El carrito NO toca Firestore.
 * ✅ Persistencia: localStorage('fyz_carrito').
 * ✅ Contador + dropdown + carrito.html.
 */

window.Carrito = {
  _initialized: false,
  KEY: "fyz_carrito",

  items: [],
  subtotal: 0,
  envio: 0.0, // Envío gratis
  total: 0,

  init() {
    if (this._initialized) return;
    this._initialized = true;

    // Cargar estado
    this._cargarLocal();

    // Dropdown + listeners (si existen en la página)
    this._asegurarDropdownHTML();
    this._configurarEventosUI();

    // Pintar UI
    this._recalcular();
    this._actualizarInterfaz();

    console.log("✅ Carrito inicializado (local only)");
  },

  /* ================= API PÚBLICA ================= */

  async agregarProducto(producto, cantidad = 1) {
    try {
      if (!producto || !producto.id) {
        this._notify("Producto inválido", "error");
        return false;
      }

      const qty = Math.max(1, parseInt(cantidad, 10) || 1);
      const id = String(producto.id);

      const idx = this.items.findIndex((it) => String(it.id) === id);
      if (idx >= 0) {
        this.items[idx].cantidad += qty;
      } else {
        this.items.push({
          id,
          nombre: producto.nombre || "Producto",
          // precio final (con descuento si aplica)
          precio: Number(producto.precio) || 0,
          // para mostrar precio original en UI
          precioOriginal: (producto.precioOriginal != null) ? Number(producto.precioOriginal) : null,
          descuento: Number(producto.descuento) || 0,
          imagen: producto.imagen || "https://via.placeholder.com/150",
          categoria: producto.categoria || "general",
          cantidad: qty
        });
      }

      this._persistir();
      this._recalcular();
      this._actualizarInterfaz();

      this._animarIcono();
      if (window.innerWidth > 768) this.abrirDropdown();

      this._notify("Producto agregado al carrito", "success");
      return true;
    } catch (err) {
      console.error("❌ Error agregarProducto:", err);
      this._notify("Error al agregar producto", "error");
      return false;
    }
  },

  eliminarProducto(productoId) {
    const id = String(productoId);
    const idx = this.items.findIndex((it) => String(it.id) === id);
    if (idx < 0) return;

    this.items.splice(idx, 1);

    this._persistir();
    this._recalcular();
    this._actualizarInterfaz();

    this._notify("Producto eliminado", "info");
  },

  actualizarCantidad(productoId, nuevaCantidad) {
    const id = String(productoId);
    const qty = parseInt(nuevaCantidad, 10) || 0;

    if (qty <= 0) {
      this.eliminarProducto(id);
      return;
    }

    const idx = this.items.findIndex((it) => String(it.id) === id);
    if (idx < 0) return;

    this.items[idx].cantidad = qty;

    this._persistir();
    this._recalcular();
    this._actualizarInterfaz();
  },

  vaciarCarrito() {
    this.items = [];
    this._persistir();
    this._recalcular();
    this._actualizarInterfaz();
    this._notify("Carrito vaciado", "info");
  },

  actualizarPaginaCarrito() {
    if (!this._initialized) this.init();
    this._recalcular();
    this._actualizarInterfaz();
  },

  abrirDropdown() {
    const dd = document.getElementById("cart-dropdown");
    if (dd) dd.classList.add("active");
  },

  cerrarDropdown() {
    const dd = document.getElementById("cart-dropdown");
    if (dd) dd.classList.remove("active");
  },

  /* ================= INTERNOS ================= */

  _cargarLocal() {
    try {
      const raw = localStorage.getItem(this.KEY);
      this.items = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(this.items)) this.items = [];

      // Normalizar tipos (por si vienen de versiones viejas o desde Firestore)
      this.items = this.items
        .filter(Boolean)
        .map((it) => {
          const precio = Number(it.precio);
          const cantidad = Math.max(1, parseInt(it.cantidad, 10) || 1);
          const precioOriginal = (it.precioOriginal != null) ? Number(it.precioOriginal) : null;
          const descuento = Number(it.descuento) || 0;
          return {
            id: String(it.id ?? ""),
            nombre: it.nombre || "Producto",
            precio: Number.isFinite(precio) ? precio : 0,
            precioOriginal: (Number.isFinite(precioOriginal) && precioOriginal > 0) ? precioOriginal : null,
            descuento,
            imagen: it.imagen || "https://via.placeholder.com/150",
            categoria: it.categoria || "general",
            cantidad
          };
        })
        .filter((it) => it.id);

      // Persistir normalizado para evitar errores (ej: precio string -> toFixed rompe)
      this._persistir();
    } catch {
      this.items = [];
    }
  },

  _persistir() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this.items));
    } catch (e) {
      console.warn("⚠️ No se pudo guardar carrito:", e);
    }
  },

  _recalcular() {
    this.subtotal = this.items.reduce((s, it) => {
      const p = Number(it.precio) || 0;
      const c = Math.max(1, parseInt(it.cantidad, 10) || 1);
      return s + p * c;
    }, 0);

    this.total = this.subtotal; // Envío gratis
},

  _configurarEventosUI() {
    // Icono carrito abre/cierra dropdown
    const icon = document.getElementById("cart-icon");
    if (icon) {
      icon.addEventListener("click", (e) => {
        const dd = document.getElementById("cart-dropdown");
        if (!dd) return;
        // Si el click fue dentro del dropdown (ej: botones "Ver carrito" / "Pagar"),
        // NO interceptamos para que el navegador pueda navegar normal.
        if (dd.contains(e.target)) return;

        dd.classList.toggle("active");
      });
    }

    // Click fuera cierra dropdown
    document.addEventListener("click", (e) => {
      const dd = document.getElementById("cart-dropdown");
      const iconEl = document.getElementById("cart-icon");
      if (!dd || !dd.classList.contains("active")) return;

      const clickDentro = dd.contains(e.target) || (iconEl && iconEl.contains(e.target));
      if (!clickDentro) dd.classList.remove("active");
    });

    // Delegación para botones dentro del dropdown
    const ddItems = document.getElementById("cart-dropdown-items");
    if (ddItems) {
      ddItems.addEventListener("click", (e) => {
        const btnRemove = e.target.closest("[data-remove]");
        const btnMinus = e.target.closest("[data-minus]");
        const btnPlus = e.target.closest("[data-plus]");

        if (btnRemove) {
          this.eliminarProducto(btnRemove.getAttribute("data-remove"));
          return;
        }
        if (btnMinus) {
          const id = btnMinus.getAttribute("data-minus");
          const it = this.items.find(x => String(x.id) === String(id));
          if (!it) return;
          this.actualizarCantidad(id, (parseInt(it.cantidad, 10) || 1) - 1);
          return;
        }
        if (btnPlus) {
          const id = btnPlus.getAttribute("data-plus");
          const it = this.items.find(x => String(x.id) === String(id));
          if (!it) return;
          this.actualizarCantidad(id, (parseInt(it.cantidad, 10) || 1) + 1);
        }
      });
    }

    // Página carrito.html: delegación
    const page = document.getElementById("cart-page-content");
    if (page) {
      page.addEventListener("click", (e) => {
        const btnRemove = e.target.closest("[data-remove]");
        const btnMinus = e.target.closest("[data-minus]");
        const btnPlus = e.target.closest("[data-plus]");
        const btnVaciar = e.target.closest("[data-clear-cart]");

        if (btnVaciar) {
          this.vaciarCarrito();
          return;
        }

        if (btnRemove) {
          this.eliminarProducto(btnRemove.getAttribute("data-remove"));
          return;
        }
        if (btnMinus) {
          const id = btnMinus.getAttribute("data-minus");
          const it = this.items.find(x => String(x.id) === String(id));
          if (!it) return;
          this.actualizarCantidad(id, (parseInt(it.cantidad, 10) || 1) - 1);
          return;
        }
        if (btnPlus) {
          const id = btnPlus.getAttribute("data-plus");
          const it = this.items.find(x => String(x.id) === String(id));
          if (!it) return;
          this.actualizarCantidad(id, (parseInt(it.cantidad, 10) || 1) + 1);
        }
      });
    }
  },

  _asegurarDropdownHTML() {
    // Si la página no trae dropdown, no lo inyectamos agresivo.
    // Solo actualizamos si existe.
    return;
  },

  _actualizarInterfaz() {
    // Contador
    const countEl = document.getElementById("cart-count");
    if (countEl) {
      const count = this.items.reduce((s, it) => s + (parseInt(it.cantidad, 10) || 0), 0);
      countEl.textContent = count;
      countEl.style.display = count > 0 ? "inline-flex" : "none";
    }

    // Dropdown items
    const ddItems = document.getElementById("cart-dropdown-items");
    if (ddItems) {
      ddItems.innerHTML = this.items.length
        ? this.items.map(it => this._renderDropdownItem(it)).join("")
        : `<div class="cart-empty">Tu carrito está vacío 🛒</div>`;
    }

    // Total dropdown
    const ddTotal = document.getElementById("cart-dropdown-total");
    if (ddTotal) ddTotal.textContent = `${formatCRC(this.total)}`;

    // Página carrito.html
    const page = document.getElementById("cart-page-content");
    if (page) {
      page.innerHTML = this._renderCarritoPage();
    }
  },

  _renderDropdownItem(it) {
    const precio = Number(it.precio) || 0;
    const precioOriginal = (it.precioOriginal != null) ? Number(it.precioOriginal) : null;
    const tieneDescuento = (precioOriginal != null && precioOriginal > precio);
    const desc = Number(it.descuento) || 0;

    const qty = Math.max(1, parseInt(it.cantidad, 10) || 1);
    const sub = precio * qty;

    const priceHtml = tieneDescuento
      ? `<div class="cart-price-lines">
            <span class="price-original">${formatCRC(precioOriginal)}</span>
            <span class="price-final">${formatCRC(precio)}</span>
            ${desc > 0 ? `<span class="discount-badge">-${desc}%</span>` : ``}
         </div>`
      : `<div class="cart-price-lines">
            <span class="price-final">${formatCRC(precio)}</span>
         </div>`;

    return `
      <div class="cart-item">
        <img src="${it.imagen}" alt="${this._esc(it.nombre)}">
        <div class="cart-details">
          <div class="cart-name">${this._esc(it.nombre)}</div>
          ${priceHtml}
          <div class="cart-mini">
            <button class="qty-btn" data-minus="${it.id}">-</button>
            <span class="qty">${qty}</span>
            <button class="qty-btn" data-plus="${it.id}">+</button>
          </div>
        </div>
        <div class="cart-price">${formatCRC(sub)}</div>
        <button class="btn-remove" title="Eliminar" data-remove="${it.id}"><i class="fas fa-trash"></i></button>
      </div>
    `;
  },

  _renderCarritoPage() {
    if (!this.items.length) {
      return `
        <div class="cart-empty-page">
          <i class="fas fa-shopping-cart"></i>
          <h2>Tu carrito está vacío</h2>
          <p>Agregá productos y volvé acá para finalizar tu compra.</p>
          <a href="index.html" class="btn-primary">Ir a la tienda</a>
        </div>
      `;
    }

    const itemsHtml = this.items.map(it => this._renderCarritoPageItem(it)).join("");

    return `
      <div class="cart-layout">
        <div class="cart-items">
          ${itemsHtml}
          <button class="btn-clear-cart" data-clear-cart>
            <i class="fas fa-broom"></i> Vaciar carrito
          </button>
        </div>

        <aside class="cart-summary">
          <h3>Resumen</h3>
          <div class="sum-row"><span>Subtotal</span><span>${formatCRC(this.subtotal)}</span></div>
          <div class="sum-row"><span>Envío</span><span class="free-shipping">Gratis</span></div>
          <div class="sum-row total"><span>Total</span><span>${formatCRC(this.total)}</span></div>
          <a href="finalizarcompra.html" class="btn-primary btn-block">
            <i class="fas fa-credit-card"></i> Finalizar compra
          </a>
        </aside>
      </div>
    `;
  },

  _renderCarritoPageItem(it) {
    const precio = Number(it.precio) || 0;
    const precioOriginal = (it.precioOriginal != null) ? Number(it.precioOriginal) : null;
    const tieneDescuento = (precioOriginal != null && precioOriginal > precio);
    const desc = Number(it.descuento) || 0;

    const qty = Math.max(1, parseInt(it.cantidad, 10) || 1);
    const sub = precio * qty;

    const unitHtml = tieneDescuento
      ? `<div class="cart-unit-prices">
            <span class="unit-original">${formatCRC(precioOriginal)}</span>
            <span class="unit-final">${formatCRC(precio)} c/u</span>
            ${desc > 0 ? `<span class="discount-badge">-${desc}%</span>` : ``}
         </div>`
      : `<div class="cart-unit-prices">
            <span class="unit-final">${formatCRC(precio)} c/u</span>
         </div>`;

    return `
      <div class="cart-item cart-item-page">
        <img src="${it.imagen}" alt="${this._esc(it.nombre)}">
        <div class="cart-details">
          <div class="cart-name">${this._esc(it.nombre)}</div>
          <div class="cart-meta">${this._esc(it.categoria || "")}</div>
          ${unitHtml}
          <div class="cart-mini">
            <button class="qty-btn" data-minus="${it.id}">-</button>
            <span class="qty">${qty}</span>
            <button class="qty-btn" data-plus="${it.id}">+</button>
          </div>
        </div>
        <div class="cart-price">${formatCRC(sub)}</div>
        <button class="btn-remove" title="Eliminar" data-remove="${it.id}"><i class="fas fa-trash"></i></button>
      </div>
    `;
  },

  _animarIcono() {
    const icon = document.getElementById("cart-icon");
    if (!icon) return;
    icon.classList.add("bounce");
    setTimeout(() => icon.classList.remove("bounce"), 450);
  },

  _notify(msg, type = "info") {
    // Usa la notificación global si existe
    if (window.mostrarNotificacion) return window.mostrarNotificacion(msg, type);
    // fallback
    console.log(`[${type}] ${msg}`);
  },

  _esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#x27;");
  }
};

window.Carrito = {
  // Obtener carrito del localStorage
  obtener: function() {
    try {
      const carrito = localStorage.getItem('fyz_carrito');
      return carrito ? JSON.parse(carrito) : [];
    } catch (e) {
      console.error('Error al obtener carrito:', e);
      return [];
    }
  },

  // Guardar carrito en localStorage
  guardar: function(items) {
    try {
      localStorage.setItem('fyz_carrito', JSON.stringify(items));
      this.actualizarUI();
    } catch (e) {
      console.error('Error al guardar carrito:', e);
    }
  },

  // Agregar producto
  agregar: function(producto) {
    const carrito = this.obtener();
    const existe = carrito.find(p => p.id === producto.id);
    
    if (existe) {
      existe.cantidad += producto.cantidad || 1;
    } else {
      carrito.push({ ...producto, cantidad: producto.cantidad || 1 });
    }
    
    this.guardar(carrito);
    console.log('✅ Producto agregado:', producto.nombre);
  },

  // Remover producto
  remover: function(productoId) {
    let carrito = this.obtener();
    carrito = carrito.filter(p => p.id !== productoId);
    this.guardar(carrito);
  },

  // Vaciar carrito
  vaciar: function() {
    localStorage.removeItem('fyz_carrito');
    this.actualizarUI();
  },

  // Obtener total
  obtenerTotal: function() {
    const carrito = this.obtener();
    return carrito.reduce((total, p) => total + (p.precio * p.cantidad), 0);
  },

  // Actualizar UI
  actualizarUI: function() {
    const carrito = this.obtener();
    const cartCount = document.getElementById('cart-count');
    const cartTotal = document.getElementById('cart-dropdown-total');
    
    if (cartCount) cartCount.textContent = carrito.length;
    if (cartTotal) cartTotal.textContent = formatCRC(this.obtenerTotal()) || '₡0';
  }
};

// Inicializar carrito cuando DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  if (window.Carrito && typeof window.Carrito.init === 'function') {
    window.Carrito.init();
  }
});

console.log("✅ [Carrito] Sistema de carrito cargado");

