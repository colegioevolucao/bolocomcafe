import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://whsxgjjkpnuwyvbqzgiy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_e1DZJ7G8FXwfdNVp6rlEnA_Hdf_dF0b";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CAKE_FLAVORS = [
  "Baeta","Banana","Banana com doce de leite","Branco","Brigadeiro","Brownie Maluco","Cenoura",
  "Cenoura Supreme","Chocolate","Chocolatudo","Choconinho","Churros","Cocada",
  "Formigueiro","Frutas Vermelhas","Laranja","Limão Siciliano",
  "Limão siciliano com amora","Macaxeira Caramelizada","Milho Cremoso","Ninho",
  "Paçoca","Queijadinha","Queijo com goiabada","Bolo de Noiva"
];

const SLICE_FLAVORS = [
  "Brownie","Bolo de Noiva","Laranja","Limão Siciliano","Cenoura","Queijo com goiabada"
];

const POT_FLAVORS = ["Oreo","Dois amores","Chocolate","Ovomaltine"];
const COOKIE_SIZES = ["Pequeno","Grande"];
const EXTRA_PORTION_FLAVORS = [
  "Brigadeiro preto",
  "Brigadeiro branco",
  "Goiabada",
  "Cocada",
  "Doce de leite",
  "Mousse de limão"
];
const CHANNELS = ["WhatsApp","Anotaí","Balcão"];
const PAYMENT_STATUSES = ["Pendente","Pago"];

const SALES_TABS = {
  cake: {
    label: "Bolos",
    singular: "Bolo",
    flavorField: "whole_cake_flavor",
    qtyField: "whole_cake_qty",
    priceField: "whole_cake_price",
    choices: CAKE_FLAVORS,
    choiceLabel: "Sabor"
  },
  pot: {
    label: "Bolo no Pote",
    singular: "Bolo no pote",
    flavorField: "pot_cake_flavor",
    qtyField: "pot_cake_qty",
    priceField: "pot_cake_price",
    choices: POT_FLAVORS,
    choiceLabel: "Sabor"
  },
  slice: {
    label: "Fatias",
    singular: "Fatia",
    flavorField: "slice_flavor",
    qtyField: "slice_qty",
    priceField: "slice_price",
    choices: SLICE_FLAVORS,
    choiceLabel: "Sabor"
  },
  cookie: {
    label: "Cookies",
    singular: "Cookie",
    flavorField: "cookie_size",
    qtyField: "cookie_qty",
    priceField: "cookie_price",
    choices: COOKIE_SIZES,
    choiceLabel: "Tamanho"
  }
};

function supportsExtraPortion(category) {
  return category === "cake" || category === "slice";
}

const state = {
  session: null,
  profile: null,
  roleIntent: null,
  view: "sales",

  // Registro diário
  sales: [],
  month: new Date().toISOString().slice(0,7),
  activeSalesTab: "today",

  // Controle gerencial
  controlSales: [],
  controlTodaySales: [],
  historicalSales: [],
  historyMeta: null,
  controlView: "today",
  controlPeriodType: "month",
  controlReferenceDate: new Date().toISOString().slice(0,10),

  // Financeiro
  financeSales: [],
  financeView: "pending",
  financePendingPeriodType: "all",
  financePaidPeriodType: "today",
  financePendingReferenceDate: new Date().toISOString().slice(0,10),
  financePaidReferenceDate: new Date().toISOString().slice(0,10),
  financePendingChannel: "",
  financePaidChannel: "",
  financePendingStart: "",
  financePendingEnd: "",
  financePaidStart: "",
  financePaidEnd: "",

  realtime: null
};

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v]) => {
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  });
  children.flat().forEach(c => node.append(c instanceof Node ? c : document.createTextNode(String(c))));
  return node;
};

function money(v) {
  return new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(Number(v || 0));
}
function dateBR(v) {
  if (!v) return "";
  const [y,m,d] = v.split("-");
  return `${d}/${m}/${y}`;
}
function dateTimeBR(v) {
  if (!v) return "Data de pagamento não informada";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "Data de pagamento não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  }).format(d);
}

function dateOnlyFromTimestamp(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return toYMD(d);
}
function options(items, selected = "") {
  const current = selected || "";
  const legacy = current && !items.includes(current)
    ? `<option value="${escapeHtml(current)}" selected>${escapeHtml(current)} (registro anterior)</option>`
    : "";

  return `<option value=""></option>${legacy}` + items
    .map(x => `<option value="${escapeHtml(x)}" ${x===current?"selected":""}>${escapeHtml(x)}</option>`)
    .join("");
}

function paymentStatusOptions(selected = "", isNew = false) {
  const current = selected || (isNew ? "Pendente" : "");
  const values = [
    { value: "pendente", label: "Pendente" },
    { value: "pago", label: "Pago" }
  ];

  return `<option value="">Não informado</option>` + values
    .map(item => `<option value="${item.value}" ${item.value===current || item.label===current ? "selected" : ""}>${item.label}</option>`)
    .join("");
}

function channelOptions(selected = "", isNew = false) {
  const current = selected || "";
  const legacy = current && !CHANNELS.includes(current) && !isNew
    ? `<option value="${escapeHtml(current)}" selected>${escapeHtml(current)} (registro anterior)</option>`
    : "";

  return `<option value=""></option>${legacy}` + CHANNELS
    .map(x => `<option value="${escapeHtml(x)}" ${x===current?"selected":""}>${escapeHtml(x)}</option>`)
    .join("");
}

function getSalesTabConfig(category = state.activeSalesTab) {
  return SALES_TABS[category] || SALES_TABS.cake;
}

function saleBelongsToCategory(sale, category = state.activeSalesTab) {
  const config = getSalesTabConfig(category);
  return Boolean(sale?.[config.flavorField]);
}

function saleLineTotal(sale, category = state.activeSalesTab) {
  const config = getSalesTabConfig(category);
  const mainTotal = Number(sale?.[config.qtyField] || 0) * Number(sale?.[config.priceField] || 0);

  if (!supportsExtraPortion(category)) return mainTotal;

  const extraTotal =
    Number(sale?.extra_portion_qty || 0) *
    Number(sale?.extra_portion_price || 0);

  return mainTotal + extraTotal;
}

function todayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodaySales() {
  const today = todayISO();
  return state.sales.filter(sale => sale.sale_date === today);
}

function getSaleProductLines(sale) {
  return Object.entries(SALES_TABS).flatMap(([key, config]) => {
    const choice = sale?.[config.flavorField];
    const quantity = Number(sale?.[config.qtyField] || 0);
    const unitPrice = Number(sale?.[config.priceField] || 0);

    if (!choice || quantity <= 0) return [];

    const hasExtra =
      supportsExtraPortion(key) &&
      Boolean(sale?.extra_portion_flavor) &&
      Number(sale?.extra_portion_qty || 0) > 0;

    const extraQuantity = hasExtra ? Number(sale.extra_portion_qty || 0) : 0;
    const extraTotal = hasExtra
      ? extraQuantity * Number(sale.extra_portion_price || 0)
      : 0;

    return [{
      category: key,
      product: config.singular,
      choice,
      quantity,
      unitPrice,
      extraFlavor: hasExtra ? sale.extra_portion_flavor : "",
      extraQuantity,
      extraTotal,
      total: (quantity * unitPrice) + extraTotal
    }];
  });
}

function todaySalesSummary() {
  const sales = getTodaySales();
  const lines = sales.flatMap(getSaleProductLines);
  const totalItems = lines.reduce((sum, line) => sum + line.quantity + Number(line.extraQuantity || 0), 0);
  const revenue = lines.reduce((sum, line) => sum + line.total, 0);
  const pending = sales
    .filter(sale => sale.payment_status === "pendente")
    .flatMap(getSaleProductLines)
    .reduce((sum, line) => sum + line.total, 0);

  return {
    orders: sales.length,
    totalItems,
    revenue,
    pending
  };
}

function todaySaleRowHTML(sale, line) {
  const paymentLabel = sale.payment_status === "pago"
    ? "Pago"
    : sale.payment_status === "pendente"
      ? "Pendente"
      : "Não informado";

  const paymentClass = sale.payment_status === "pago"
    ? "status-paid"
    : sale.payment_status === "pendente"
      ? "status-pending"
      : "status-neutral";

  return `
    <tr>
      <td>${escapeHtml(sale.client || "—")}</td>
      <td>${escapeHtml(line.product)}</td>
      <td>
        <div>${escapeHtml(line.choice)}</div>
        ${line.extraFlavor ? `
          <small class="today-extra">
            + ${escapeHtml(line.extraFlavor)} (${line.extraQuantity})
          </small>
        ` : ""}
      </td>
      <td class="today-number">${line.quantity}</td>
      <td>${escapeHtml(sale.channel || "—")}</td>
      <td class="today-money">${money(line.total)}</td>
      <td><span class="payment-badge ${paymentClass}">${paymentLabel}</span></td>
      <td>${escapeHtml(sale.notes || "")}</td>
    </tr>
  `;
}

async function bootstrap() {
  const { data } = await supabase.auth.getSession();
  state.session = data.session;

  if (state.session) {
    await loadProfile();
    await loadSales();

    if (state.profile?.role === "gestao") {
      await loadControlData();
    }

    connectRealtime();
  }

  render();
}

