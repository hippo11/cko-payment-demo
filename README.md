# Checkout.com Sandbox Demo — Technical Assessment (Part 2)

A minimal Express backend + static frontend demonstrating a Checkout.com Payments API
integration: end-to-end payment, webhook handling, and a use case built on payment
response data.
First integration is built on top of frame.js (legacy) --> this was a traditional approach with frame js on hands (so original frame code is still on js file, not removed)
Iterate the changes using Flow as main integration 

## What to expect for demo

### 1. End-to-end payment demo cases
- test with auth
- test auth with different payment methods (visa/mc/amex by default setting) + different amount and currency combo
- test auth different decline cases
- void auth
- full capture; partial capture; multiple partial capture; overcapture (decline case)
- full refund; partial refund; overrefund
- recurring (MIT + CIT) through direct API only integration
- talk about idempotency 

### 2. Settings
- sandbox environment default setting (no customization)
it means default payment methods setup, no overcapture/overrefund allowed; no bank account getting configured;
- 3DS default on
- Separate auth and capture

### 3. Webhook handling
- `POST /webhooks/checkout` receives asynchronous payment lifecycle events
  (`payment_approved`, `payment_captured`, `payment_declined`, `payment_refunded`, etc).
- Signature verification uses HMAC-SHA256 over the raw request body, compared with
  `crypto.timingSafeEqual` to avoid timing attacks.
- Verified events update an in-memory order store, modeling how a merchant backend
  would react to payment state changes (e.g. triggering fulfillment on capture).
- Tunnelled to a public HTTPS endpoint via ngrok for local testing against
  Checkout.com's sandbox webhook dispatcher.

### 4. Sandbox payment data review
- Explore sandbox environment payment details page for demo purpose

### 5. other flows
- adjust auth (optional)
- recurring: MIT and CIT using terminal curl cmd ONLY because no time to implement
- incremental auth (optional)


## What's Intentionally Out of Scope

Disputes and bank payouts are separate product (cannot set up any bank accounts at sandbox environment)
I can simulate a dispute case manually through sandbox dashboard for demo purpose
surfaces not required by the brief's ask for "an end-to-end payment" and "a use case
based on payment data." I reviewed Checkout.com's testing docs for these and can speak
to how each would extend this integration, but did not build them here to keep the
demo focused.

## Reference
First version of integration was on frame.js; since it was deprecated, using Flow will be better integration starting point
- Detailed info:
https://www.checkout.com/docs/developer-resources/testing/test-cards

https://www.checkout.com/docs/developer-resources/event-notifications
https://api-reference.checkout.com/tag/Payments

## Setup

```bash
npm install express cors node-fetch dotenv
```

Create a `.env` file:
```
CKO_SECRET_KEY=sk_sbox_xxxxx
CKO_PUBLIC_KEY=pk_sbox_xxxxx
CKO_WEBHOOK_SIGNATURE_KEY=xxxxx
```

Run:
```bash
node server.js
```

For webhook testing, expose local port 3000 via ngrok and register the forwarding URL
(with `/webhooks/checkout` path) in the Checkout.com Dashboard under
Developers → Webhooks, subscribing to the relevant payment event types.

## Testing Capture and Refund Flows

Capture and refund calls were tested directly against the Payments API via Postman
rather than building dedicated UI, to keep the frontend focused on the core payment
flow:

- **Capture**: `POST /payments/{id}/captures` with `{ "amount": <minor_units>,
  "capture_type": "NonFinal" | "Final" }`
- **Refund**: `POST /payments/{id}/refunds` with `{ "amount": <minor_units> }`

## Files

- `server.js` — Express backend: payment creation, webhook receiver, payment status
  lookup.
- `index.html` / `public/` — minimal frontend for triggering a payment
