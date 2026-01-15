/**
 * SISTEMA DE AUTENTICACIÓN - F&Z STORE
 * Manejo completo de usuarios, roles y sesiones con seguridad
 */

const AuthSystem = {
        // Evita inicializar dos veces y duplicar listeners
    _initialized: false,
    // Evita spamear el \"Bienvenido\" en cada recarga
    _welcomedThisSession: false,
// Estado actual
    usuario: null,
    datosUsuario: null,
    esAdministrador: false,
    token: null,
    
    // Inicializar sistema
    init: function() {
        console.log('🔐 Inicializando sistema de autenticación...');
        
        
        if (this._initialized) {
            return;
        }
        this._initialized = true;
        this._welcomedThisSession = sessionStorage.getItem('fyz_welcomed') === 'true';
// Verificar que Firebase esté cargado
        if (!auth) {
            console.error('❌ Firebase Auth no está disponible');
            this.mostrarError('Error de sistema. Recarga la página.');
            return;
        }
        
        // Escuchar cambios en el estado de autenticación
        this.inicializarAuthListener();
        
        // Configurar eventos de la interfaz
        this.configurarEventos();
        
        // Verificar sesión guardada
        this.verificarSesionGuardada();
    },
    
    // Inicializar listener de autenticación
    inicializarAuthListener: function() {
        auth.onAuthStateChanged(async (user) => {
            this.usuario = user;
            
            if (user) {
                console.log('✅ Usuario autenticado:', user.email);
                await this.cargarDatosUsuario(user.uid);
                await this.verificarRol();
                this.guardarSesion();
                this.actualizarInterfazUsuario();
                if (!this._welcomedThisSession) {
                    this.mostrarNotificacion(`Bienvenido ${this.getNombreUsuario()}`, 'success');
                    sessionStorage.setItem('fyz_welcomed', 'true');
                    this._welcomedThisSession = true;
                }
                
                // Disparar evento personalizado
                document.dispatchEvent(new CustomEvent('authStateChanged', {
                    detail: { 
                        usuario: this.usuario, 
                        datos: this.datosUsuario,
                        esAdmin: this.esAdministrador 
                    }
                }));
                
            } else {
                console.log('🔓 Usuario no autenticado');
                this.limpiarSesion();
                this.limpiarInterfazUsuario();
            }
        });
    },
    
    // Cargar datos del usuario desde Firestore
    cargarDatosUsuario: async function(uid) {
        try {
            const userDoc = await db.collection('usuarios').doc(uid).get();
            
            if (userDoc.exists) {
                this.datosUsuario = userDoc.data();
                
                // Guardar en localStorage para acceso rápido
                localStorage.setItem('userData', JSON.stringify(this.datosUsuario));
                
                // Actualizar último acceso
                await db.collection('usuarios').doc(uid).update({
                    ultimoAcceso: new Date().toISOString()
                }).catch(() => {
                    // Ignorar errores de actualización
                });
                
                return this.datosUsuario;
            } else {
                // Crear documento si no existe (para usuarios antiguos)
                await this.crearDocumentoUsuario(uid);
                return await this.cargarDatosUsuario(uid);
            }
            
        } catch (error) {
            console.error('❌ Error cargando datos usuario:', error);
            
            // Intentar cargar de localStorage como fallback
            const cachedData = localStorage.getItem('userData');
            if (cachedData) {
                this.datosUsuario = JSON.parse(cachedData);
            }
            
            return this.datosUsuario;
        }
    },
    
    // Crear documento de usuario si no existe
    crearDocumentoUsuario: async function(uid) {
        try {
            const user = auth.currentUser;
            if (!user) return;
            
            const userData = {
                uid: uid,
                email: user.email,
                nombre: user.displayName || user.email.split('@')[0],
                rol: 'cliente',
                fechaRegistro: new Date().toISOString(),
                ultimoAcceso: new Date().toISOString(),
                activo: true,
                notificaciones: true,
                newsletter: false
            };
            
            await db.collection('usuarios').doc(uid).set(userData);
            console.log('✅ Documento de usuario creado:', uid);
            
        } catch (error) {
            console.error('❌ Error creando documento usuario:', error);
        }
    },
    
    // Verificar rol del usuario
    verificarRol: async function() {
        try {
            if (!this.usuario) {
                this.esAdministrador = false;
                return false;
            }
            
            const userDoc = await db.collection('usuarios').doc(this.usuario.uid).get();
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                this.esAdministrador = userData.rol === 'admin' || userData.rol === 'superadmin';
                return this.esAdministrador;
            }
            
            this.esAdministrador = false;
            return false;
            
        } catch (error) {
            console.error('❌ Error verificando rol:', error);
            this.esAdministrador = false;
            return false;
        }
    },
    
    // Iniciar sesión con email/contraseña
    login: async function(email, password, rememberMe = false) {
        try {
            console.log('🔑 Intentando inicio de sesión:', email);
            
            // Validaciones básicas
            if (!this.validarEmail(email)) {
                throw new Error('Por favor ingresa un email válido');
            }
            
            if (!password || password.length < 6) {
                throw new Error('La contraseña debe tener al menos 6 caracteres');
            }
            
            // Mostrar loading
            this.mostrarLoading();
            
            // Configurar persistencia según "Recuérdame"
            const persistence = rememberMe ? 
                firebase.auth.Auth.Persistence.LOCAL : 
                firebase.auth.Auth.Persistence.SESSION;
            
            await auth.setPersistence(persistence);
            
            // Intentar inicio de sesión
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // Verificar si el email está verificado
            if (!user.emailVerified) {
                console.warn('⚠️ Email no verificado');
                this.mostrarNotificacion('Por favor, verifica tu email antes de continuar', 'warning');
            }
            
            console.log('✅ Inicio de sesión exitoso');
            return { success: true, usuario: user };
            
        } catch (error) {
            console.error('❌ Error en login:', error);
            
            let mensajeError = 'Error al iniciar sesión';
            let tipoError = 'error';
            
            switch(error.code) {
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                    mensajeError = 'Email o contraseña incorrectos';
                    break;
                case 'auth/too-many-requests':
                    mensajeError = 'Demasiados intentos fallidos. Intenta más tarde';
                    tipoError = 'warning';
                    break;
                case 'auth/user-disabled':
                    mensajeError = 'Esta cuenta ha sido deshabilitada';
                    break;
                case 'auth/invalid-email':
                    mensajeError = 'Email inválido';
                    break;
                case 'auth/network-request-failed':
                    mensajeError = 'Error de conexión. Verifica tu internet';
                    break;
                case 'auth/email-not-verified':
                    mensajeError = 'Verifica tu email antes de iniciar sesión';
                    tipoError = 'warning';
                    break;
            }
            
            this.mostrarNotificacion(mensajeError, tipoError);
            return { success: false, error: mensajeError };
            
        } finally {
            this.ocultarLoading();
        }
    },
    
    // Registro de usuario

    // Registro de usuario

    register: async function(email, password, datosUsuario) {
        try {
            console.log('👤 Registrando nuevo usuario:', email);
            
            // Validaciones
            if (!this.validarEmail(email)) {
                throw new Error('Por favor ingresa un email válido');
            }
            
            if (!password || password.length < 6) {
                throw new Error('La contraseña debe tener al menos 6 caracteres');
            }
            
            if (!datosUsuario.nombre || datosUsuario.nombre.trim().length < 2) {
                throw new Error('El nombre es requerido (mínimo 2 caracteres)');
            }
            
            // Mostrar loading
            this.mostrarLoading();
            
            // Crear usuario en Authentication
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // Preparar datos para Firestore
            const userData = {
                uid: user.uid,
                email: user.email,
                nombre: datosUsuario.nombre.trim(),
                telefono: datosUsuario.telefono || '',
                direccion: datosUsuario.direccion || '',
                fechaNacimiento: datosUsuario.fechaNacimiento || '',
                rol: 'cliente',
                fechaRegistro: new Date().toISOString(),
                ultimoAcceso: new Date().toISOString(),
                activo: true,
                notificaciones: true,
                newsletter: datosUsuario.newsletter || false,
                fechaActualizacion: new Date().toISOString()
            };
            
            // Guardar en Firestore
            await db.collection('usuarios').doc(user.uid).set(userData);
            
            // Enviar email de verificación
            await user.sendEmailVerification({
                url: window.location.origin + '/login.html',
                handleCodeInApp: true
            });
            
            // Enviar email de bienvenida (opcional)
            this.enviarEmailBienvenida(user.email, userData.nombre);
            
            console.log('✅ Usuario registrado exitosamente');
            
            this.mostrarNotificacion(
                '¡Registro exitoso! Hemos enviado un email de verificación.',
                'success'
            );
            
            return { success: true, usuario: user };
            
        } catch (error) {
            console.error('❌ Error en registro:', error);
            
            let mensajeError = 'Error al registrar usuario';
            
            switch(error.code) {
                case 'auth/email-already-in-use':
                    mensajeError = 'Este email ya está registrado';
                    break;
                case 'auth/invalid-email':
                    mensajeError = 'Email inválido';
                    break;
                case 'auth/operation-not-allowed':
                    mensajeError = 'El registro con email/contraseña no está habilitado';
                    break;
                case 'auth/weak-password':
                    mensajeError = 'La contraseña es muy débil';
                    break;
                case 'auth/network-request-failed':
                    mensajeError = 'Error de conexión';
                    break;
            }
            
            this.mostrarNotificacion(mensajeError, 'error');
            return { success: false, error: mensajeError };
            
        } finally {
            this.ocultarLoading();
        }
    },
    
    // Enviar email de bienvenida
    enviarEmailBienvenida: async function(email, nombre) {
        try {
            // Aquí usarías un cloud function o servicio de email
            console.log('📧 Email de bienvenida enviado a:', email);
            
            // Ejemplo con fetch a un cloud function
            /*
            await fetch('https://us-central1-fyzperfumeria.cloudfunctions.net/sendWelcomeEmail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, nombre })
            });
            */
            
        } catch (error) {
            console.error('❌ Error enviando email de bienvenida:', error);
        }
    },
    
    // Cerrar sesión
    logout: async function() {
        try {
            console.log('🚪 Cerrando sesión...');
            
            // Mostrar confirmación
            if (!confirm('¿Estás seguro de cerrar sesión?')) {
                return false;
            }
            
            await auth.signOut();
            
            this.mostrarNotificacion('Sesión cerrada exitosamente', 'info');
            
            // Redirigir después de cerrar sesión
            setTimeout(() => {
                if (!window.location.pathname.includes('index.html')) {
                    window.location.href = 'index.html';
                }
            }, 1000);
            
            return true;
            
        } catch (error) {
            console.error('❌ Error al cerrar sesión:', error);
            this.mostrarNotificacion('Error al cerrar sesión', 'error');
            return false;
        }
    },
    
    // Restablecer contraseña
    resetPassword: async function(email) {
        try {
            if (!this.validarEmail(email)) {
                throw new Error('Por favor ingresa un email válido');
            }
            
            this.mostrarLoading();
            
            await auth.sendPasswordResetEmail(email, {
                url: window.location.origin + '/login.html',
                handleCodeInApp: true
            });
            
            this.mostrarNotificacion(
                'Email de recuperación enviado. Revisa tu bandeja de entrada.',
                'success'
            );
            
            return true;
            
        } catch (error) {
            console.error('❌ Error al restablecer contraseña:', error);
            
            let mensajeError = 'Error al enviar email de recuperación';
            
            if (error.code === 'auth/user-not-found') {
                mensajeError = 'No existe una cuenta con este email';
            }
            
            this.mostrarNotificacion(mensajeError, 'error');
            return false;
            
        } finally {
            this.ocultarLoading();
        }
    },
    
    // Actualizar perfil
    updateProfile: async function(datos) {
        try {
            if (!this.usuario) {
                throw new Error('No hay usuario autenticado');
            }
            
            const updates = {};
            
            // Validar y preparar datos
            if (datos.nombre && datos.nombre.trim().length >= 2) {
                updates.nombre = datos.nombre.trim();
            }
            
            if (datos.telefono !== undefined) {
                updates.telefono = datos.telefono;
            }
            
            if (datos.direccion !== undefined) {
                updates.direccion = datos.direccion;
            }
            
            if (datos.fechaNacimiento !== undefined) {
                updates.fechaNacimiento = datos.fechaNacimiento;
            }
            
            if (datos.newsletter !== undefined) {
                updates.newsletter = datos.newsletter;
            }
            
            if (Object.keys(updates).length === 0) {
                throw new Error('No hay datos para actualizar');
            }
            
            updates.fechaActualizacion = new Date().toISOString();
            
            await db.collection('usuarios').doc(this.usuario.uid).update(updates);
            
            // Actualizar datos locales
            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            Object.assign(userData, updates);
            localStorage.setItem('userData', JSON.stringify(userData));
            
            this.mostrarNotificacion('Perfil actualizado exitosamente', 'success');
            
            // Actualizar interfaz
            this.actualizarInterfazUsuario();
            
            return true;
            
        } catch (error) {
            console.error('❌ Error actualizando perfil:', error);
            this.mostrarNotificacion('Error al actualizar perfil', 'error');
            return false;
        }
    },
    
    // Actualizar contraseña
    updatePassword: async function(currentPassword, newPassword) {
        try {
            if (!this.usuario) {
                throw new Error('No hay usuario autenticado');
            }
            
            if (!currentPassword || !newPassword) {
                throw new Error('Ambas contraseñas son requeridas');
            }
            
            if (newPassword.length < 6) {
                throw new Error('La nueva contraseña debe tener al menos 6 caracteres');
            }
            
            this.mostrarLoading();
            
            // Reautenticar para cambiar contraseña
            const credential = firebase.auth.EmailAuthProvider.credential(
                this.usuario.email,
                currentPassword
            );
            
            await this.usuario.reauthenticateWithCredential(credential);
            
            // Actualizar contraseña
            await this.usuario.updatePassword(newPassword);
            
            this.mostrarNotificacion('Contraseña actualizada exitosamente', 'success');
            
            return true;
            
        } catch (error) {
            console.error('❌ Error actualizando contraseña:', error);
            
            let mensajeError = 'Error al actualizar contraseña';
            
            if (error.code === 'auth/wrong-password') {
                mensajeError = 'La contraseña actual es incorrecta';
            } else if (error.code === 'auth/weak-password') {
                mensajeError = 'La nueva contraseña es muy débil';
            }
            
            this.mostrarNotificacion(mensajeError, 'error');
            return false;
            
        } finally {
            this.ocultarLoading();
        }
    },
    
    // Guardar sesión
    guardarSesion: function() {
        try {
            const sessionData = {
                uid: this.usuario?.uid,
                email: this.usuario?.email,
                timestamp: Date.now()
            };
            
            sessionStorage.setItem('fyz_session', JSON.stringify(sessionData));
            
        } catch (error) {
            console.error('❌ Error guardando sesión:', error);
        }
    },
    
    // Verificar sesión guardada
    verificarSesionGuardada: function() {
        try {
            const sessionData = sessionStorage.getItem('fyz_session');
            if (sessionData) {
                const session = JSON.parse(sessionData);
                
                // Verificar si la sesión es reciente (menos de 1 día)
                const unDia = 24 * 60 * 60 * 1000;
                if (Date.now() - session.timestamp < unDia) {
                    console.log('🔄 Sesión guardada encontrada');
                }
            }
        } catch (error) {
            console.error('❌ Error verificando sesión:', error);
        }
    },
    
    // Limpiar sesión
    limpiarSesion: function() {
        try {
            sessionStorage.removeItem('fyz_session');
            localStorage.removeItem('userData');
        } catch (error) {
            console.error('❌ Error limpiando sesión:', error);
        }
    },
    
    // Actualizar interfaz de usuario
    actualizarInterfazUsuario: function() {
        const userNameElement = document.getElementById('user-name');
        const userMenu = document.getElementById('user-menu');
        const userDropdown = document.getElementById('user-dropdown');
        const adminLink = document.getElementById('admin-link');
        const profileLink = document.getElementById('profile-link');
        const ordersLink = document.getElementById('orders-link');
        const loginLink = document.getElementById('login-link');
        const registerLink = document.getElementById('register-link');
        const logoutLink = document.getElementById('logout-link');
        
        if (this.usuario) {
            // Mostrar nombre de usuario
            if (userNameElement) {
                const nombre = this.getNombreUsuario();
                userNameElement.innerHTML = `
                    <i class="fas fa-user-circle"></i>
                    <span class="user-name-text">${nombre}</span>
                    <i class="fas fa-chevron-down user-arrow"></i>
                `;
            }
            
            // Actualizar menú desplegable
            if (loginLink) loginLink.style.display = 'none';
            if (registerLink) registerLink.style.display = 'none';
            
            if (profileLink) profileLink.style.display = 'block';
            if (ordersLink) ordersLink.style.display = 'block';
            if (logoutLink) logoutLink.style.display = 'block';
            
            // Mostrar/ocultar enlace de admin
            if (adminLink) {
                adminLink.style.display = this.esAdministrador ? 'block' : 'none';
            }
            
            // Mostrar enlaces del footer
            const footerOrders = document.getElementById('footer-orders');
            const footerProfile = document.getElementById('footer-profile');
            const footerAdmin = document.getElementById('footer-admin');
            
            if (footerOrders) footerOrders.style.display = 'block';
            if (footerProfile) footerProfile.style.display = 'block';
            if (footerAdmin) footerAdmin.style.display = this.esAdministrador ? 'block' : 'none';
            
        } else {
            // Usuario no autenticado
            if (userNameElement) {
                userNameElement.innerHTML = `
                    <i class="fas fa-user"></i>
                    <span class="user-name-text">Iniciar Sesión</span>
                    <i class="fas fa-chevron-down user-arrow"></i>
                `;
            }
            
            if (loginLink) loginLink.style.display = 'block';
            if (registerLink) registerLink.style.display = 'block';
            if (profileLink) profileLink.style.display = 'none';
            if (ordersLink) ordersLink.style.display = 'none';
            if (logoutLink) logoutLink.style.display = 'none';
            if (adminLink) adminLink.style.display = 'none';
            
            // Ocultar enlaces del footer
            const footerOrders = document.getElementById('footer-orders');
            const footerProfile = document.getElementById('footer-profile');
            const footerAdmin = document.getElementById('footer-admin');
            
            if (footerOrders) footerOrders.style.display = 'none';
            if (footerProfile) footerProfile.style.display = 'none';
            if (footerAdmin) footerAdmin.style.display = 'none';
        }
    },
    
    // Limpiar interfaz de usuario
    limpiarInterfazUsuario: function() {
        this.actualizarInterfazUsuario(); // Reutilizamos la misma función
    },
    
    // Obtener datos del usuario
    getCurrentUser: function() {
        return this.usuario;
    },
    
    getNombreUsuario: function() {
        if (!this.usuario) return 'Invitado';
        
        if (this.datosUsuario && this.datosUsuario.nombre) {
            return this.datosUsuario.nombre;
        }
        
        return this.usuario.email.split('@')[0];
    },
    
    // Validaciones
    validarEmail: function(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },
    
    // Configurar eventos
    configurarEventos: function() {
        // =========================
        // Formularios (login/registro)
        // =========================
        const loginForm = document.getElementById('login-form');
        if (loginForm && !loginForm.dataset.bound) {
            loginForm.dataset.bound = 'true';
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const email = (document.getElementById('email')?.value || '').trim();
                const password = document.getElementById('password')?.value || '';
                const rememberMe = !!document.getElementById('remember-me')?.checked;

                const btn = document.getElementById('login-button');
                const prevText = btn ? btn.innerHTML : '';
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Entrando...</span>';
                }

                try {
                    const res = await this.login(email, password, rememberMe);
                    if (!res?.success) throw new Error('Login falló');

                    // Esperar rol y redirigir
                    await this.verificarRol();

                    const isAdmin = this.esAdministrador;
                    const redirect = isAdmin ? 'admin/index.html' : 'index.html';
                    window.location.href = redirect;
                } catch (err) {
                    const msg = err?.message || 'Error al iniciar sesión';
                    this.mostrarNotificacion(msg, 'error');
                } finally {
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = prevText;
                    }
                    this.ocultarLoading();
                }
            });
        }

        // Menú desplegable de usuario
        const userMenu = document.getElementById('user-menu');
        if (userMenu) {
            userMenu.addEventListener('click', (e) => {
                e.stopPropagation();
                const dropdown = document.getElementById('user-dropdown');
                if (dropdown) {
                    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
                }
            });
            
            // Cerrar al hacer clic fuera
            document.addEventListener('click', () => {
                const dropdown = document.getElementById('user-dropdown');
                if (dropdown) {
                    dropdown.style.display = 'none';
                }
            });
        }
        
        // Enlace cerrar sesión
        const logoutLink = document.getElementById('logout-link');
        if (logoutLink) {
            logoutLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        }
        
        // Enlace panel admin
        const adminLink = document.getElementById('admin-link');
        if (adminLink) {
            adminLink.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = window.location.pathname.includes('/admin/') ? 'index.html' : 'admin/index.html';
            });
        }
        // Enlace pedidos
        const ordersLink = document.getElementById('orders-link');
        if (ordersLink) {
            ordersLink.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = 'mis_pedidos.html';
            });
        }
    },
    
    // Utilidades de UI
    mostrarNotificacion: function(mensaje, tipo = 'info') {
        // Crear contenedor si no existe
        let container = document.getElementById('notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-width: 400px;
            `;
            document.body.appendChild(container);
        }
        
        // Crear notificación
        const notification = document.createElement('div');
        notification.className = `auth-notification notification-${tipo}`;
        
        const icon = tipo === 'success' ? 'check-circle' : 
                    tipo === 'error' ? 'exclamation-circle' : 
                    tipo === 'warning' ? 'exclamation-triangle' : 'info-circle';
        
        notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-icon">
                    <i class="fas fa-${icon}"></i>
                </div>
                <div class="notification-message">
                    ${mensaje}
                </div>
                <button class="notification-close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        // Estilos
        notification.style.cssText = `
            background: ${tipo === 'success' ? '#2ecc71' : 
                         tipo === 'error' ? '#e74c3c' : 
                         tipo === 'warning' ? '#f39c12' : '#3498db'};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            animation: slideIn 0.3s ease;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        `;
        
        notification.querySelector('.notification-content').style.cssText = `
            display: flex;
            align-items: center;
            gap: 15px;
        `;
        
        notification.querySelector('.notification-close').style.cssText = `
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            margin-left: auto;
            padding: 0;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        container.appendChild(notification);
        
        // Botón cerrar
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        });
        
        // Auto-remover después de 5 segundos
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
    },
    
    mostrarError: function(mensaje) {
        this.mostrarNotificacion(mensaje, 'error');
    },
    
    mostrarLoading: function() {
        let loading = document.getElementById('auth-loading');
        if (!loading) {
            loading = document.createElement('div');
            loading.id = 'auth-loading';
            loading.className = 'auth-loading-overlay';
            loading.innerHTML = `
                <div class="auth-loading-spinner">
                    <div class="spinner"></div>
                    <p>Procesando...</p>
                </div>
            `;
            
            loading.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 99999;
            `;
            
            loading.querySelector('.auth-loading-spinner').style.cssText = `
                background: white;
                padding: 40px;
                border-radius: 10px;
                text-align: center;
                box-shadow: 0 5px 20px rgba(0,0,0,0.3);
            `;
            
            loading.querySelector('.spinner').style.cssText = `
                border: 5px solid #f3f3f3;
                border-top: 5px solid #3498db;
                border-radius: 50%;
                width: 50px;
                height: 50px;
                animation: spin 1s linear infinite;
                margin: 0 auto 20px;
            `;
            
            document.body.appendChild(loading);
        }
        
        loading.style.display = 'flex';
    },
    
    ocultarLoading: function() {
        const loading = document.getElementById('auth-loading');
        if (loading) {
            loading.style.display = 'none';
        }
    },
    
    // Verificar autenticación para páginas protegidas
    requireAuth: function() {
        return new Promise((resolve, reject) => {
            const unsubscribe = auth.onAuthStateChanged(user => {
                unsubscribe();
                
                if (user) {
                    resolve(user);
                } else {
                    this.mostrarNotificacion('Debes iniciar sesión para acceder', 'error');
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 2000);
                    reject(new Error('No autenticado'));
                }
            });
        });
    },
    
    // Verificar si es admin para páginas de admin
    requireAdmin: async function() {
        try {
            const user = await this.requireAuth();
            await this.verificarRol();
            
            if (!this.esAdministrador) {
                this.mostrarNotificacion('No tienes permisos de administrador', 'error');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
                throw new Error('No es administrador');
            }
            
            return user;
        } catch (error) {
            throw error;
        }
    }
};

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    AuthSystem.init();
});

// Exportar para uso global
window.AuthSystem = AuthSystem;
window.authSystem = AuthSystem; // Alias para compatibilidad

// Añadir estilos CSS para animaciones
const authStyles = document.createElement('style');
authStyles.textContent = `
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .user-menu {
        cursor: pointer;
        position: relative;
    }
    
    .user-dropdown {
        position: absolute;
        top: 100%;
        right: 0;
        background: white;
        min-width: 200px;
        box-shadow: 0 5px 20px rgba(0,0,0,0.1);
        border-radius: 8px;
        overflow: hidden;
        z-index: 1000;
        display: none;
    }
    
    .user-dropdown a {
        display: block;
        padding: 12px 20px;
        color: #333;
        text-decoration: none;
        border-bottom: 1px solid #eee;
        transition: background 0.3s;
    }
    
    .user-dropdown a:hover {
        background: #f8f9fa;
    }
    
    .user-dropdown a i {
        margin-right: 10px;
        width: 20px;
        text-align: center;
    }
    
    .user-name-text {
        margin: 0 8px;
    }
    
    .user-arrow {
        font-size: 12px;
        transition: transform 0.3s;
    }
    
    .user-menu.active .user-arrow {
        transform: rotate(180deg);
    }
`;

if (!document.querySelector('style[data-auth-styles]')) {
    authStyles.setAttribute('data-auth-styles', 'true');
    document.head.appendChild(authStyles);
}

console.log('✅ AuthSystem inicializado correctamente');
// Mostrar botón admin en la tienda si el usuario es admin
async function mostrarBotonAdminSiAplica(user) {
  const btn = document.getElementById("btn-admin-panel");
  if (!btn || !user) return;

  try {
    const snap = await db.collection("usuarios").doc(user.uid).get();
    const rol = (snap.data()?.rol || "").toLowerCase();
    const esAdmin = rol === "admin" || rol === "superadmin";
    btn.style.display = esAdmin ? "inline-flex" : "none";
  } catch {
    btn.style.display = "none";
  }
}
