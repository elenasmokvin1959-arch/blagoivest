const levels = [
  { id: 1, title: "1 уровень продаж", price: 50, daily: 2 },
  { id: 2, title: "2 уровень продаж", price: 100, daily: 4 },
  { id: 3, title: "3 уровень продаж", price: 250, daily: 10 },
  { id: 4, title: "4 уровень продаж", price: 500, daily: 22 },
  { id: 5, title: "5 уровень продаж", price: 1000, daily: 48 },
  { id: 6, title: "6 уровень продаж", price: 2500, daily: 125 },
  { id: 7, title: "7 уровень продаж", price: 5000, daily: 270 }
];

const countryCodes = [
  ["Молдова", "+373"], ["ПМР / Молдова", "+373"], ["Украина", "+380"], ["Россия", "+7"], ["Казахстан", "+7"],
  ["Румыния", "+40"], ["Болгария", "+359"], ["Турция", "+90"], ["Грузия", "+995"], ["Армения", "+374"],
  ["Азербайджан", "+994"], ["Беларусь", "+375"], ["Польша", "+48"], ["Германия", "+49"], ["Франция", "+33"],
  ["Италия", "+39"], ["Испания", "+34"], ["Португалия", "+351"], ["Нидерланды", "+31"], ["Бельгия", "+32"],
  ["Чехия", "+420"], ["Словакия", "+421"], ["Венгрия", "+36"], ["Греция", "+30"], ["Кипр", "+357"],
  ["Литва", "+370"], ["Латвия", "+371"], ["Эстония", "+372"], ["Великобритания", "+44"], ["Ирландия", "+353"],
  ["США / Канада", "+1"], ["Мексика", "+52"], ["Бразилия", "+55"], ["Аргентина", "+54"], ["Колумбия", "+57"],
  ["ОАЭ", "+971"], ["Саудовская Аравия", "+966"], ["Израиль", "+972"], ["Индия", "+91"], ["Китай", "+86"],
  ["Гонконг", "+852"], ["Сингапур", "+65"], ["Таиланд", "+66"], ["Вьетнам", "+84"], ["Индонезия", "+62"],
  ["Филиппины", "+63"], ["Южная Корея", "+82"], ["Япония", "+81"], ["Австралия", "+61"], ["Новая Зеландия", "+64"]
];

const networks = ["USDT TRC20", "USDT Polygon POS", "LTC", "BTC"];
const stateKey = "crypto-invest-mobile-state";

const defaultState = {
  accounts: {},
  currentPhone: "",
  pendingRef: "",
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
  history: [
    { title: "Добро пожаловать", text: "Зарегистрируйтесь, добавьте адрес вывода и выберите первый уровень." }
  ]
};

let authMode = "login";
let state = loadState();
let cloudSaveTimer = null;

const screens = {
  home: document.querySelector("#homeScreen"),
  levels: document.querySelector("#levelsScreen"),
  blago: document.querySelector("#blagoScreen"),
  income: document.querySelector("#incomeScreen"),
  share: document.querySelector("#shareScreen"),
  profile: document.querySelector("#profileScreen")
};

