# Checkout.com Sandbox Demo — Technical Assessment (Part 2)

A minimal Express backend + static frontend demonstrating a Checkout.com Payments API
integration: end-to-end payment, webhook handling, and a use case built on payment
response data.
First integration is built on top of frame.js (legacy) --> this was a traditional approach with frame js on hands (so original frame code is still on js file, not removed)
Iterate the changes using Flow as main integration 

## What to expect for demo

### 1. End-to-end payment demo
- test with auth (with 3DS default on)
- test with different payment methods (visa/mc/amex by default setting)
- test with decline cases, fraud decline or other card declines
- Separate auth and capture
- partial capture; multiple partial capture; overcapture (decline case)
- refund; partial refund; overrefund

### 2. Auth/capture separation
- Payments are created with `capture: false`, so funds are authorized but not
  immediately captured.
- A separate call to `POST /payments/{id}/captures` finalizes the charge — modeling a
  real-world scenario where authorization and fulfillment happen at different times
  (e.g. capture-on-ship).
- Multiple partial captures are supported by setting `capture_type: "NonFinal"` on all
  but the last capture in a sequence, so the remaining authorized balance stays open
  instead of auto-voiding after the first capture.

### 3. Webhook handling
- `POST /webhooks/checkout` receives asynchronous payment lifecycle events
  (`payment_approved`, `payment_captured`, `payment_declined`, `payment_refunded`, etc).
- Signature verification uses HMAC-SHA256 over the raw request body, compared with
  `crypto.timingSafeEqual` to avoid timing attacks.
- Verified events update an in-memory order store, modeling how a merchant backend
  would react to payment state changes (e.g. triggering fulfillment on capture).
- Tunnelled to a public HTTPS endpoint via ngrok for local testing against
  Checkout.com's sandbox webhook dispatcher.

### 4. Use case from payment data
- On a successful payment, the response is inspected for `scheme` and `last4` to
  generate a human-readable confirmation message — a simple example of branching
  logic driven by data returned in the payment object, rather than just a static
  success/fail flag.
- Declined payments surface the `response_summary` field to explain *why* a payment
  failed, rather than a generic error.

### 5. Partial refunds
- `POST /payments/{id}/refunds` supports refunding less than the full captured amount,
  tested against a live sandbox transaction.

## What's Intentionally Out of Scope

Disputes, fraud detection response codes, and bank payouts are separate product
surfaces not required by the brief's ask for "an end-to-end payment" and "a use case
based on payment data." I reviewed Checkout.com's testing docs for these and can speak
to how each would extend this integration, but did not build them here to keep the
demo focused.

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
- `index.html` / `public/` — minimal frontend for triggering a payment via Frames.js.
