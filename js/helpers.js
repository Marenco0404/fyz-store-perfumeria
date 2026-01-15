/**
 * HELPERS - F&Z STORE
 * Funciones auxiliares y utilitarias
 */

// Utilidades globales
window.Helpers = {
  // Formatear moneda CRC
  formatCRC: (amount) => {
    return new Intl.NumberFormat('es-CR', {
      style: 'currency',
      currency: 'CRC',
      minimumFractionDigits: 0
    }).format(amount);
  },

  // Formatear moneda USD
  formatUSD: (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  },

  // Convertir CRC a USD
  crcToUsd: (crc) => {
    const rate = window.PAYMENTS_CONFIG?.paypalFxRate || 520;
    return (crc / rate).toFixed(2);
  },

  // Convertir USD a CRC
  usdToCrc: (usd) => {
    const rate = window.PAYMENTS_CONFIG?.paypalFxRate || 520;
    return Math.round(usd * rate);
  },

  // Validar email
  validarEmail: (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  },

  // Generar ID único
  generarId: () => {
    return 'TX-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
  },

  // Log con timestamp
  log: (tipo, msg, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${tipo}: ${msg}`, data || '');
  }
};

console.log("✅ [Helpers] Cargado");

// Formatear colones (CRC) de forma consistente en todo el sitio
window.formatCRC = function(amount) {
    const n = Number(amount) || 0;
    return new Intl.NumberFormat('es-CR', {
        style: 'currency',
        currency: 'CRC',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(n);
};

const Helpers = {
    // Formatear moneda
    formatCurrency: function(amount) {
        return new Intl.NumberFormat('es-CR', {
            style: 'currency',
            currency: 'CRC',
            minimumFractionDigits: 2
        }).format(amount);
    },

    // Formatear fecha
    formatDate: function(dateString, includeTime = false) {
        const date = new Date(dateString);
        const options = {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        };
        
        if (includeTime) {
            options.hour = '2-digit';
            options.minute = '2-digit';
        }
        
        return date.toLocaleDateString('es-ES', options);
    },

    // Validar email
    isValidEmail: function(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },

    // Validar teléfono
    isValidPhone: function(phone) {
        const re = /^[\+]?[1-9][\d]{0,15}$/;
        return re.test(phone.replace(/[\s\-\(\)]/g, ''));
    },

    // Obtener parámetro de URL
    getUrlParameter: function(name) {
        name = name.replace(/[\[\]]/g, '\\$&');
        const regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)');
        const results = regex.exec(window.location.href);
        if (!results) return null;
        if (!results[2]) return '';
        return decodeURIComponent(results[2].replace(/\+/g, ' '));
    },

    // Establecer parámetro de URL
    setUrlParameter: function(key, value) {
        const url = new URL(window.location);
        url.searchParams.set(key, value);
        window.history.pushState({}, '', url);
    },

    // Eliminar parámetro de URL
    removeUrlParameter: function(key) {
        const url = new URL(window.location);
        url.searchParams.delete(key);
        window.history.pushState({}, '', url);
    },

    // Generar ID único
    generateId: function(length = 8) {
        return Math.random().toString(36).substr(2, length);
    },

    // Capitalizar texto
    capitalize: function(text) {
        return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    },

    // Truncar texto
    truncate: function(text, maxLength = 100) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    },

    // Mostrar loading
    showLoading: function(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = `
                <div class="loading">
                    <div class="loading-spinner"></div>
                    <p>Cargando...</p>
                </div>
            `;
        }
    },

    // Ocultar loading
    hideLoading: function(elementId, content = '') {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = content;
        }
    },

    // Copiar al portapapeles
    copyToClipboard: function(text) {
        return new Promise((resolve, reject) => {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(text)
                    .then(resolve)
                    .catch(reject);
            } else {
                // Fallback para navegadores antiguos
                const textarea = document.createElement('textarea');
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                try {
                    document.execCommand('copy');
                    resolve();
                } catch (err) {
                    reject(err);
                }
                document.body.removeChild(textarea);
            }
        });
    },

    // Descargar archivo
    downloadFile: function(filename, content, type = 'text/plain') {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    // Validar tarjeta de crédito (algoritmo de Luhn)
    validateCreditCard: function(number) {
        const cleanNum = number.replace(/\D/g, '');
        if (cleanNum.length < 13 || cleanNum.length > 19) return false;
        
        let sum = 0;
        let isEven = false;
        
        for (let i = cleanNum.length - 1; i >= 0; i--) {
            let digit = parseInt(cleanNum.charAt(i), 10);
            
            if (isEven) {
                digit *= 2;
                if (digit > 9) digit -= 9;
            }
            
            sum += digit;
            isEven = !isEven;
        }
        
        return (sum % 10) === 0;
    },

    // Validar fecha de expiración
    validateExpiryDate: function(expiry) {
        const [month, year] = expiry.split('/').map(Number);
        if (!month || !year) return false;
        
        const now = new Date();
        const currentYear = now.getFullYear() % 100;
        const currentMonth = now.getMonth() + 1;
        
        if (year < currentYear) return false;
        if (year === currentYear && month < currentMonth) return false;
        if (month < 1 || month > 12) return false;
        
        return true;
    },

    // Formatear número de tarjeta
    formatCardNumber: function(number) {
        return number.replace(/\D/g, '').replace(/(\d{4})/g, '$1 ').trim();
    },

    // Formatear fecha de expiración
    formatExpiryDate: function(date) {
        return date.replace(/\D/g, '').replace(/(\d{2})(\d{2})/, '$1/$2');
    },

    // Obtener tipo de tarjeta
    getCardType: function(number) {
        const cleanNum = number.replace(/\D/g, '');
        
        // Visa
        if (/^4/.test(cleanNum)) return 'visa';
        // MasterCard
        if (/^5[1-5]/.test(cleanNum)) return 'mastercard';
        // American Express
        if (/^3[47]/.test(cleanNum)) return 'amex';
        // Discover
        if (/^6(?:011|5)/.test(cleanNum)) return 'discover';
        // Diners Club
        if (/^3(?:0[0-5]|[68])/.test(cleanNum)) return 'diners';
        // JCB
        if (/^35/.test(cleanNum)) return 'jcb';
        
        return 'unknown';
    },

    // Debounce para eventos
    debounce: function(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Throttle para eventos
    throttle: function(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    // Verificar conexión a internet
    isOnline: function() {
        return navigator.onLine;
    },

    // Almacenar en localStorage con expiración
    setLocalStorageWithExpiry: function(key, value, ttl) {
        const now = new Date();
        const item = {
            value: value,
            expiry: now.getTime() + ttl
        };
        localStorage.setItem(key, JSON.stringify(item));
    },

    // Obtener de localStorage con expiración
    getLocalStorageWithExpiry: function(key) {
        const itemStr = localStorage.getItem(key);
        if (!itemStr) return null;
        
        const item = JSON.parse(itemStr);
        const now = new Date();
        
        if (now.getTime() > item.expiry) {
            localStorage.removeItem(key);
            return null;
        }
        
        return item.value;
    },

    // Generar gradiente aleatorio
    randomGradient: function() {
        const gradients = [
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
            'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
            'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)'
        ];
        
        return gradients[Math.floor(Math.random() * gradients.length)];
    },

    // Calcular edad a partir de fecha de nacimiento
    calculateAge: function(birthDate) {
        const today = new Date();
        const birth = new Date(birthDate);
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        
        return age;
    },

    // Slugify texto
    slugify: function(text) {
        return text
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '')
            .replace(/\-\-+/g, '-')
            .replace(/^-+/, '')
            .replace(/-+$/, '');
    },

    // Obtener diferencia de tiempo en texto
    timeAgo: function(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + ' años';
        
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + ' meses';
        
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + ' días';
        
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + ' horas';
        
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + ' minutos';
        
        return Math.floor(seconds) + ' segundos';
    },

    // ========== OPTIMIZACIÓN DE PERFORMANCE ==========
    
    // Lazy loading de imágenes con Intersection Observer
    initLazyLoading: function() {
        if (!('IntersectionObserver' in window)) {
            // Fallback para navegadores antiguos
            const images = document.querySelectorAll('[data-src]');
            images.forEach(img => {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
            });
            return;
        }

        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                        observer.unobserve(img);
                    }
                }
            });
        }, {
            rootMargin: '50px'
        });

        document.querySelectorAll('[data-src]').forEach(img => imageObserver.observe(img));
    },

    // Precarga de recursos críticos
    preloadResource: function(url, as = 'script') {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = as;
        link.href = url;
        document.head.appendChild(link);
    },

    // Deferral de tareas no críticas
    deferTask: function(callback, delay = 0) {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(callback);
        } else {
            setTimeout(callback, delay);
        }
    },

    // Caché local con expiración
    setCache: function(key, value, ttl = 3600000) {
        const item = {
            value: value,
            expiry: Date.now() + ttl
        };
        try {
            localStorage.setItem('cache_' + key, JSON.stringify(item));
        } catch (e) {
            console.warn('Cache full:', e);
        }
    },

    getCache: function(key) {
        try {
            const itemStr = localStorage.getItem('cache_' + key);
            if (!itemStr) return null;
            
            const item = JSON.parse(itemStr);
            if (Date.now() > item.expiry) {
                localStorage.removeItem('cache_' + key);
                return null;
            }
            return item.value;
        } catch (e) {
            return null;
        }
    },

    // Debounce mejorado para eventos
    debounce: function(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};

// Exportar para uso global
window.Helpers = Helpers;

// Inicializar lazy loading automáticamente
document.addEventListener('DOMContentLoaded', () => {
    Helpers.initLazyLoading();
});