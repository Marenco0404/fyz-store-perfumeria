# Pagos reales (Stripe + PayPal)

## 1) Frontend
En `js/firebase-config.js` completá:

- `PAYMENTS_CONFIG.stripePublishableKey` (pk_...)
- `PAYMENTS_CONFIG.paypalClientId` (Client ID de PayPal)
- `PAYMENTS_CONFIG.paypalEnv` ("production" o "sandbox")

## 2) Stripe (obligatorio Cloud Functions)
Stripe necesita un backend para crear PaymentIntents.

### Config rápida
1. Instalá Firebase CLI y logueate
2. En la raíz del proyecto (donde está `functions/`):
   - `cd functions`
   - `npm install`
3. Seteá la secret:
   - `firebase functions:config:set stripe.secret="sk_live_..."`

   (o en hosting propio: `STRIPE_SECRET_KEY=sk_...`)
4. Deploy:
   - `firebase deploy --only functions`

### Resultado
La function queda como:
`https://us-central1-TU_PROJECT_ID.cloudfunctions.net/createPaymentIntent`

El frontend la llama automáticamente usando el `projectId` de Firebase.

## 3) PayPal
PayPal funciona directo con el SDK y tu Client ID.

**OJO:** en tu app de PayPal tenés que permitir el dominio donde vas a hostear (localhost para pruebas y tu dominio real para producción).
