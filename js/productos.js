/**
 * SISTEMA DE PRODUCTOS - F&Z STORE
 * Gestión de productos, carrusel y filtros
 */

const ProductosSystem = {
        // Evita inicializar dos veces por página
    _initialized: false,
    // Callback del auto-slide para reiniciar correctamente
    _autoSlideCallback: null,
// Estado
    productos: [],
    productosFiltrados: [],
    categoriaActual: '',
    // Mapas desde Firestore
    categoriasMap: {},          // {catId: {id,nombre,slug}}
    categoriaSlugById: {},      // {catId: 'perfumeria'|'sexshop'}
    subcategoriasList: [],       // [{categoria,slug,nombre,estado,...}] (desde Firestore)
    // Subcategoría activa (fallback cuando no existe #category-filters en el HTML)
    _activeSubcategoria: 'all',
    currentSlide: 0,
    carruselInterval: null,
    
    // Inicializar
    init: function() {
        console.log('📦 Inicializando sistema de productos...');
        
        
        if (this._initialized) {
            console.log('ℹ️ ProductosSystem ya estaba inicializado, evitando doble init');
            return;
        }
        this._initialized = true;
        // Cargar productos según la página
        this.detectarPagina();
        
        // Inicializar carrusel (si existe en la página)
        this.inicializarCarrusel();
        
        // Cargar catálogo (categorías/subcategorías) y luego productos
        this.cargarCatalogo()
            .catch(err => console.warn('⚠️ No se pudo cargar catálogo (categorías):', err))
            .finally(() => this.cargarProductos());
        
        // Configurar eventos
        this.configurarEventos();

        // Extra: en Sex Shop las “subcategorías” son cards. Las hacemos clickeables.
        this.configurarSexshopCategoriasUI();
        
        console.log('✅ ProductosSystem inicializado correctamente');
    },

    // Obtener el contenedor correcto para pintar productos según la página
    getProductsContainer: function() {
        return document.getElementById('products-container') ||
               document.getElementById('sexshop-products') ||
               document.getElementById('featured-products');
    },

    // Normalizar strings (para comparar categorías aunque vengan distintas)
    normalizar: function(v) {
        return (v || '')
            .toString()
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '');
    },

    // Cargar categorías (y sembrar defaults si no existen)
    cargarCatalogo: async function() {
        if (typeof db === 'undefined') return;

        // 1) categorías
        const catSnap = await db.collection('categorias').get();
        const cats = catSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Si no existen, sembramos las 2 base con IDs fijos
        if (cats.length === 0) {
            await db.collection('categorias').doc('perfumeria').set({
                nombre: 'Perfumería',
                slug: 'perfumeria',
                estado: 'active',
                descripcion: 'Fragancias y perfumes'
            }, { merge: true });
            await db.collection('categorias').doc('sexshop').set({
                nombre: 'Sex Shop',
                slug: 'sexshop',
                estado: 'active',
                descripcion: 'Productos íntimos'
            }, { merge: true });
        }

        const catSnap2 = await db.collection('categorias').get();
        catSnap2.forEach(doc => {
            const data = doc.data() || {};
            const nombre = data.nombre || doc.id;
            const slug = data.slug || this.normalizar(nombre);
            this.categoriasMap[doc.id] = { id: doc.id, nombre, slug };
            this.categoriaSlugById[doc.id] = slug;
        });

        // 2) subcategorías (para pintar dinámicamente en Sex Shop)
        try {
            const subSnap = await db.collection('subcategorias').get();
            this.subcategoriasList = subSnap.docs
                .map(d => ({ id: d.id, ...(d.data() || {}) }))
                .filter(sc => (sc.estado || 'active') === 'active');
        } catch (e) {
            console.warn('⚠️ No se pudieron cargar subcategorías:', e);
            this.subcategoriasList = [];
        }

        // Si estamos en Sex Shop, pintamos las subcategorías desde Firestore (incluye las creadas en Admin)
        if (this.categoriaActual === 'sexshop') {
            this.renderizarSexshopSubcategorias();
            // Luego reconectamos eventos de las cards
            this.configurarSexshopCategoriasUI();
        }

    },
    
    // Detectar página actual
    detectarPagina: function() {
        const path = window.location.pathname;
        const bodyClass = document.body.className;
        
        if (path.includes('perfumeria.html') || bodyClass.includes('perfumeria-page')) {
            this.categoriaActual = 'perfumeria';
        } else if (path.includes('sexshop.html') || bodyClass.includes('sexshop-page')) {
            this.categoriaActual = 'sexshop';
        } else {
            this.categoriaActual = '';
        }
        
        console.log('📍 Página detectada:', this.categoriaActual || 'index');
    },
    
    // Inicializar carrusel del index
    inicializarCarrusel: function() {
        const carrusel = document.querySelector('.hero-carousel');
        if (!carrusel) {
            console.log('ℹ️ No hay carrusel en esta página');
            return;
        }
        
        console.log('🎠 Inicializando carrusel...');
        
        const slides = carrusel.querySelectorAll('.carousel-slide');
        const indicators = carrusel.querySelectorAll('.indicator');
        const prevBtn = carrusel.querySelector('#carousel-prev');
        const nextBtn = carrusel.querySelector('#carousel-next');
        
        if (slides.length === 0) {
            console.warn('⚠️ No hay slides en el carrusel');
            return;
        }
        
        // Función para mostrar slide
        const mostrarSlide = (index) => {
            // Validar índice
            if (index < 0) index = slides.length - 1;
            if (index >= slides.length) index = 0;
            
            // Ocultar todos los slides
            slides.forEach(slide => {
                slide.classList.remove('active');
                slide.style.opacity = '0';
            });
            
            // Quitar activo de todos los indicadores
            indicators.forEach(indicator => {
                indicator.classList.remove('active');
            });
            
            // Mostrar slide actual con animación
            slides[index].classList.add('active');
            setTimeout(() => {
                slides[index].style.opacity = '1';
            }, 10);
            
            // Activar indicador actual
            if (indicators[index]) {
                indicators[index].classList.add('active');
            }
            
            this.currentSlide = index;
        };
        
        // Función para siguiente slide
        const siguienteSlide = () => {
            mostrarSlide(this.currentSlide + 1);
        };
        
        // Función para slide anterior
        const anteriorSlide = () => {
            mostrarSlide(this.currentSlide - 1);
        };
        
        // Eventos de botones
        if (prevBtn) {
            prevBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                anteriorSlide();
                this.reiniciarIntervalo();
            });
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                siguienteSlide();
                this.reiniciarIntervalo();
            });
        }
        
        // Eventos de indicadores
        indicators.forEach((indicator, index) => {
            indicator.addEventListener('click', (e) => {
                e.stopPropagation();
                mostrarSlide(index);
                this.reiniciarIntervalo();
            });
        });
        
        // Auto avanzar cada 5 segundos
        this.iniciarAutoSlide(siguienteSlide);
        
        // Pausar al pasar el mouse
        carrusel.addEventListener('mouseenter', () => {
            this.pausarAutoSlide();
        });
        
        carrusel.addEventListener('mouseleave', () => {
            this.reiniciarIntervalo();
        });
        
        // Mostrar primer slide
        mostrarSlide(0);
        
        // Añadir estilos para animación
        this.agregarEstilosCarrusel();
        
        console.log('✅ Carrusel inicializado con', slides.length, 'slides');
    },
    
    // Iniciar auto slide
    iniciarAutoSlide: function(callback) {
        // Guardar referencia para poder reiniciar luego
        this._autoSlideCallback = callback;
        this.carruselInterval = setInterval(callback, 5000);
    },
    
    // Pausar auto slide
    pausarAutoSlide: function() {
        if (this.carruselInterval) {
            clearInterval(this.carruselInterval);
            this.carruselInterval = null;
        }
    },
    
    // Reiniciar intervalo
    reiniciarIntervalo: function() {
        this.pausarAutoSlide();
        if (typeof this._autoSlideCallback === 'function') {
            this.iniciarAutoSlide(this._autoSlideCallback);
        }
    },
    
    // Agregar estilos CSS para el carrusel
    agregarEstilosCarrusel: function() {
        const styles = document.createElement('style');
        styles.textContent = `
            .hero-carousel {
                position: relative;
                overflow: hidden;
                height: 600px;
            }
            
            .carousel-slide {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-size: cover;
                background-position: center;
                opacity: 0;
                transition: opacity 0.8s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .carousel-slide.active {
                opacity: 1;
                z-index: 1;
            }
            
            .carousel-slide::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.3));
                z-index: 0;
            }
            
            .carousel-content {
                position: relative;
                z-index: 2;
                text-align: center;
                color: white;
                max-width: 800px;
                padding: 0 20px;
            }
            
            .carousel-title {
                font-size: 3.5rem;
                font-weight: 700;
                margin-bottom: 20px;
                text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
                animation: fadeInUp 0.8s ease;
            }
            
            .carousel-text {
                font-size: 1.2rem;
                margin-bottom: 30px;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
                animation: fadeInUp 0.8s ease 0.2s both;
            }
            
            .carousel-content .btn {
                animation: fadeInUp 0.8s ease 0.4s both;
            }
            
            .carousel-btn {
                position: absolute;
                top: 50%;
                transform: translateY(-50%);
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: white;
                width: 50px;
                height: 50px;
                border-radius: 50%;
                cursor: pointer;
                z-index: 10;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                transition: all 0.3s ease;
                backdrop-filter: blur(5px);
            }
            
            .carousel-btn:hover {
                background: rgba(255, 255, 255, 0.3);
                transform: translateY(-50%) scale(1.1);
            }
            
            .carousel-btn.prev {
                left: 20px;
            }
            
            .carousel-btn.next {
                right: 20px;
            }
            
            .carousel-indicators {
                position: absolute;
                bottom: 20px;
                left: 0;
                right: 0;
                display: flex;
                justify-content: center;
                gap: 10px;
                z-index: 10;
            }
            
            .indicator {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.5);
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .indicator.active {
                background: white;
                transform: scale(1.2);
            }
            
            .indicator:hover {
                background: rgba(255, 255, 255, 0.8);
            }
            
            @keyframes fadeInUp {
                from {
                    opacity: 0;
                    transform: translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            @media (max-width: 768px) {
                .hero-carousel {
                    height: 400px;
                }
                
                .carousel-title {
                    font-size: 2rem;
                }
                
                .carousel-text {
                    font-size: 1rem;
                }
                
                .carousel-btn {
                    width: 40px;
                    height: 40px;
                    font-size: 16px;
                }
                
                .carousel-btn.prev {
                    left: 10px;
                }
                
                .carousel-btn.next {
                    right: 10px;
                }
            }
        `;
        
        if (!document.querySelector('style[data-carrusel-styles]')) {
            styles.setAttribute('data-carrusel-styles', 'true');
            document.head.appendChild(styles);
        }
    },
    
    // Cargar productos desde Firebase
    // Nota: evitamos queries que requieran índices compuestos.
    cargarProductos: async function() {
        try {
            console.log('🔄 Cargando productos...');
            
            // Mostrar loading
            this.mostrarLoading();
            
            // 1) Traer un lote razonable
            const snapshot = await db.collection('productos').limit(250).get();

            this.productos = [];
            snapshot.forEach(doc => {
                const raw = doc.data() || {};

                // Normalizar estado
                const estadoNorm = this.normalizar(raw.estado);
                const isActive = (estadoNorm === 'active' || estadoNorm === 'activo' || raw.estado === true);

                // Normalizar categoría (puede venir como id de 'categorias' o texto)
                const catRaw = raw.categoria || '';
                const catSlug = this.categoriaSlugById[catRaw] || this.normalizar(catRaw);

                // Filtrar por estado y (si aplica) por página
                if (!isActive) return;
                if (this.categoriaActual && catSlug !== this.categoriaActual) return;

                const producto = {
                    id: doc.id,
                    ...raw,
                    // Guardamos también el slug para filtros/pintado
                    _categoriaSlug: catSlug,
                    _estadoActivo: isActive
                };
                
                // Calcular precio con descuento
                if (producto.descuento && producto.descuento > 0) {
                    producto.precioOriginal = producto.precio;
                    producto.precio = producto.precio * (1 - producto.descuento / 100);
                    producto.tieneDescuento = true;
                }
                
                this.productos.push(producto);
            });

            // Ordenar local (fechaCreacion puede venir como ISO string)
            this.productos.sort((a, b) => {
                const fa = Date.parse(a.fechaCreacion || a.fechaActualizacion || 0) || 0;
                const fb = Date.parse(b.fechaCreacion || b.fechaActualizacion || 0) || 0;
                return fb - fa;
            });

            console.log(`✅ ${this.productos.length} productos cargados`);
            
            // Procesar según la página
            if (this.categoriaActual) {
                this.mostrarProductosPorCategoria();
            } else if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
                this.mostrarProductosDestacados();
            }
            
        } catch (error) {
            console.error('❌ Error cargando productos:', error);
            const code = error?.code || '';
            const extra = code ? ` (Firebase: ${code})` : '';
            this.mostrarError('Error al cargar los productos. Intenta recargar la página.' + extra);
        } finally {
            this.ocultarLoading();
        }
    },
    
    // Mostrar productos destacados (para index.html)
    mostrarProductosDestacados: function() {
        try {
            const container = document.getElementById('featured-products');
            if (!container) return;
            
            // Filtrar productos destacados o tomar los últimos
            let productosDestacados = this.productos.filter(p => p.destacado);
            
            if (productosDestacados.length === 0) {
                productosDestacados = this.productos.slice(0, 8);
            } else if (productosDestacados.length > 8) {
                productosDestacados = productosDestacados.slice(0, 8);
            }
            
            this.productosFiltrados = productosDestacados;
            
            // Mostrar en la página
            this.renderizarProductosGrid(productosDestacados, container);
            
        } catch (error) {
            console.error('❌ Error mostrando productos destacados:', error);
        }
    },
    
    // Mostrar productos por categoría
    mostrarProductosPorCategoria: function() {
        try {
            this.productosFiltrados = this.productos;
            
            // Actualizar contador
            this.actualizarContadorProductos();
            
            // Mostrar productos (Perfumería usa #products-container, Sex Shop usa #sexshop-products)
            const container = this.getProductsContainer();
            if (container) this.renderizarProductosGrid(this.productosFiltrados, container);
            
            // Configurar filtros si existen
            this.configurarFiltros();
            
        } catch (error) {
            console.error('❌ Error mostrando productos por categoría:', error);
        }
    },
    
    // Renderizar grid de productos
    renderizarProductosGrid: function(productos, container) {
        if (!container) return;
        
        if (productos.length === 0) {
            container.innerHTML = `
                <div class="no-products">
                    <div class="no-products-icon">
                        <i class="fas fa-box-open"></i>
                    </div>
                    <h3>No hay productos disponibles</h3>
                    <p>Pronto añadiremos nuevos productos a esta categoría.</p>
                    <a href="index.html" class="btn btn-primary">
                        <i class="fas fa-arrow-left"></i> Volver al inicio
                    </a>
                </div>
            `;
            return;
        }
        
        let html = '';
        
        productos.forEach(producto => {
            const precioOriginal = producto.tieneDescuento ? 
                `<span class="product-price-original">${formatCRC(producto.precioOriginal)}</span>` : '';
            
            const descuentoBadge = producto.tieneDescuento ? 
                `<span class="product-discount">-${producto.descuento}%</span>` : '';
            
            const stockClass = producto.stock <= 5 ? 'low-stock' : producto.stock > 0 ? 'in-stock' : 'out-of-stock';
            // Mostrar stock SIEMPRE (como pediste). Si es bajo, avisamos.
            const stockText = producto.stock > 0
                ? (producto.stock <= 5 ? `Stock: ${producto.stock} (últimas)` : `Stock: ${producto.stock}`)
                : 'Agotado';
            
            const puedeComprar = (Number(producto.stock) || 0) > 0;
            const addOverlayBtn = puedeComprar
                ? `<button class="btn-add-cart" onclick="ProductosSystem.agregarAlCarrito('${producto.id}')">
                        <i class="fas fa-cart-plus"></i> Agregar
                   </button>`
                : `<button class="btn-add-cart" disabled title="Agotado">
                        <i class="fas fa-ban"></i> Agotado
                   </button>`;

            const addMainBtn = puedeComprar
                ? `<button class="btn-add-to-cart" onclick="ProductosSystem.agregarAlCarrito('${producto.id}')">
                        <i class="fas fa-cart-plus"></i> Agregar al Carrito
                   </button>`
                : `<button class="btn-add-to-cart" disabled title="Agotado">
                        <i class="fas fa-ban"></i> Agotado
                   </button>`;

            html += `
                <div class="product-card" data-id="${producto.id}" data-categoria="${producto.categoria}">
                    <div class="product-image">
                        ${descuentoBadge}
                        <img src="${producto.imagen || 'https://via.placeholder.com/300x300'}" 
                             alt="${producto.nombre}"
                             class="product-img"
                             loading="lazy"
                             onerror="this.src='https://via.placeholder.com/300x300'">
                        <div class="product-overlay">
                            <button class="btn-quick-view" onclick="ProductosSystem.mostrarVistaRapida('${producto.id}')">
                                <i class="fas fa-eye"></i> Vista Rápida
                            </button>
                            ${addOverlayBtn}
                        </div>
                    </div>
                    <div class="product-info">
                        <span class="product-category">${this.getCategoriaNombre(producto.categoria)}</span>
                        ${producto.tieneDescuento ? `<span class="product-discount-label"><i class="fas fa-tag"></i> Producto con descuento</span>` : ``}
                        <h3 class="product-name">${producto.nombre}</h3>
                        <p class="product-description">${this.truncarTexto(producto.descripcion || '', 80)}</p>
                        <div class="product-price">
                            ${precioOriginal}
                            <span class="product-current-price">${formatCRC(producto.precio)}</span>
                        </div>
                        <div class="product-meta">
                            <span class="product-stock ${stockClass}">
                                <i class="fas fa-box"></i> ${stockText}
                            </span>
                            ${producto.valoracion ? 
                                `<span class="product-rating">
                                    <i class="fas fa-star"></i> ${producto.valoracion.toFixed(1)}
                                </span>` : ''}
                        </div>
                        ${addMainBtn}
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
        // Añadir efecto hover a las tarjetas
        this.agregarEfectosHover();
    },
    
    // Agregar efectos hover a las tarjetas de producto
    agregarEfectosHover: function() {
        const productCards = document.querySelectorAll('.product-card');
        productCards.forEach(card => {
            card.addEventListener('mouseenter', () => {
                card.style.transform = 'translateY(-5px)';
                card.style.boxShadow = '0 10px 25px rgba(0,0,0,0.15)';
            });
            
            card.addEventListener('mouseleave', () => {
                card.style.transform = 'translateY(0)';
                card.style.boxShadow = '0 5px 15px rgba(0,0,0,0.1)';
            });
        });
    },
    
    // Truncar texto
    truncarTexto: function(texto, maxLength) {
        if (!texto) return '';
        if (texto.length <= maxLength) return texto;
        return texto.substring(0, maxLength) + '...';
    },
    
    // Obtener nombre legible de categoría
    getCategoriaNombre: function(categoria) {
        const categorias = {
            'perfumeria': 'Perfumería',
            'sexshop': 'Sex Shop',
            'cosmetica': 'Cosmética',
            'bienestar': 'Bienestar',
            'hombre': 'Para Hombre',
            'mujer': 'Para Mujer',
            'unisex': 'Unisex'
        };
        return categorias[categoria] || categoria;
    },

    // Formatear nombre bonito desde slug
    formatearNombre: function(slug) {
        const mapa = {
            'hombre': 'Hombre',
            'mujer': 'Mujer',
            'unisex': 'Unisex',
            'juguetes': 'Juguetes',
            'lubricantes': 'Lubricantes',
            'saludsexual': 'Salud Sexual',
            'lenceria': 'Lencería',
            'arosyanillos': 'Aros y Anillos',
            'juegoseroticos': 'Juegos Eróticos'
        };
        if (mapa[slug]) return mapa[slug];

        // Capitalizar con espacios aproximados
        const texto = (slug || '').toString().replace(/[-_]+/g, ' ');
        return texto
            .split(' ')
            .filter(Boolean)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    },
    
    // Agregar producto al carrito
    agregarAlCarrito: async function(productoId) {
        try {
            const producto = this.productos.find(p => p.id === productoId);
            if (!producto) {
                this.mostrarNotificacion('Producto no encontrado', 'error');
                return false;
            }
            
            // Usar el sistema de carrito global
            if (window.Carrito) {
                const resultado = await Carrito.agregarProducto({
                    id: producto.id,
                    nombre: producto.nombre,
                    // precio final (con descuento si aplica)
                    precio: producto.precio,
                    // para mostrar “precio original vs rebajado” en carrito/checkout
                    precioOriginal: producto.tieneDescuento ? (producto.precioOriginal ?? null) : null,
                    descuento: producto.tieneDescuento ? (Number(producto.descuento) || 0) : 0,
                    imagen: producto.imagen || 'https://via.placeholder.com/150',
                    categoria: producto.categoria
                });
                // Nota: el stock SOLO se descuenta cuando se completa la compra.
                return resultado;
            } else {
                this.mostrarNotificacion('Sistema de carrito no disponible', 'error');
                return false;
            }
            
        } catch (error) {
            console.error('❌ Error agregando al carrito:', error);
            this.mostrarNotificacion('Error al agregar al carrito', 'error');
            return false;
        }
    },

    // Actualiza solo el texto de stock en la card (sin re-render completo)
    _refrescarStockCard: function(productoId, nuevoStock) {
        try {
            const card = document.querySelector(`.product-card[data-id="${productoId}"]`);
            if (!card) return;

            const stockEl = card.querySelector('.product-stock');
            if (!stockEl) return;

            // clases
            stockEl.classList.remove('low-stock', 'in-stock', 'out-of-stock');
            let cls = (nuevoStock <= 0) ? 'out-of-stock' : (nuevoStock <= 5 ? 'low-stock' : 'in-stock');
            stockEl.classList.add(cls);

            const txt = (nuevoStock <= 0) ? 'Agotado' : (nuevoStock <= 5 ? `Stock: ${nuevoStock} (últimas)` : `Stock: ${nuevoStock}`);
            stockEl.innerHTML = `<i class="fas fa-box"></i> ${txt}`;

            // si ya se agotó, desactivar botón principal
            const btn = card.querySelector('.btn-add-to-cart');
            if (btn && nuevoStock <= 0) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-ban"></i> Agotado';
            }
        } catch (e) {
            // no romper
        }
    },
    
    // Mostrar vista rápida
    mostrarVistaRapida: function(productoId) {
        const producto = this.productos.find(p => p.id === productoId);
        if (!producto) return;
        
        console.log('🔍 Vista rápida de:', producto.nombre);
        
        // Aquí puedes implementar un modal con más detalles
        // Por ahora solo mostramos una notificación
        this.mostrarNotificacion(`Vista rápida: ${producto.nombre} - ${formatCRC(producto.precio)}`, 'info');
    },
    
    // Configurar filtros
    configurarFiltros: function() {
        // Filtros de subcategoría (en páginas de categoría)
        const categoryFilters = document.getElementById('category-filters');
        if (categoryFilters) {
            // Limpiar filtros existentes
            categoryFilters.innerHTML = '';
            
            // Agregar "Todas"
            const allBtn = document.createElement('button');
            allBtn.className = 'filter-btn active';
            allBtn.dataset.filter = 'all';
            allBtn.textContent = 'Todas';
            allBtn.addEventListener('click', () => this.aplicarFiltroCategoria('all'));
            categoryFilters.appendChild(allBtn);
            
            // Obtener subcategorías únicas
            const subcats = [...new Set(this.productos
                .map(p => p.subcategoria || '')
                .filter(v => this.normalizar(v) !== '')
                .map(v => this.normalizar(v))
            )];

            // Si no hay subcategorías, dejamos solo "Todas"
            subcats.forEach(sc => {
                const btn = document.createElement('button');
                btn.className = 'filter-btn';
                btn.dataset.filter = sc;
                btn.textContent = this.formatearNombre(sc);
                btn.addEventListener('click', () => this.aplicarFiltroCategoria(sc));
                categoryFilters.appendChild(btn);
            });
        }
        
        // Filtro de precio
        const priceRange = document.getElementById('price-range');
        if (priceRange) {
            // Establecer máximo basado en productos
            const maxPrice = Math.max(...this.productos.map(p => p.precio), 500);
            priceRange.max = maxPrice;
            priceRange.value = maxPrice;
            
            const priceMax = document.getElementById('price-max');
            if (priceMax) {
                priceMax.textContent = `${formatCRC(maxPrice)}+`;
            }
            
            priceRange.addEventListener('input', (e) => {
                const value = e.target.value;
                const priceMax = document.getElementById('price-max');
                if (priceMax) {
                    priceMax.textContent = `${formatCRC(value)}+`;
                }
                this.aplicarFiltros();
            });
        }
        
        // Ordenar
        const sortSelect = document.getElementById('sort-select');
        if (sortSelect) {
            sortSelect.addEventListener('change', () => this.aplicarFiltros());
        }
        
        // Buscador
        const searchInput = document.getElementById('product-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.aplicarFiltros());
        }
    },

    // Sexshop.html usa cards como subcategorías (no #category-filters).
    // Esta función conecta esas cards con el filtro por subcategoría.
    configurarSexshopCategoriasUI: function() {
        try {
            if (this.categoriaActual !== 'sexshop') return;

            const cards = document.querySelectorAll('.sexshop-category');
            if (!cards || cards.length === 0) return;

            cards.forEach(card => {
                // Preferimos data-subcat (slug), si no, inferimos por el texto del título.
                const attr = (card.getAttribute('data-subcat') || '').trim();
                const titleEl = card.querySelector('.category-name');
                const title = titleEl ? titleEl.textContent : '';

                const slug = this.normalizar(attr || title);
                if (!slug) return;

                // Accesibilidad básica
                card.setAttribute('role', 'button');
                card.setAttribute('tabindex', '0');

                const onPick = () => {
                    cards.forEach(c => c.classList.remove('active'));
                    card.classList.add('active');

                    this.aplicarFiltroCategoria(slug);

                    // Scroll suave a la sección de productos
                    const target = document.querySelector('.sexshop-products') || document.getElementById('sexshop-products') || document.getElementById('products-container');
                    if (target && typeof target.scrollIntoView === 'function') {
                        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                };

                card.addEventListener('click', onPick);
                card.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onPick();
                    }
                });
            });
        } catch (err) {
            console.warn('⚠️ No se pudo configurar UI de categorías Sex Shop:', err);
        }
    },
    
    // Aplicar filtro de categoría
    aplicarFiltroCategoria: function(categoria) {
        // Guardar fallback (por si no existen botones .filter-btn)
        this._activeSubcategoria = categoria || 'all';

        // Actualizar botones activos
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeBtn = document.querySelector(`.filter-btn[data-filter="${categoria}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
        
        this.aplicarFiltros();
    },
    
    // Aplicar todos los filtros
    aplicarFiltros: function() {
        let productosFiltrados = [...this.productos];
        
        // Filtrar por subcategoría
        const categoriaActiva = document.querySelector('.filter-btn.active');
        let filtroSubcat = 'all';
        if (categoriaActiva && categoriaActiva.dataset.filter) {
            filtroSubcat = this.normalizar(categoriaActiva.dataset.filter);
        } else if (this._activeSubcategoria) {
            filtroSubcat = this.normalizar(this._activeSubcategoria);
        }
        if (filtroSubcat && filtroSubcat !== 'all') {
            productosFiltrados = productosFiltrados.filter(p => this.normalizar(p.subcategoria) === filtroSubcat);
        }
        
        // Filtrar por precio máximo
        const priceRange = document.getElementById('price-range');
        if (priceRange) {
            const precioMax = parseInt(priceRange.value);
            productosFiltrados = productosFiltrados.filter(p => p.precio <= precioMax);
        }
        
        // Filtrar por búsqueda
        const searchInput = document.getElementById('product-search');
        if (searchInput && searchInput.value.trim()) {
            const busqueda = searchInput.value.trim().toLowerCase();
            productosFiltrados = productosFiltrados.filter(p => 
                p.nombre.toLowerCase().includes(busqueda) || 
                (p.descripcion && p.descripcion.toLowerCase().includes(busqueda)) ||
                (p.categoria && p.categoria.toLowerCase().includes(busqueda))
            );
        }
        
        // Ordenar
        const sortSelect = document.getElementById('sort-select');
        if (sortSelect) {
            switch(sortSelect.value) {
                case 'price-asc':
                    productosFiltrados.sort((a, b) => a.precio - b.precio);
                    break;
                case 'price-desc':
                    productosFiltrados.sort((a, b) => b.precio - a.precio);
                    break;
                case 'name-asc':
                    productosFiltrados.sort((a, b) => a.nombre.localeCompare(b.nombre));
                    break;
                case 'name-desc':
                    productosFiltrados.sort((a, b) => b.nombre.localeCompare(a.nombre));
                    break;
                case 'newest':
                    productosFiltrados.sort((a, b) => 
                        new Date(b.fechaCreacion || 0) - new Date(a.fechaCreacion || 0)
                    );
                    break;
            }
        }
        
        this.productosFiltrados = productosFiltrados;
        
        // Actualizar contador
        this.actualizarContadorProductos();
        
        // Mostrar resultados
        const container = this.getProductsContainer();
        if (container) this.renderizarProductosGrid(productosFiltrados, container);
    },
    
    // Actualizar contador de productos
    actualizarContadorProductos: function() {
        const countElement = document.getElementById('products-count');
        if (countElement) {
            const countNumber = document.getElementById('count-number');
            if (countNumber) {
                countNumber.textContent = this.productosFiltrados.length;
            }
            countElement.innerHTML = `Mostrando <span id="count-number">${this.productosFiltrados.length}</span> productos`;
        }
    },
    
    // Configurar eventos
    configurarEventos: function() {
        // Botones de vista (grid/list)
        const viewBtns = document.querySelectorAll('.view-btn');
        viewBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                this.cambiarVista(view);
            });
        });
        
        // Eventos de filtro
        this.configurarFiltros();
    },
    
    // Cambiar vista (grid/list)
    cambiarVista: function(view) {
        const container = document.getElementById('products-container');
        if (!container) return;
        
        // Actualizar botones activos
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeBtn = document.querySelector(`.view-btn[data-view="${view}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
        
        // Cambiar clase del contenedor
        container.classList.remove('grid-view', 'list-view');
        container.classList.add(`${view}-view`);
    },
    
    // UI Helpers
    mostrarLoading: function() {
        const containers = ['featured-products', 'products-container', 'sexshop-products'];
        
        containers.forEach(containerId => {
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = `
                    <div class="loading-products">
                        <div class="spinner"></div>
                        <p>Cargando productos...</p>
                    </div>
                `;
            }
        });
    },
    
    ocultarLoading: function() {
        // El contenido se reemplaza automáticamente
    },
    
    mostrarError: function(mensaje) {
        const container = document.getElementById('products-container') || 
                         document.getElementById('featured-products');
        
        if (container) {
            container.innerHTML = `
                <div class="error-products">
                    <div class="error-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h3>${mensaje}</h3>
                    <button onclick="ProductosSystem.cargarProductos()" class="btn-retry">
                        <i class="fas fa-redo"></i> Reintentar
                    </button>
                </div>
            `;
        }
    },
    
    mostrarNotificacion: function(mensaje, tipo = 'info') {
        if (window.AuthSystem && typeof AuthSystem.mostrarNotificacion === 'function') {
            AuthSystem.mostrarNotificacion(mensaje, tipo);
            return;
        }
        
        // Implementación básica
        const notification = document.createElement('div');
        notification.className = `product-notification notification-${tipo}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${tipo === 'success' ? 'check-circle' : 
                                  tipo === 'error' ? 'exclamation-circle' : 
                                  tipo === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
                <span>${mensaje}</span>
            </div>
        `;
        
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${tipo === 'success' ? '#2ecc71' : 
                         tipo === 'error' ? '#e74c3c' : 
                         tipo === 'warning' ? '#f39c12' : '#3498db'};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            z-index: 9999;
            animation: slideInRight 0.3s ease;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            max-width: 300px;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
};

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    ProductosSystem.init();
});

// Exportar para uso global
window.ProductosSystem = ProductosSystem;
window.productos = ProductosSystem; // Alias para compatibilidad

console.log('✅ ProductosSystem listo para usar');