const els = {
  authScreen: document.querySelector("#authScreen"),
  authForm: document.querySelector("#authForm"),
  authError: document.querySelector("#authError"),
  authSubmit: document.querySelector("#authSubmit"),
  countryCode: document.querySelector("#countryCode"),
  balance: document.querySelector("#balanceValue"),
  activeLevelText: document.querySelector("#activeLevelText"),
  levelList: document.querySelector("#levelList"),
  blagoLevel: document.querySelector("#blagoLevel"),
  timerValue: document.querySelector("#timerValue"),
  timerStatus: document.querySelector("#timerStatus"),
  startBlago: document.querySelector("#startBlago"),
  claimIncome: document.querySelector("#claimIncome"),
  totalIncome: document.querySelector("#totalIncome"),
  pendingIncome: document.querySelector("#pendingIncome"),
  incomeFeed: document.querySelector("#incomeFeed"),
  withdrawNetwork: document.querySelector("#withdrawNetwork"),
  withdrawAmount: document.querySelector("#withdrawAmount"),
  withdrawList: document.querySelector("#withdrawList"),
  withdrawBtn: document.querySelector("#withdrawBtn"),
  copyRef: document.querySelector("#copyRef"),
  refLink: document.querySelector("#refLink"),
  profileAvatar: document.querySelector("#profileAvatar"),
  profileName: document.querySelector("#profileName"),
  profilePhone: document.querySelector("#profilePhone"),
  walletForm: document.querySelector("#walletForm"),
  walletNetwork: document.querySelector("#walletNetwork"),
  walletAddress: document.querySelector("#walletAddress"),
  walletList: document.querySelector("#walletList"),
  profilePanel: document.querySelector("#profilePanel"),
  logoutButton: document.querySelector("#logoutButton"),
  toast: document.querySelector("#toast"),
  themeToggle: document.querySelector("#themeToggle"),
  paymentModal: document.querySelector("#paymentModal"),
  paymentClose: document.querySelector("#paymentClose"),
  paymentLevelText: document.querySelector("#paymentLevelText"),
  paymentResult: document.querySelector("#paymentResult")
};

let selectedPaymentLevel = null;

function loadState() {
  try {
    return { ...defaultState, ...JSON.parse(localStorage.getItem(stateKey)) };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  persistCurrentAccount();
  localStorage.setItem(stateKey, JSON.stringify(state));
  queueCloudSave();
}

function currentUser() {
  return state.currentPhone ? state.accounts[state.currentPhone] : null;
}

function persistCurrentAccount() {
  if (!state.currentPhone || !state.accounts[state.currentPhone]) return;
  state.accounts[state.currentPhone].app = {
    balance: state.balance,
    pending: state.pending,
    totalIncome: state.totalIncome,
    activeLevel: state.activeLevel,
    cycleEndsAt: state.cycleEndsAt,
    cycleReady: state.cycleReady,
    lastStartDate: state.lastStartDate,
    wallets: state.wallets || {},
    withdrawalRequests: state.withdrawalRequests || [],
    history: state.history || [],
    referralReports: state.referralReports || [],
    pendingPayment: state.pendingPayment || null
  };
}

function loadAccountApp(phone) {
  const app = state.accounts[phone]?.app || {};
  state.balance = Number(app.balance || 0);
  state.pending = Number(app.pending || 0);
  state.totalIncome = Number(app.totalIncome || 0);
  state.activeLevel = Number(app.activeLevel || 0);
  state.cycleEndsAt = Number(app.cycleEndsAt || 0);
  state.cycleReady = Boolean(app.cycleReady);
  state.lastStartDate = app.lastStartDate || "";
  state.wallets = app.wallets || {};
  state.withdrawalRequests = app.withdrawalRequests || [];
  state.history = app.history || [
    { title: "Добро пожаловать", text: "Аккаунт открыт. Уровень не выдан, выберите пакет самостоятельно." }
  ];
  state.referralReports = app.referralReports || [];
  state.pendingPayment = app.pendingPayment || null;
}

function appSnapshot() {
  return {
    balance: state.balance,
    pending: state.pending,
    totalIncome: state.totalIncome,
    activeLevel: state.activeLevel,
    cycleEndsAt: state.cycleEndsAt,
    cycleReady: state.cycleReady,
    lastStartDate: state.lastStartDate,
    wallets: state.wallets || {},
    withdrawalRequests: state.withdrawalRequests || [],
    history: state.history || [],
    referralReports: state.referralReports || [],
    pendingPayment: state.pendingPayment || null
  };
}

function hydrateAccount(user, app) {
  if (!user?.phone) return;
  state.accounts[user.phone] = {
    name: user.name,
    phone: user.phone,
    countryCode: user.countryCode,
    sponsor: user.sponsor || "",
    createdAt: user.createdAt,
    app: app || user.app || {}
  };
}

function queueCloudSave() {
  if (!state.currentPhone) return;
  window.clearTimeout(cloudSaveTimer);
  cloudSaveTimer = window.setTimeout(() => {
    fetch("/api/user-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: state.currentPhone, app: appSnapshot() })
    }).catch(() => {});
  }, 450);
}

