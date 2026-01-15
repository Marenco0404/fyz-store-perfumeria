/**
 * SISTEMA DE ADMINISTRACIÓN - F&Z STORE
 * Panel completo de administración con Firebase
 */

const AdminSystem = {
    // Estado del uploader (sin campo URL)
    _productImageUrl: "",
    _productImageUploading: false,
    // Labels para estados de pedidos
    estadoPedidoLabel: function(estado) {
        const map = {
            pendiente: 'Pago completado', // legacy
            pago_completado: 'Pago completado',
            solicitando_envio: 'Solicitando envío',
            envio_hecho: 'Envío hecho (24–48h)',
            completado: 'Completado',
            cancelado: 'Cancelado'
        };
        return map[estado] || estado || 'N/A';
    },


    // Estado
    currentPage: 'dashboard',
    currentUser: null,
    productos: [],
    categorias: [],
    subcategorias: [],
    pedidos: [],
    usuarios: [],

    // Cache del último reporte de ventas generado (para exportación)
    _lastSalesReport: null,
    
    // Inicializar
    init: async function() {
        console.log('👑 Inicializando sistema de administración...');
        
        // Verificar autenticación
        await this.verificarAutenticacion();
        
        // Configurar eventos
        this.configurarEventos();
        
        // Cargar datos iniciales
        await this.cargarDatosIniciales();
        
        // Actualizar estadísticas
        await this.actualizarEstadisticas();
        
        // Mostrar página actual
        this.mostrarPagina(this.currentPage);
    },
    
    // Verificar autenticación y permisos
    verificarAutenticacion: async function() {
        try {
            // Esperar a que auth esté listo
            await new Promise(resolve => {
                const checkAuth = () => {
                    if (auth && typeof auth.onAuthStateChanged === 'function') {
                        resolve();
                    } else {
                        setTimeout(checkAuth, 100);
                    }
                };
                checkAuth();
            });
            
            // Verificar si hay usuario autenticado
            return new Promise((resolve, reject) => {
                auth.onAuthStateChanged(async (user) => {
                    if (user) {
                        this.currentUser = user;
                        
                        // Verificar si es administrador
                        const esAdmin = await this.verificarEsAdmin(user.uid);
                        
                        if (esAdmin) {
                            console.log('✅ Usuario administrador autenticado');
                            this.actualizarUIUsuario(user);
                            resolve(true);
                        } else {
                            console.log('⛔ Usuario no es administrador');
                            this.mostrarError('No tienes permisos de administrador');
                            setTimeout(() => window.location.href = '../index.html', 2000);
                            reject(new Error('No es administrador'));
                        }
                    } else {
                        console.log('🔓 Usuario no autenticado');
                        window.location.href = '../login.html';
                        reject(new Error('No autenticado'));
                    }
                });
            });
            
        } catch (error) {
            console.error('❌ Error verificando autenticación:', error);
            window.location.href = '../login.html';
        }
    },
    
    // Verificar si el usuario es administrador
    verificarEsAdmin: async function(userId) {
        try {
            const userDoc = await db.collection('usuarios').doc(userId).get();
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                return userData.rol === 'admin' || userData.rol === 'superadmin';
            }
            
            return false;
        } catch (error) {
            console.error('❌ Error verificando rol:', error);
            return false;
        }
    },

    // Crear/asegurar categorías base y subcategorías default
    asegurarCatalogoBase: async function() {
        if (typeof db === 'undefined') return;

        // Categorías principales (IDs fijos para que el front filtre bien)
        const categoriasBase = [
            { id: 'perfumeria', nombre: 'Perfumería', slug: 'perfumeria', estado: 'active', descripcion: 'Fragancias y perfumes' },
            { id: 'sexshop', nombre: 'Sex Shop', slug: 'sexshop', estado: 'active', descripcion: 'Productos íntimos' }
        ];

        for (const c of categoriasBase) {
            await db.collection('categorias').doc(c.id).set(c, { merge: true });
        }

        // Subcategorías default
        const subcatsBase = [
            // Perfumería
            { categoria: 'perfumeria', slug: 'hombre', nombre: 'Hombre' },
            { categoria: 'perfumeria', slug: 'mujer', nombre: 'Mujer' },
            { categoria: 'perfumeria', slug: 'unisex', nombre: 'Unisex' },
            // SexShop
            { categoria: 'sexshop', slug: 'juguetes', nombre: 'Juguetes' },
            { categoria: 'sexshop', slug: 'lubricantes', nombre: 'Lubricantes' },
            { categoria: 'sexshop', slug: 'saludsexual', nombre: 'Salud Sexual' },
            { categoria: 'sexshop', slug: 'lenceria', nombre: 'Lencería' },
            { categoria: 'sexshop', slug: 'arosyanillos', nombre: 'Aros y Anillos' },
            { categoria: 'sexshop', slug: 'juegoseroticos', nombre: 'Juegos Eróticos' }
        ];

        const subRef = db.collection('subcategorias');
        const snap = await subRef.get();
        const existentes = new Set(snap.docs.map(d => (d.data()?.categoria || '') + '::' + (d.data()?.slug || d.id)));
        for (const sc of subcatsBase) {
            const key = `${sc.categoria}::${sc.slug}`;
            if (existentes.has(key)) continue;
            await subRef.add({
                categoria: sc.categoria,
                slug: sc.slug,
                nombre: sc.nombre,
                estado: 'active',
                fechaCreacion: new Date().toISOString()
            });
        }
    },

    // Traducir errores comunes de Firestore a mensajes entendibles
    formatearErrorFirestore: function(err) {
        const code = err?.code || '';
        if (code === 'permission-denied') return 'Permiso denegado (reglas de Firestore).';
        if (code === 'unauthenticated') return 'No autenticado. Volvé a iniciar sesión.';
        if (code === 'unavailable') return 'Firestore no disponible (revisá internet o Firebase).';
        if (code === 'failed-precondition') return 'Falta un índice en Firestore (te sale un link en la consola).';
        return (err?.message || 'Error desconocido');
    },

    // Helper: cargar una colección sin tumbar todo el panel si falla
    cargarColeccionSeguro: async function(queryPromise, label) {
        try {
            const snap = await queryPromise;
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (err) {
            console.error(`❌ Error cargando ${label}:`, err);
            this.mostrarError(`Error cargando ${label}: ${this.formatearErrorFirestore(err)}`);
            return [];
        }
    },
    
    // Cargar datos iniciales
    cargarDatosIniciales: async function() {
        try {
            console.log('📊 Cargando datos iniciales...');

            // Asegurar categorías base (perfumeria/sexshop) y subcategorías default
            await this.asegurarCatalogoBase();

            // Cargar todo "a prueba de fallos" (si alguna colección está bloqueada por reglas,
            // el panel igual abre y te dice EXACTO qué falló)
            this.productos = await this.cargarColeccionSeguro(
                db.collection('productos').orderBy('fechaCreacion', 'desc').limit(50).get(),
                'productos'
            );

            this.categorias = await this.cargarColeccionSeguro(
                db.collection('categorias').get(),
                'categorías'
            );

            this.subcategorias = await this.cargarColeccionSeguro(
                db.collection('subcategorias').get(),
                'subcategorías'
            );

            this.pedidos = await this.cargarColeccionSeguro(
                db.collection('pedidos').orderBy('fecha', 'desc').limit(10).get(),
                'pedidos'
            );

            this.usuarios = await this.cargarColeccionSeguro(
                db.collection('usuarios').orderBy('fechaRegistro', 'desc').limit(50).get(),
                'usuarios'
            );
            
            console.log('✅ Datos cargados:', {
                productos: this.productos.length,
                categorias: this.categorias.length,
                pedidos: this.pedidos.length,
                usuarios: this.usuarios.length
            });
            
        } catch (error) {
            console.error('❌ Error cargando datos:', error);
            this.mostrarError('Error al cargar los datos: ' + this.formatearErrorFirestore(error));
        }
    },
    
    // Actualizar estadísticas
    actualizarEstadisticas: async function() {
        try {
            // ====== Totales reales (no solo los 10/50 cargados en memoria) ======
            // Estados que cuentan como "venta" en tu flujo actual
            const SALE_STATES = ['pago_completado', 'solicitando_envio', 'envio_hecho', 'completado', 'pendiente'];

            // 1) Ventas totales (suma de (pedido.totalCRC ?? pedido.total))
            let totalVentas = 0;
            let totalPedidos = 0;
            let totalProductos = 0;
            let totalUsuarios = 0;
            let pedidosPendientes = 0;

            // Pedidos (para totales + pendientes)
            const pedidosAllSnap = await db.collection('pedidos').get();
            totalPedidos = pedidosAllSnap.size;

            pedidosAllSnap.forEach(d => {
                const p = d.data() || {};
                const estado = (p.estado || '').toString();

                // "pendiente" para el badge: pagos completados pero sin terminar el flujo
                if (['pago_completado', 'solicitando_envio', 'pendiente', 'procesando'].includes(estado)) {
                    pedidosPendientes++;
                }

                // Ventas: contar estados de venta
                if (SALE_STATES.includes(estado)) {
                    const t = Number((p.totalCRC ?? p.total) ?? 0);
                    if (Number.isFinite(t)) totalVentas += t;
                }
            });

            // Productos
            const productosSnap = await db.collection('productos').get();
            totalProductos = productosSnap.size;

            // Usuarios
            const usuariosSnap = await db.collection('usuarios').get();
            totalUsuarios = usuariosSnap.size;

            // Actualizar UI
            const elVentas = document.getElementById('total-ventas');
            if (elVentas) elVentas.textContent = `${formatCRC(totalVentas)}`;

            const elPedidos = document.getElementById('total-pedidos');
            if (elPedidos) elPedidos.textContent = totalPedidos;

            const elProductos = document.getElementById('total-productos');
            if (elProductos) elProductos.textContent = totalProductos;

            const elUsuarios = document.getElementById('total-usuarios');
            if (elUsuarios) elUsuarios.textContent = totalUsuarios;
            
            // Actualizar contadores en sidebar (totales reales)
            document.getElementById('productos-count').textContent = 
                totalProductos;
            document.getElementById('categorias-count').textContent = 
                this.categorias.length;
            document.getElementById('usuarios-count').textContent = 
                totalUsuarios;
            
            document.getElementById('pedidos-pendientes').textContent = 
                pedidosPendientes;

            // ====== Tendencias (los numeritos verdes) ======
            // Comparar últimos 7 días vs los 7 anteriores
            await this._actualizarTendenciasDashboard({ pedidosAllSnap, productosSnap, usuariosSnap, saleStates: SALE_STATES });
                
        } catch (error) {
            console.error('❌ Error actualizando estadísticas:', error);
        }
    },

    // Helper: calcular % cambio
    _pctChange: function(curr, prev) {
        const c = Number(curr) || 0;
        const p = Number(prev) || 0;
        if (p === 0 && c === 0) return 0;
        if (p === 0 && c > 0) return 100;
        return ((c - p) / p) * 100;
    },

    // Helper: parsear fecha ISO (string) con fallback
    _toDate: function(v) {
        if (!v) return null;
        // Firestore Timestamp compat
        if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate();
        // ISO string
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
    },

    // Actualizar numeritos verdes del dashboard (tendencias)
    _actualizarTendenciasDashboard: async function({ pedidosAllSnap, productosSnap, usuariosSnap, saleStates }) {
        try {
            const now = new Date();
            const startCurr = new Date(now);
            startCurr.setDate(startCurr.getDate() - 7);
            const startPrev = new Date(startCurr);
            startPrev.setDate(startPrev.getDate() - 7);

            // Ventas y pedidos (por fecha del pedido)
            let ventasCurr = 0, ventasPrev = 0;
            let pedidosCurr = 0, pedidosPrev = 0;

            pedidosAllSnap.forEach(d => {
                const p = d.data() || {};
                const fecha = this._toDate(p.fecha);
                if (!fecha) return;

                const estado = (p.estado || '').toString();
                const total = Number((p.totalCRC ?? p.total) ?? 0);

                if (fecha >= startCurr && fecha <= now) {
                    pedidosCurr++;
                    if (saleStates.includes(estado) && Number.isFinite(total)) ventasCurr += total;
                } else if (fecha >= startPrev && fecha < startCurr) {
                    pedidosPrev++;
                    if (saleStates.includes(estado) && Number.isFinite(total)) ventasPrev += total;
                }
            });

            // Productos nuevos (por fechaCreacion)
            let prodCurr = 0, prodPrev = 0;
            productosSnap.forEach(d => {
                const p = d.data() || {};
                const fecha = this._toDate(p.fechaCreacion);
                if (!fecha) return;
                if (fecha >= startCurr && fecha <= now) prodCurr++;
                else if (fecha >= startPrev && fecha < startCurr) prodPrev++;
            });

            // Usuarios nuevos (por fechaRegistro)
            let userCurr = 0, userPrev = 0;
            usuariosSnap.forEach(d => {
                const u = d.data() || {};
                const fecha = this._toDate(u.fechaRegistro || u.fechaCreacion || u.createdAt);
                if (!fecha) return;
                if (fecha >= startCurr && fecha <= now) userCurr++;
                else if (fecha >= startPrev && fecha < startCurr) userPrev++;
            });

            // Pintar tendencias en UI (orden de las cards)
            const cards = Array.from(document.querySelectorAll('.stats-grid .stat-card'));
            const trends = [
                this._pctChange(ventasCurr, ventasPrev),
                this._pctChange(pedidosCurr, pedidosPrev),
                this._pctChange(prodCurr, prodPrev),
                this._pctChange(userCurr, userPrev)
            ];

            cards.forEach((card, idx) => {
                const el = card?.querySelector('.stat-trend');
                if (!el) return;
                const pct = trends[idx] ?? 0;
                const sign = pct >= 0 ? '+' : '';
                el.textContent = `${sign}${pct.toFixed(1)}%`;
                el.classList.remove('positive', 'negative');
                el.classList.add(pct >= 0 ? 'positive' : 'negative');
            });
        } catch (e) {
            console.warn('⚠️ No se pudieron calcular tendencias:', e);
        }
    },
    
    // Mostrar página específica
    mostrarPagina: function(pagina) {
        // Actualizar menú activo (si existe)
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        const link = document.querySelector(`[data-page="${pagina}"]`);
        if (link && link.parentElement) link.parentElement.classList.add('active');
        
        // Ocultar todas las páginas
        document.querySelectorAll('.admin-page-content').forEach(page => {
            page.classList.remove('active');
        });
        
        // Mostrar página seleccionada
        const pageElement = document.getElementById(`page-${pagina}`);
        if (pageElement) {
            pageElement.classList.add('active');
            document.getElementById('page-title').textContent = 
                this.getPageTitle(pagina);
        }
        
        // Cargar contenido específico de la página
        this.cargarContenidoPagina(pagina);
        
        this.currentPage = pagina;
    },
    
    // Obtener título de página
    getPageTitle: function(pagina) {
        const titulos = {
            'dashboard': 'Dashboard',
            'productos': 'Productos',
            'categorias': 'Categorías',
            'pedidos': 'Pedidos',
            'usuarios': 'Usuarios',
            'ventas': 'Ventas'
        };
        
        return titulos[pagina] || pagina;
    },
    
    // Cargar contenido de la página
    cargarContenidoPagina: function(pagina) {
        switch(pagina) {
            case 'productos':
                this.mostrarProductos();
                break;
            case 'categorias':
                this.mostrarCategorias();
                break;
            case 'pedidos':
                this.mostrarPedidos();
                break;
            case 'usuarios':
                this.mostrarUsuarios();
                break;
            case 'ventas':
                this.mostrarVentas();
                break;
            case 'dashboard':
            default:
                this.mostrarDashboard();
                break;
        }
    },
    
    // Mostrar dashboard
    mostrarDashboard: function() {
        // Pedidos recientes
        this.mostrarPedidosRecientes();

        // Gráfico de ventas
        const select = document.querySelector('#page-dashboard .select-period');
        const days = parseInt(select?.value || '7', 10) || 7;
        this._renderSalesChart(days);

        if (select && !select.dataset.bound) {
            select.dataset.bound = '1';
            select.addEventListener('change', () => {
                const d = parseInt(select.value || '7', 10) || 7;
                this._renderSalesChart(d);
            });
        }
    },

    // Render gráfico simple (canvas) de ventas por día
    _renderSalesChart: async function(days) {
        const host = document.getElementById('sales-chart');
        if (!host) return;

        host.innerHTML = `
            <div class="loading-chart">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Cargando gráfico...</p>
            </div>
        `;

        try {
            const points = await this._getVentasPorDia(days);

            if (!points.length) {
                host.innerHTML = `<div class="loading-chart"><p>No hay ventas en este período.</p></div>`;
                return;
            }

            // Canvas responsivo
            host.innerHTML = `<canvas id="sales-canvas" style="width:100%; height:260px;"></canvas>`;
            const canvas = document.getElementById('sales-canvas');
            const ctx = canvas.getContext('2d');

            // Ajuste de resolución
            const resize = () => {
                const rect = host.getBoundingClientRect();
                const dpr = window.devicePixelRatio || 1;
                canvas.width = Math.max(300, Math.floor(rect.width * dpr));
                canvas.height = Math.floor(260 * dpr);
                canvas.style.height = '260px';
                canvas.style.width = '100%';
                this._drawLineChart(ctx, canvas.width, canvas.height, points);
            };
            resize();
            window.addEventListener('resize', resize, { passive: true });
        } catch (e) {
            console.error('❌ Error renderizando gráfico:', e);
            host.innerHTML = `<div class="loading-chart"><p>Error cargando gráfico.</p></div>`;
        }
    },

    // Obtener ventas por día (últimos N días)
    _getVentasPorDia: async function(days) {
        const SALE_STATES = ['pago_completado', 'solicitando_envio', 'envio_hecho', 'completado', 'pendiente'];
        const now = new Date();
        const start = new Date(now);
        start.setDate(start.getDate() - days);
        const startISO = start.toISOString();

        // Traer pedidos del rango (si hay muchos, igual funciona bien para dashboard)
        let snap;
        try {
            snap = await db.collection('pedidos')
                .where('fecha', '>=', startISO)
                .orderBy('fecha', 'asc')
                .get();
        } catch {
            // fallback si falta índice o hay fechas mezcladas
            snap = await db.collection('pedidos').get();
        }

        // Map día -> total
        const byDay = new Map();
        for (let i = 0; i <= days; i++) {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            const key = d.toISOString().slice(0, 10);
            byDay.set(key, 0);
        }

        snap.forEach(doc => {
            const p = doc.data() || {};
            const estado = (p.estado || '').toString();
            if (!SALE_STATES.includes(estado)) return;

            const dt = this._toDate(p.fecha);
            if (!dt || dt < start || dt > now) return;
            const key = dt.toISOString().slice(0, 10);
            const t = Number((p.totalCRC ?? p.total) ?? 0);
            if (!Number.isFinite(t)) return;
            byDay.set(key, (byDay.get(key) || 0) + t);
        });

        // Convertir a puntos ordenados
        return Array.from(byDay.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([day, total]) => ({ day, total }));
    },

    // Dibujo del gráfico (línea) en canvas
    _drawLineChart: function(ctx, w, h, points) {
        const pad = Math.floor(34 * (window.devicePixelRatio || 1));
        const innerW = w - pad * 2;
        const innerH = h - pad * 2;

        const maxY = Math.max(...points.map(p => p.total)) || 1;
        const minY = 0;

        // limpiar
        ctx.clearRect(0, 0, w, h);

        // estilos
        ctx.lineWidth = Math.max(2, 2 * (window.devicePixelRatio || 1));
        ctx.strokeStyle = '#7c3aed';
        ctx.fillStyle = 'rgba(124,58,237,0.08)';

        // grid suave
        ctx.save();
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = Math.max(1, 1 * (window.devicePixelRatio || 1));
        for (let i = 0; i <= 4; i++) {
            const y = pad + (innerH * i) / 4;
            ctx.beginPath();
            ctx.moveTo(pad, y);
            ctx.lineTo(pad + innerW, y);
            ctx.stroke();
        }
        ctx.restore();

        const xFor = (i) => pad + (innerW * i) / Math.max(1, (points.length - 1));
        const yFor = (v) => pad + innerH - ((v - minY) / (maxY - minY)) * innerH;

        // área
        ctx.beginPath();
        points.forEach((p, i) => {
            const x = xFor(i);
            const y = yFor(p.total);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.lineTo(xFor(points.length - 1), pad + innerH);
        ctx.lineTo(xFor(0), pad + innerH);
        ctx.closePath();
        ctx.fill();

        // línea
        ctx.beginPath();
        points.forEach((p, i) => {
            const x = xFor(i);
            const y = yFor(p.total);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = '#7c3aed';
        ctx.stroke();

        // puntos
        ctx.fillStyle = '#7c3aed';
        points.forEach((p, i) => {
            const x = xFor(i);
            const y = yFor(p.total);
            ctx.beginPath();
            ctx.arc(x, y, Math.max(2, 3 * (window.devicePixelRatio || 1)), 0, Math.PI * 2);
            ctx.fill();
        });
    },
    
    // Mostrar productos
    mostrarProductos: function() {
        const container = document.getElementById('page-productos');
        if (!container) return;
        
        let html = `
            <div class="page-header">
                <h2>Gestión de Productos</h2>
                <p>Administra todos los productos de la tienda</p>
            </div>
            
            <div class="admin-actions">
                <button class="btn btn-primary" onclick="AdminSystem.abrirModalProducto()">
                    <i class="fas fa-plus"></i> Nuevo Producto
                </button>
                <button class="btn btn-secondary" onclick="AdminSystem.exportarProductos()">
                    <i class="fas fa-download"></i> Exportar
                </button>
            </div>
            
            <div class="admin-table-container">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Imagen</th>
                            <th>Nombre</th>
                            <th>Categoría</th>
                            <th>Precio</th>
                            <th>Stock</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        if (this.productos.length === 0) {
            html += `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 3rem;">
                        <i class="fas fa-box-open" style="font-size: 3rem; color: #666; margin-bottom: 1rem;"></i>
                        <p>No hay productos registrados</p>
                    </td>
                </tr>
            `;
        } else {
            this.productos.forEach(producto => {
                html += `
                    <tr>
                        <td>${producto.id.substring(0, 8)}...</td>
                        <td>
                            <img src="${producto.imagen || 'https://via.placeholder.com/50'}" 
                                 alt="${producto.nombre}" 
                                 style="width: 50px; height: 50px; object-fit: cover; border-radius: 5px;">
                        </td>
                        <td>${producto.nombre}</td>
                        <td>
                            <span class="badge">${producto.categoria || 'Sin categoría'}</span>
                        </td>
                        <td>${
                            (() => {
                                const base = Number(producto.precio) || 0;
                                const desc = Number(producto.descuento) || 0;
                                if (desc > 0) {
                                    const final = base * (1 - desc / 100);
                                    return (
                                        '<div style="display:flex; flex-direction:column; gap:4px;">' +
                                          '<span style="text-decoration:line-through; opacity:.65;">' + formatCRC(base.toFixed(2)) + '</span>' +
                                          '<span style="font-weight:700;">' + formatCRC(final.toFixed(2)) + ' ' +
                                            '<span class="badge badge-warning">-' + desc + '%</span>' +
                                          '</span>' +
                                        '</div>'
                                    );
                                }
                                return '<span>' + formatCRC(base.toFixed(2)) + '</span>';
                            })()
                        }</td>
                        <td>
                            <span class="${producto.stock > 10 ? 'in-stock' : producto.stock > 0 ? 'low-stock' : 'out-of-stock'}">
                                ${producto.stock || 0}
                            </span>
                        </td>
                        <td>
                            <span class="badge ${producto.estado === 'active' ? 'badge-success' : 'badge-danger'}">
                                ${producto.estado || 'inactive'}
                            </span>
                        </td>
                        <td>
                            <button class="btn-action btn-edit" onclick="AdminSystem.editarProducto('${producto.id}')">
                                <i class="fas fa-edit"></i> Editar
                            </button>
                            <button class="btn-action btn-delete" onclick="AdminSystem.eliminarProducto('${producto.id}')">
                                <i class="fas fa-trash"></i> Eliminar
                            </button>
                        </td>
                    </tr>
                `;
            });
        }
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        container.innerHTML = html;
    },
    
    // Mostrar categorías y subcategorías
    mostrarCategorias: function() {
        const container = document.getElementById('page-categorias');
        if (!container) return;
        
        let html = `
            <div class="page-header">
                <h2>Categorías y Subcategorías</h2>
                <p>Perfumería y Sex Shop son categorías principales. Abajo podés manejar subcategorías.</p>
            </div>

            <div class="admin-actions">
                <button class="btn btn-primary" onclick="AdminSystem.abrirModalSubcategoria()">
                    <i class="fas fa-plus"></i> Nueva Subcategoría
                </button>
            </div>

            <div class="categories-grid">
        `;
        
        if (this.categorias.length === 0) {
            html += `
                <div class="no-categories">
                    <i class="fas fa-tags" style="font-size: 3rem; color: #666; margin-bottom: 1rem;"></i>
                    <p>No hay categorías registradas</p>
                </div>
            `;
        } else {
            // Mostrar categorías principales (no borrar)
            this.categorias
                .filter(c => (c.slug || c.id) === 'perfumeria' || (c.slug || c.id) === 'sexshop')
                .forEach(categoria => {
                html += `
                    <div class="category-card">
                        <div class="category-header">
                            <h3>${categoria.nombre}</h3>
                            <span class="badge ${categoria.estado === 'active' ? 'badge-success' : 'badge-danger'}">
                                ${categoria.estado}
                            </span>
                        </div>
                        <p class="category-description">${categoria.descripcion || 'Sin descripción'}</p>
                        <div class="category-stats">
                            <span><i class="fas fa-layer-group"></i> Subcategorías: ${(this.subcategorias || []).filter(sc => (sc.categoria||'') === (categoria.slug||categoria.id)).length}</span>
                        </div>
                    </div>
                `;
            });
        }
        
        html += `</div>`;

        // Lista de subcategorías
        const byCat = (slug) => (this.subcategorias || [])
            .filter(sc => (sc.categoria || '') === slug)
            .sort((a,b) => (a.nombre||'').localeCompare(b.nombre||''));

        html += `
            <div class="page-header" style="margin-top:28px;">
                <h3>Subcategorías</h3>
            </div>
            <div class="admin-table">
                <table>
                    <thead>
                        <tr>
                            <th>Categoría</th>
                            <th>Subcategoría</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        const rows = [];
        ['perfumeria','sexshop'].forEach(cat => {
            byCat(cat).forEach(sc => rows.push({cat, sc}));
        });

        if (rows.length === 0) {
            html += `<tr><td colspan="4" style="text-align:center; padding:18px; opacity:.8;">No hay subcategorías todavía.</td></tr>`;
        } else {
            rows.forEach(({cat, sc}) => {
                html += `
                    <tr>
                        <td>${cat === 'perfumeria' ? 'Perfumería' : 'Sex Shop'}</td>
                        <td>${sc.nombre || sc.slug || ''}</td>
                        <td><span class="badge ${sc.estado === 'active' ? 'badge-success' : 'badge-danger'}">${sc.estado || 'active'}</span></td>
                        <td>
                            <button class="btn-action btn-edit" onclick="AdminSystem.abrirModalSubcategoria('${sc.id}')"><i class="fas fa-edit"></i></button>
                            <button class="btn-action btn-delete" onclick="AdminSystem.toggleSubcategoria('${sc.id}')"><i class="fas fa-power-off"></i></button>
                        </td>
                    </tr>
                `;
            });
        }

        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        container.innerHTML = html;
    },
    
    // Mostrar pedidos
    mostrarPedidos: function() {
        const container = document.getElementById('page-pedidos');
        if (!container) return;
        
        let html = `
            <div class="page-header">
                <h2>Gestión de Pedidos</h2>
                <p>Administra todos los pedidos de la tienda</p>
            </div>
            
            <div class="filters">
                <select class="filter-select" onchange="AdminSystem.filtrarPedidos(this.value)">
                    <option value="all">Todos los pedidos</option>
                    <option value="pago_completado">Pago completado</option>
                    <option value="solicitando_envio">Solicitando envío</option>
                    <option value="envio_hecho">Envío hecho</option>
                    <option value="completado">Completados</option>
                    <option value="cancelado">Cancelados</option>
                </select>
            </div>
            
            <div class="admin-table-container">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>ID Pedido</th>
                            <th>Cliente</th>
                            <th>Fecha</th>
                            <th>Total</th>
                            <th>Método</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        if (this.pedidos.length === 0) {
            html += `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 3rem;">
                        <i class="fas fa-shopping-bag" style="font-size: 3rem; color: #666; margin-bottom: 1rem;"></i>
                        <p>No hay pedidos registrados</p>
                    </td>
                </tr>
            `;
        } else {
            this.pedidos.forEach(pedido => {
                html += `
                    <tr>
                        <td>${pedido.id.substring(0, 8)}...</td>
                        <td>${pedido.usuarioEmail || 'Cliente'}</td>
                        <td>${new Date(pedido.fecha).toLocaleDateString('es-ES')}</td>
                        <td>${formatCRC((pedido.totalCRC ?? pedido.total) ? (pedido.totalCRC ?? pedido.total).toFixed(2) : '0.00')}</td>
                        <td>${pedido.metodoPago || 'N/A'}</td>
                        <td>
                            <select class="status-select" data-pedido="${pedido.id}" onchange="AdminSystem.actualizarEstadoPedido('${pedido.id}', this.value)">
                                <option value="pago_completado" ${pedido.estado === 'pago_completado' || pedido.estado === 'pendiente' ? 'selected' : ''}>Pago completado</option>
                                <option value="solicitando_envio" ${pedido.estado === 'solicitando_envio' ? 'selected' : ''}>Solicitando envío</option>
                                <option value="envio_hecho" ${pedido.estado === 'envio_hecho' ? 'selected' : ''}>Envío hecho (24–48h)</option>
                                <option value="completado" ${pedido.estado === 'completado' ? 'selected' : ''}>Completado</option>
                                <option value="cancelado" ${pedido.estado === 'cancelado' ? 'selected' : ''}>Cancelado</option>
                            </select>
                        </td>
                        <td>
                            <button class="btn-action btn-view" onclick="AdminSystem.verDetallePedido('${pedido.id}')">
                                <i class="fas fa-eye"></i> Ver
                            </button>
                        </td>
                    </tr>
                `;
            });
        }
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        container.innerHTML = html;
    },
    
    // Mostrar pedidos recientes para dashboard
    mostrarPedidosRecientes: function() {
        const container = document.getElementById('recent-orders');
        if (!container) return;
        
        let html = '';
        
        if (this.pedidos.length === 0) {
            html = `
                <div class="loading-orders">
                    <p>No hay pedidos recientes</p>
                </div>
            `;
        } else {
            this.pedidos.slice(0, 5).forEach(pedido => {
                html += `
                    <div class="order-item">
                        <div class="order-status status-${pedido.estado}"></div>
                        <div class="order-info">
                            <div class="order-id">Pedido #${pedido.id.substring(0, 8)}</div>
                            <div class="order-customer">${pedido.usuarioEmail}</div>
                        </div>
                        <div class="order-amount">${formatCRC((pedido.totalCRC ?? pedido.total)?.toFixed(2) || '0.00')}</div>
                    </div>
                `;
            });
        }
        
        container.innerHTML = html;
    },
    
    // Mostrar usuarios
    mostrarUsuarios: function() {
        const container = document.getElementById('page-usuarios');
        if (!container) return;
        
        let html = `
            <div class="page-header">
                <h2>Gestión de Usuarios</h2>
                <p>Administra los usuarios de la plataforma</p>
            </div>
            
            <div class="admin-table-container">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Email</th>
                            <th>Nombre</th>
                            <th>Rol</th>
                            <th>Registro</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        if (this.usuarios.length === 0) {
            html += `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 3rem;">
                        <i class="fas fa-users" style="font-size: 3rem; color: #666; margin-bottom: 1rem;"></i>
                        <p>No hay usuarios registrados</p>
                    </td>
                </tr>
            `;
        } else {
            this.usuarios.forEach(usuario => {
                html += `
                    <tr>
                        <td>${usuario.id.substring(0, 8)}...</td>
                        <td>${usuario.email}</td>
                        <td>${usuario.nombre || 'No especificado'}</td>
                        <td>
                            <span class="badge ${usuario.rol === 'admin' ? 'badge-warning' : 'badge'}">
                                ${usuario.rol || 'cliente'}
                            </span>
                        </td>
                        <td>${usuario.fechaRegistro ? new Date(usuario.fechaRegistro).toLocaleDateString('es-ES') : 'N/A'}</td>
                        <td>
                            <span class="badge ${usuario.estado === 'active' ? 'badge-success' : 'badge-danger'}">
                                ${usuario.estado || 'inactive'}
                            </span>
                        </td>
                        <td>
                            <button class="btn-action btn-edit" onclick="AdminSystem.editarUsuario('${usuario.id}')">
                                <i class="fas fa-edit"></i> Editar
                            </button>
                        </td>
                    </tr>
                `;
            });
        }
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        container.innerHTML = html;
    },
    
    // Mostrar ventas
    mostrarVentas: function() {
        const container = document.getElementById('page-ventas');
        if (!container) return;
        
        let html = `
            <div class="page-header">
                <h2>Reportes de Ventas</h2>
                <p>Análisis y reportes de ventas</p>
            </div>
            
            <div class="sales-filters">
                <div class="filter-row">
                    <div class="form-group">
                        <label>Desde:</label>
                        <input type="date" id="fecha-desde" value="${this.getDateOneMonthAgo()}">
                    </div>
                    <div class="form-group">
                        <label>Hasta:</label>
                        <input type="date" id="fecha-hasta" value="${this.getTodayDate()}">
                    </div>
                    <button class="btn btn-primary" onclick="AdminSystem.generarReporteVentas()">
                        <i class="fas fa-chart-bar"></i> Generar Reporte
                    </button>
                </div>
            </div>
            
            <div class="sales-report-container">
                <div class="loading-report">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Selecciona un rango de fechas para generar el reporte</p>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
    },
    
    // (Configuración eliminada por solicitud)
    
    // Funciones auxiliares para fechas
    getTodayDate: function() {
        return new Date().toISOString().split('T')[0];
    },
    
    getDateOneMonthAgo: function() {
        const date = new Date();
        date.setMonth(date.getMonth() - 1);
        return date.toISOString().split('T')[0];
    },
    
    // Actualizar UI del usuario
    actualizarUIUsuario: function(user) {
        const usernameElement = document.getElementById('admin-username');
        if (usernameElement && user.email) {
            usernameElement.textContent = user.email.split('@')[0];
        }
    },
    
    // Configurar eventos
    configurarEventos: function() {
        // Menú de navegación
        document.querySelectorAll('.menu-item a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = e.target.closest('a').dataset.page;
                this.mostrarPagina(page);
                
                // Cerrar sidebar en móvil al clickear una opción
                const sidebar = document.querySelector('.admin-sidebar');
                if (sidebar && window.innerWidth <= 768) {
                    sidebar.classList.remove('active');
                }
            });
        });
        
        // Toggle menú móvil
        const menuToggle = document.getElementById('admin-menu-toggle');
        const sidebar = document.querySelector('.admin-sidebar');
        
        if (menuToggle && sidebar) {
            menuToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                sidebar.classList.toggle('active');
            });
            
            // Cerrar sidebar cuando se clickea fuera
            document.addEventListener('click', (e) => {
                if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
                    if (sidebar.classList.contains('active')) {
                        sidebar.classList.remove('active');
                    }
                }
            });
            
            // Cerrar sidebar al cambiar tamaño de pantalla
            window.addEventListener('resize', () => {
                if (window.innerWidth > 768 && sidebar.classList.contains('active')) {
                    sidebar.classList.remove('active');
                }
            });
        }
        
        // Cerrar sesión
        const logoutBtn = document.getElementById('admin-logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.cerrarSesion();
            });
        }
        
        // Cerrar modal al hacer clic fuera
        const modalOverlay = document.getElementById('modal-overlay');
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) {
                    this.cerrarModal();
                }
            });
        }
    },
    
    // Cerrar sesión
    cerrarSesion: async function() {
        try {
            await auth.signOut();
            window.location.href = '../index.html';
        } catch (error) {
            console.error('❌ Error cerrando sesión:', error);
        }
    },
    
    // Funciones de modal
    abrirModal: function(titulo, contenido) {
        const modal = document.getElementById('modal-overlay');
        const modalContainer = document.getElementById('modal-container');
        
        modalContainer.innerHTML = `
            <div class="modal-header">
                <h2>${titulo}</h2>
                <button class="modal-close" onclick="AdminSystem.cerrarModal()">&times;</button>
            </div>
            <div class="modal-body">
                ${contenido}
            </div>
        `;
        
        modal.classList.add('active');
    },
    
    cerrarModal: function() {
        const modal = document.getElementById('modal-overlay');
        modal.classList.remove('active');
    },
    
    
    // =========================
    // Upload de imágenes (Cloudinary)
    // =========================
    setupProductImageUploader: function(existingUrl = '') {
        const dz = document.getElementById('producto-imagen-dropzone');
        const fileInput = document.getElementById('producto-imagen-file');
        const nameEl = document.getElementById('producto-imagen-nombre');
        const statusEl = document.getElementById('producto-imagen-estado');
        const preview = document.getElementById('producto-imagen-preview');
        // Ya no usamos input de URL; guardamos en memoria
        if (!dz || !fileInput) return;
        this._productImageUrl = existingUrl || '';
        this._productImageUploading = false;

        // Si hay imagen previa, mostrarla
        if (existingUrl) {
            try {
                preview.src = existingUrl;
                preview.style.display = 'block';
                nameEl.textContent = 'Imagen actual cargada';
            } catch (e) {}
        }

        const pick = () => fileInput.click();
        dz.addEventListener('click', pick);

        dz.addEventListener('dragover', (e) => {
            e.preventDefault();
            dz.style.opacity = '0.85';
        });

        dz.addEventListener('dragleave', () => {
            dz.style.opacity = '1';
        });

        dz.addEventListener('drop', async (e) => {
            e.preventDefault();
            dz.style.opacity = '1';
            const file = e.dataTransfer.files && e.dataTransfer.files[0];
            if (file) await this._handleProductImageFile(file, { nameEl, statusEl, preview });
        });

        fileInput.addEventListener('change', async () => {
            const file = fileInput.files && fileInput.files[0];
            if (file) await this._handleProductImageFile(file, { nameEl, statusEl, preview });
        });
    },

    // Cargar subcategorías en el select según categoría
    setupSubcategoriaSelect: function(selectedSlug = '') {
        const catSel = document.getElementById('producto-categoria');
        const subSel = document.getElementById('producto-subcategoria');
        if (!catSel || !subSel) return;

        const norm = (v) => (v || '').toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');

        const render = () => {
            const cat = norm(catSel.value);
            const subcats = (this.subcategorias || [])
                .filter(sc => norm(sc.categoria) === cat)
                .filter(sc => norm(sc.estado || 'active') !== 'inactive')
                .sort((a,b) => (a.nombre || '').localeCompare(b.nombre || ''));

            subSel.innerHTML = '<option value="">(Opcional)</option>';
            subcats.forEach(sc => {
                const slug = sc.slug || norm(sc.nombre) || '';
                const opt = document.createElement('option');
                opt.value = slug;
                opt.textContent = sc.nombre || slug;
                if (norm(selectedSlug) === norm(slug)) opt.selected = true;
                subSel.appendChild(opt);
            });
        };

        catSel.addEventListener('change', () => {
            selectedSlug = '';
            render();
        });

        render();
    },

    _handleProductImageFile: async function(file, { nameEl, statusEl, preview }) {
        try {
            if (!file.type || !file.type.startsWith('image/')) {
                alert('Eso no es una imagen 😅');
                return;
            }

            const maxMB = 4;
            if (file.size > maxMB * 1024 * 1024) {
                alert(`La imagen pesa mucho. Máximo ${maxMB}MB.`);
                return;
            }

            nameEl.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;

            // preview
            try {
                const tmpUrl = URL.createObjectURL(file);
                preview.src = tmpUrl;
                preview.style.display = 'block';
            } catch (_) {}
            // Subida real (Cloudinary)
            statusEl.textContent = 'Subiendo imagen...';
            this._productImageUrl = '';
            this._productImageUploading = true;
            const downloadUrl = await this.subirImagenProducto(file);
            this._productImageUrl = downloadUrl;
            this._productImageUploading = false;
            statusEl.textContent = '✅ Imagen subida';
        } catch (err) {
            console.error('Error subiendo imagen:', err);
            statusEl.textContent = '❌ No se pudo subir la imagen';
            this._productImageUploading = false;
            const code = err?.code || err?.name || 'error';
            const msg = err?.message ? ` - ${err.message}` : '';
            alert(`No se pudo subir la imagen (${code})${msg}

Tips rápidos:
- Verificá que el upload preset de Cloudinary sea **unsigned** y se llame "images"
- En Cloudinary → Settings → Upload, habilitá unsigned uploads para ese preset
- Probá con una imagen < 4MB (JPG/PNG/WebP)`);
            console.error('Cloudinary upload error:', err);
        }
    },

    subirImagenProducto: async function(file) {
        // ✅ Cloudinary unsigned upload (no Firebase Storage)
        const CLOUD_NAME = 'dsxuvmpfm';
        const UPLOAD_PRESET = 'images'; // tu upload preset

        const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', UPLOAD_PRESET);
        // Opcional: guardar en carpeta "products" dentro de Cloudinary
        formData.append('folder', 'products');

        const res = await fetch(endpoint, {
            method: 'POST',
            body: formData
        });

        let data;
        try { data = await res.json(); } catch (_) { data = null; }

        if (!res.ok) {
            const message = (data && (data.error?.message || data.error)) || `HTTP ${res.status}`;
            const e = new Error(message);
            e.code = 'cloudinary-upload-failed';
            throw e;
        }

        const url = data.secure_url || data.url;
        if (!url) {
            const e = new Error('Cloudinary no devolvió la URL de la imagen');
            e.code = 'cloudinary-no-url';
            throw e;
        }

        return url;
    },

// Funciones específicas de productos
    abrirModalProducto: function(productoId = null) {
        const producto = productoId ? 
            this.productos.find(p => p.id === productoId) : null;
        
        const norm = (v) => (v || '').toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');

        let categoriasOptions = '';
        this.categorias
            .filter(c => (c.estado || 'active') !== 'inactive')
            .forEach(cat => {
                const slug = cat.slug || cat.id;
                const selected = norm(producto?.categoria) === norm(slug) ? 'selected' : '';
                categoriasOptions += `<option value="${slug}" ${selected}>${cat.nombre || slug}</option>`;
            });

        // Subcategorías (se llenan luego según categoría)
        const subcatValue = norm(producto?.subcategoria || '');
        
        const contenido = `
            <form class="admin-form" onsubmit="return AdminSystem.guardarProducto(event, '${productoId || 'nuevo'}')">
                <div class="form-group">
                    <label>Nombre del Producto</label>
                    <input type="text" id="producto-nombre" value="${producto?.nombre || ''}" required>
                </div>
                <div class="form-group">
                    <label>Descripción</label>
                    <textarea id="producto-descripcion" rows="3">${producto?.descripcion || ''}</textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Precio (₡)</label>
                        <input type="number" id="producto-precio" step="0.01" min="0" value="${producto?.precio || 0}" required>
                        <small style="opacity:.85; display:block; margin-top:6px;">Este es el precio base (sin descuento).</small>
                    </div>
                    <div class="form-group">
                        <label>Stock</label>
                        <input type="number" id="producto-stock" min="0" value="${producto?.stock || 0}" required>
                    </div>
                    <div class="form-group">
                        <label>Descuento (%)</label>
                        <input type="number" id="producto-descuento" step="1" min="0" max="90" value="${producto?.descuento || 0}">
                        <small style="opacity:.85; display:block; margin-top:6px;">0 = sin descuento. Ej: 15 = -15%.</small>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Categoría</label>
                        <select id="producto-categoria" required>
                            <option value="">Seleccionar categoría</option>
                            ${categoriasOptions}
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Subcategoría</label>
                        <select id="producto-subcategoria">
                            <option value="">(Opcional)</option>
                        </select>
                        <small style="opacity:.85; display:block; margin-top:6px;">En Perfumería: Hombre/Mujer/Unisex. En SexShop: tus categorías.</small>
                    </div>
                    <div class="form-group">
                        <label>Estado</label>
                        <select id="producto-estado">
                            <option value="active" ${producto?.estado === 'active' ? 'selected' : ''}>Activo</option>
                            <option value="inactive" ${producto?.estado === 'inactive' ? 'selected' : ''}>Inactivo</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Imagen del Producto</label>

                    <!-- Drag & drop / seleccionar archivo -->
                    <div id="producto-imagen-dropzone" style="border: 2px dashed #ccc; padding: 12px; border-radius: 8px; cursor: pointer;">
                        <p style="margin:0;">Arrastrá la imagen aquí o clic para elegir</p>
                        <small id="producto-imagen-nombre" style="display:block; margin-top:6px; opacity:.85;"></small>
                        <small id="producto-imagen-estado" style="display:block; margin-top:6px; opacity:.85;"></small>
                    </div>

                    <input id="producto-imagen-file" type="file" accept="image/*" style="display:none;" />

                    <!-- Preview (opcional) -->
                    <img id="producto-imagen-preview" alt="" style="display:none; margin-top:10px; max-width:160px; border-radius:8px;" />
<div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="AdminSystem.cerrarModal()">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Guardar Producto</button>
                </div>
            </form>
        `;
        
        this.abrirModal(productoId ? 'Editar Producto' : 'Nuevo Producto', contenido);
    
        // Activar drag&drop de imagen + cargar subcategorías
        setTimeout(() => {
            AdminSystem.setupProductImageUploader(producto?.imagen || '');
            AdminSystem.setupSubcategoriaSelect(subcatValue);
        }, 0);
},
    
    guardarProducto: async function(e, productoId) {
        e.preventDefault();
        
        try {
            const productoData = {
                nombre: document.getElementById('producto-nombre').value,
                descripcion: document.getElementById('producto-descripcion').value,
                precio: parseFloat(document.getElementById('producto-precio').value),
                descuento: Math.max(0, Math.min(90, parseFloat(document.getElementById('producto-descuento')?.value || 0) || 0)),
                stock: parseInt(document.getElementById('producto-stock').value),
                categoria: document.getElementById('producto-categoria').value,
                subcategoria: (document.getElementById('producto-subcategoria')?.value || ''),
                estado: document.getElementById('producto-estado').value,
                imagen: this._productImageUrl,
                fechaActualizacion: new Date().toISOString()
            };

            if (this._productImageUploading) {
                alert('Aguantá un toque: la imagen todavía se está subiendo.');
                return false;
            }

            if (!productoData.imagen) {
                alert('Subí una imagen (arrastrándola o eligiéndola) antes de guardar.');
                return false;
            }

            
            if (productoId === 'nuevo') {
                productoData.fechaCreacion = new Date().toISOString();
                await db.collection('productos').add(productoData);
                this.mostrarNotificacion('Producto creado exitosamente', 'success');
            } else {
                await db.collection('productos').doc(productoId).update(productoData);
                this.mostrarNotificacion('Producto actualizado exitosamente', 'success');
            }
            
            this.cerrarModal();
            await this.cargarDatosIniciales();
            await this.actualizarEstadisticas();
            this.mostrarPagina('productos');
            
        } catch (error) {
            console.error('❌ Error guardando producto:', error);
            this.mostrarNotificacion('Error al guardar el producto', 'error');
        }
    },
    
    editarProducto: function(productoId) {
        this.abrirModalProducto(productoId);
    },
    
    eliminarProducto: async function(productoId) {
        if (confirm('¿Estás seguro de eliminar este producto? Esta acción no se puede deshacer.')) {
            try {
                await db.collection('productos').doc(productoId).delete();
                this.mostrarNotificacion('Producto eliminado exitosamente', 'success');
                await this.cargarDatosIniciales();
                await this.actualizarEstadisticas();
                this.mostrarPagina('productos');
            } catch (error) {
                console.error('❌ Error eliminando producto:', error);
                this.mostrarNotificacion('Error al eliminar el producto', 'error');
            }
        }
    },

    // ===== Subcategorías =====
    abrirModalSubcategoria: function(subcategoriaId = null) {
        const sc = subcategoriaId ? (this.subcategorias || []).find(s => s.id === subcategoriaId) : null;

        const categoriasOptions = (this.categorias || [])
            .filter(c => (c.slug || c.id) === 'perfumeria' || (c.slug || c.id) === 'sexshop')
            .map(c => {
                const slug = c.slug || c.id;
                const selected = (sc?.categoria || '') === slug ? 'selected' : '';
                return `<option value="${slug}" ${selected}>${c.nombre || slug}</option>`;
            }).join('');

        const contenido = `
            <form class="admin-form" onsubmit="return AdminSystem.guardarSubcategoria(event, '${subcategoriaId || 'nuevo'}')">
                <div class="form-group">
                    <label>Categoría principal</label>
                    <select id="subcat-categoria" required>
                        <option value="">Seleccionar...</option>
                        ${categoriasOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label>Nombre de la subcategoría</label>
                    <input type="text" id="subcat-nombre" value="${sc?.nombre || ''}" required>
                    <small style="opacity:.85; display:block; margin-top:6px;">Ej: Hombre, Mujer, Lubricantes, etc.</small>
                </div>
                <div class="form-group">
                    <label>Estado</label>
                    <select id="subcat-estado">
                        <option value="active" ${(sc?.estado || 'active') === 'active' ? 'selected' : ''}>Activa</option>
                        <option value="inactive" ${sc?.estado === 'inactive' ? 'selected' : ''}>Inactiva</option>
                    </select>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="AdminSystem.cerrarModal()">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        `;

        this.abrirModal(subcategoriaId ? 'Editar Subcategoría' : 'Nueva Subcategoría', contenido);
    },

    guardarSubcategoria: async function(e, subcategoriaId) {
        e.preventDefault();
        try {
            const cat = document.getElementById('subcat-categoria').value;
            const nombre = document.getElementById('subcat-nombre').value.trim();
            const estado = document.getElementById('subcat-estado').value;
            const slug = nombre
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\s+/g, '')
                .replace(/[^a-z0-9]/g, '');

            const data = {
                categoria: cat,
                nombre,
                slug,
                estado,
                fechaActualizacion: new Date().toISOString()
            };

            if (subcategoriaId === 'nuevo') {
                data.fechaCreacion = new Date().toISOString();
                await db.collection('subcategorias').add(data);
                this.mostrarNotificacion('Subcategoría creada', 'success');
            } else {
                await db.collection('subcategorias').doc(subcategoriaId).update(data);
                this.mostrarNotificacion('Subcategoría actualizada', 'success');
            }

            this.cerrarModal();
            await this.cargarDatosIniciales();
            this.mostrarPagina('categorias');
        } catch (error) {
            console.error('❌ Error guardando subcategoría:', error);
            this.mostrarNotificacion('Error al guardar la subcategoría', 'error');
        }
    },

    toggleSubcategoria: async function(subcategoriaId) {
        try {
            const sc = (this.subcategorias || []).find(s => s.id === subcategoriaId);
            if (!sc) return;
            const nuevo = (sc.estado || 'active') === 'active' ? 'inactive' : 'active';
            await db.collection('subcategorias').doc(subcategoriaId).update({ estado: nuevo, fechaActualizacion: new Date().toISOString() });
            this.mostrarNotificacion(`Subcategoría ${nuevo === 'active' ? 'activada' : 'desactivada'}`, 'success');
            await this.cargarDatosIniciales();
            this.mostrarPagina('categorias');
        } catch (error) {
            console.error('❌ Error cambiando estado subcategoría:', error);
            this.mostrarNotificacion('Error al actualizar estado', 'error');
        }
    },
    
    // Funciones para categorías (similares a productos)
    abrirModalCategoria: function(categoriaId = null) {
        const categoria = categoriaId ? 
            this.categorias.find(c => c.id === categoriaId) : null;
        
        const contenido = `
            <form class="admin-form" onsubmit="return AdminSystem.guardarCategoria(event, '${categoriaId || 'nuevo'}')">
                <div class="form-group">
                    <label>Nombre de la Categoría</label>
                    <input type="text" id="categoria-nombre" value="${categoria?.nombre || ''}" required>
                </div>
                <div class="form-group">
                    <label>Descripción</label>
                    <textarea id="categoria-descripcion" rows="3">${categoria?.descripcion || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>Estado</label>
                    <select id="categoria-estado">
                        <option value="active" ${categoria?.estado === 'active' ? 'selected' : ''}>Activa</option>
                        <option value="inactive" ${categoria?.estado === 'inactive' ? 'selected' : ''}>Inactiva</option>
                    </select>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="AdminSystem.cerrarModal()">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Guardar Categoría</button>
                </div>
            </form>
        `;
        
        this.abrirModal(categoriaId ? 'Editar Categoría' : 'Nueva Categoría', contenido);
    },
    
    guardarCategoria: async function(e, categoriaId) {
        e.preventDefault();
        
        try {
            const categoriaData = {
                nombre: document.getElementById('categoria-nombre').value,
                descripcion: document.getElementById('categoria-descripcion').value,
                estado: document.getElementById('categoria-estado').value,
                fechaActualizacion: new Date().toISOString()
            };
            
            if (categoriaId === 'nuevo') {
                categoriaData.fechaCreacion = new Date().toISOString();
                await db.collection('categorias').add(categoriaData);
                this.mostrarNotificacion('Categoría creada exitosamente', 'success');
            } else {
                await db.collection('categorias').doc(categoriaId).update(categoriaData);
                this.mostrarNotificacion('Categoría actualizada exitosamente', 'success');
            }
            
            this.cerrarModal();
            await this.cargarDatosIniciales();
            await this.actualizarEstadisticas();
            this.mostrarPagina('categorias');
            
        } catch (error) {
            console.error('❌ Error guardando categoría:', error);
            this.mostrarNotificacion('Error al guardar la categoría', 'error');
        }
    },
    
    editarCategoria: function(categoriaId) {
        this.abrirModalCategoria(categoriaId);
    },
    
    eliminarCategoria: async function(categoriaId) {
        if (confirm('¿Estás seguro de eliminar esta categoría? Los productos asociados quedarán sin categoría.')) {
            try {
                await db.collection('categorias').doc(categoriaId).delete();
                this.mostrarNotificacion('Categoría eliminada exitosamente', 'success');
                await this.cargarDatosIniciales();
                await this.actualizarEstadisticas();
                this.mostrarPagina('categorias');
            } catch (error) {
                console.error('❌ Error eliminando categoría:', error);
                this.mostrarNotificacion('Error al eliminar la categoría', 'error');
            }
        }
    },
    
    // Funciones para pedidos
    actualizarEstadoPedido: async function(pedidoId, nuevoEstado) {
        try {
            await db.collection('pedidos').doc(pedidoId).update({
                estado: nuevoEstado,
                fechaActualizacion: new Date().toISOString()
            });
            
            this.mostrarNotificacion(`Estado del pedido actualizado a: ${this.estadoPedidoLabel(nuevoEstado)}`, 'success');
            await this.cargarDatosIniciales();
            this.mostrarPedidos();
            
        } catch (error) {
            console.error('❌ Error actualizando estado del pedido:', error);
            this.mostrarNotificacion('Error al actualizar el estado', 'error');
        }
    },
    
    verDetallePedido: async function(pedidoId) {
        try {
            const pedidoDoc = await db.collection('pedidos').doc(pedidoId).get();
            if (!pedidoDoc.exists) return;
            
            const pedido = pedidoDoc.data();
            
            let productosHTML = '';
            if (pedido.items && Array.isArray(pedido.items)) {
                pedido.items.forEach(item => {
                    productosHTML += `
                        <div class="order-detail-item">
                            <img src="${item.imagen}" alt="${item.nombre}" style="width: 50px; height: 50px; object-fit: cover;">
                            <div>
                                <strong>${item.nombre}</strong>
                                <p>Cantidad: ${item.cantidad} x ${formatCRC(item.precio?.toFixed(2) || '0.00')}</p>
                            </div>
                            <span>${formatCRC((item.precio * item.cantidad).toFixed(2))}</span>
                        </div>
                    `;
                });
            }
            
            const contenido = `
                <div class="order-details">
                    <div class="detail-section">
                        <h3>Información del Pedido</h3>
                        <p><strong>ID:</strong> ${pedidoId}</p>
                        <p><strong>Fecha:</strong> ${new Date(pedido.fecha).toLocaleString('es-ES')}</p>
                        <p><strong>Estado:</strong> <span class="badge">${pedido.estado}</span></p>
                        <p><strong>Total:</strong> ${formatCRC((pedido.totalCRC ?? pedido.total)?.toFixed(2) || '0.00')}</p>
                        <p><strong>Método de Pago:</strong> ${pedido.metodoPago}</p>
                    </div>
                    
                    <div class="detail-section">
                        <h3>Productos</h3>
                        ${productosHTML || '<p>No hay productos</p>'}
                    </div>
                    
                    ${pedido.shipping ? `
                    <div class="detail-section">
                        <h3>Información de Envío</h3>
                        <p><strong>Nombre:</strong> ${pedido.shipping.nombre}</p>
                        <p><strong>Dirección:</strong> ${pedido.shipping.direccion}</p>
                        <p><strong>Ciudad:</strong> ${pedido.shipping.ciudad}</p>
                        <p><strong>Código Postal:</strong> ${pedido.shipping.codigoPostal}</p>
                        <p><strong>Teléfono:</strong> ${pedido.shipping.telefono}</p>
                    </div>
                    ` : ''}
                </div>
            `;
            
            this.abrirModal(`Detalle del Pedido #${pedidoId.substring(0, 8)}`, contenido);
            
        } catch (error) {
            console.error('❌ Error cargando detalle del pedido:', error);
            this.mostrarNotificacion('Error al cargar el detalle del pedido', 'error');
        }
    },
    
    filtrarPedidos: async function(estado) {
        try {
            let query = db.collection('pedidos').orderBy('fecha', 'desc');
            
            if (estado !== 'all') {
                query = query.where('estado', '==', estado);
            }
            
            const snapshot = await query.limit(50).get();
            this.pedidos = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            this.mostrarPedidos();
            
        } catch (error) {
            console.error('❌ Error filtrando pedidos:', error);
        }
    },
    
    // Funciones para usuarios
    editarUsuario: async function(usuarioId) {
        try {
            const usuarioDoc = await db.collection('usuarios').doc(usuarioId).get();
            if (!usuarioDoc.exists) return;
            
            const usuario = usuarioDoc.data();
            
            const contenido = `
                <form class="admin-form" onsubmit="return AdminSystem.guardarUsuario(event, '${usuarioId}')">
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" id="usuario-email" value="${usuario.email}" readonly>
                    </div>
                    <div class="form-group">
                        <label>Nombre</label>
                        <input type="text" id="usuario-nombre" value="${usuario.nombre || ''}">
                    </div>
                    <div class="form-group">
                        <label>Rol</label>
                        <select id="usuario-rol">
                            <option value="cliente" ${usuario.rol === 'cliente' ? 'selected' : ''}>Cliente</option>
                            <option value="admin" ${usuario.rol === 'admin' ? 'selected' : ''}>Administrador</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Estado</label>
                        <select id="usuario-estado">
                            <option value="active" ${usuario.estado === 'active' ? 'selected' : ''}>Activo</option>
                            <option value="inactive" ${usuario.estado === 'inactive' ? 'selected' : ''}>Inactivo</option>
                        </select>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="AdminSystem.cerrarModal()">Cancelar</button>
                        <button type="submit" class="btn btn-primary">Guardar Cambios</button>
                    </div>
                </form>
            `;
            
            this.abrirModal('Editar Usuario', contenido);
            
        } catch (error) {
            console.error('❌ Error cargando usuario:', error);
        }
    },
    
    guardarUsuario: async function(e, usuarioId) {
        e.preventDefault();
        
        try {
            const usuarioData = {
                nombre: document.getElementById('usuario-nombre').value,
                rol: document.getElementById('usuario-rol').value,
                estado: document.getElementById('usuario-estado').value,
                fechaActualizacion: new Date().toISOString()
            };
            
            await db.collection('usuarios').doc(usuarioId).update(usuarioData);
            
            this.mostrarNotificacion('Usuario actualizado exitosamente', 'success');
            this.cerrarModal();
            await this.cargarDatosIniciales();
            this.mostrarPagina('usuarios');
            
        } catch (error) {
            console.error('❌ Error actualizando usuario:', error);
            this.mostrarNotificacion('Error al actualizar el usuario', 'error');
        }
    },
    
    // Funciones para ventas
    generarReporteVentas: async function() {
        const fechaDesde = document.getElementById('fecha-desde').value;
        const fechaHasta = document.getElementById('fecha-hasta').value;
        
        if (!fechaDesde || !fechaHasta) {
            this.mostrarNotificacion('Selecciona ambas fechas', 'warning');
            return;
        }
        
        try {
            const desde = new Date(fechaDesde);
            const hasta = new Date(fechaHasta);
            hasta.setHours(23, 59, 59, 999);
            
            const pedidosSnap = await db.collection('pedidos')
                .where('fecha', '>=', desde.toISOString())
                .where('fecha', '<=', hasta.toISOString())
                .get();
            
            const pedidos = pedidosSnap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            const ventasPorDia = {}; // key: YYYY-MM-DD
            const topProductos = {}; // key: productoId/nombre
            let totalVentas = 0;
            let totalPedidos = 0;
            
            pedidos.forEach(pedido => {
                const d = new Date(pedido.fecha);
                const isoDay = isNaN(d.getTime()) ? 'N/A' : d.toISOString().slice(0, 10);

                if (!ventasPorDia[isoDay]) ventasPorDia[isoDay] = { ventas: 0, pedidos: 0 };
                ventasPorDia[isoDay].ventas += Number((pedido.totalCRC ?? pedido.total) || 0);
                ventasPorDia[isoDay].pedidos += 1;

                totalVentas += Number((pedido.totalCRC ?? pedido.total) || 0);
                totalPedidos += 1;

                // Top productos
                const items = Array.isArray(pedido.items) ? pedido.items : [];
                items.forEach(it => {
                    const key = String(it.id || it.productoId || it.nombre || 'desconocido');
                    const qty = Math.max(1, parseInt(it.cantidad, 10) || 1);
                    const price = Number(it.precio || 0);
                    if (!topProductos[key]) {
                        topProductos[key] = {
                            id: String(it.id || it.productoId || ''),
                            nombre: it.nombre || key,
                            cantidad: 0,
                            ingresos: 0
                        };
                    }
                    topProductos[key].cantidad += qty;
                    topProductos[key].ingresos += qty * price;
                });
            });

            const diasOrdenados = Object.keys(ventasPorDia)
                .filter(k => k !== 'N/A')
                .sort();

            const topLista = Object.values(topProductos)
                .sort((a, b) => b.cantidad - a.cantidad)
                .slice(0, 10);
            
            // Generar HTML del reporte
            let reporteHTML = `
                <div class="sales-summary">
                    <div class="summary-card">
                        <h3>${formatCRC(totalVentas)}</h3>
                        <p>Ventas Totales</p>
                    </div>
                    <div class="summary-card">
                        <h3>${totalPedidos}</h3>
                        <p>Pedidos Totales</p>
                    </div>
                    <div class="summary-card">
                        <h3>${formatCRC((totalVentas / totalPedidos || 0).toFixed(2))}</h3>
                        <p>Ticket Promedio</p>
                    </div>
                </div>
                
                <div class="sales-table-container">
                    <h3>Ventas por Día</h3>
                    <table class="sales-table">
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Pedidos</th>
                                <th>Ventas</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            diasOrdenados.forEach(isoDay => {
                const fecha = new Date(isoDay + 'T00:00:00Z').toLocaleDateString('es-ES');
                reporteHTML += `
                    <tr>
                        <td>${fecha}</td>
                        <td>${ventasPorDia[isoDay].pedidos}</td>
                        <td>${formatCRC(ventasPorDia[isoDay].ventas.toFixed(2))}</td>
                    </tr>
                `;
            });
            
            reporteHTML += `
                        </tbody>
                    </table>
                </div>
                
                <div class="sales-table-container" style="margin-top: 1rem;">
                    <h3>Top productos (por cantidad)</h3>
                    <table class="sales-table">
                        <thead>
                            <tr>
                                <th>Producto</th>
                                <th>Cantidad</th>
                                <th>Ingresos</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${topLista.length ? topLista.map(p => `
                                <tr>
                                    <td>${p.nombre}</td>
                                    <td>${p.cantidad}</td>
                                    <td>${formatCRC(p.ingresos)}</td>
                                </tr>
                            `).join('') : `
                                <tr><td colspan="3" style="text-align:center; opacity:.8; padding: 1rem;">Sin datos</td></tr>
                            `}
                        </tbody>
                    </table>
                </div>

                <div class="report-actions">
                    <button class="btn btn-primary" onclick="AdminSystem.exportarReporte()">
                        <i class="fas fa-file-export"></i> Exportar Reporte (JSON)
                    </button>
                </div>
            `;

            // Guardar para exportar
            this._lastSalesReport = {
                rango: { desde: fechaDesde, hasta: fechaHasta },
                resumen: {
                    totalVentas: Number(totalVentas.toFixed(2)),
                    totalPedidos,
                    ticketPromedio: Number(((totalVentas / totalPedidos) || 0).toFixed(2))
                },
                ventasPorDia,
                topProductos: topLista,
                pedidos: pedidos.map(p => ({
                    id: p.id,
                    fecha: p.fecha,
                    total: (p.totalCRC ?? p.total),
                    email: p.email || null,
                    estado: p.estado || null,
                    items: p.items || []
                }))
            };
            
            document.querySelector('.sales-report-container').innerHTML = reporteHTML;
            
        } catch (error) {
            console.error('❌ Error generando reporte:', error);
            this.mostrarNotificacion('Error al generar el reporte', 'error');
        }
    },
    
    // (Configuración eliminada por solicitud)
    
    // Exportar datos
    exportarProductos: function() {
        const productosJSON = JSON.stringify(this.productos, null, 2);
        this.descargarJSON(productosJSON, 'productos.json');
    },
    
    exportarReporte: function() {
        if (!this._lastSalesReport) {
            this.mostrarNotificacion('Primero generá un reporte', 'warning');
            return;
        }
        const reporteJSON = JSON.stringify(this._lastSalesReport, null, 2);
        this.descargarJSON(reporteJSON, 'reporte-ventas.json');
    },
    
    descargarJSON: function(data, filename) {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },
    
    // Notificaciones
    mostrarNotificacion: function(mensaje, tipo = 'info') {
        // Crear elemento de notificación
        const notification = document.createElement('div');
        notification.className = `admin-notification notification-${tipo}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${tipo === 'success' ? 'check-circle' : tipo === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                <span>${mensaje}</span>
            </div>
            <button class="notification-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        // Estilos
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${tipo === 'success' ? '#2ecc71' : tipo === 'error' ? '#e74c3c' : '#3498db'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            display: flex;
            align-items: center;
            gap: 1rem;
            z-index: 9999;
            animation: slideIn 0.3s ease;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            min-width: 300px;
        `;
        
        document.body.appendChild(notification);
        
        // Auto eliminar después de 5 segundos
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
    },
    
    mostrarError: function(mensaje) {
        this.mostrarNotificacion(mensaje, 'error');
    }
};

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname.includes('/admin/')) {
        AdminSystem.init();
    }
});

// Exportar para uso global
window.AdminSystem = AdminSystem;
window.admin = AdminSystem; // Alias
