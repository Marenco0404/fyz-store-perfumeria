/**
 * performance-config.js - Optimización de carga y velocidad
 * Inicializa estrategias de caché, preload y lazy loading
 */

(function() {
  // Preload de recursos críticos
  const preloadCritical = () => {
    // Preload de fuentes
    const fontLink = document.createElement('link');
    fontLink.rel = 'preload';
    fontLink.as = 'style';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Poppins:wght@400;500;600&display=swap';
    document.head.appendChild(fontLink);
  };

  // Prefetch de páginas probables
  const prefetchPages = () => {
    const prefetchUrls = [
      'perfumeria.html',
      'sexshop.html',
      'carrito.html',
      'login.html'
    ];

    prefetchUrls.forEach(url => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = url;
      document.head.appendChild(link);
    });
  };

  // Deshabilitar throttling de requestIdleCallback en scroll
  const disableScrollThrottle = () => {
    let ticking = false;
    const update = () => {
      ticking = false;
    };

    window.addEventListener('scroll', () => {
      if (!ticking) {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(update, { timeout: 500 });
        } else {
          setTimeout(update, 100);
        }
        ticking = true;
      }
    }, { passive: true });
  };

  // Reducir repaints en animaciones CSS
  const optimizeCSSAnimations = () => {
    // Las animaciones usan transform y opacity (GPU accelerated)
    const style = document.createElement('style');
    style.textContent = `
      img, .product-card, .category-card {
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
      }
      .transition-transform {
        will-change: transform;
      }
    `;
    document.head.appendChild(style);
  };

  // Caché de respuestas de API
  const cacheApiResponses = () => {
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const [resource] = args;
      const url = typeof resource === 'string' ? resource : resource.url;

      // Cachear llamadas a Firestore/APIs
      if (url.includes('firestore') || url.includes('api/')) {
        const cacheKey = 'fetch_' + url;
        const cached = Helpers?.getCache?.(cacheKey);
        
        if (cached) {
          return Promise.resolve(new Response(JSON.stringify(cached), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }));
        }

        return originalFetch.apply(this, args).then(response => {
          if (response.ok && response.headers.get('content-type')?.includes('json')) {
            response.clone().json().then(data => {
              Helpers?.setCache?.(cacheKey, data, 300000); // 5 min cache
            });
          }
          return response;
        });
      }

      return originalFetch.apply(this, args);
    };
  };

  // Inicialización
  document.addEventListener('DOMContentLoaded', () => {
    preloadCritical();
    prefetchPages();
    disableScrollThrottle();
    optimizeCSSAnimations();
    
    // Esperar a que Helpers esté disponible
    if (window.Helpers) {
      cacheApiResponses();
    }
  });

  // Network information API
  if ('connection' in navigator) {
    const conn = navigator.connection;
    
    // Si es conexión lenta, desactivar animaciones pesadas
    if (conn.effectiveType === '3g' || conn.effectiveType === '4g') {
      const slow = conn.effectiveType === '3g';
      document.documentElement.style.setProperty('--animation-duration', slow ? '0.1s' : '0.3s');
    }

    conn.addEventListener('change', () => {
      console.log('Cambio de velocidad de red:', conn.effectiveType);
    });
  }
})();