async function apiPost(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Ошибка сервера");
  }
  return data;
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizePhone(code, phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return `${code}${digits}`;
}

function readReferralFromUrl() {
  const ref = new URLSearchParams(window.location.search).get("ref");
  if (ref) {
    state.pendingRef = decodeURIComponent(ref).trim();
    localStorage.setItem("crypto-invest-pending-ref", state.pendingRef);
    return;
  }
  state.pendingRef = state.pendingRef || localStorage.getItem("crypto-invest-pending-ref") || "";
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isBusinessDay() {
  const day = new Date().getDay();
  return day >= 1 && day <= 5;
}

function addHistory(title, text) {
  state.history.unshift({ title, text });
  state.history = state.history.slice(0, 24);
}

function toast(text) {
  els.toast.textContent = text;
  els.toast.classList.add("is-visible");
  window.clearTimeout(toast.hideTimer);
  toast.hideTimer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 2200);
}

function populateCountryCodes() {
  els.countryCode.innerHTML = countryCodes
    .map(([country, code]) => `<option value="${code}">${code} ${country}</option>`)
    .join("");
}

function setAuthMode(mode) {
  authMode = mode;
  els.authForm.classList.toggle("is-register", mode === "register");
  els.authSubmit.textContent = mode === "register" ? "Зарегистрироваться" : "Войти";
  els.authError.textContent = "";
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.authMode === mode);
  });
}

function setLoggedIn(phone) {
  persistCurrentAccount();
  state.currentPhone = phone;
  loadAccountApp(phone);
  saveState();
  document.body.classList.remove("auth-locked");
  render();
}

function setLoggedInFromApi(user, app) {
  if (!user || !user.phone) {
    throw new Error("Сервер не вернул данные аккаунта. Проверьте Supabase и Render Environment.");
  }
  hydrateAccount(user, app);
  state.currentPhone = user.phone;
  loadAccountApp(user.phone);
  localStorage.setItem(stateKey, JSON.stringify(state));
  document.body.classList.remove("auth-locked");
  render();
}

function logout() {
  state.currentPhone = "";
  saveState();
  document.body.classList.add("auth-locked");
  setScreen("home");
}

async function handleAuth(event) {
  event.preventDefault();
  const form = new FormData(els.authForm);
  const name = String(form.get("name") || "").trim();
  const countryCode = String(form.get("countryCode") || "+373");
  const phone = normalizePhone(countryCode, form.get("phone"));
  const password = String(form.get("password") || "");
  const passwordConfirm = String(form.get("passwordConfirm") || "");

  if (phone.length < countryCode.length + 5) {
    els.authError.textContent = "Введите корректный номер телефона.";
    return;
  }

  if (authMode === "register") {
    if (!name) {
      els.authError.textContent = "Введите имя.";
      return;
    }
    if (password.length < 4) {
      els.authError.textContent = "Пароль должен быть минимум 4 символа.";
      return;
    }
    if (password !== passwordConfirm) {
      els.authError.textContent = "Пароли не совпадают.";
      return;
    }
    if (state.accounts[phone]) {
      els.authError.textContent = "Аккаунт с таким номером уже есть.";
      return;
    }

    try {
      const data = await apiPost("/api/auth/register", {
        name,
        countryCode,
        phone,
        password,
        sponsor: state.pendingRef && state.pendingRef !== phone ? state.pendingRef : ""
      });
      setLoggedInFromApi(data.user, data.app);
      toast("Регистрация завершена");
    } catch (error) {
      els.authError.textContent = error.message;
    }
    return;
  }

  try {
    const data = await apiPost("/api/auth/login", { phone, password });
    setLoggedInFromApi(data.user, data.app);
    toast("Вы вошли в аккаунт");
  } catch (error) {
    els.authError.textContent = error.message;
  }
}

