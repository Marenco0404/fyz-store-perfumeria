/**
 * app.js (FINAL · Firebase v9 COMPAT)
 * ----------------------------------
 * Inicializa sistemas según la página actual
 */

const App = {
  initMobileMenu() {
    const menuToggle = document.getElementById('menu-toggle');
    const navMenu = document.querySelector('.nav-menu');
    if (!menuToggle || !navMenu) return;

    // Evitar duplicar listeners (algunas páginas tenían init inline)
    if (menuToggle.dataset.bound === '1') return;
    menuToggle.dataset.bound = '1';

    const closeMenu = () => {
      navMenu.classList.remove('active');
      document.body.classList.remove('menu-open');
    };

    const openMenu = () => {
      navMenu.classList.add('active');
      document.body.classList.add('menu-open');
    };

    menuToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (navMenu.classList.contains('active')) closeMenu();
      else openMenu();
    });

    // Cerrar al navegar
    navMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => closeMenu());
    });

    // Cerrar al tocar fuera
    document.addEventListener('click', (e) => {
      if (!navMenu.classList.contains('active')) return;
      if (navMenu.contains(e.target) || menuToggle.contains(e.target)) return;
      closeMenu();
    });

    // Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });

    // Si vuelves a escritorio, lo cerramos
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) closeMenu();
    });
  },
  init() {
    document.addEventListener("DOMContentLoaded", () => {
      const path = window.location.pathname;
      const file = (path.split("/").pop() || "index.html").toLowerCase();

      const isAuthPage = file === "login.html" || file === "registro.html";
      const isAdminPage = path.includes("/admin/");

      console.log("📍 Página:", file);

      // Menú hamburguesa (mobile)
      App.initMobileMenu();

      // Auth en todas
      if (window.AuthSystem?.init) {
        AuthSystem.init();
      }

      // ❌ NO carrito en login / registro
      if (!isAuthPage && window.Carrito?.init) {
        Carrito.init();
      }

      // Admin
      if (isAdminPage && window.AdminSystem?.init) {
        AdminSystem.init();
        return;
      }

      // Tienda
      if (
        file === "index.html" ||
        file === "perfumeria.html" ||
        file === "sexshop.html"
      ) {
        window.ProductosSystem?.init?.();
      }

      // Checkout
      if (file === "finalizarcompra.html") {
        window.CheckoutSystem?.init?.();
      }

      if (file === "confirmacion.html") {
        window.CheckoutSystem?.initConfirmacion?.();
      }
    });
  }
};

App.init();
