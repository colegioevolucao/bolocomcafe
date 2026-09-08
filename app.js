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
  "Brownie Maluco","Bolo de Noiva","Laranja","Limão Siciliano","Cenoura","Brownie"
];

const POT_FLAVORS = ["Oreo","Dois amores","Chocolate","Ovomaltine"];
const COOKIE_SIZES = ["Pequeno","Grande"];
const CHANNELS = ["WhatsApp","Anotaí"];

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

const state = {
  session: null,
  profile: null,
  roleIntent: null,
  view: "sales",

  // Registro diário
  sales: [],
  month: new Date().toISOString().slice(0,7),
  activeSalesTab: "cake",

  // Controle gerencial
  controlSales: [],
  historicalSales: [],
  historyMeta: null,
  controlPeriodType: "month",
  controlReferenceDate: new Date().toISOString().slice(0,10),

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
function options(items, selected = "") {
  return `<option value=""></option>` + items
    .map(x => `<option ${x===selected?"selected":""}>${escapeHtml(x)}</option>`)
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
  return Number(sale?.[config.qtyField] || 0) * Number(sale?.[config.priceField] || 0);
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

  if (type === "week") {
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

async function refreshCurrentData() {
  if (state.view === "control" && state.profile?.role === "gestao") {
    await loadControlData();
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

    notes: row.notes || null,
    created_by: state.session.user.id
  };

  const { error } = await supabase.from("sales").insert(payload);
  if (error) throw error;
}

async function updateSale(id, row) {
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

    notes: row.notes || null,
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
    notes: q("notes")
  };

  row[config.flavorField] = q("product_choice");
  row[config.qtyField] = Number(q("quantity") || 0);
  row[config.priceField] = Number(q("unit_price") || 0);

  return row;
}

function bindLineTotal(tr) {
  const qty = tr.querySelector('[name="quantity"]');
  const price = tr.querySelector('[name="unit_price"]');
  const output = tr.querySelector("[data-line-total]");

  if (!qty || !price || !output) return;

  const refresh = () => {
    output.textContent = money(Number(qty.value || 0) * Number(price.value || 0));
  };

  qty.addEventListener("input", refresh);
  price.addEventListener("input", refresh);
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
                  <span>Registro + Controle de vendas.</span>
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
  const config = getSalesTabConfig(category);
  const filteredSales = state.sales.filter(s => saleBelongsToCategory(s, category));
  const rows = filteredSales.map(s => saleRowHTML(s, category)).join("");

  const tabButtons = Object.entries(SALES_TABS).map(([key, tab]) => {
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
        <table class="sales-table compact-sales-table">
          <thead>
            <tr>
              <th>DATA</th>
              <th>CLIENTE</th>
              <th>CANAL DO PEDIDO</th>
              <th>${config.choiceLabel.toUpperCase()}</th>
              <th>QUANTIDADE</th>
              <th>PREÇO UNITÁRIO</th>
              <th>TOTAL</th>
              <th>OBSERVAÇÕES</th>
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
      <td class="line-total" data-line-total>${money(0)}</td>
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
      <td class="line-total" data-line-total>${money(quantity * unitPrice)}</td>
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

function controlPageHTML() {
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

  const referenceInput = state.controlPeriodType === "week"
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
    <div class="topbar control-topbar">
      <div>
        <h1>Controle</h1>
        <p>Visão gerencial conectada ao Registro de Vendas e ao histórico consolidado.</p>
      </div>

      <div class="export-actions">
        <button id="exportPdfBtn" class="btn-secondary">Gerar PDF</button>
        <button id="exportExcelBtn" class="btn-primary">Gerar Excel</button>
      </div>
    </div>

    <section class="period-panel">
      <div class="period-control">
        <label>Período</label>
        <select id="periodType">
          <option value="week" ${state.controlPeriodType==="week"?"selected":""}>Semana</option>
          <option value="fortnight1" ${state.controlPeriodType==="fortnight1"?"selected":""}>1ª quinzena</option>
          <option value="fortnight2" ${state.controlPeriodType==="fortnight2"?"selected":""}>2ª quinzena</option>
          <option value="month" ${state.controlPeriodType==="month"?"selected":""}>Mês</option>
        </select>
      </div>

      <div class="period-control">
        <label>${state.controlPeriodType === "week" ? "Data de referência" : "Mês de referência"}</label>
        ${referenceInput}
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

function buildHistoricalNotice(report) {
  if (state.controlPeriodType !== "month") {
    return `
      <div class="history-note">
        <strong>Filtro detalhado:</strong>
        semana e quinzena utilizam apenas vendas com data registrada no sistema.
        O histórico de janeiro a julho foi recebido consolidado por mês e não pode ser dividido com precisão por semana ou quinzena.
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
    "Cookies": { qty:0, revenue:0 }
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
        "Observações"
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
    button.addEventListener("click", () => {
      state.activeSalesTab = button.dataset.salesTab;
      renderMainOnly();
    });
  });

  root.querySelector("#addRowBtn")?.addEventListener("click", () => {
    root.querySelector("[data-new-row] input[name='client']")?.focus();
  });

  root.querySelectorAll("#salesBody tr").forEach(bindLineTotal);

  root.querySelector(".save-new")?.addEventListener("click", async e => {
    const tr = e.target.closest("tr");
    const category = tr.dataset.category || state.activeSalesTab;
    const row = getCategoryRowData(tr, category);

    if (!row.client) {
      alert("Informe o cliente.");
      return;
    }

    if (!row.channel) {
      alert("Escolha WhatsApp ou Anotaí.");
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
      alert("Escolha WhatsApp ou Anotaí.");
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

  root.querySelector("#periodType")?.addEventListener("change", async e => {
    state.controlPeriodType = e.target.value;
    await loadControlData();
    renderMainOnly();
  });

  root.querySelector("#periodReference")?.addEventListener("change", async e => {
    if (state.controlPeriodType === "week") {
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
  main.innerHTML = state.view === "control" ? controlPageHTML() : salesPageHTML();
  state.view === "control" ? bindControlPage() : bindSalesPage();
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