async function loadProfile() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role")
    .eq("id", state.session.user.id)
    .single();

  if (error) throw error;
  state.profile = data;
  state.view = data.role === "gestao" ? "control" : "sales";
}

async function login(email, password) {
  if (!state.roleIntent) {
    throw new Error("Escolha primeiro o tipo de acesso.");
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error("E-mail ou senha inválidos.");

  state.session = data.session;
  await loadProfile();

  if (state.profile.role !== state.roleIntent) {
    const attemptedRole = state.roleIntent;

    await supabase.auth.signOut();
    state.session = null;
    state.profile = null;

    if (attemptedRole === "gestao") {
      throw new Error(
        "Este e-mail não é um acesso de Gestão. Use o e-mail e a senha exclusivos da Gestão."
      );
    }

    throw new Error(
      "Este e-mail pertence à Gestão. Para entrar, escolha o Acesso Gestão."
    );
  }

  state.view = state.profile.role === "gestao" ? "control" : "sales";

  await loadSales();

  if (state.profile.role === "gestao") {
    await loadControlData();
  }

  connectRealtime();
  render();
}

async function logout() {
  if (state.realtime) await supabase.removeChannel(state.realtime);
  await supabase.auth.signOut();

  state.session = null;
  state.profile = null;
  state.sales = [];
  state.controlSales = [];
  state.controlTodaySales = [];
  state.financeSales = [];
  state.historicalSales = [];
  state.historyMeta = null;
  state.roleIntent = null;

  render();
}

async function loadSales() {
  if (!state.session) return;

  const start = `${state.month}-01`;
  const [year, month] = state.month.split("-").map(Number);
  const next = new Date(year, month, 1);
  const nextMonth = toYMD(next);

  const { data, error } = await supabase
    .from("sales")
    .select("*")
    .gte("sale_date", start)
    .lt("sale_date", nextMonth)
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  state.sales = data || [];
}

function toYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function lastDayOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0);
}

function getPeriodRange(type = state.controlPeriodType, referenceDate = state.controlReferenceDate) {
  const ref = new Date(`${referenceDate}T12:00:00`);
  const y = ref.getFullYear();
  const m = ref.getMonth();

  let start;
  let end;
  let label;

  if (type === "day") {
    start = new Date(ref);
    end = new Date(ref);
    label = `Dia ${dateBR(toYMD(ref))}`;
  } else if (type === "week") {
    const day = ref.getDay();
    const distanceToMonday = day === 0 ? -6 : 1 - day;

    start = new Date(ref);
    start.setDate(ref.getDate() + distanceToMonday);

    end = new Date(start);
    end.setDate(start.getDate() + 6);

    label = `Semana de ${dateBR(toYMD(start))} a ${dateBR(toYMD(end))}`;
  } else if (type === "fortnight1") {
    start = new Date(y, m, 1);
    end = new Date(y, m, 15);
    label = `1ª quinzena de ${monthLabel(referenceDate.slice(0,7))}`;
  } else if (type === "fortnight2") {
    start = new Date(y, m, 16);
    end = lastDayOfMonth(y, m);
    label = `2ª quinzena de ${monthLabel(referenceDate.slice(0,7))}`;
  } else {
    start = new Date(y, m, 1);
    end = lastDayOfMonth(y, m);
    label = monthLabel(referenceDate.slice(0,7));
  }

  return {
    start: toYMD(start),
    end: toYMD(end),
    label,
    monthKey: `${y}-${String(m + 1).padStart(2, "0")}`,
    referenceMonth: `${y}-${String(m + 1).padStart(2, "0")}-01`
  };
}

function monthLabel(monthKey) {
  if (!monthKey) return "";
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric"
  }).format(new Date(year, month - 1, 1));
}

async function loadControlData() {
  if (!state.session || state.profile?.role !== "gestao") return;

  const today = todayISO();

  const { data: todayData, error: todayError } = await supabase
    .from("sales")
    .select("*")
    .eq("sale_date", today)
    .order("created_at", { ascending: false });

  if (todayError) throw todayError;
  state.controlTodaySales = todayData || [];

  const period = getPeriodRange();

  const { data: salesData, error: salesError } = await supabase
    .from("sales")
    .select("*")
    .gte("sale_date", period.start)
    .lte("sale_date", period.end)
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (salesError) throw salesError;
  state.controlSales = salesData || [];

  if (state.controlPeriodType === "month") {
    const { data: historicalData, error: historicalError } = await supabase
      .from("historical_sales")
      .select("*")
      .eq("reference_month", period.referenceMonth)
      .order("quantity", { ascending: false });

    if (historicalError) throw historicalError;
    state.historicalSales = historicalData || [];

    const { data: metaData, error: metaError } = await supabase
      .from("historical_months")
      .select("*")
      .eq("reference_month", period.referenceMonth)
      .maybeSingle();

    if (metaError) throw metaError;
    state.historyMeta = metaData || null;
  } else {
    state.historicalSales = [];
    state.historyMeta = null;
  }
}

async function loadFinanceData() {
  if (!state.session || state.profile?.role !== "gestao") return;

  const { data, error } = await supabase
    .from("sales")
    .select("*")
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  state.financeSales = data || [];
}

async function refreshCurrentData() {
  if (state.view === "control" && state.profile?.role === "gestao") {
    await loadControlData();
  } else if (state.view === "finance" && state.profile?.role === "gestao") {
    await loadFinanceData();
  } else {
    await loadSales();
  }
}

function connectRealtime() {
  if (state.realtime) supabase.removeChannel(state.realtime);

  state.realtime = supabase
    .channel("bolo-com-cafe-live")
    .on("postgres_changes", { event:"*", schema:"public", table:"sales" }, async () => {
      await refreshCurrentData();
      renderMainOnly();
    })
    .on("postgres_changes", { event:"*", schema:"public", table:"historical_sales" }, async () => {
      if (state.view === "control" && state.profile?.role === "gestao") {
        await loadControlData();
        renderMainOnly();
      }
    })
    .subscribe();
}

async function saveSale(row) {
  const payload = {
    sale_date: row.sale_date || new Date().toISOString().slice(0,10),
    client: row.client || null,
    channel: row.channel || null,

    whole_cake_flavor: row.whole_cake_flavor || null,
    whole_cake_qty: Number(row.whole_cake_qty || 0),
    whole_cake_price: Number(row.whole_cake_price || 0),

    pot_cake_flavor: row.pot_cake_flavor || null,
    pot_cake_qty: Number(row.pot_cake_qty || 0),
    pot_cake_price: Number(row.pot_cake_price || 0),

    slice_flavor: row.slice_flavor || null,
    slice_qty: Number(row.slice_qty || 0),
    slice_price: Number(row.slice_price || 0),

    cookie_size: row.cookie_size || null,
    cookie_qty: Number(row.cookie_qty || 0),
    cookie_price: Number(row.cookie_price || 0),

    extra_portion_flavor: row.extra_portion_flavor || null,
    extra_portion_qty: Number(row.extra_portion_qty || 0),
    extra_portion_price: Number(row.extra_portion_price || 0),

    notes: row.notes || null,
    payment_status: row.payment_status || null,
    paid_at: row.payment_status === "pago" ? new Date().toISOString() : null,
    created_by: state.session.user.id
  };

  const { error } = await supabase.from("sales").insert(payload);
  if (error) throw error;
}