function setScreen(name) {
  Object.entries(screens).forEach(([key, screen]) => {
    screen.classList.toggle("is-active", key === name);
  });
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.nav === name);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHeader() {
  const active = levels.find((level) => level.id === state.activeLevel);
  els.balance.textContent = money(state.balance);
  els.activeLevelText.textContent = active ? `${active.title} активен` : "Уровень не приобретен";
  els.blagoLevel.textContent = active ? active.title : "Уровень не выбран";
}

function renderLevels() {
  els.levelList.innerHTML = "";
  levels.forEach((level) => {
    const locked = state.activeLevel > level.id;
    const active = state.activeLevel === level.id;
    const affordable = state.balance >= level.price;
    const card = document.createElement("article");
    card.className = `level-card${locked ? " is-locked" : ""}${active ? " is-active" : ""}`;
    card.innerHTML = `
      <div>
        <strong>${level.title}</strong>
        <span>Стоимость ${money(level.price)}</span>
        <small>Ежедневный доход ${money(level.daily)}</small>
        <small>${affordable || active || locked ? "" : `Не хватает ${money(level.price - state.balance)}`}</small>
      </div>
      <button type="button" ${locked || active ? "disabled" : ""}>
        ${locked ? "Закрыт" : active ? "Куплен" : affordable ? "Купить" : "Оплатить"}
      </button>
    `;
    card.querySelector("button").addEventListener("click", () => buyLevel(level));
    els.levelList.append(card);
  });
}

function buyLevel(level) {
  if (state.balance < level.price) {
    openPaymentModal(level);
    return;
  }
  state.balance = Number((state.balance - level.price).toFixed(2));
  activatePaidLevel(level, `Баланс списан: ${money(level.price)}.`);
  toast(`${level.title} активирован`);
}

function activatePaidLevel(level, note) {
  state.activeLevel = level.id;
  addHistory("Покупка уровня", `${level.title} приобретен за ${money(level.price)}. ${note} Предыдущие уровни закрыты, следующие доступны.`);
  applyReferralBonuses(level.price);
  saveState();
  render();
}

function openPaymentModal(level) {
  selectedPaymentLevel = level;
  els.paymentLevelText.textContent = `${level.title}: к оплате ${money(level.price)}. Выберите монету и сеть.`;
  els.paymentResult.innerHTML = "<span>После выбора монеты откроется ссылка на оплату. Если ссылка не появилась, значит backend Render ещё не настроен как Web Service.</span>";
  els.paymentModal.hidden = false;
  toast("Выберите монету для оплаты");
}

function closePaymentModal() {
  els.paymentModal.hidden = true;
  selectedPaymentLevel = null;
}

async function createCryptoPayment(currency, label) {
  if (!selectedPaymentLevel) return;
  const user = currentUser();
  els.paymentResult.textContent = "Создаем платеж...";
  try {
    const response = await fetch("/api/nowpayments/create-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        levelId: selectedPaymentLevel.id,
        payCurrency: currency,
        payLabel: label,
        userPhone: user?.phone || "",
        userName: user?.name || ""
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Оплата пока не настроена на сервере. Проверьте Render Web Service и переменные NOWPayments.");
    }
    if (!data.paymentUrl) {
      throw new Error("NOWPayments не вернул ссылку оплаты. Проверьте API key и валюту.");
    }
    els.paymentResult.innerHTML = `
      <strong>Платеж создан: ${escapeHtml(label)}</strong>
      <span>Сумма уровня: ${money(selectedPaymentLevel.price)}</span>
      <a href="${escapeHtml(data.paymentUrl)}" target="_blank" rel="noreferrer">Открыть оплату</a>
      <button class="secondary-btn" type="button" data-check-payment="${escapeHtml(data.paymentId)}">Проверить оплату</button>
    `;
    state.pendingPayment = {
      paymentId: data.paymentId,
      levelId: selectedPaymentLevel.id,
      amount: selectedPaymentLevel.price,
      payLabel: label
    };
    saveState();
  } catch (error) {
    els.paymentResult.innerHTML = `<strong>Платеж не создан</strong><span>${escapeHtml(error.message)}</span>`;
    toast("Платеж не создан");
  }
}

