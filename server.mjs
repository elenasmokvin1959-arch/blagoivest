import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${port}`;
const nowpaymentsApiKey = process.env.NOWPAYMENTS_API_KEY || "";
const nowpaymentsIpnSecret = process.env.NOWPAYMENTS_IPN_SECRET || "";
const payments = new Map();

const levels = {
  1: { title: "1 уровень продаж", price: 50 },
  2: { title: "2 уровень продаж", price: 100 },
  3: { title: "3 уровень продаж", price: 250 },
  4: { title: "4 уровень продаж", price: 500 },
  5: { title: "5 уровень продаж", price: 1000 },
  6: { title: "6 уровень продаж", price: 2500 },
  7: { title: "7 уровень продаж", price: 5000 }
};

const payCurrencies = {
  usdttrc20: "USDT TRC20",
  usdtmatic: "USDT Polygon POS",
  ltc: "LTC",
  btc: "BTC"
};

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function verifyIpnSignature(rawBody, signature) {
  if (!nowpaymentsIpnSecret || !signature) return false;
  const digest = createHmac("sha512", nowpaymentsIpnSecret).update(rawBody).digest("hex");
  const left = Buffer.from(digest);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function createNowpaymentsInvoice(payload) {
  const response = await fetch("https://api.nowpayments.io/v1/invoice", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": nowpaymentsApiKey
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || "NOWPayments invoice error");
  }
  return data;
}

async function fetchNowpaymentsStatus(paymentId) {
  const response = await fetch(`https://api.nowpayments.io/v1/payment/${encodeURIComponent(paymentId)}`, {
    headers: { "x-api-key": nowpaymentsApiKey }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || "NOWPayments status error");
  }
  return data;
}

async function handleCreatePayment(req, res) {
  if (!nowpaymentsApiKey) {
    sendJson(res, 500, { error: "NOWPayments API key is not configured" });
    return;
  }

  const body = JSON.parse(await readBody(req) || "{}");
  const level = levels[Number(body.levelId)];
  const payCurrency = String(body.payCurrency || "").toLowerCase();

  if (!level) {
    sendJson(res, 400, { error: "Unknown level" });
    return;
  }
  if (!payCurrencies[payCurrency]) {
    sendJson(res, 400, { error: "Unknown payment currency" });
    return;
  }

  const orderId = `level-${body.levelId}-${Date.now()}`;
  const invoice = await createNowpaymentsInvoice({
    price_amount: level.price,
    price_currency: "usd",
    pay_currency: payCurrency,
    order_id: orderId,
    order_description: `${level.title} · ${body.userPhone || "user"}`,
    success_url: `${publicBaseUrl}/?payment=success`,
    cancel_url: `${publicBaseUrl}/?payment=cancel`,
    ipn_callback_url: `${publicBaseUrl}/nowpayments/ipn`,
    is_fixed_rate: false,
    is_fee_paid_by_user: true
  });

  const paymentId = String(invoice.id || invoice.invoice_id || orderId);
  payments.set(paymentId, {
    paymentId,
    orderId,
    levelId: Number(body.levelId),
    userPhone: body.userPhone || "",
    status: "waiting",
    raw: invoice
  });

  sendJson(res, 200, {
    paymentId,
    paymentUrl: invoice.invoice_url,
    orderId
  });
}

async function handlePaymentStatus(req, res, paymentId) {
  if (!nowpaymentsApiKey) {
    sendJson(res, 500, { error: "NOWPayments API key is not configured" });
    return;
  }

  const cached = payments.get(paymentId);
  let statusData = cached?.raw || {};

  try {
    statusData = await fetchNowpaymentsStatus(paymentId);
  } catch {
    if (!cached) throw new Error("Payment not found");
  }

  const paymentStatus = statusData.payment_status || cached?.status || "waiting";
  payments.set(paymentId, { ...(cached || {}), paymentId, status: paymentStatus, raw: statusData });
  sendJson(res, 200, { paymentId, paymentStatus, raw: statusData });
}

async function handleIpn(req, res) {
  const rawBody = await readBody(req);
  const signature = req.headers["x-nowpayments-sig"];

  if (nowpaymentsIpnSecret && !verifyIpnSignature(rawBody, String(signature || ""))) {
    sendJson(res, 401, { error: "Invalid IPN signature" });
    return;
  }

  const body = JSON.parse(rawBody || "{}");
  const paymentId = String(body.payment_id || body.invoice_id || body.id || "");
  if (paymentId) {
    const cached = payments.get(paymentId) || {};
    payments.set(paymentId, {
      ...cached,
      paymentId,
      status: body.payment_status || body.status || cached.status || "waiting",
      raw: body
    });
  }

  sendJson(res, 200, { ok: true });
}

async function serveStatic(url, res) {
  const route = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const filePath = normalize(join(root, route));

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const file = await readFile(filePath);
  res.writeHead(200, { "Content-Type": types[extname(filePath)] || "application/octet-stream" });
  res.end(file);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", publicBaseUrl);

    if (req.method === "POST" && url.pathname === "/api/nowpayments/create-payment") {
      await handleCreatePayment(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/nowpayments/payment-status/")) {
      const paymentId = decodeURIComponent(url.pathname.split("/").pop() || "");
      await handlePaymentStatus(req, res, paymentId);
      return;
    }

    if (req.method === "POST" && url.pathname === "/nowpayments/ipn") {
      await handleIpn(req, res);
      return;
    }

    await serveStatic(url, res);
  } catch (error) {
    if (req.url?.startsWith("/api/") || req.url === "/nowpayments/ipn") {
      sendJson(res, 500, { error: error.message || "Server error" });
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`finance-site: ${publicBaseUrl}`);
});