async function updateSale(id, row) {
  const previous = state.sales.find(sale => String(sale.id) === String(id));
  let paidAt = previous?.paid_at || null;

  if (row.payment_status === "pago" && previous?.payment_status !== "pago") {
    paidAt = new Date().toISOString();
  } else if (row.payment_status !== "pago") {
    paidAt = null;
  }

  const payload = {
    sale_date: row.sale_date,
    client: row.client || null,
    channel: row.channel || null,

    whole_cake_flavor: row.whole_cake_flavor || null,
    whole_cake_qty: Number(row.whole_cake_qty || 0),
    whole_cake_price: Number(row.whole_cake_price || 0),

    pot_cake_flavor: row.pot_cake_flavor || null,
    pot_cake_qty: Number(row.pot_cake_qty || 0),
    pot_cake_price: Number(row.pot_cake_price || 0),

    slice_flavor: row.slice_flavor || null,
    slice_qty: Number(row.slice_qty || 0),
    slice_price: Number(row.slice_price || 0),

    cookie_size: row.cookie_size || null,
    cookie_qty: Number(row.cookie_qty || 0),
    cookie_price: Number(row.cookie_price || 0),

    extra_portion_flavor: row.extra_portion_flavor || null,
    extra_portion_qty: Number(row.extra_portion_qty || 0),
    extra_portion_price: Number(row.extra_portion_price || 0),

    notes: row.notes || null,
    payment_status: row.payment_status || null,
    paid_at: paidAt,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from("sales").update(payload).eq("id", id);
  if (error) throw error;
}

async function deleteSale(id) {
  if (state.profile?.role !== "gestao") return;
  if (!confirm("Excluir este registro?")) return;

  const { error } = await supabase.from("sales").delete().eq("id", id);
  if (error) alert(error.message);
}

function getCategoryRowData(tr, category = state.activeSalesTab) {
  const config = getSalesTabConfig(category);
  const q = (name) => tr.querySelector(`[name="${name}"]`)?.value || "";

  const row = {
    sale_date: q("sale_date"),
    client: q("client"),
    channel: q("channel"),
    whole_cake_flavor: null,
    whole_cake_qty: 0,
    whole_cake_price: 0,
    pot_cake_flavor: null,
    pot_cake_qty: 0,
    pot_cake_price: 0,
    slice_flavor: null,
    slice_qty: 0,
    slice_price: 0,
    cookie_size: null,
    cookie_qty: 0,
    cookie_price: 0,
    extra_portion_flavor: null,
    extra_portion_qty: 0,
    extra_portion_price: 0,
    notes: q("notes"),
    payment_status: q("payment_status")
  };

  row[config.flavorField] = q("product_choice");
  row[config.qtyField] = Number(q("quantity") || 0);
  row[config.priceField] = Number(q("unit_price") || 0);

  if (supportsExtraPortion(category)) {
    const extraFlavor = q("extra_portion_choice");

    if (extraFlavor) {
      row.extra_portion_flavor = extraFlavor;
      row.extra_portion_qty = Number(q("extra_quantity") || 1);
      row.extra_portion_price = Number(q("extra_unit_price") || 0);
    }
  }

  return row;
}

function bindLineTotal(tr) {
  const qty = tr.querySelector('[name="quantity"]');
  const price = tr.querySelector('[name="unit_price"]');
  const extraChoice = tr.querySelector('[name="extra_portion_choice"]');
  const extraQty = tr.querySelector('[name="extra_quantity"]');
  const extraPrice = tr.querySelector('[name="extra_unit_price"]');
  const output = tr.querySelector("[data-line-total]");

  if (!qty || !price || !output) return;

  const refresh = () => {
    const mainTotal = Number(qty.value || 0) * Number(price.value || 0);
    const hasExtra = Boolean(extraChoice?.value);
    const extraTotal = hasExtra
      ? Number(extraQty?.value || 0) * Number(extraPrice?.value || 0)
      : 0;

    output.textContent = money(mainTotal + extraTotal);
  };

  qty.addEventListener("input", refresh);
  price.addEventListener("input", refresh);
  extraChoice?.addEventListener("change", refresh);
  extraQty?.addEventListener("input", refresh);
  extraPrice?.addEventListener("input", refresh);
  refresh();
}

function renderAuth() {
  const app = document.querySelector("#app");

  const selected = state.roleIntent;
  const isGestao = selected === "gestao";
  const accessTitle = isGestao ? "Acesso Gestão" : "Acesso Vendas";
  const accessDescription = isGestao
    ? "Área restrita à gestão. Use o e-mail e a senha exclusivos da Gestão."
    : "Área da equipe de vendas. Use o e-mail e a senha cadastrados para Vendas.";
  const emailLabel = isGestao ? "E-mail da Gestão" : "E-mail de Vendas";
  const buttonLabel = isGestao ? "Entrar na Gestão" : "Entrar em Vendas";

  app.innerHTML = `
    <section class="auth-page">
      <div class="auth-brand">
        <div class="logo-wrap">
          <img src="./public/logo-bolo-com-cafe.jpeg" alt="Bolo com Café">
          <div>
            <h1 class="brand-title">Bolo com Café</h1>
            <div class="brand-sub">MAIS QUE BOLOS, BONS MOMENTOS</div>
          </div>
        </div>
        <div class="quote">“Organização também é um ingrediente de sucesso.”</div>
      </div>

      <div class="auth-panel">
        ${
          !selected
            ? `
              <div class="access-intro">
                <span class="eyebrow">SISTEMA DE VENDAS</span>
                <h2>Escolha seu acesso</h2>
                <p>Vendas e Gestão possuem credenciais diferentes, mas trabalham sobre a mesma base de dados.</p>
              </div>

              <div class="access-grid access-grid-entry">
                <button class="access-card access-card-large" data-role="vendas">
                  <span class="access-icon">◫</span>
                  <strong>Acesso Vendas</strong>
                  <span>Registro diário dos pedidos.</span>
                  <small>Somente Registro de Vendas</small>
                </button>

                <button class="access-card access-card-large management-card" data-role="gestao">
                  <span class="access-icon">▥</span>
                  <strong>Acesso Gestão</strong>
                  <span>Registro + Controle + Financeiro.</span>
                  <small>Área restrita à Gestão</small>
                </button>
              </div>

              <div class="info-box access-info">
                Os dois acessos são independentes e permanecem conectados ao mesmo banco de vendas.
              </div>
            `
            : `
              <button id="backAccess" class="back-access" type="button">← Trocar tipo de acesso</button>

              <div class="selected-access ${isGestao ? "selected-management" : "selected-sales"}">
                <span class="eyebrow">${isGestao ? "ÁREA RESTRITA" : "REGISTRO DE PEDIDOS"}</span>
                <h2>${accessTitle}</h2>
                <p>${accessDescription}</p>
              </div>

              <form id="loginForm" class="form-stack">
                <div class="field">
                  <label>${emailLabel}</label>
                  <input
                    name="email"
                    type="email"
                    autocomplete="username"
                    placeholder="${isGestao ? "gestao@..." : "vendas@..."}"
                    required
                  >
                </div>

                <div class="field">
                  <label>Senha</label>
                  <input
                    name="password"
                    type="password"
                    autocomplete="current-password"
                    required
                  >
                </div>

                <div id="authError" class="error-box hidden"></div>

                <button class="btn-primary access-submit" type="submit">
                  ${buttonLabel}
                </button>
              </form>

              <div class="access-security-note">
                <strong>${isGestao ? "Gestão" : "Vendas"}</strong>
                <span>
                  ${
                    isGestao
                      ? "Este acesso abre o Registro de Vendas e o Controle."
                      : "Este acesso abre somente o Registro de Vendas."
                  }
                </span>
              </div>
            `
        }
      </div>
    </section>
  `;

  app.querySelectorAll("[data-role]").forEach((button) => {
    button.onclick = () => {
      state.roleIntent = button.dataset.role;
      renderAuth();
    };
  });

  app.querySelector("#backAccess")?.addEventListener("click", () => {
    state.roleIntent = null;
    renderAuth();
  });

  const form = app.querySelector("#loginForm");
  if (form) {
    form.onsubmit = async (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      const box = app.querySelector("#authError");
      box.classList.add("hidden");

      try {
        await login(data.get("email"), data.get("password"));
      } catch (err) {
        box.textContent = err.message;
        box.classList.remove("hidden");
      }
    };
  }
}

function sidebarHTML() {
  const canControl = state.profile?.role === "gestao";
  return `
    <aside class="sidebar">
      <div class="side-brand">
        <img src="./public/logo-bolo-com-cafe.jpeg" alt="">
        <div><strong>Bolo com Café</strong><small>${canControl ? "Gestão" : "Vendas"}</small></div>
      </div>
      <nav class="nav">
        <button data-view="sales" class="${state.view==="sales"?"active":""}">▣ Registro de Vendas</button>
        ${canControl ? `<button data-view="control" class="${state.view==="control"?"active":""}">▥ Controle</button>` : ""}
        ${canControl ? `<button data-view="finance" class="${state.view==="finance"?"active":""}">◔ Financeiro</button>` : ""}
      </nav>
      <div class="side-bottom">
        <div class="profile-card">
          <strong>${state.profile?.name || state.session?.user?.email}</strong>
          <small>${canControl ? "Gestão" : "Vendas"}</small>
        </div>
        <button id="logoutBtn" class="btn-secondary" style="width:100%">Sair</button>
      </div>
    </aside>
  `;
}

function salesPageHTML() {
  const category = state.activeSalesTab;
  const isTodayView = category === "today";
  const todaySales = getTodaySales();
  const todayLines = todaySales.flatMap(sale =>
    getSaleProductLines(sale).map(line => ({ sale, line }))
  );
  const todaySummary = todaySalesSummary();
  const canSeeFinancialSummary = state.profile?.role === "gestao";

  const productTabButtons = Object.entries(SALES_TABS).map(([key, tab]) => {
    const count = state.sales.filter(s => saleBelongsToCategory(s, key)).length;
    return `
      <button
        type="button"
        class="sales-tab ${category===key ? "active" : ""}"
        data-sales-tab="${key}"
      >
        <span>${tab.label}</span>
        <small>${count}</small>
      </button>
    `;
  }).join("");

  const todayTabButton = `
    <button
      type="button"
      class="sales-tab sales-tab-today ${isTodayView ? "active" : ""}"
      data-sales-tab="today"
    >
      <span>Vendas do Dia</span>
      <small>${todaySales.length}</small>
    </button>
  `;

  const tabButtons = todayTabButton + productTabButtons;

  if (isTodayView) {
    const rows = todayLines.map(({ sale, line }) => todaySaleRowHTML(sale, line)).join("");

    return `
      <div class="topbar">
        <div>
          <h1>Registro de Vendas</h1>
          <p>Vendas do Dia é atualizada automaticamente a cada novo registro.</p>
        </div>
        <div class="sync-pill"><span class="sync-dot"></span> Atualização automática</div>
      </div>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Vendas do Dia</h2>
            <p>${dateBR(todayISO())} · visão automática dos registros salvos hoje.</p>
          </div>
        </div>

        <div class="sales-tabs" role="tablist" aria-label="Categorias de produtos">
          ${tabButtons}
        </div>

        <div class="today-kpis ${canSeeFinancialSummary ? "" : "today-kpis-sales"}">
          <div class="today-kpi">
            <span>Pedidos</span>
            <strong>${todaySummary.orders}</strong>
          </div>
          <div class="today-kpi">
            <span>Itens vendidos</span>
            <strong>${todaySummary.totalItems}</strong>
          </div>
          ${canSeeFinancialSummary ? `
            <div class="today-kpi">
              <span>Faturamento do dia</span>
              <strong>${money(todaySummary.revenue)}</strong>
            </div>
          ` : ""}
          <div class="today-kpi">
            <span>Valor pendente</span>
            <strong>${money(todaySummary.pending)}</strong>
          </div>
        </div>

        <div class="table-wrap today-table-wrap">
          <table class="sales-table today-sales-table">
            <thead>
              <tr>
                <th>CLIENTE</th>
                <th>PRODUTO</th>
                <th>SABOR / TAMANHO</th>
                <th>QTD.</th>
                <th>CANAL</th>
                <th>TOTAL</th>
                <th>PAGAMENTO</th>
                <th>OBSERVAÇÕES</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `
                <tr>
                  <td colspan="8" class="empty">Nenhuma venda registrada hoje.</td>
                </tr>
              `}
            </tbody>
          </table>
        </div>

        <div class="panel-foot">
          <span class="muted">Esta aba é somente para acompanhamento.</span>
          <span class="muted">Registre novas vendas nas abas de produtos.</span>
        </div>
      </section>
    `;
  }

  const config = getSalesTabConfig(category);
  const hasExtraColumn = supportsExtraPortion(category);
  const filteredSales = state.sales.filter(s => saleBelongsToCategory(s, category));
  const rows = filteredSales.map(s => saleRowHTML(s, category)).join("");

  return `
    <div class="topbar">
      <div>
        <h1>Registro de Vendas</h1>
        <p>Registre cada produto na sua aba. O Controle é atualizado automaticamente.</p>
      </div>
      <div class="sync-pill"><span class="sync-dot"></span> Conectado ao Controle</div>
    </div>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Planilha de registro</h2>
          <p>Uma linha por produto/sabor. Use Quantidade quando o cliente pedir mais de uma unidade.</p>
        </div>
        <button id="addRowBtn" class="btn-primary">+ Nova linha</button>
      </div>

      <div class="sales-tabs" role="tablist" aria-label="Categorias de produtos">
        ${tabButtons}
      </div>

      <div class="toolbar">
        <label>Mês <input id="monthFilter" type="month" value="${state.month}"></label>
        <div class="toolbar-context">
          <strong>${config.label}</strong>
          <span>${filteredSales.length} registro(s) nesta aba</span>
        </div>
      </div>

      <div class="table-wrap">
        <table class="sales-table compact-sales-table ${hasExtraColumn ? "has-extra-column" : ""}">
          <thead>
            <tr>
              <th>DATA</th>
              <th>CLIENTE</th>
              <th>CANAL DO PEDIDO</th>
              <th>${config.choiceLabel.toUpperCase()}</th>
              <th class="qty-header">QTD.</th>
              <th>PREÇO UNITÁRIO</th>
              ${hasExtraColumn ? `<th>PORÇÃO EXTRA</th>` : ""}
              <th>TOTAL</th>
              <th>PGTO</th>
              <th>OBS.</th>
              <th>AÇÕES</th>
            </tr>
          </thead>
          <tbody id="salesBody">
            ${newRowHTML(category)}
            ${rows}
          </tbody>
        </table>
      </div>

      <div class="panel-foot">
        <span class="muted">
          ${filteredSales.length} registro(s) de ${config.label.toLowerCase()} em ${state.month}
        </span>
        <span class="muted">
          Quantidade × preço unitário = total da linha.
        </span>
      </div>
    </section>
  `;
}

function newRowHTML(category = state.activeSalesTab) {
  const config = getSalesTabConfig(category);

  return `
    <tr data-new-row data-category="${category}">
      <td>
        <input name="sale_date" type="date" value="${new Date().toISOString().slice(0,10)}">
      </td>
      <td>
        <input class="client-input" name="client" placeholder="Cliente">
      </td>
      <td>
        <select name="channel">${channelOptions("", true)}</select>
      </td>
      <td>
        <select name="product_choice">${options(config.choices)}</select>
      </td>
      <td>
        <input class="qty-input" name="quantity" type="number" min="1" step="1" value="1">
      </td>
      <td>
        <input class="price-input" name="unit_price" type="number" min="0" step=".01" placeholder="0,00">
      </td>
      ${supportsExtraPortion(category) ? `
        <td class="extra-portion-cell">
          <select name="extra_portion_choice" aria-label="Sabor da porção extra">
            ${options(EXTRA_PORTION_FLAVORS)}
          </select>
          <div class="extra-portion-meta">
            <input
              name="extra_quantity"
              type="number"
              min="1"
              step="1"
              value="1"
              aria-label="Quantidade da porção extra"
              title="Quantidade da porção extra"
            >
            <input
              name="extra_unit_price"
              type="number"
              min="0"
              step=".01"
              placeholder="R$"
              aria-label="Preço da porção extra"
              title="Preço unitário da porção extra"
            >
          </div>
        </td>
      ` : ""}
      <td class="line-total" data-line-total>${money(0)}</td>
      <td>
        <select name="payment_status" class="payment-select payment-select-pending">${paymentStatusOptions("", true)}</select>
      </td>
      <td>
        <input class="obs-input" name="notes" placeholder="Observações">
      </td>
      <td>
        <button class="icon-btn save-new" title="Salvar">Salvar</button>
      </td>
    </tr>
  `;
}

function saleRowHTML(s, category = state.activeSalesTab) {
  const canDelete = state.profile?.role === "gestao";
  const config = getSalesTabConfig(category);
  const quantity = Number(s[config.qtyField] || 0) || 1;
  const unitPrice = Number(s[config.priceField] || 0);
  const choice = s[config.flavorField] || "";

  return `
    <tr data-id="${s.id}" data-category="${category}">
      <td>
        <input name="sale_date" type="date" value="${s.sale_date || ""}">
      </td>
      <td>
        <input class="client-input" name="client" value="${escapeHtml(s.client || "")}">
      </td>
      <td>
        <select name="channel">${channelOptions(s.channel || "", false)}</select>
      </td>
      <td>
        <select name="product_choice">${options(config.choices, choice)}</select>
      </td>
      <td>
        <input class="qty-input" name="quantity" type="number" min="1" step="1" value="${quantity}">
      </td>
      <td>
        <input class="price-input" name="unit_price" type="number" min="0" step=".01" value="${unitPrice}">
      </td>
      ${supportsExtraPortion(category) ? `
        <td class="extra-portion-cell">
          <select name="extra_portion_choice" aria-label="Sabor da porção extra">
            ${options(EXTRA_PORTION_FLAVORS, s.extra_portion_flavor || "")}
          </select>
          <div class="extra-portion-meta">
            <input
              name="extra_quantity"
              type="number"
              min="1"
              step="1"
              value="${Number(s.extra_portion_qty || 0) || 1}"
              aria-label="Quantidade da porção extra"
              title="Quantidade da porção extra"
            >
            <input
              name="extra_unit_price"
              type="number"
              min="0"
              step=".01"
              value="${Number(s.extra_portion_price || 0)}"
              aria-label="Preço da porção extra"
              title="Preço unitário da porção extra"
            >
          </div>
        </td>
      ` : ""}
      <td class="line-total" data-line-total>${money(
        (quantity * unitPrice) +
        (Number(s.extra_portion_qty || 0) * Number(s.extra_portion_price || 0))
      )}</td>
      <td>
        <select name="payment_status" class="payment-select ${s.payment_status === "pago" ? "payment-select-paid" : (s.payment_status === "pendente" ? "payment-select-pending" : "")}">${paymentStatusOptions(s.payment_status || "", false)}</select>
      </td>
      <td>
        <input class="obs-input" name="notes" value="${escapeHtml(s.notes || "")}">
      </td>
      <td>
        <div class="row-actions">
          <button class="icon-btn update-row">Salvar</button>
          ${canDelete ? `<button class="icon-btn danger delete-row">Excluir</button>` : ""}
        </div>
      </td>
    </tr>
  `;
}

function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}



