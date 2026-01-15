/**
 * verificador-paypal.js
 * Script de verificación rápida de PayPal
 * Incluye en finalizarcompra.html justo antes de </head>
 */

(function() {
  'use strict';

  const checks = {
    firebase: false,
    config: false,
    module: false,
    errors: []
  };

  // Monitor de errores
  const originalError = console.error;
  console.error = function(...args) {
    checks.errors.push({
      type: 'ERROR',
      msg: args.join(' '),
      time: new Date().toLocaleTimeString()
    });
    originalError.apply(console, args);
  };

  // Verificar Firebase
  window.addEventListener('load', () => {
    setTimeout(() => {
      try {
        if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
          checks.firebase = true;
          console.log('✅ [PayPal Check] Firebase inicializado');
        }
      } catch (e) {
        console.log('⚠️ [PayPal Check] Firebase error:', e.message);
      }

      try {
        if (window.PAYMENTS_CONFIG && window.PAYMENTS_CONFIG.paypalClientId) {
          checks.config = true;
          console.log('✅ [PayPal Check] PAYMENTS_CONFIG ok');
        } else {
          console.error('❌ [PayPal Check] PAYMENTS_CONFIG no está configurado');
        }
      } catch (e) {
        console.error('❌ [PayPal Check] Error verificando config:', e.message);
      }

      try {
        if (window.PayPal && typeof window.PayPal.init === 'function') {
          checks.module = true;
          console.log('✅ [PayPal Check] PayPal module cargado');
        } else {
          console.error('❌ [PayPal Check] PayPal module no disponible');
        }
      } catch (e) {
        console.error('❌ [PayPal Check] Error verificando módulo:', e.message);
      }

      // Reporte final
      if (checks.firebase && checks.config && checks.module) {
        console.log('✅ [PayPal Check] TODAS LAS VERIFICACIONES PASARON');
        // Banner verde en consola
        console.log('%c ✅ PayPal está correctamente configurado ', 'background: #27ae60; color: white; padding: 8px; border-radius: 3px; font-weight: bold;');
      } else {
        console.log('%c ⚠️ Algunas verificaciones fallaron ', 'background: #e74c3c; color: white; padding: 8px; border-radius: 3px; font-weight: bold;');
        console.log('Firebase:', checks.firebase ? '✅' : '❌');
        console.log('Config:', checks.config ? '✅' : '❌');
        console.log('Module:', checks.module ? '✅' : '❌');
        
        if (checks.errors.length > 0) {
          console.log('Errores capturados:');
          checks.errors.forEach(e => {
            console.log(`  [${e.time}] ${e.msg}`);
          });
        }
      }

      // Exponer para debug
      window.PayPalChecks = checks;
    }, 1000);
  });
})();
