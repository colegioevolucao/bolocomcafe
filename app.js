import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://whsxgjjkpnuwyvbqzgiy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_e1DZJ7G8FXwfdNVp6rlEnA_Hdf_dF0b";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CAKE_FLAVORS = [
  "Baeta","Banana","Banana com doce de leite","Branco","Brownie Maluco","Cenoura",
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
const CHANNELS = ["WhatsApp","Instagram","Balcão","Telefone","iFood","Outro"];

const state = {
  session: null,
  profile: null,
  roleIntent: null,
  view: "sales",
  sales: [],
  month: new Date().toISOString().slice(0,7),
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
  return `<option value=""></option>` + items.map(x => `<option ${x===selected?"selected":""}>${x}</option>`).join("");
}

async function bootstrap() {
  const { data } = await supabase.auth.getSession();
  state.session = data.session;
  if (state.session) {
    await loadProfile();
    await loadSales();
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

  // Os acessos são independentes: uma credencial de Vendas não entra na Gestão
  // e uma credencial de Gestão não entra pelo acesso de Vendas.
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
  connectRealtime();
  render();
}

async function logout() {
  if (state.realtime) await supabase.removeChannel(state.realtime);
  await supabase.auth.signOut();
  state.session = null;
  state.profile = null;
  state.sales = [];
  state.roleIntent = null;
  render();
}

async function loadSales() {
  if (!state.session) return;
  const start = `${state.month}-01`;
  const [y,m] = state.month.split("-").map(Number);
  const next = new Date(y, m, 1).toISOString().slice(0,10);

  const { data, error } = await supabase
    .from("sales")
    .select("*")
    .gte("sale_date", start)
    .lt("sale_date", next)
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  state.sales = data || [];
}

function connectRealtime() {
  if (state.realtime) supabase.removeChannel(state.realtime);
  state.realtime = supabase
    .channel("sales-live")
    .on("postgres_changes", { event:"*", schema:"public", table:"sales" }, async () => {
      await loadSales();
      renderMainOnly();
    })
    .subscribe();
}

async function saveSale(row) {
  const payload = {
    sale_date: row.sale_date || new Date().toISOString().slice(0,10),
    client: row.client || null,
    channel: row.channel || null,
    whole_cake_flavor: row.whole_cake_flavor || null,
    whole_cake_price: Number(row.whole_cake_price || 0),
    pot_cake_flavor: row.pot_cake_flavor || null,
    pot_cake_price: Number(row.pot_cake_price || 0),
    slice_flavor: row.slice_flavor || null,
    slice_price: Number(row.slice_price || 0),
    cookie_size: row.cookie_size || null,
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
    whole_cake_price: Number(row.whole_cake_price || 0),
    pot_cake_flavor: row.pot_cake_flavor || null,
    pot_cake_price: Number(row.pot_cake_price || 0),
    slice_flavor: row.slice_flavor || null,
    slice_price: Number(row.slice_price || 0),
    cookie_size: row.cookie_size || null,
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

function getRowData(tr) {
  const q = (name) => tr.querySelector(`[name="${name}"]`)?.value || "";
  return {
    sale_date: q("sale_date"),
    client: q("client"),
    channel: q("channel"),
    whole_cake_flavor: q("whole_cake_flavor"),
    whole_cake_price: q("whole_cake_price"),
    pot_cake_flavor: q("pot_cake_flavor"),
    pot_cake_price: q("pot_cake_price"),
    slice_flavor: q("slice_flavor"),
    slice_price: q("slice_price"),
    cookie_size: q("cookie_size"),
    cookie_price: q("cookie_price"),
    notes: q("notes")
  };
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
  const rows = state.sales.map(s => saleRowHTML(s)).join("");
  return `
    <div class="topbar">
      <div><h1>Registro de Vendas</h1><p>Registre os pedidos. O Controle é atualizado automaticamente.</p></div>
      <div class="sync-pill"><span class="sync-dot"></span> Conectado ao Controle</div>
    </div>

    <section class="panel">
      <div class="panel-head">
        <div><h2>Planilha de registro</h2><p>Uma linha por pedido.</p></div>
        <button id="addRowBtn" class="btn-primary">+ Nova linha</button>
      </div>

      <div class="toolbar">
        <label>Mês <input id="monthFilter" type="month" value="${state.month}"></label>
      </div>

      <div class="table-wrap">
        <table class="sales-table">
          <thead>
            <tr>
              <th>DATA</th>
              <th>CLIENTE</th>
              <th>CANAL DO PEDIDO</th>
              <th>BOLO INTEIRO - sabor</th>
              <th>PREÇO</th>
              <th>BOLO NO POTE - sabor</th>
              <th>PREÇO</th>
              <th>FATIA - sabor</th>
              <th>PREÇO</th>
              <th>COOKIES (P ou G)</th>
              <th>PREÇO</th>
              <th>OBSERVAÇÕES</th>
              <th>AÇÕES</th>
            </tr>
          </thead>
          <tbody id="salesBody">
            ${newRowHTML()}
            ${rows || ""}
          </tbody>
        </table>
      </div>

      <div class="panel-foot">
        <span class="muted">${state.sales.length} registro(s) em ${state.month}</span>
        <span class="muted">Todos os registros alimentam o Controle automaticamente.</span>
      </div>
    </section>
  `;
}

function newRowHTML() {
  return `
    <tr data-new-row>
      <td><input name="sale_date" type="date" value="${new Date().toISOString().slice(0,10)}"></td>
      <td><input class="client-input" name="client" placeholder="Cliente"></td>
      <td><select name="channel">${options(CHANNELS)}</select></td>
      <td><select name="whole_cake_flavor">${options(CAKE_FLAVORS)}</select></td>
      <td><input class="price-input" name="whole_cake_price" type="number" min="0" step=".01" placeholder="0,00"></td>
      <td><select name="pot_cake_flavor">${options(POT_FLAVORS)}</select></td>
      <td><input class="price-input" name="pot_cake_price" type="number" min="0" step=".01" placeholder="0,00"></td>
      <td><select name="slice_flavor">${options(SLICE_FLAVORS)}</select></td>
      <td><input class="price-input" name="slice_price" type="number" min="0" step=".01" placeholder="0,00"></td>
      <td><select name="cookie_size">${options(COOKIE_SIZES)}</select></td>
      <td><input class="price-input" name="cookie_price" type="number" min="0" step=".01" placeholder="0,00"></td>
      <td><input class="obs-input" name="notes" placeholder="Observações"></td>
      <td><button class="icon-btn save-new" title="Salvar">Salvar</button></td>
    </tr>
  `;
}

function saleRowHTML(s) {
  const canDelete = state.profile?.role === "gestao";
  return `
    <tr data-id="${s.id}">
      <td><input name="sale_date" type="date" value="${s.sale_date || ""}"></td>
      <td><input class="client-input" name="client" value="${escapeHtml(s.client || "")}"></td>
      <td><select name="channel">${options(CHANNELS, s.channel || "")}</select></td>
      <td><select name="whole_cake_flavor">${options(CAKE_FLAVORS, s.whole_cake_flavor || "")}</select></td>
      <td><input class="price-input" name="whole_cake_price" type="number" min="0" step=".01" value="${Number(s.whole_cake_price || 0)}"></td>
      <td><select name="pot_cake_flavor">${options(POT_FLAVORS, s.pot_cake_flavor || "")}</select></td>
      <td><input class="price-input" name="pot_cake_price" type="number" min="0" step=".01" value="${Number(s.pot_cake_price || 0)}"></td>
      <td><select name="slice_flavor">${options(SLICE_FLAVORS, s.slice_flavor || "")}</select></td>
      <td><input class="price-input" name="slice_price" type="number" min="0" step=".01" value="${Number(s.slice_price || 0)}"></td>
      <td><select name="cookie_size">${options(COOKIE_SIZES, s.cookie_size || "")}</select></td>
      <td><input class="price-input" name="cookie_price" type="number" min="0" step=".01" value="${Number(s.cookie_price || 0)}"></td>
      <td><input class="obs-input" name="notes" value="${escapeHtml(s.notes || "")}"></td>
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
  const report = buildReport(state.sales);
  const max = Math.max(1, ...report.flavorRanking.map(x => x.qty));
  const bars = report.flavorRanking.slice(0,8).map(x => `
    <div class="bar-row">
      <span>${x.name}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(x.qty/max)*100}%"></div></div>
      <strong>${x.qty}</strong>
    </div>`).join("");

  const ranking = report.flavorRanking.slice(0,8).map((x,i) => `
    <div class="rank-item"><span class="rank-pos">${i+1}</span><span>${x.name}</span><strong>${x.qty}</strong></div>
  `).join("");

  const summary = report.productSummary.map(x => `
    <tr><td>${x.product}</td><td>${x.qty}</td><td>${money(x.revenue)}</td></tr>
  `).join("");

  return `
    <div class="topbar">
      <div><h1>Controle</h1><p>Visão gerencial gerada automaticamente a partir do Registro de Vendas.</p></div>
      <div>
        <input id="monthFilter" type="month" value="${state.month}" style="padding:10px;border:1px solid var(--line);border-radius:10px;background:white;">
      </div>
    </div>

    <div class="kpis">
      <div class="kpi"><span>Total vendido</span><strong>${report.totalItems}</strong></div>
      <div class="kpi"><span>Faturamento</span><strong>${money(report.revenue)}</strong></div>
      <div class="kpi"><span>Pedidos</span><strong>${report.orders}</strong></div>
      <div class="kpi"><span>Ticket médio</span><strong>${money(report.ticket)}</strong></div>
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
          <thead><tr><th>Produto</th><th>Qtd.</th><th>Faturamento</th></tr></thead>
          <tbody>${summary}</tbody>
        </table>
      </section>

      <section class="card">
        <h3>Indicadores do mês</h3>
        <p><strong>Mais vendido:</strong> ${report.bestFlavor || "—"}</p>
        <p><strong>Menos vendido:</strong> ${report.worstFlavor || "—"}</p>
        <p><strong>Canal com mais pedidos:</strong> ${report.bestChannel || "—"}</p>
        <p><strong>Faturamento médio por pedido:</strong> ${money(report.ticket)}</p>
      </section>
    </div>
  `;
}

function buildReport(rows) {
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
    const add = (type, flavor, price) => {
      const p = Number(price || 0);
      if (flavor) {
        totalItems += 1;
        flavorMap[flavor] = (flavorMap[flavor] || 0) + 1;
        productSummary[type].qty += 1;
      }
      productSummary[type].revenue += p;
      revenue += p;
    };
    add("Bolo inteiro", r.whole_cake_flavor, r.whole_cake_price);
    add("Bolo no pote", r.pot_cake_flavor, r.pot_cake_price);
    add("Fatia", r.slice_flavor, r.slice_price);

    const cookiePrice = Number(r.cookie_price || 0);
    if (r.cookie_size) {
      totalItems += 1;
      productSummary["Cookies"].qty += 1;
      flavorMap[`Cookie ${r.cookie_size}`] = (flavorMap[`Cookie ${r.cookie_size}`] || 0) + 1;
    }
    productSummary["Cookies"].revenue += cookiePrice;
    revenue += cookiePrice;

    if (r.channel) channelMap[r.channel] = (channelMap[r.channel] || 0) + 1;
  });

  const flavorRanking = Object.entries(flavorMap)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a,b) => b.qty - a.qty);

  const channels = Object.entries(channelMap).sort((a,b) => b[1] - a[1]);

  return {
    orders: rows.length,
    totalItems,
    revenue,
    ticket: rows.length ? revenue / rows.length : 0,
    flavorRanking,
    bestFlavor: flavorRanking[0]?.name,
    worstFlavor: flavorRanking.at(-1)?.name,
    bestChannel: channels[0]?.[0],
    productSummary: Object.entries(productSummary).map(([product,v]) => ({ product, ...v }))
  };
}

function bindSalesPage() {
  const root = document.querySelector("#main");
  root.querySelector("#monthFilter")?.addEventListener("change", async e => {
    state.month = e.target.value;
    await loadSales();
    renderMainOnly();
  });

  root.querySelector("#addRowBtn")?.addEventListener("click", () => {
    root.querySelector("[data-new-row] input[name='client']")?.focus();
  });

  root.querySelector(".save-new")?.addEventListener("click", async e => {
    const tr = e.target.closest("tr");
    try {
      await saveSale(getRowData(tr));
      tr.querySelectorAll("input,select").forEach(x => {
        if (x.name === "sale_date") return;
        x.value = "";
      });
    } catch (err) { alert(err.message); }
  });

  root.querySelectorAll(".update-row").forEach(btn => btn.addEventListener("click", async e => {
    const tr = e.target.closest("tr");
    try {
      await updateSale(tr.dataset.id, getRowData(tr));
      alert("Registro atualizado.");
    } catch (err) { alert(err.message); }
  }));

  root.querySelectorAll(".delete-row").forEach(btn => btn.addEventListener("click", e => {
    deleteSale(e.target.closest("tr").dataset.id);
  }));
}

function bindControlPage() {
  const root = document.querySelector("#main");
  root.querySelector("#monthFilter")?.addEventListener("change", async e => {
    state.month = e.target.value;
    await loadSales();
    renderMainOnly();
  });
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
  app.querySelectorAll("[data-view]").forEach(btn => btn.onclick = () => {
    state.view = btn.dataset.view;
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