function financialSaleTotal(sale) {
  return getSaleProductLines(sale).reduce((sum, line) => sum + Number(line.total || 0), 0);
}

function financialSaleInfo(sale) {
  const lines = getSaleProductLines(sale);
  if (!lines.length) return { product: "—", detail: "—", quantity: 0, total: 0 };

  const product = lines.map(line => line.product).join(" + ");
  const detail = lines.map(line => {
    const extra = line.extraFlavor ? ` + ${line.extraFlavor}` : "";
    return `${line.choice}${extra}`;
  }).join(" + ");
  const quantity = lines.reduce((sum, line) => sum + line.quantity + Number(line.extraQuantity || 0), 0);
  const total = lines.reduce((sum, line) => sum + line.total, 0);
  return { product, detail, quantity, total };
}

function financeFilterConfig(view = state.financeView) {
  if (view === "paid") {
    return {
      periodType: state.financePaidPeriodType,
      referenceDate: state.financePaidReferenceDate,
      channel: state.financePaidChannel,
      start: state.financePaidStart,
      end: state.financePaidEnd
    };
  }

  return {
    periodType: state.financePendingPeriodType,
    referenceDate: state.financePendingReferenceDate,
    channel: state.financePendingChannel,
    start: state.financePendingStart,
    end: state.financePendingEnd
  };
}

