import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${port}`;
const nowpaymentsApiKey = process.env.NOWPAYMENTS_API_KEY || "";
const nowpaymentsIpnSecret = process.env.NOWPAYMENTS_IPN_SECRET || "";
const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || "";
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

function publicUser(row) {
  if (!row) return null;
  return {
    name: row.name,
    phone: row.phone,
    countryCode: row.country_code,
    sponsor: row.sponsor || "",
    createdAt: row.created_at,
    app: row.app_state || {}
  };
}

function defaultAppState(name) {
  return {
    balance: 0,
    pending: 0,
    totalIncome: 0,
    activeLevel: 0,
    cycleEndsAt: 0,
    cycleReady: false,
    lastStartDate: "",
    wallets: {},
    withdrawalRequests: [],
    referralReports: [],
    pendingPayment: null,
    history: [
      { title: "Регистрация", text: `${name}, аккаунт создан. Уровень не выдан, выберите пакет самостоятельно.` }
    ]
  };
}

function passwordHash(password, salt) {
  return scryptSync(password, salt, 64).toString("hex");
}

function createPasswordRecord(password) {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: passwordHash(password, salt) };
}

function verifyPassword(password, salt, expectedHash) {
  const actual = Buffer.from(passwordHash(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function supabaseRequest(path, options = {}) {
  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error("Supabase is not configured");
  }
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseSecretKey,
      Authorization: `Bearer ${supabaseSecretKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.hint || "Supabase request failed");
  }
  return data;
}

async function findUser(phone) {
  const rows = await supabaseRequest(`app_users?phone=eq.${encodeURIComponent(phone)}&select=*`);
  return rows?.[0] || null;
}

async function createUser({ name, phone, countryCode, password, sponsor }) {
  const existing = await findUser(phone);
  if (existing) {
    const error = new Error("Account already exists");
    error.status = 409;
    throw error;
  }
  const passwordRecord = createPasswordRecord(password);
  const rows = await supabaseRequest("app_users", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      phone,
      name,
      country_code: countryCode,
      sponsor: sponsor && sponsor !== phone ? sponsor : null,
      password_hash: passwordRecord.hash,
      password_salt: passwordRecord.salt,
      app_state: defaultAppState(name)
    })
  });
  return rows?.[0];
}

async function updateUserState(phone, appState) {
  const rows = await supabaseRequest(`app_users?phone=eq.${encodeURIComponent(phone)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ app_state: appState })
  });
  return rows?.[0];
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

async function handleRegister(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();
  const countryCode = String(body.countryCode || "").trim();
  const password = String(body.password || "");
  const sponsor = String(body.sponsor || "").trim();

  if (!name || !phone || password.length < 4) {
    sendJson(res, 400, { error: "Invalid registration data" });
    return;
  }

  const user = await createUser({ name, phone, countryCode, password, sponsor });
  sendJson(res, 200, { user: publicUser(user), app: user.app_state || {} });
}

async function handleLogin(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const phone = String(body.phone || "").trim();
  const password = String(body.password || "");
  const user = await findUser(phone);

  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    sendJson(res, 401, { error: "Invalid phone or password" });
    return;
  }

  sendJson(res, 200, { user: publicUser(user), app: user.app_state || {} });
}

async function handleSaveState(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const phone = String(body.phone || "").trim();
  const app = body.app || null;

  if (!phone || !app || typeof app !== "object") {
    sendJson(res, 400, { error: "Invalid state payload" });
    return;
  }

  const user = await updateUserState(phone, app);
  sendJson(res, 200, { user: publicUser(user), app: user.app_state || {} });
}

async function handleGetState(req, res, phone) {
  const user = await findUser(phone);
  if (!user) {
    sendJson(res, 404, { error: "Account not found" });
    return;
  }
  sendJson(res, 200, { user: publicUser(user), app: user.app_state || {} });
}

async function handleReferralBonus(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const buyerPhone = String(body.buyerPhone || "").trim();
  const amount = Number(body.amount || 0);
  const buyer = await findUser(buyerPhone);

  if (!buyer || !Number.isFinite(amount) || amount <= 0) {
    sendJson(res, 400, { error: "Invalid referral bonus payload" });
    return;
  }

  const percents = [10, 2.5, 1];
  const results = [];
  let sponsorPhone = buyer.sponsor || "";

  for (let index = 0; index < 3; index += 1) {
    if (!sponsorPhone) break;
    const sponsor = await findUser(sponsorPhone);
    if (!sponsor) break;

    const bonus = Number((amount * percents[index] / 100).toFixed(2));
    const app = sponsor.app_state || {};
    const report = {
      from: buyer.phone,
      fromName: buyer.name,
      level: index + 1,
      percent: percents[index],
      amount: bonus,
      date: new Date().toLocaleString("ru-RU")
    };

    app.balance = Number((Number(app.balance || 0) + bonus).toFixed(2));
    app.totalIncome = Number((Number(app.totalIncome || 0) + bonus).toFixed(2));
    app.referralReports = [report, ...(app.referralReports || [])].slice(0, 100);
    app.history = [
      {
        title: "Реферальный бонус",
        text: `$${bonus.toFixed(2)} от ${buyer.name} за покупку уровня. Линия ${index + 1}, ${percents[index]}%.`
      },
      ...(app.history || [])
    ].slice(0, 100);

    await updateUserState(sponsor.phone, app);
    results.push(report);
    sponsorPhone = sponsor.sponsor || "";
  }

  sendJson(res, 200, { bonuses: results });
}

async function handleTeam(req, res, phone) {
  const rows = await supabaseRequest("app_users?select=phone,name,sponsor,app_state");
  const user = rows.find((row) => row.phone === phone);
  const first = rows.filter((row) => row.sponsor === phone);
  const firstPhones = first.map((row) => row.phone);
  const second = rows.filter((row) => firstPhones.includes(row.sponsor));
  const secondPhones = second.map((row) => row.phone);
  const third = rows.filter((row) => secondPhones.includes(row.sponsor));
  const clean = (row) => ({ phone: row.phone, name: row.name, sponsor: row.sponsor || "" });

  sendJson(res, 200, {
    lines: [first.map(clean), second.map(clean), third.map(clean)],
    reports: user?.app_state?.referralReports || []
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

    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      await handleRegister(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      await handleLogin(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/user-state") {
      await handleSaveState(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/user-state/")) {
      const phone = decodeURIComponent(url.pathname.split("/").pop() || "");
      await handleGetState(req, res, phone);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/referral-bonus") {
      await handleReferralBonus(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/team/")) {
      const phone = decodeURIComponent(url.pathname.split("/").pop() || "");
      await handleTeam(req, res, phone);
      return;
    }

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
