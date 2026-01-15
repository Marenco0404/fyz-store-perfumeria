# FYZ Store — build “prod” (limpio + seguro)

## Deploy (Firebase Hosting)
1) `firebase login`
2) `firebase use <tu-proyecto>`
3) `firebase deploy`

## Importante (seguridad)
- **Reglas Firestore:** este proyecto incluye `firestore.rules` (lectura pública del catálogo, escritura solo admin; pedidos solo del dueño; updates de pedidos solo admin).
- Asegurate de tener la colección `usuarios/{uid}` con `rol: "admin"` o `"superadmin"` para los admins.
- No expongás credenciales en `.env.local`. Ese archivo es para dev.

## Headers (CSP)
`firebase.json` ya trae CSP + headers básicos para que:
- Firebase SDK cargue bien
- PayPal SDK funcione
- CDN fonts funcione

Si agregás scripts externos nuevos, acordate de sumarlos a la CSP.

## Estructura de colecciones (esperada)
- `productos`
- `categorias`
- `subcategorias`
- `usuarios`
- `pedidos`

## Checklist de “100”
- [x] Checkout PayPal guarda pedidos por `paypalOrderId` (sin “pedido no encontrado”)
- [x] Favicon en todas las páginas
- [x] Proyecto sin basura (sin test pages / backups)
- [x] `firestore.rules` + `firestore.indexes.json` incluidos
- [x] Security headers + CSP en hosting