function financeRange(config) {
  const type = config.periodType;
  const ref = config.referenceDate || todayISO();

  if (type === "all") return null;
  if (type === "today") return { start: todayISO(), end: todayISO() };
  if (type === "custom") {
    if (!config.start || !config.end) return null;
    return { start: config.start, end: config.end };
  }

  return getPeriodRange(type, ref);
}

function getFilteredFinanceSales(view = state.financeView) {
  const config = financeFilterConfig(view);
  const range = financeRange(config);
  const desiredStatus = view === "paid" ? "pago" : "pendente";

  return (state.financeSales || []).filter(sale => {
    if (sale.payment_status !== desiredStatus) return false;
    if (config.channel && sale.channel !== config.channel) return false;

    if (!range) return true;

    const dateValue = view === "paid"
      ? dateOnlyFromTimestamp(sale.paid_at)
      : sale.sale_date;

    if (!dateValue) return false;
    return dateValue >= range.start && dateValue <= range.end;
  });
}

function financePeriodOptions(selected) {
  const items = [
    ["all", "Todos"],
    ["today", "Hoje"],
    ["day", "Dia"],
    ["week", "Semana"],
    ["fortnight1", "1ª quinzena"],
    ["fortnight2", "2ª quinzena"],
    ["month", "Mês"],
    ["custom", "Período personalizado"]
  ];

  return items.map(([value, label]) =>
    `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`
  ).join("");
}

function financeChannelOptions(selected = "") {
  return `<option value="">Todos os canais</option>` + CHANNELS.map(channel =>
    `<option value="${escapeHtml(channel)}" ${selected === channel ? "selected" : ""}>${escapeHtml(channel)}</option>`
  ).join("");
}

function financeFiltersHTML(view) {
  const config = financeFilterConfig(view);
  const isCustom = config.periodType === "custom";
  const referenceDisabled = ["all", "today", "custom"].includes(config.periodType);

  return `
    <section class="finance-filters">
      <div class="period-control">
        <label>Período</label>
        <select id="financePeriodType">${financePeriodOptions(config.periodType)}</select>
      </div>

      <div class="period-control ${referenceDisabled ? "finance-reference-disabled" : ""}">
        <label>Data de referência</label>
        <input id="financeReferenceDate" type="date" value="${config.referenceDate || todayISO()}" ${referenceDisabled ? "disabled" : ""}>
      </div>

      <div class="period-control">
        <label>Canal</label>
        <select id="financeChannel">${financeChannelOptions(config.channel)}</select>
      </div>

      <div class="finance-custom-dates ${isCustom ? "" : "hidden"}" id="financeCustomDates">
        <div class="period-control">
          <label>De</label>
          <input id="financeStartDate" type="date" value="${config.start || ""}">
        </div>
        <div class="period-control">
          <label>Até</label>
          <input id="financeEndDate" type="date" value="${config.end || ""}">
        </div>
      </div>

      <div class="period-search-action finance-search-action">
        <button id="financeSearchBtn" class="btn-primary period-search-btn" type="button">Pesquisar</button>
      </div>
    </section>
  `;
}

function pendingFinanceHTML() {
  const sales = getFilteredFinanceSales("pending");
  const totalPending = sales.reduce((sum, sale) => sum + financialSaleTotal(sale), 0);
  const uniqueClients = new Set(sales.map(s => (s.client || "").trim()).filter(Boolean)).size;
  const maxPending = Math.max(0, ...sales.map(financialSaleTotal));

  const rows = sales.map(sale => {
    const info = financialSaleInfo(sale);
    return `
      <tr>
        <td>${dateBR(sale.sale_date)}</td>
        <td>${escapeHtml(sale.client || "—")}</td>
        <td>${escapeHtml(info.product)}</td>
        <td>${escapeHtml(info.detail)}</td>
        <td class="finance-money">${money(info.total)}</td>
        <td>${escapeHtml(sale.channel || "—")}</td>
        <td><span class="payment-badge status-pending">Pendente</span></td>
        <td><button class="finance-pay-btn" data-mark-paid="${sale.id}">Marcar como pago</button></td>
      </tr>
    `;
  }).join("");

  return `
    <section class="finance-kpis">
      <div class="finance-kpi"><span>Total pendente a receber</span><strong>${money(totalPending)}</strong></div>
      <div class="finance-kpi"><span>Pedidos pendentes</span><strong>${sales.length}</strong></div>
      <div class="finance-kpi"><span>Clientes com pendência</span><strong>${uniqueClients}</strong></div>
      <div class="finance-kpi"><span>Maior pendência</span><strong>${money(maxPending)}</strong></div>
    </section>

    ${financeFiltersHTML("pending")}

    <section class="card finance-table-card">
      <div class="control-section-head">
        <div>
          <h3>Pagamentos pendentes</h3>
          <p>Vendas que ainda aguardam pagamento.</p>
        </div>
      </div>
      <div class="table-wrap finance-table-wrap">
        <table class="sales-table finance-table">
          <thead>
            <tr>
              <th>DATA DA VENDA</th><th>CLIENTE</th><th>PRODUTO</th><th>SABOR / TAMANHO</th>
              <th>VALOR</th><th>CANAL</th><th>STATUS</th><th>AÇÕES</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="8" class="empty">Nenhum pagamento pendente encontrado.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;
}

function paidFinanceHTML() {
  const filtered = getFilteredFinanceSales("paid");
  const paidToday = (state.financeSales || []).filter(sale =>
    sale.payment_status === "pago" && dateOnlyFromTimestamp(sale.paid_at) === todayISO()
  );
  const receivedToday = paidToday.reduce((sum, sale) => sum + financialSaleTotal(sale), 0);
  const receivedPeriod = filtered.reduce((sum, sale) => sum + financialSaleTotal(sale), 0);

  const rows = filtered.map(sale => {
    const info = financialSaleInfo(sale);
    return `
      <tr>
        <td>${sale.paid_at ? dateTimeBR(sale.paid_at) : `<span class="finance-no-date">Data de pagamento não informada</span>`}</td>
        <td>${escapeHtml(sale.client || "—")}</td>
        <td>${dateBR(sale.sale_date)}</td>
        <td>${escapeHtml(info.product)}</td>
        <td>${escapeHtml(info.detail)}</td>
        <td class="finance-money">${money(info.total)}</td>
        <td>${escapeHtml(sale.channel || "—")}</td>
        <td><span class="payment-badge status-paid">Pago</span></td>
      </tr>
    `;
  }).join("");

  return `
    <section class="finance-kpis finance-kpis-paid">
      <div class="finance-kpi"><span>Recebido hoje</span><strong>${money(receivedToday)}</strong></div>
      <div class="finance-kpi"><span>Pagamentos realizados hoje</span><strong>${paidToday.length}</strong></div>
      <div class="finance-kpi"><span>Total recebido no período</span><strong>${money(receivedPeriod)}</strong></div>
    </section>

    ${financeFiltersHTML("paid")}

    <section class="card finance-table-card">
      <div class="control-section-head">
        <div>
          <h3>Pagamentos realizados</h3>
          <p>Organizados pela data em que o pagamento foi registrado.</p>
        </div>
      </div>
      <div class="table-wrap finance-table-wrap">
        <table class="sales-table finance-table finance-paid-table">
          <thead>
            <tr>
              <th>DATA DO PAGAMENTO</th><th>CLIENTE</th><th>DATA DA VENDA</th><th>PRODUTO</th>
              <th>SABOR / TAMANHO</th><th>VALOR</th><th>CANAL</th><th>STATUS</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="8" class="empty">Nenhum pagamento encontrado para o período.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;
}

function financePageHTML() {
  const pendingActive = state.financeView === "pending";
  return `
    <div class="topbar finance-topbar">
      <div>
        <h1>Financeiro</h1>
        <p>Acompanhe pagamentos pendentes e valores efetivamente recebidos.</p>
      </div>
      <div class="sync-pill"><span class="sync-dot"></span> Conectado às vendas</div>
    </div>

    <div class="finance-tabs" role="tablist" aria-label="Financeiro">
      <button type="button" class="finance-tab finance-tab-pending ${pendingActive ? "active" : ""}" data-finance-view="pending">
        Pendente
      </button>
      <button type="button" class="finance-tab finance-tab-paid ${!pendingActive ? "active" : ""}" data-finance-view="paid">
        Pago
      </button>
    </div>

    ${pendingActive ? pendingFinanceHTML() : paidFinanceHTML()}
  `;
}

