// server.js
// Minimal Express backend demonstrating a Checkout.com Payments API integration.
// Run: npm install express cors node-fetch dotenv
// Then: node server.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));
app.use(express.static('public'));

const CKO_SECRET_KEY = process.env.CKO_SECRET_KEY; // sk_sbox_...
const CKO_PUBLIC_KEY = process.env.CKO_PUBLIC_KEY;
const CKO_API_BASE = 'https://api.sandbox.checkout.com';

const ZERO_DECIMAL_CURRENCIES = ['BIF', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'VUV', 'VND', 'XAF', 'XOF', 'XPF'];

const PARTNER_RESPONSE_CODE_MESSAGES = {
  '51': 'Insufficient funds',
  '05': 'Do not honor',
  '14': 'Invalid card number',
  '54': 'Expired card',
  '57': 'Transaction not permitted',
  '61': 'Exceeds withdrawal limit',
  '62': 'Restricted card'
};

function toMinorUnits(amount, currency) {
  const upperCurrency = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.includes(upperCurrency)) {
    return Math.round(amount);
  }
  return Math.round(amount * 100);
}

// STEP 1: Create a payment using a card token generated client-side by Frames.js this is draft version 1
app.post('/api/pay', async (req, res) => {
  const { token, amount, currency } = req.body;
 const minorUnitAmount = toMinorUnits(amount, currency || 'USD');
  try {
    const response = await fetch(`${CKO_API_BASE}/payments`, {
      method: 'POST',
      headers: {
        'Authorization': CKO_SECRET_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source: { type: 'token', token },
        amount: minorUnitAmount,          
        currency: currency || 'USD',
        processing_channel_id: 'pc_hxcpt2uen7buzoakcvsn6fb2ji',
        reference: `demo-order-${Date.now()}`,
        capture: false,
	store_for_future_use: true,
        "3ds": { enabled: true },
        success_url: `http://localhost:3000/payment-complete`,
        failure_url: `http://localhost:3000/payment-complete`
      })
    });

    const payment = await response.json();

    if (payment.status === "Pending" && payment._links?.redirect?.href) {
      return res.json({
        success: true,
        requiresAction: true,
        redirectUrl: payment._links.redirect.href,
        id: payment.id
      });
    }

    // STEP 2: USE CASE — branch logic based on data returned from the payment.
    // Example use case: if payment method is a card and risk flagged, show a
    // different message than a straightforward approved card payment.
    let useCaseMessage = '';
    if (payment.status === 'Authorized' || payment.status === 'Captured') {
      const scheme = payment.source?.scheme || 'unknown scheme';
      const last4 = payment.source?.last4 || '----';
      useCaseMessage = `Payment approved via ${scheme} card ending in ${last4}.`;
    } else if (payment.status === 'Declined') {
      useCaseMessage = `Payment declined. Response: ${payment.response_summary}`;
    } else {
      useCaseMessage = `Payment status: ${payment.status}`;
    }

    res.json({
      success: response.ok,
      status: payment.status,
      id: payment.id,
      sourceId: payment.source?.id,
      useCaseMessage,
      raw: payment
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/create-payment-session', async (req, res) => {
  const { amount, currency } = req.body;

  try {
    const minorUnitAmount = toMinorUnits(amount, currency || 'USD');
    const reference = `demo-order-${Date.now()}`;

    const response = await fetch(`${CKO_API_BASE}/payment-sessions`, {
      method: 'POST',
      headers: {
        'Authorization': CKO_SECRET_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: minorUnitAmount,
        currency: currency || 'USD',
        reference,
        billing: { address: { country: 'GB' } },
        customer: { email: 'demo@example.com' },
        processing_channel_id: 'pc_hxcpt2uen7buzoakcvsn6fb2ji',
        capture: false,
        "3ds": { enabled: true },
        success_url: 'http://localhost:3000/index.html',
        failure_url: 'http://localhost:3000/index.html'
      })
    });

    const session = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(session);
    }

    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/payment-status/:id', async (req, res) => {
  try {
    const response = await fetch(`${CKO_API_BASE}/payments/${req.params.id}`, {
      headers: { 'Authorization': CKO_SECRET_KEY }
    });
    const payment = await response.json();
    console.log('RAW PAYMENT OBJECT:', JSON.stringify(payment, null, 2));

    let declineReason = null;
if (payment.status === 'Declined') {
  const partnerCode = payment.processing?.partner_response_code;
  declineReason = payment.response_summary
    || PARTNER_RESPONSE_CODE_MESSAGES[partnerCode]
    || (partnerCode ? `Partner response code ${partnerCode}` : 'Unknown decline reason');
}

    res.json({
      id: payment.id,
      status: payment.status,
      declineReason,
      raw: payment
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/charge-saved-card", async (req, res) => {
  const { sourceId, amount, currency } = req.body;

  try {
    const response = await fetch(`${CKO_API_BASE}/payments`, {
      method: "POST",
      headers: {
        "Authorization": CKO_SECRET_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        source: { type: "id", id: sourceId },
        amount,
        currency: currency || "USD",
        processing_channel_id: "pc_hxcpt2uen7buzoakcvsn6fb2ji",
        reference: `repeat-charge-${Date.now()}`,
        capture: true
      })
    });
    const payment = await response.json();

    if (payment.status === "Pending" && payment._links?.redirect?.href) {
      return res.json({
        success: true,
        requiresAction: true,
        redirectUrl: payment._links.redirect.href,
        id: payment.id
      });
    }
    res.json({
      success: response.ok,
      id: payment.id,
      status: payment.status,
      useCaseMessage: `Repeat charge of $${(amount/100).toFixed(2)} using saved card status: ${payment.status}.`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/payment-complete", async (req, res) => {
  const paymentId = req.query["cko-session-id"] || req.query["cko-payment-id"] || req.query.id;
  if (!paymentId) {
    return res.send("<p>Redirected back, but no payment ID found in query params.</p>");
  }
  try {
    const response = await fetch(`${CKO_API_BASE}/payments/${paymentId}`, {
      headers: { "Authorization": CKO_SECRET_KEY }
    });
    const payment = await response.json();
    res.send(`<h2>3DS Authentication Result</h2><p>Payment ID: ${payment.id}</p><p>Status: ${payment.status}</p>`);
  } catch (err) {
    res.status(500).send("Error checking payment status: " + err.message);
  }
});

app.post('/webhooks/checkout', (req, res) => {
  const signature = req.headers['cko-signature'];

  if (!isValidSignature(req.rawBody, signature)) {
    console.warn('Webhook rejected: invalid signature');
    return res.status(401).send('Invalid signature');
  }

  res.status(200).send('OK');

  const event = req.body;
  handleWebhookEvent(event).catch(err => {
    console.error('Error processing webhook event:', event.type, err.message);
  });
});

function isValidSignature(rawBody, signatureHeader) {
  if (!rawBody || !signatureHeader || !process.env.CKO_WEBHOOK_SIGNATURE_KEY) return false;

  const expectedHmac = crypto
    .createHmac('sha256', process.env.CKO_WEBHOOK_SIGNATURE_KEY)
    .update(rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedHmac, 'utf8');
  const receivedBuf = Buffer.from(signatureHeader, 'utf8');

  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

app.get('/api/config', (req, res) => {
  res.json({ publicKey: CKO_PUBLIC_KEY });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Demo server running on http://localhost:${PORT}`));

const orderStore = new Map();

async function handleWebhookEvent(event) {
  console.log(`Webhook received: ${event.type} for payment ${event.data?.id}`);

  switch (event.type) {
    case 'payment_approved':
      await onPaymentApproved(event.data);
      break;
    case 'payment_captured':
      await onPaymentCaptured(event.data);
      break;
    case 'payment_declined':
    case 'payment_capture_declined':
      await onPaymentDeclined(event.data);
      break;
    case 'payment_refunded':
      await onPaymentRefunded(event.data);
      break;
    case 'dispute_evidence_required':
      await onDisputeEvidenceRequired(event.data);
      break;
    default:
      console.log(`No handler configured for event type: ${event.type}`);
  }
}

async function onPaymentApproved(payment) {
  const order = orderStore.get(payment.reference) || {};
  if (order.status === 'captured' || order.status === 'approved') return;
  orderStore.set(payment.reference, { ...order, status: 'approved', paymentId: payment.id });
  console.log(`Order ${payment.reference}: approved, awaiting capture confirmation.`);
}

async function onPaymentCaptured(payment) {
  const order = orderStore.get(payment.reference) || {};
  if (order.status === 'captured') return;
  orderStore.set(payment.reference, { ...order, status: 'captured', paymentId: payment.id });
  console.log(`Order ${payment.reference}: captured. Triggering fulfillment.`);
}

async function onPaymentDeclined(payment) {
  const order = orderStore.get(payment.reference) || {};
  orderStore.set(payment.reference, { ...order, status: 'declined', paymentId: payment.id });
  console.log(`Order ${payment.reference}: declined. Notifying customer to retry.`);
}

async function onPaymentRefunded(payment) {
  const order = orderStore.get(payment.reference) || {};
  orderStore.set(payment.reference, { ...order, status: 'refunded', paymentId: payment.id });
  console.log(`Order ${payment.reference}: refunded.`);
}

async function onDisputeEvidenceRequired(dispute) {
  console.log(`Dispute ${dispute.id} requires evidence submission by deadline.`);
}

app.get('/api/order-status/:reference', (req, res) => {
  const order = orderStore.get(req.params.reference);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});
