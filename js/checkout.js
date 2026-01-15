/**
 * checkout-v4.js - Checkout Mejorado v4.0
 * ==========================================
 * - Mejor validación
 * - Mejor UX
 * - Manejo de errores mejorado
 * - Flujo más limpio
 */

(function () {
  "use strict";

  const Checkout = {
    currentStep: 1,
    isProcessing: false,

    /**
     * Inicializar
     */
    async init() {
      console.log("✅ [Checkout v4] Inicializando");

      // Validar carrito
      const items = this.getCart();
      if (!items || !items.length) {
        this.showError("Tu carrito está vacío. Agregá productos antes de continuar.");
        setTimeout(() => {
          window.location.href = "carrito.html";
        }, 2000);
        return;
      }

      // Renderizar UI
      this.renderSummary();
      this.prefillForm();
      this.bindEvents();

      // Inicializar PayPal
      if (window.PayPal) {
        const ok = await window.PayPal.init();
        console.log(ok ? "✅ PayPal listo" : "⚠️ PayPal no disponible");
      }

      console.log("✅ [Checkout v4] Listo");
    },

    /**
     * Obtener carrito
     */
    getCart() {
      try {
        return JSON.parse(localStorage.getItem("fyz_carrito") || "[]");
      } catch (e) {
        console.warn("Error leyendo carrito:", e);
        return [];
      }
    },

    /**
     * Calcular total
     */
    getTotal() {
      const items = this.getCart();
      return items.reduce((sum, item) => {
        const price = Number(item.precio || 0);
        const qty = Math.max(1, parseInt(item.cantidad || 1, 10));
        return sum + (price * qty);
      }, 0);
    },

    /**
     * Formatear monedas
     */
    formatCRC(n) {
      return "₡" + (Number(n || 0)).toLocaleString("es-CR", { minimumFractionDigits: 0 });
    },

    formatUSD(n) {
      return "$" + (Number(n || 0)).toLocaleString("en-US", { minimumFractionDigits: 2 });
    },

    crcToUsd(crc) {
      const cfg = window.PAYMENTS_CONFIG || {};
      const rate = Number(cfg.paypalFxRate || 520);
      return Math.round((crc / rate) * 100) / 100;
    },

    /**
     * Renderizar resumen
     */
    renderSummary() {
      const items = this.getCart();
      const total = this.getTotal();
      const totalUSD = this.crcToUsd(total);

      // Items
      const itemsHtml = items.map(item => {
        const qty = Math.max(1, parseInt(item.cantidad || 1, 10));
        const subtotal = Number(item.precio || 0) * qty;
        return `
          <div class="summary-item">
            <div class="summary-item-image">
              <img src="${item.imagen}" alt="${item.nombre}" onerror="this.src='https://via.placeholder.com/50'">
            </div>
            <div class="summary-item-info">
              <div class="summary-item-name">${item.nombre}</div>
              <div class="summary-item-details">x${qty} @ ${this.formatCRC(item.precio)}</div>
            </div>
            <div class="summary-item-price">${this.formatCRC(subtotal)}</div>
          </div>
        `;
      }).join("");

      const summaryItems = document.getElementById("summary-items");
      if (summaryItems) summaryItems.innerHTML = itemsHtml;

      const summaryTotal = document.getElementById("summary-total");
      if (summaryTotal) summaryTotal.textContent = this.formatCRC(total);

      const summaryUSD = document.getElementById("summary-total-usd");
      if (summaryUSD) summaryUSD.textContent = `(${this.formatUSD(totalUSD)} aprox.)`;
    },

    /**
     * Pre-rellenar formulario si está autenticado
     */
    prefillForm() {
      if (typeof window.auth === "undefined") return;

      const user = window.auth.currentUser;
      if (!user) return;

      const email = document.getElementById("shipping-email");
      if (email && !email.value) {
        email.value = user.email || "";
      }
    },

    /**
     * Vincular eventos
     */
    bindEvents() {
      // Continuar a pago
      const continueBtn = document.getElementById("continue-to-payment");
      if (continueBtn) {
        continueBtn.addEventListener("click", () => this.goToPayment());
      }

      // Volver al carrito
      const backBtn = document.getElementById("back-to-cart");
      if (backBtn) {
        backBtn.addEventListener("click", () => {
          window.location.href = "carrito.html";
        });
      }

      // Volver a envío
      const backPaymentBtn = document.getElementById("back-to-shipping");
      if (backPaymentBtn) {
        backPaymentBtn.addEventListener("click", () => this.goToShipping());
      }

      // Cambiar método de pago
      const paymentRadios = document.querySelectorAll('input[name="payment-method"]');
      paymentRadios.forEach(radio => {
        radio.addEventListener("change", (e) => {
          this.selectPaymentMethod(e.target.value);
        });
      });

      // Seleccionar PayPal por defecto
      this.selectPaymentMethod("paypal");
    },

    /**
     * Validar y ir a pago
     */
    goToPayment() {
      // Validar formulario
      const form = document.getElementById("shipping-form");
      if (!form || !form.checkValidity()) {
        form?.reportValidity?.();
        this.showError("❌ Por favor, completa todos los campos requeridos.");
        return;
      }

      // Validaciones adicionales
      const email = document.getElementById("shipping-email")?.value || "";
      const phone = document.getElementById("shipping-phone")?.value || "";

      if (!this.isValidEmail(email)) {
        this.showError("❌ Email no válido.");
        return;
      }

      if (!this.isValidPhone(phone)) {
        this.showError("❌ Teléfono debe tener al menos 8 dígitos.");
        return;
      }

      // Guardar datos de envío
      const shipping = {
        firstName: document.getElementById("shipping-first-name")?.value || "",
        lastName: document.getElementById("shipping-last-name")?.value || "",
        email,
        phone,
        address: document.getElementById("shipping-address")?.value || "",
        city: document.getElementById("shipping-city")?.value || "",
        postal: document.getElementById("shipping-postal")?.value || "",
        country: document.getElementById("shipping-country")?.value || "CR"
      };
      localStorage.setItem("fyz_checkout_shipping", JSON.stringify(shipping));

      // Ir a pago
      const shippingSection = document.getElementById("shipping-section");
      const paymentSection = document.getElementById("payment-section");

      if (shippingSection) shippingSection.style.display = "none";
      if (paymentSection) paymentSection.style.display = "block";

      // Actualizar steps
      this.updateSteps(2);
      this.showSuccess("✅ Información de envío guardada. Selecciona tu método de pago.");

      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    /**
     * Volver a envío
     */
    goToShipping() {
      const shippingSection = document.getElementById("shipping-section");
      const paymentSection = document.getElementById("payment-section");

      if (shippingSection) shippingSection.style.display = "block";
      if (paymentSection) paymentSection.style.display = "none";

      this.updateSteps(1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    /**
     * Seleccionar método de pago
     */
    async selectPaymentMethod(method) {
      console.log(`Método seleccionado: ${method}`);

      // Actualizar UI
      const paypalMethod = document.getElementById("paypal-method");
      const cardMethod = document.getElementById("card-method");

      if (method === "paypal") {
        paypalMethod?.classList.add("selected");
        cardMethod?.classList.remove("selected");

        if (window.PayPal) {
          await window.PayPal.renderButtons("paypal-button-container");
        }
      } else {
        paypalMethod?.classList.remove("selected");
        cardMethod?.classList.add("selected");
      }
    },

    /**
     * Actualizar steps
     */
    updateSteps(step) {
      this.currentStep = step;
      const steps = document.querySelectorAll(".progress-step");
      steps.forEach((el, idx) => {
        if (idx < step) {
          el.classList.add("active");
        } else {
          el.classList.remove("active");
        }
      });
    },

    /**
     * Validar email
     */
    isValidEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },

    /**
     * Validar teléfono
     */
    isValidPhone(phone) {
      const digits = phone.replace(/\D/g, "");
      return digits.length >= 8;
    },

    /**
     * Mostrar mensajes
     */
    showError(msg) {
      this._showMessage(msg, "error");
    },

    showSuccess(msg) {
      this._showMessage(msg, "success");
    },

    showInfo(msg) {
      this._showMessage(msg, "info");
    },

    _showMessage(msg, type) {
      const errorEl = document.getElementById("checkout-error");
      if (!errorEl) return;

      errorEl.innerHTML = msg;
      errorEl.className = `message-box ${type} show`;

      // Auto-hide después de 4 segundos
      setTimeout(() => {
        errorEl.classList.remove("show");
      }, 4000);
    }
  };

  // === INIT ===
  window.checkout = Checkout;

  document.addEventListener("DOMContentLoaded", () => {
    Checkout.init().catch(err => {
      console.error("❌ Error en checkout:", err);
      Checkout.showError(`Error: ${err.message}`);
    });
  });

  // === DEBUG ===
  window.CheckoutDebug = {
    carrito: () => Checkout.getCart(),
    total: () => Checkout.getTotal(),
    config: () => window.PAYMENTS_CONFIG,
    paypal: () => window.PayPal,
    step: () => Checkout.currentStep
  };
})();