async function markSaleAsPaid(id) {
  const { error } = await supabase
    .from("sales")
    .update({
      payment_status: "pago",
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", id);

  if (error) throw error;
  await loadFinanceData();
}

function bindFinancePage() {
  const root = document.querySelector("#main");

  root.querySelectorAll("[data-finance-view]").forEach(button => {
    button.addEventListener("click", () => {
      state.financeView = button.dataset.financeView;
      renderMainOnly();
    });
  });

  root.querySelector("#financePeriodType")?.addEventListener("change", e => {
    const type = e.target.value;
    const custom = root.querySelector("#financeCustomDates");
    const reference = root.querySelector("#financeReferenceDate");
    custom?.classList.toggle("hidden", type !== "custom");
    if (reference) reference.disabled = ["all", "today", "custom"].includes(type);
  });

  root.querySelector("#financeSearchBtn")?.addEventListener("click", () => {
    const view = state.financeView;
    const periodType = root.querySelector("#financePeriodType")?.value || "all";
    const referenceDate = root.querySelector("#financeReferenceDate")?.value || todayISO();
    const channel = root.querySelector("#financeChannel")?.value || "";
    const start = root.querySelector("#financeStartDate")?.value || "";
    const end = root.querySelector("#financeEndDate")?.value || "";

    if (periodType === "custom" && (!start || !end)) {
      alert("Informe as datas inicial e final do período personalizado.");
      return;
    }

    if (periodType === "custom" && start > end) {
      alert("A data inicial não pode ser posterior à data final.");
      return;
    }

    if (view === "paid") {
      state.financePaidPeriodType = periodType;
      state.financePaidReferenceDate = referenceDate;
      state.financePaidChannel = channel;
      state.financePaidStart = start;
      state.financePaidEnd = end;
    } else {
      state.financePendingPeriodType = periodType;
      state.financePendingReferenceDate = referenceDate;
      state.financePendingChannel = channel;
      state.financePendingStart = start;
      state.financePendingEnd = end;
    }

    renderMainOnly();
  });

  root.querySelectorAll("[data-mark-paid]").forEach(button => {
    button.addEventListener("click", async () => {
      const id = button.dataset.markPaid;
      if (!confirm("Confirmar este pagamento como Pago?")) return;

      button.disabled = true;
      button.textContent = "Salvando...";
      try {
        await markSaleAsPaid(id);
        renderMainOnly();
      } catch (error) {
        console.error(error);
        button.disabled = false;
        button.textContent = "Marcar como pago";
        alert("Não foi possível registrar o pagamento.");
      }
    });
  });
}

function controlTodaySummary() {
  const sales = state.controlTodaySales || [];
  const lines = sales.flatMap(getSaleProductLines);
  const totalItems = lines.reduce(
    (sum, line) => sum + line.quantity + Number(line.extraQuantity || 0),
    0
  );
  const revenue = lines.reduce((sum, line) => sum + line.total, 0);
  const pending = sales
    .filter(sale => sale.payment_status === "pendente")
    .flatMap(getSaleProductLines)
    .reduce((sum, line) => sum + line.total, 0);

  return {
    orders: sales.length,
    totalItems,
    revenue,
    pending
  };
}

function controlTodayHTML() {
  const summary = controlTodaySummary();
  const rows = (state.controlTodaySales || [])
    .flatMap(sale => getSaleProductLines(sale).map(line => todaySaleRowHTML(sale, line)))
    .join("");

  return `
    <section class="control-today-view">
      <div class="today-kpis control-today-kpis">
        <div class="today-kpi">
          <span>Pedidos de hoje</span>
          <strong>${summary.orders}</strong>
        </div>
        <div class="today-kpi">
          <span>Itens vendidos</span>
          <strong>${summary.totalItems}</strong>
        </div>
        <div class="today-kpi">
          <span>Faturamento do dia</span>
          <strong>${money(summary.revenue)}</strong>
        </div>
        <div class="today-kpi">
          <span>Valor pendente</span>
          <strong>${money(summary.pending)}</strong>
        </div>
      </div>

      <section class="card control-today-card">
        <div class="control-section-head">
          <div>
            <h3>Vendas do Dia</h3>
            <p>${dateBR(todayISO())} · atualização automática a partir do Registro de Vendas.</p>
          </div>
        </div>

        <div class="table-wrap today-table-wrap">
          <table class="sales-table today-sales-table">
            <thead>
              <tr>
                <th>CLIENTE</th>
                <th>PRODUTO</th>
                <th>SABOR / TAMANHO</th>
                <th>QTD.</th>
                <th>CANAL</th>
                <th>TOTAL</th>
                <th>PAGAMENTO</th>
                <th>OBSERVAÇÕES</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `
                <tr>
                  <td colspan="8" class="empty">Nenhuma venda registrada hoje.</td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  `;
}

function controlAnalysisHTML() {
  const period = getPeriodRange();
  const report = buildReport(state.controlSales, state.historicalSales);
  const max = Math.max(1, ...report.flavorRanking.map(x => x.qty));

  const bars = report.flavorRanking.slice(0,10).map(x => `
    <div class="bar-row">
      <span>${escapeHtml(x.name)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(x.qty/max)*100}%"></div></div>
      <strong>${x.qty}</strong>
    </div>`).join("");

  const ranking = report.flavorRanking.slice(0,10).map((x,i) => `
    <div class="rank-item">
      <span class="rank-pos">${i+1}</span>
      <span>${escapeHtml(x.name)}</span>
      <strong>${x.qty}</strong>
    </div>
  `).join("");

  const summary = report.productSummary.map(x => `
    <tr>
      <td>${escapeHtml(x.product)}</td>
      <td>${x.qty}</td>
      <td>${report.revenueComplete ? money(x.revenue) : (x.revenue > 0 ? `${money(x.revenue)}*` : "—")}</td>
    </tr>
  `).join("");

  const referenceInput = ["day", "week"].includes(state.controlPeriodType)
    ? `<input id="periodReference" type="date" value="${state.controlReferenceDate}">`
    : `<input id="periodReference" type="month" value="${state.controlReferenceDate.slice(0,7)}">`;

  const historicalNotice = buildHistoricalNotice(report);

  const revenueDisplay = report.revenueComplete
    ? money(report.revenue)
    : (report.revenue > 0 ? `${money(report.revenue)}*` : "—");

  const ordersDisplay = report.hasHistory
    ? (report.orders > 0 ? `${report.orders}*` : "—")
    : report.orders;

  const ticketDisplay = report.hasHistory || !report.revenueComplete
    ? "—"
    : money(report.ticket);

  return `
    <div class="control-analysis-actions">
      <div></div>
      <div class="export-actions">
        <button id="exportPdfBtn" class="btn-secondary">Gerar PDF</button>
        <button id="exportExcelBtn" class="btn-primary">Gerar Excel</button>
      </div>
    </div>

    <section class="period-panel">
      <div class="period-control">
        <label>Período</label>
        <select id="periodType">
          <option value="day" ${state.controlPeriodType==="day"?"selected":""}>Dia</option>
          <option value="week" ${state.controlPeriodType==="week"?"selected":""}>Semana</option>
          <option value="fortnight1" ${state.controlPeriodType==="fortnight1"?"selected":""}>1ª quinzena</option>
          <option value="fortnight2" ${state.controlPeriodType==="fortnight2"?"selected":""}>2ª quinzena</option>
          <option value="month" ${state.controlPeriodType==="month"?"selected":""}>Mês</option>
        </select>
      </div>

      <div class="period-control">
        <label>${["day", "week"].includes(state.controlPeriodType) ? "Data de referência" : "Mês de referência"}</label>
        ${referenceInput}
      </div>

      <div class="period-search-action">
        <button id="searchPeriodBtn" class="btn-primary period-search-btn" type="button">
          Pesquisar
        </button>
      </div>

      <div class="period-result">
        <span>Exibindo</span>
        <strong>${escapeHtml(period.label)}</strong>
      </div>
    </section>

    ${historicalNotice}

    <div class="kpis">
      <div class="kpi">
        <span>Total vendido</span>
        <strong>${report.totalItems}</strong>
        <small>${report.hasHistory ? "inclui histórico consolidado" : "registros do período"}</small>
      </div>

      <div class="kpi">
        <span>Faturamento</span>
        <strong>${revenueDisplay}</strong>
        <small>${report.revenueComplete ? "valores registrados" : "histórico antigo sem preços"}</small>
      </div>

      <div class="kpi">
        <span>Pedidos</span>
        <strong>${ordersDisplay}</strong>
        <small>${report.hasHistory ? "não disponível no histórico mensal" : "pedidos registrados"}</small>
      </div>

      <div class="kpi">
        <span>Ticket médio</span>
        <strong>${ticketDisplay}</strong>
        <small>${report.hasHistory ? "indisponível para histórico consolidado" : "faturamento ÷ pedidos"}</small>
      </div>
    </div>

    <div class="control-grid">
      <section class="card">
        <h3>Vendas por sabor</h3>
        <div class="bars">${bars || `<div class="empty">Nenhuma venda no período.</div>`}</div>
      </section>

      <section class="card">
        <h3>Ranking dos sabores</h3>
        <div class="rank-list">${ranking || `<div class="empty">Sem dados.</div>`}</div>
      </section>

      <section class="card">
        <h3>Resumo por produto</h3>
        <table class="summary-table">
          <thead>
            <tr><th>Produto</th><th>Qtd.</th><th>Faturamento</th></tr>
          </thead>
          <tbody>${summary}</tbody>
        </table>
        ${report.hasHistory && !report.revenueComplete ? `<p class="data-note">* Valores financeiros não existiam na planilha histórica.</p>` : ""}
      </section>

      <section class="card">
        <h3>Indicadores do período</h3>
        <p><strong>Mais vendido:</strong> ${report.bestFlavor || "—"}</p>
        <p><strong>Menos vendido:</strong> ${report.worstFlavor || "—"}</p>
        <p><strong>Canal com mais pedidos:</strong> ${report.bestChannel || "—"}</p>
        <p><strong>Origem dos dados:</strong> ${report.hasHistory ? "Histórico + registros do sistema" : "Registro diário do sistema"}</p>
      </section>
    </div>
  `;
}


function controlPageHTML() {
  const isToday = state.controlView === "today";

  return `
    <div class="topbar control-topbar">
      <div>
        <h1>Controle</h1>
        <p>${isToday
          ? "Acompanhamento operacional das vendas registradas hoje."
          : "Visão gerencial conectada ao Registro de Vendas e ao histórico consolidado."
        }</p>
      </div>
    </div>

    <div class="control-view-tabs" role="tablist" aria-label="Visualizações do controle">
      <button
        type="button"
        class="control-view-tab ${isToday ? "active" : ""}"
        data-control-view="today"
      >
        Vendas do Dia
      </button>
      <button
        type="button"
        class="control-view-tab ${!isToday ? "active" : ""}"
        data-control-view="analysis"
      >
        Análise por Período
      </button>
    </div>

    ${isToday ? controlTodayHTML() : controlAnalysisHTML()}
  `;
}


function buildHistoricalNotice(report) {
  if (state.controlPeriodType !== "month") {
    return `
      <div class="history-note">
        <strong>Filtro detalhado:</strong>
        dia, semana e quinzena utilizam apenas vendas com data registrada no sistema.
        O histórico de janeiro a julho foi recebido consolidado por mês e não pode ser dividido com precisão por dia, semana ou quinzena.
      </div>
    `;
  }

  if (state.historyMeta?.status === "pendente") {
    return `
      <div class="history-note warning-note">
        <strong>Histórico pendente:</strong> ${escapeHtml(state.historyMeta.notes || "Este mês ainda não possui apuração histórica.")}
      </div>
    `;
  }

  if (state.historyMeta?.difference) {
    return `
      <div class="history-note warning-note">
        <strong>Conferência histórica:</strong>
        total informado ${state.historyMeta.reported_total}; soma detalhada ${state.historyMeta.detailed_total};
        diferença ${state.historyMeta.difference}. ${escapeHtml(state.historyMeta.notes || "")}
      </div>
    `;
  }

  if (report.hasHistory) {
    return `
      <div class="history-note">
        <strong>Histórico carregado:</strong>
        os dados mensais anteriores foram normalizados e integrados ao Controle.
      </div>
    `;
  }

  return "";
}

function buildReport(rows, historicalRows = []) {
  let revenue = 0;
  let totalItems = 0;

  const flavorMap = {};
  const channelMap = {};

  const productSummary = {
    "Bolo inteiro": { qty:0, revenue:0 },
    "Bolo no pote": { qty:0, revenue:0 },
    "Fatia": { qty:0, revenue:0 },
    "Cookies": { qty:0, revenue:0 },
    "Porção extra": { qty:0, revenue:0 }
  };

  rows.forEach(r => {
    const addDaily = (type, flavor, qty, unitPrice, rankingLabel = flavor) => {
      const quantity = flavor ? Math.max(1, Number(qty || 0)) : 0;
      const price = Number(unitPrice || 0);
      const lineRevenue = quantity * price;

      if (flavor && quantity > 0) {
        totalItems += quantity;
        flavorMap[rankingLabel] = (flavorMap[rankingLabel] || 0) + quantity;
        productSummary[type].qty += quantity;
      }

      productSummary[type].revenue += lineRevenue;
      revenue += lineRevenue;
    };

    addDaily(
      "Bolo inteiro",
      r.whole_cake_flavor,
      r.whole_cake_qty,
      r.whole_cake_price
    );

    addDaily(
      "Bolo no pote",
      r.pot_cake_flavor,
      r.pot_cake_qty,
      r.pot_cake_price
    );

    addDaily(
      "Fatia",
      r.slice_flavor,
      r.slice_qty,
      r.slice_price
    );

    addDaily(
      "Cookies",
      r.cookie_size,
      r.cookie_qty,
      r.cookie_price,
      r.cookie_size ? `Cookie ${r.cookie_size}` : ""
    );

    addDaily(
      "Porção extra",
      r.extra_portion_flavor,
      r.extra_portion_qty,
      r.extra_portion_price,
      r.extra_portion_flavor ? `Porção extra - ${r.extra_portion_flavor}` : ""
    );

    if (r.channel) {
      channelMap[r.channel] = (channelMap[r.channel] || 0) + 1;
    }
  });

  let hasUnpricedHistory = false;

  historicalRows.forEach(r => {
    const qty = Number(r.quantity || 0);
    const type = r.product_type || "Bolo inteiro";
    const flavor = r.flavor || "Não identificado";

    if (!productSummary[type]) {
      productSummary[type] = { qty:0, revenue:0 };
    }

    if (qty > 0) {
      totalItems += qty;
      flavorMap[flavor] = (flavorMap[flavor] || 0) + qty;
      productSummary[type].qty += qty;
    }

    if (r.revenue === null || r.revenue === undefined) {
      hasUnpricedHistory = true;
    } else {
      const histRevenue = Number(r.revenue || 0);
      revenue += histRevenue;
      productSummary[type].revenue += histRevenue;
    }
  });

  const flavorRanking = Object.entries(flavorMap)
    .map(([name, qty]) => ({ name, qty }))
    .filter(x => x.qty > 0)
    .sort((a,b) => b.qty - a.qty || a.name.localeCompare(b.name, "pt-BR"));

  const channels = Object.entries(channelMap)
    .sort((a,b) => b[1] - a[1]);

  const hasHistory = historicalRows.length > 0;
  const revenueComplete = !hasUnpricedHistory;

  return {
    orders: rows.length,
    totalItems,
    revenue,
    ticket: rows.length && revenueComplete && !hasHistory ? revenue / rows.length : 0,
    flavorRanking,
    bestFlavor: flavorRanking[0]?.name,
    worstFlavor: flavorRanking.at(-1)?.name,
    bestChannel: channels[0]?.[0],
    hasHistory,
    revenueComplete,
    productSummary: Object.entries(productSummary)
      .map(([product,v]) => ({ product, ...v }))
      .filter(x => x.qty > 0 || x.revenue > 0)
  };
}

function getCurrentControlReport() {
  return {
    period: getPeriodRange(),
    report: buildReport(state.controlSales, state.historicalSales)
  };
}

async function exportControlExcel() {
  const { period, report } = getCurrentControlReport();

  try {
    const XLSX = await import("https://esm.sh/xlsx@0.18.5");
    const workbook = XLSX.utils.book_new();

    const summaryRows = [
      ["BOLO COM CAFÉ - CONTROLE DE VENDAS"],
      ["Período", period.label],
      ["Total vendido", report.totalItems],
      ["Faturamento", report.revenueComplete ? report.revenue : "Histórico sem preços"],
      ["Pedidos registrados", report.hasHistory ? "Não disponível no histórico mensal" : report.orders],
      ["Ticket médio", report.hasHistory ? "Não disponível no histórico mensal" : report.ticket],
      ["Mais vendido", report.bestFlavor || ""],
      ["Menos vendido", report.worstFlavor || ""],
      ["Canal com mais pedidos", report.bestChannel || ""],
      [],
      ["Observação", state.historyMeta?.notes || ""]
    ];

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryRows), "Resumo");

    const rankingRows = [
      ["Posição", "Sabor", "Quantidade"],
      ...report.flavorRanking.map((x, i) => [i + 1, x.name, x.qty])
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rankingRows), "Ranking");

    const productRows = [
      ["Produto", "Quantidade", "Faturamento"],
      ...report.productSummary.map(x => [
        x.product,
        x.qty,
        report.revenueComplete ? x.revenue : (x.revenue || "")
      ])
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(productRows), "Produtos");

    const dailyRows = [
      [
        "Data","Cliente","Canal",
        "Bolo inteiro","Qtd. bolo inteiro","Preço unitário bolo","Total bolo",
        "Bolo no pote","Qtd. pote","Preço unitário pote","Total pote",
        "Fatia","Qtd. fatia","Preço unitário fatia","Total fatia",
        "Cookie","Qtd. cookie","Preço unitário cookie","Total cookie",
        "Porção extra","Qtd. porção extra","Preço unitário porção extra","Total porção extra",
        "Pagamento","Observações"
      ],
      ...state.controlSales.map(r => [
        r.sale_date || "",
        r.client || "",
        r.channel || "",

        r.whole_cake_flavor || "",
        Number(r.whole_cake_qty || 0),
        Number(r.whole_cake_price || 0),
        Number(r.whole_cake_qty || 0) * Number(r.whole_cake_price || 0),

        r.pot_cake_flavor || "",
        Number(r.pot_cake_qty || 0),
        Number(r.pot_cake_price || 0),
        Number(r.pot_cake_qty || 0) * Number(r.pot_cake_price || 0),

        r.slice_flavor || "",
        Number(r.slice_qty || 0),
        Number(r.slice_price || 0),
        Number(r.slice_qty || 0) * Number(r.slice_price || 0),

        r.cookie_size || "",
        Number(r.cookie_qty || 0),
        Number(r.cookie_price || 0),
        Number(r.cookie_qty || 0) * Number(r.cookie_price || 0),

        r.extra_portion_flavor || "",
        Number(r.extra_portion_qty || 0),
        Number(r.extra_portion_price || 0),
        Number(r.extra_portion_qty || 0) * Number(r.extra_portion_price || 0),

        r.payment_status === "pago" ? "Pago" : (r.payment_status === "pendente" ? "Pendente" : "Não informado"),
        r.notes || ""
      ])
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(dailyRows), "Registro diário");

    const historyRows = [
      ["Mês", "Produto", "Sabor", "Quantidade", "Faturamento", "Fonte"],
      ...state.historicalSales.map(r => [
        r.reference_month || "",
        r.product_type || "",
        r.flavor || "",
        Number(r.quantity || 0),
        r.revenue ?? "",
        r.source || ""
      ])
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(historyRows), "Histórico");

    const fileKey = period.label
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();

    XLSX.writeFile(workbook, `bolo-com-cafe-${fileKey}.xlsx`);
  } catch (error) {
    console.error(error);
    alert("Não foi possível gerar o arquivo Excel.");
  }
}

async function exportControlPdf() {
  const { period, report } = getCurrentControlReport();

  try {
    const { jsPDF } = await import("https://esm.sh/jspdf@2.5.2");
    const { default: autoTable } = await import("https://esm.sh/jspdf-autotable@3.8.4");

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    doc.setFontSize(18);
    doc.text("Bolo com Café - Controle de Vendas", 14, 18);

    doc.setFontSize(10);
    doc.text(`Período: ${period.label}`, 14, 26);

    const revenueText = report.revenueComplete
      ? money(report.revenue)
      : "Não disponível no histórico";

    const ordersText = report.hasHistory
      ? "Não disponível no histórico"
      : String(report.orders);

    autoTable(doc, {
      startY: 32,
      head: [["Indicador", "Resultado"]],
      body: [
        ["Total vendido", String(report.totalItems)],
        ["Faturamento", revenueText],
        ["Pedidos", ordersText],
        ["Mais vendido", report.bestFlavor || "—"],
        ["Menos vendido", report.worstFlavor || "—"],
        ["Canal com mais pedidos", report.bestChannel || "—"]
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [74, 31, 24] }
    });

    const nextY = (doc.lastAutoTable?.finalY || 70) + 8;
    doc.setFontSize(13);
    doc.text("Ranking por sabor", 14, nextY);

    autoTable(doc, {
      startY: nextY + 4,
      head: [["#", "Sabor", "Quantidade"]],
      body: report.flavorRanking.slice(0, 20).map((x, i) => [
        String(i + 1), x.name, String(x.qty)
      ]),
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [107, 48, 36] }
    });

    if (state.historyMeta?.notes) {
      const noteY = (doc.lastAutoTable?.finalY || 120) + 8;
      doc.setFontSize(8.5);
      const lines = doc.splitTextToSize(`Observação: ${state.historyMeta.notes}`, 180);
      doc.text(lines, 14, noteY);
    }

    const fileKey = period.label
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();

    doc.save(`bolo-com-cafe-${fileKey}.pdf`);
  } catch (error) {
    console.error(error);
    alert("Não foi possível gerar o PDF.");
  }
}

function bindSalesPage() {
  const root = document.querySelector("#main");

  root.querySelector("#monthFilter")?.addEventListener("change", async e => {
    state.month = e.target.value;
    await loadSales();
    renderMainOnly();
  });

  root.querySelectorAll("[data-sales-tab]").forEach(button => {
    button.addEventListener("click", async () => {
      const nextTab = button.dataset.salesTab;
      state.activeSalesTab = nextTab;

      if (nextTab === "today") {
        const currentMonth = todayISO().slice(0, 7);
        if (state.month !== currentMonth) {
          state.month = currentMonth;
          await loadSales();
        }
      }

      renderMainOnly();
    });
  });

  root.querySelector("#addRowBtn")?.addEventListener("click", () => {
    root.querySelector("[data-new-row] input[name='client']")?.focus();
  });

  root.querySelectorAll("#salesBody tr").forEach(bindLineTotal);
  root.querySelectorAll('select[name="payment_status"]').forEach(select => {
    const refreshPaymentColor = () => {
      select.classList.toggle("payment-select-pending", select.value === "pendente");
      select.classList.toggle("payment-select-paid", select.value === "pago");
    };
    select.addEventListener("change", refreshPaymentColor);
    refreshPaymentColor();
  });

  root.querySelector(".save-new")?.addEventListener("click", async e => {
    const tr = e.target.closest("tr");
    const category = tr.dataset.category || state.activeSalesTab;
    const row = getCategoryRowData(tr, category);

    if (!row.client) {
      alert("Informe o cliente.");
      return;
    }

    if (!row.channel) {
      alert("Escolha WhatsApp, Anotaí ou Balcão.");
      return;
    }

    const config = getSalesTabConfig(category);

    if (!row[config.flavorField]) {
      alert(`Escolha ${config.choiceLabel.toLowerCase()}.`);
      return;
    }

    if (Number(row[config.qtyField] || 0) < 1) {
      alert("A quantidade deve ser pelo menos 1.");
      return;
    }

    try {
      await saveSale(row);

      tr.querySelectorAll("input,select").forEach(x => {
        if (x.name === "sale_date") return;
        if (x.name === "quantity") {
          x.value = "1";
          return;
        }
        x.value = "";
      });

      bindLineTotal(tr);
    } catch (err) {
      alert(err.message);
    }
  });

  root.querySelectorAll(".update-row").forEach(btn => btn.addEventListener("click", async e => {
    const tr = e.target.closest("tr");
    const category = tr.dataset.category || state.activeSalesTab;
    const row = getCategoryRowData(tr, category);

    if (!row.channel) {
      alert("Escolha WhatsApp, Anotaí ou Balcão.");
      return;
    }

    try {
      await updateSale(tr.dataset.id, row);
      alert("Registro atualizado.");
    } catch (err) {
      alert(err.message);
    }
  }));

  root.querySelectorAll(".delete-row").forEach(btn => btn.addEventListener("click", e => {
    deleteSale(e.target.closest("tr").dataset.id);
  }));
}

function bindControlPage() {
  const root = document.querySelector("#main");

  root.querySelectorAll("[data-control-view]").forEach(button => {
    button.addEventListener("click", () => {
      state.controlView = button.dataset.controlView;
      renderMainOnly();
    });
  });

  root.querySelector("#searchPeriodBtn")?.addEventListener("click", async () => {
    const periodType = root.querySelector("#periodType")?.value || state.controlPeriodType;
    const referenceValue = root.querySelector("#periodReference")?.value;

    state.controlPeriodType = periodType;

    if (referenceValue) {
      state.controlReferenceDate = ["day", "week"].includes(periodType)
        ? referenceValue
        : `${referenceValue}-01`;
    }

    const button = root.querySelector("#searchPeriodBtn");
    if (button) {
      button.disabled = true;
      button.textContent = "Pesquisando...";
    }

    try {
      await loadControlData();
      renderMainOnly();
    } catch (error) {
      console.error(error);
      if (button) {
        button.disabled = false;
        button.textContent = "Pesquisar";
      }
      alert("Não foi possível carregar a pesquisa. Tente novamente.");
    }
  });

  root.querySelector("#periodType")?.addEventListener("change", async e => {
    state.controlPeriodType = e.target.value;
    await loadControlData();
    renderMainOnly();
  });

  root.querySelector("#periodReference")?.addEventListener("change", async e => {
    if (["day", "week"].includes(state.controlPeriodType)) {
      state.controlReferenceDate = e.target.value;
    } else {
      state.controlReferenceDate = `${e.target.value}-01`;
    }

    await loadControlData();
    renderMainOnly();
  });

  root.querySelector("#exportExcelBtn")?.addEventListener("click", exportControlExcel);
  root.querySelector("#exportPdfBtn")?.addEventListener("click", exportControlPdf);
}

function renderMainOnly() {
  const main = document.querySelector("#main");
  if (!main) return render();

  if (state.view === "control") {
    main.innerHTML = controlPageHTML();
    bindControlPage();
  } else if (state.view === "finance") {
    main.innerHTML = financePageHTML();
    bindFinancePage();
  } else {
    main.innerHTML = salesPageHTML();
    bindSalesPage();
  }
}

function renderApp() {
  const app = document.querySelector("#app");

  app.innerHTML = `
    <div class="dashboard">
      ${sidebarHTML()}
      <main class="content" id="main"></main>
    </div>
  `;

  app.querySelectorAll("[data-view]").forEach(btn => btn.onclick = async () => {
    state.view = btn.dataset.view;

    if (state.view === "control") {
      await loadControlData();
    } else if (state.view === "finance") {
      await loadFinanceData();
    } else {
      await loadSales();
    }

    renderApp();
  });

  app.querySelector("#logoutBtn").onclick = logout;
  renderMainOnly();
}

function render() {
  if (!state.session) renderAuth();
  else renderApp();
}

bootstrap().catch(err => {
  document.querySelector("#app").innerHTML = `<div style="padding:30px">Erro: ${err.message}</div>`;
});