async function checkCryptoPayment(paymentId) {
  const pending = state.pendingPayment;
  if (!pending || pending.paymentId !== paymentId) {
    toast("Платеж не найден");
    return;
  }
  els.paymentResult.append(" Проверяем статус...");
  try {
    const response = await fetch(`/api/nowpayments/payment-status/${encodeURIComponent(paymentId)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Не удалось проверить оплату");
    const paidStatuses = ["confirmed", "finished"];
    if (!paidStatuses.includes(data.paymentStatus)) {
      toast(`Статус: ${data.paymentStatus || "ожидает оплаты"}`);
      return;
    }
    const level = levels.find((item) => item.id === pending.levelId);
    if (!level) throw new Error("Уровень не найден");
    activatePaidLevel(level, `Оплата NOWPayments подтверждена. Валюта: ${pending.payLabel}.`);
    state.pendingPayment = null;
    saveState();
    closePaymentModal();
    toast("Оплата подтверждена");
  } catch (error) {
    toast(error.message);
  }
}

function referralChainFor(phone) {
  const chain = [];
  let cursor = state.accounts[phone]?.sponsor || "";
  for (let i = 0; i < 3; i += 1) {
    if (!cursor || !state.accounts[cursor] || chain.includes(cursor)) break;
    chain.push(cursor);
    cursor = state.accounts[cursor].sponsor || "";
  }
  return chain;
}

function applyReferralBonuses(amount) {
  const buyer = currentUser();
  if (!buyer) return;
  fetch("/api/referral-bonus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buyerPhone: buyer.phone, amount })
  }).catch(() => {});
  const percents = [10, 2.5, 1];
  referralChainFor(buyer.phone).forEach((sponsorPhone, index) => {
    const sponsor = state.accounts[sponsorPhone];
    const bonus = Number((amount * percents[index] / 100).toFixed(2));
    sponsor.app = sponsor.app || {};
    sponsor.app.balance = Number((Number(sponsor.app.balance || 0) + bonus).toFixed(2));
    sponsor.app.totalIncome = Number((Number(sponsor.app.totalIncome || 0) + bonus).toFixed(2));
    sponsor.app.referralReports = sponsor.app.referralReports || [];
    sponsor.app.history = sponsor.app.history || [];
    const report = {
      from: buyer.phone,
      fromName: buyer.name,
      level: index + 1,
      percent: percents[index],
      amount: bonus,
      date: new Date().toLocaleString("ru-RU")
    };
    sponsor.app.referralReports.unshift(report);
    sponsor.app.history.unshift({
      title: "Реферальный бонус",
      text: `${money(bonus)} от ${buyer.name} за покупку уровня. Линия ${index + 1}, ${percents[index]}%.`
    });
    if (state.currentPhone === sponsorPhone) {
      state.balance = sponsor.app.balance;
      state.totalIncome = sponsor.app.totalIncome;
      state.referralReports = sponsor.app.referralReports;
      state.history = sponsor.app.history;
    }
  });
}

function getActiveDaily() {
  return levels.find((level) => level.id === state.activeLevel)?.daily || 0;
}

function updateTimer() {
  if (!state.cycleEndsAt) {
    els.timerValue.textContent = "24:00:00";
    els.timerStatus.textContent = state.activeLevel
      ? "Нажмите старт: доход сразу начислится в ожидание, следующий запуск будет через 24 часа."
      : "Купите уровень, чтобы запустить ежедневный цикл.";
    els.startBlago.disabled = !state.activeLevel;
    return;
  }

  const left = state.cycleEndsAt - Date.now();
  if (left <= 0) {
    state.cycleEndsAt = 0;
    if (!state.cycleReady) {
      state.cycleReady = true;
      saveState();
    }
    els.timerValue.textContent = "24:00:00";
    els.timerStatus.textContent = "Можно снова нажать старт и начислить следующий ежедневный доход.";
    els.startBlago.disabled = false;
    return;
  }

  const total = Math.floor(left / 1000);
  const hours = String(Math.floor(total / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  els.timerValue.textContent = `${hours}:${minutes}:${seconds}`;
  els.timerStatus.textContent = "До следующего запуска BLAGO. Накопленный доход можно забрать кнопкой ниже.";
  els.startBlago.disabled = true;
}

function startBlago() {
  if (!state.activeLevel) {
    toast("Сначала купите уровень");
    setScreen("levels");
    return;
  }
  if (!isBusinessDay()) {
    toast("BLAGO запускается с понедельника по пятницу");
    return;
  }
  if (state.cycleEndsAt && state.cycleEndsAt > Date.now()) {
    toast("Следующий старт будет доступен после 24 часов");
    return;
  }
  const amount = getActiveDaily();
  state.pending = Number((state.pending + amount).toFixed(2));
  state.cycleEndsAt = Date.now() + 24 * 60 * 60 * 1000;
  state.cycleReady = false;
  state.lastStartDate = todayKey();
  addHistory("BLAGO начислен", `${money(amount)} добавлены в ожидающий доход. Следующий старт доступен через 24 часа.`);
  saveState();
  render();
  toast(`${money(amount)} начислены, заберите доход`);
}

function claimIncome() {
  if (!state.pending) {
    toast("Пока нет дохода к получению");
    return;
  }
  const amount = state.pending;
  state.balance = Number((state.balance + amount).toFixed(2));
  state.totalIncome = Number((state.totalIncome + amount).toFixed(2));
  state.pending = 0;
  addHistory("Доход получен", `${money(amount)} зачислены на баланс.`);
  saveState();
  render();
  toast(`${money(amount)} зачислены`);
}

function withdraw() {
  if (!state.activeLevel) {
    toast("Вывод доступен только после покупки уровня");
    setScreen("levels");
    return;
  }
  if (!isBusinessDay()) {
    toast("Заявки на вывод доступны с понедельника по пятницу");
    return;
  }
  const network = els.withdrawNetwork.value;
  const address = state.wallets?.[network] || "";
  if (!address) {
    toast(`Добавьте адрес ${network} в профиле`);
    setScreen("profile");
    return;
  }
  if (state.balance <= 0) {
    toast("На балансе нет средств");
    return;
  }
  const amount = Number(els.withdrawAmount.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    toast("Введите сумму вывода");
    return;
  }
  if (amount < 5) {
    toast("Минимальная сумма вывода $5");
    return;
  }
  if (amount > state.balance) {
    toast("Сумма больше баланса");
    return;
  }
  const request = {
    id: `wd-${Date.now()}`,
    amount,
    network,
    address,
    status: "В обработке",
    createdAt: new Date().toLocaleString("ru-RU")
  };
  state.balance = Number((state.balance - amount).toFixed(2));
  state.withdrawalRequests = [request, ...(state.withdrawalRequests || [])].slice(0, 30);
  addHistory("Заявка на вывод отправлена", `${money(amount)} на ${network} отправлены в обработку. Адрес: ${address}`);
  els.withdrawAmount.value = "";
  saveState();
  render();
  toast("Заявка на вывод отправлена и находится в обработке");
}

function renderIncome() {
  els.totalIncome.textContent = money(state.totalIncome);
  els.pendingIncome.textContent = money(state.pending);
  renderWithdrawals();
  els.incomeFeed.innerHTML = "";
  state.history.forEach((item) => {
    const row = document.createElement("article");
    row.className = "feed-item";
    row.innerHTML = `<strong>${item.title}</strong><p>${item.text}</p>`;
    els.incomeFeed.append(row);
  });
}

function renderWithdrawals() {
  els.withdrawList.innerHTML = "";
  const requests = state.withdrawalRequests || [];
  if (!requests.length) return;
  requests.forEach((request) => {
    const item = document.createElement("article");
    item.className = "withdraw-item";
    item.innerHTML = `
      <span class="status-pill">${escapeHtml(request.status)}</span>
      <strong>${money(request.amount)} · ${escapeHtml(request.network)}</strong>
      <span>${escapeHtml(request.address)}</span>
      <span>${escapeHtml(request.createdAt)}</span>
    `;
    els.withdrawList.append(item);
  });
}

function saveWallet(event) {
  event.preventDefault();
  const network = els.walletNetwork.value;
  const address = els.walletAddress.value.trim();
  if (!address) {
    toast("Введите адрес или ссылку");
    return;
  }
  state.wallets = { ...(state.wallets || {}), [network]: address };
  addHistory("Адрес вывода сохранен", `${network}: ${address}`);
  saveState();
  els.walletAddress.value = "";
  renderWallets();
  renderIncome();
  toast("Адрес сохранен");
}

function renderProfile() {
  const user = currentUser();
  const name = user?.name || "Профиль";
  els.profileName.textContent = name;
  els.profilePhone.textContent = user?.sponsor
    ? `${user.phone} · пригласил ${user.sponsor}`
    : user?.phone || "Телефон не указан";
  els.profileAvatar.textContent = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "CI";
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  els.refLink.value = `${baseUrl}?ref=${encodeURIComponent(user?.phone || "blago-user")}`;
  renderWallets();
}

function renderWallets() {
  els.walletList.innerHTML = "";
  networks.forEach((network) => {
    const address = state.wallets?.[network];
    const item = document.createElement("div");
    item.className = "wallet-item";
    item.innerHTML = `<strong>${network}</strong><span>${address || "Адрес не сохранен"}</span>`;
    els.walletList.append(item);
  });
}

function renderProfilePanel(type = "team") {
  const team = getTeamLines(state.currentPhone);
  const teamHtml = team.map((line, index) => {
    const names = line.length
      ? line.map((account) => `${escapeHtml(account.name)} · ${escapeHtml(account.phone)}`).join("<br>")
      : "Пока нет партнеров";
    return `<strong>${index + 1} уровень: ${line.length}</strong><br>${names}`;
  }).join("<br><br>");
  const reports = (state.referralReports || []);
  const reportHtml = reports.length
    ? reports.map((item) => `<strong>${money(item.amount)} · ${item.percent}% · ${item.level} линия</strong><br>${escapeHtml(item.fromName)} · ${escapeHtml(item.from)}<br>${escapeHtml(item.date)}`).join("<br><br>")
    : "Пока нет реферальных начислений.";
  const content = {
    withdrawals: `<strong>Общий доход</strong><br>Всего заработано: ${money(state.totalIncome)}<br>Текущий баланс: ${money(state.balance)}<br>Вывод доступен после сохранения адреса в профиле.`,
    details: "<strong>Детали дохода</strong><br>Здесь отображаются ежедневные начисления BLAGO, дата запуска, дата получения и сумма.",
    team: `<strong>Размер команды</strong><br>${teamHtml}`,
    report: `<strong>Отчет команды</strong><br>${reportHtml}<br><br>Проценты: 10% от 1 линии, 2.5% от 2 линии, 1% от 3 линии.`
  };
  els.profilePanel.innerHTML = content[type] || content.team;
  refreshTeamPanel(type);
}

async function refreshTeamPanel(type) {
  if (!state.currentPhone || !["team", "report"].includes(type)) return;
  try {
    const response = await fetch(`/api/team/${encodeURIComponent(state.currentPhone)}`);
    const data = await response.json();
    if (!response.ok) return;
    if (type === "team") {
      const html = data.lines.map((line, index) => {
        const names = line.length
          ? line.map((account) => `${escapeHtml(account.name)} · ${escapeHtml(account.phone)}`).join("<br>")
          : "Пока нет партнеров";
        return `<strong>${index + 1} уровень: ${line.length}</strong><br>${names}`;
      }).join("<br><br>");
      els.profilePanel.innerHTML = `<strong>Размер команды</strong><br>${html}`;
    }
    if (type === "report") {
      const reports = data.reports || [];
      const html = reports.length
        ? reports.map((item) => `<strong>${money(item.amount)} · ${item.percent}% · ${item.level} линия</strong><br>${escapeHtml(item.fromName)} · ${escapeHtml(item.from)}<br>${escapeHtml(item.date)}`).join("<br><br>")
        : "Пока нет реферальных начислений.";
      els.profilePanel.innerHTML = `<strong>Отчет команды</strong><br>${html}<br><br>Проценты: 10% от 1 линии, 2.5% от 2 линии, 1% от 3 линии.`;
    }
  } catch {}
}

function getTeamLines(phone) {
  const accounts = Object.values(state.accounts || {});
  const first = accounts.filter((account) => account.sponsor === phone);
  const firstPhones = first.map((account) => account.phone);
  const second = accounts.filter((account) => firstPhones.includes(account.sponsor));
  const secondPhones = second.map((account) => account.phone);
  const third = accounts.filter((account) => secondPhones.includes(account.sponsor));
  return [first, second, third];
}

function render() {
  renderHeader();
  renderLevels();
  renderIncome();
  renderProfile();
  updateTimer();
}

readReferralFromUrl();
populateCountryCodes();
setAuthMode("login");

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
});

document.querySelectorAll("[data-nav]").forEach((button) => {
  button.addEventListener("click", () => setScreen(button.dataset.nav));
});

document.querySelectorAll("[data-panel]").forEach((button) => {
  button.addEventListener("click", () => renderProfilePanel(button.dataset.panel));
});

els.authForm.addEventListener("submit", handleAuth);
els.startBlago.addEventListener("click", startBlago);
els.claimIncome.addEventListener("click", claimIncome);
els.withdrawBtn.addEventListener("click", withdraw);
els.walletForm.addEventListener("submit", saveWallet);
els.logoutButton.addEventListener("click", logout);
els.paymentClose.addEventListener("click", closePaymentModal);
els.paymentModal.addEventListener("click", (event) => {
  if (event.target === els.paymentModal) closePaymentModal();
});
document.querySelectorAll("[data-pay-currency]").forEach((button) => {
  button.addEventListener("click", () => createCryptoPayment(button.dataset.payCurrency, button.dataset.payLabel));
});
els.paymentResult.addEventListener("click", (event) => {
  const button = event.target.closest("[data-check-payment]");
  if (button) checkCryptoPayment(button.dataset.checkPayment);
});
els.copyRef.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(els.refLink.value);
    toast("Ссылка скопирована");
  } catch {
    els.refLink.select();
    toast("Ссылка выделена");
  }
});

els.themeToggle.addEventListener("click", () => {
  document.documentElement.classList.toggle("dark");
  localStorage.setItem("crypto-invest-theme", document.documentElement.classList.contains("dark") ? "dark" : "light");
});

if (localStorage.getItem("crypto-invest-theme") === "dark") {
  document.documentElement.classList.add("dark");
}

if (currentUser()) {
  loadAccountApp(state.currentPhone);
  document.body.classList.remove("auth-locked");
}

renderProfilePanel();
render();
window.setInterval(() => {
  updateTimer();
  renderHeader();
}, 1000);
