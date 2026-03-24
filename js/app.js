const APP_NAME = "Bíblia Livre";

const VALID_USER = {
  username: "devocional",
  password: "biblia",
};

const BIBLE_URL = "./data/biblialivre.json";

const STORAGE_KEYS = {
  AUTH: "devocional_diario_auth_v1",
  PROGRESS: "devocional_diario_progress_v1",
  SETTINGS: "devocional_diario_settings_v1",
  DAILY_VERSE: "devocional_diario_daily_verse_v1",
};

const NAV_LINKS = [
  { id: "home", href: "./livros.html", icon: "🏠", label: "Início" },
  { id: "plans", href: "./meusplanos.html", icon: "📋", label: "Meus Planos" },
  { id: "goal", href: "./meta-diaria.html", icon: "🎯", label: "Meta Diária" },
  { id: "verse", href: "./versiculo-diario.html", icon: "✝", label: "Versículo do Dia" },
];

const CURRENT_PAGE = document.body.dataset.page || "index";
const appRoot = document.getElementById("app-root");

let bibleData = null;
let stats = {
  totalVerses: 0,
  readVerses: 0,
  percentRead: 0,
  remainingVerses: 0,
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function isAuthenticated() {
  const auth = loadFromStorage(STORAGE_KEYS.AUTH, null);
  return !!auth && auth.username === VALID_USER.username;
}

function setAuthenticated(username) {
  saveToStorage(STORAGE_KEYS.AUTH, { username, ts: Date.now() });
}

function logout() {
  localStorage.removeItem(STORAGE_KEYS.AUTH);
  window.location.href = "./index.html";
}

let progress = loadFromStorage(STORAGE_KEYS.PROGRESS, {});
let settings = loadFromStorage(STORAGE_KEYS.SETTINGS, {
  dailyGoalVerses: 50,
});

function toggleChapterRead(bookId, chapterIndex, verseCount) {
  if (!progress[bookId]) progress[bookId] = {};
  const current = progress[bookId][chapterIndex];
  progress[bookId][chapterIndex] = { read: !current?.read };
  saveToStorage(STORAGE_KEYS.PROGRESS, progress);
  recomputeStats();
}

function getChapterRead(bookId, chapterIndex) {
  return !!progress[bookId]?.[chapterIndex]?.read;
}

function recomputeStats() {
  if (!bibleData) return;
  let totalVerses = 0;
  let readVerses = 0;

  for (const book of bibleData) {
    if (!Array.isArray(book.capitulos)) continue;
    book.capitulos.forEach((chapter, chapterIndex) => {
      const versesInChapter = chapter.length;
      totalVerses += versesInChapter;
      if (getChapterRead(book.id, chapterIndex)) {
        readVerses += versesInChapter;
      }
    });
  }

  stats = {
    totalVerses,
    readVerses,
    percentRead: totalVerses ? (readVerses / totalVerses) * 100 : 0,
    remainingVerses: totalVerses - readVerses,
  };
}

function sidebarNavHtml(activeId) {
  return NAV_LINKS.map(
    (item) => `
    <a class="sidebar-link ${item.id === activeId ? "sidebar-link-active" : ""}" href="${item.href}">
      <span class="sidebar-link-icon" aria-hidden="true">${item.icon}</span>
      <span>${escapeHtml(item.label)}</span>
    </a>`
  ).join("");
}

/**
 * @param {{ topTitle: string; topSubtitle: string; back: null | { href: string; label: string }; activeNav: string }} opts
 * @returns {HTMLElement}
 */
function mountShell(opts) {
  const { topTitle, topSubtitle, back, activeNav } = opts;
  const backHtml = back
    ? `<a class="btn btn-back" id="btn-back" href="${back.href}">${escapeHtml(back.label)}</a>`
    : `<span class="topbar-back-spacer" aria-hidden="true"></span>`;

  appRoot.innerHTML = `
    <div class="layout">
      <header class="topbar">
        <div class="topbar-left">
          <button type="button" class="btn btn-icon nav-toggle" id="nav-toggle" aria-label="Abrir menu" aria-expanded="false">☰</button>
          ${backHtml}
          <div class="topbar-title-group">
            <h1>${escapeHtml(topTitle)}</h1>
            <span class="topbar-subtitle">${escapeHtml(topSubtitle)}</span>
          </div>
        </div>
        <div class="topbar-right">
          <button type="button" id="btn-logout" class="btn btn-ghost">Sair</button>
        </div>
      </header>
      <div class="shell">
        <div class="sidebar-backdrop" id="sidebar-backdrop" hidden></div>
        <aside class="sidebar" id="sidebar" aria-label="Navegação principal">
          <div class="sidebar-title">Menu</div>
          <nav class="sidebar-nav">${sidebarNavHtml(activeNav)}</nav>
        </aside>
        <main id="main-slot" class="main main-single"></main>
      </div>
    </div>
  `;

  document.getElementById("btn-logout").addEventListener("click", logout);

  const toggle = document.getElementById("nav-toggle");
  const backdrop = document.getElementById("sidebar-backdrop");

  function setNavOpen(open) {
    document.body.classList.toggle("nav-open", open);
    toggle?.setAttribute("aria-expanded", open ? "true" : "false");
    if (backdrop) backdrop.hidden = !open;
  }

  toggle?.addEventListener("click", () => {
    setNavOpen(!document.body.classList.contains("nav-open"));
  });
  backdrop?.addEventListener("click", () => setNavOpen(false));
  document.querySelectorAll(".sidebar-nav a.sidebar-link").forEach((a) => {
    a.addEventListener("click", () => setNavOpen(false));
  });

  return document.getElementById("main-slot");
}

function chapterReaderUrl(bookId, cap) {
  return `./paginas.html?livro=${encodeURIComponent(bookId)}&cap=${cap}`;
}

function shortenPeriodLabel(periodo) {
  if (!periodo) return "Outros livros";
  return periodo
    .replace(/\s*-\s*AT\s*$/i, "")
    .replace(/\s*-\s*NT\s*$/i, "")
    .trim() || periodo;
}

function groupBooksByPeriod(books) {
  const map = new Map();
  for (const book of books) {
    const key = book.periodo || "—";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(book);
  }
  return map;
}

// ---------- Páginas ----------

function renderLoginPage() {
  appRoot.innerHTML = "";

  const container = document.createElement("div");
  container.className = "center-container";

  container.innerHTML = `
    <div class="card card-login">
      <p class="brand-mark" aria-hidden="true">✝</p>
      <h1>${escapeHtml(APP_NAME)}</h1>
      <p class="subtitle">Leia a Bíblia Livre no navegador, com progresso e metas.</p>
      <form id="login-form" class="form">
        <label class="form-label">
          Usuário
          <input name="username" type="text" autocomplete="username" placeholder="devocional" required />
        </label>
        <label class="form-label">
          Senha
          <input name="password" type="password" autocomplete="current-password" placeholder="••••••" required />
          <span class="hint">Credenciais de demonstração: <strong>devocional</strong> / <strong>biblia</strong></span>
        </label>
        <button type="submit" class="btn btn-primary">Entrar</button>
      </form>
    </div>
  `;

  appRoot.appendChild(container);

  document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const username = fd.get("username").toString().trim();
    const password = fd.get("password").toString();

    if (username === VALID_USER.username && password === VALID_USER.password) {
      setAuthenticated(username);
      window.location.href = "./livros.html";
    } else {
      alert("Usuário ou senha inválidos.");
    }
  });
}

function renderLivrosPage() {
  if (!isAuthenticated()) {
    window.location.href = "./index.html";
    return;
  }

  const main = mountShell({
    topTitle: APP_NAME,
    topSubtitle: "Escolha um livro",
    back: null,
    activeNav: "home",
  });

  const wrap = document.createElement("div");
  wrap.className = "main-inner";
  wrap.innerHTML = `
    <section class="panel panel-home-hero">
      <div class="home-hero-inner">
        <div class="home-hero-copy">
          <h2 class="panel-heading-plain">Seu progresso</h2>
          <p class="view-description">Acompanhe quanto da Bíblia você já marcou como lida.</p>
        </div>
        <div class="progress-widget" aria-live="polite">
          <div
            class="progress-bar-track"
            role="progressbar"
            aria-valuenow="${Math.round(stats.percentRead)}"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-label="Percentual da Bíblia lido"
          >
            <div class="progress-bar-fill" style="width: ${Math.min(100, stats.percentRead)}%"></div>
          </div>
          <div class="progress-widget-stats">
            <span class="progress-widget-pct"><strong>${stats.percentRead.toFixed(1)}%</strong> concluído</span>
            <span class="progress-widget-count">${stats.readVerses.toLocaleString("pt-BR")} / ${stats.totalVerses.toLocaleString("pt-BR")} versículos</span>
          </div>
        </div>
      </div>
    </section>
    <section class="panel panel-books">
      <div class="panel-books-header">
        <h2>Livros</h2>
        <input type="search" id="book-search" class="input-search" placeholder="Buscar por nome…" autocomplete="off" />
      </div>
      <p class="view-description">Os livros são agrupados por testamento quando essa informação existe no arquivo.</p>
      <div id="books-list" class="books-list"></div>
    </section>
  `;
  main.appendChild(wrap);

  const list = wrap.querySelector("#books-list");
  const search = wrap.querySelector("#book-search");

  function renderBookList(filterText) {
    list.innerHTML = "";
    const q = filterText.trim().toLowerCase();

    if (!bibleData) {
      list.innerHTML = '<p class="empty-inline">Carregando Bíblia…</p>';
      return;
    }

    const groups = groupBooksByPeriod(bibleData);
    let any = false;

    for (const [periodo, books] of groups) {
      const visible = books.filter(
        (b) => !q || (b.nome && b.nome.toLowerCase().includes(q))
      );
      if (!visible.length) continue;
      any = true;

      const block = document.createElement("div");
      block.className = "book-period";
      const h = document.createElement("h3");
      h.className = "book-period-title";
      h.textContent = shortenPeriodLabel(periodo);
      block.appendChild(h);

      const grid = document.createElement("div");
      grid.className = "books-grid";

      visible.forEach((book) => {
        const a = document.createElement("a");
        a.className = "book-item";
        a.href = `./capitulos.html?livro=${encodeURIComponent(book.id)}`;
        const name = document.createElement("span");
        name.className = "book-item-name";
        name.textContent = book.nome;
        const meta = document.createElement("span");
        meta.className = "book-item-meta";
        meta.textContent = `${book.capitulos.length} cap.`;
        a.append(name, meta);
        grid.appendChild(a);
      });

      block.appendChild(grid);
      list.appendChild(block);
    }

    if (!any) {
      list.innerHTML = '<p class="empty-inline">Nenhum livro encontrado.</p>';
    }
  }

  search.addEventListener("input", () => renderBookList(search.value));
  renderBookList("");
}

function renderCapitulosPage() {
  if (!isAuthenticated()) {
    window.location.href = "./index.html";
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const bookId = params.get("livro");
  if (!bookId) {
    window.location.href = "./livros.html";
    return;
  }

  const book = bibleData?.find((b) => b.id === bookId);
  if (!book) {
    window.location.href = "./livros.html";
    return;
  }

  const main = mountShell({
    topTitle: "Capítulos",
    topSubtitle: book.nome,
    back: { href: "./livros.html", label: "← Livros" },
    activeNav: "home",
  });

  const section = document.createElement("section");
  section.className = "panel panel-chapters";
  section.innerHTML = `
    <h2>Capítulos</h2>
    <p class="view-description">Abra o capítulo ou marque como lido quando terminar.</p>
    <div id="chapters-list" class="chapters-list"></div>
  `;
  main.appendChild(section);

  const list = section.querySelector("#chapters-list");
  book.capitulos.forEach((chapter, index) => {
    const versesCount = chapter.length;
    const isRead = getChapterRead(book.id, index);

    const row = document.createElement("div");
    row.className = "chapter-row";

    const link = document.createElement("a");
    link.className = "chapter-main";
    link.href = chapterReaderUrl(book.id, index + 1);
    link.innerHTML = `
      <span class="chapter-number">Cap. ${index + 1}</span>
      <span class="chapter-meta">${versesCount} vers.</span>
    `;

    const label = document.createElement("label");
    label.className = "chapter-check-label";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = isRead;
    cb.addEventListener("change", () => {
      toggleChapterRead(book.id, index, versesCount);
    });
    const span = document.createElement("span");
    span.textContent = "Lido";
    label.append(cb, span);

    row.append(link, label);
    list.appendChild(row);
  });
}

function renderCapituloPage() {
  if (!isAuthenticated()) {
    window.location.href = "./index.html";
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const bookId = params.get("livro");
  const capStr = params.get("cap");
  const chapterNumber = capStr ? parseInt(capStr, 10) : NaN;

  if (!bookId || !chapterNumber || Number.isNaN(chapterNumber)) {
    window.location.href = "./livros.html";
    return;
  }

  const book = bibleData?.find((b) => b.id === bookId);
  if (!book?.capitulos?.[chapterNumber - 1]) {
    window.location.href = "./livros.html";
    return;
  }

  const chapterIndex = chapterNumber - 1;
  const chapter = book.capitulos[chapterIndex];
  const verseCount = chapter.length;
  const isRead = getChapterRead(book.id, chapterIndex);
  const prevCap = chapterNumber > 1 ? chapterNumber - 1 : null;
  const nextCap =
    chapterNumber < book.capitulos.length ? chapterNumber + 1 : null;

  const main = mountShell({
    topTitle: book.nome,
    topSubtitle: `Capítulo ${chapterNumber}`,
    back: {
      href: `./capitulos.html?livro=${encodeURIComponent(book.id)}`,
      label: "← Capítulos",
    },
    activeNav: "home",
  });

  const panel = document.createElement("section");
  panel.className = "panel panel-reader";

  const prevHtml = prevCap
    ? `<a class="btn btn-ghost btn-sm" href="${chapterReaderUrl(book.id, prevCap)}">← Cap. ${prevCap}</a>`
    : `<span class="btn btn-ghost btn-sm is-disabled" aria-disabled="true">← Anterior</span>`;
  const nextHtml = nextCap
    ? `<a class="btn btn-ghost btn-sm" href="${chapterReaderUrl(book.id, nextCap)}">Próximo →</a>`
    : `<span class="btn btn-ghost btn-sm is-disabled" aria-disabled="true">Próximo →</span>`;

  panel.innerHTML = `
    <div class="reader-header">
      <div>
        <h2 class="reader-title-heading">${escapeHtml(book.nome)} ${chapterNumber}</h2>
        <p class="reader-subtitle">Bíblia Livre — ${verseCount} versículos neste capítulo.</p>
      </div>
    </div>
    <div class="reader-toolbar">
      <label class="reader-mark-read">
        <input type="checkbox" id="reader-mark-chapter" ${isRead ? "checked" : ""} />
        <span>Marcar capítulo como lido</span>
      </label>
      <div class="reader-nav-chapters">
        ${prevHtml}
        ${nextHtml}
      </div>
    </div>
    <div id="reader-content" class="reader-content"></div>
  `;

  main.appendChild(panel);

  panel.querySelector("#reader-mark-chapter").addEventListener("change", (e) => {
    const wantRead = e.target.checked;
    const currently = getChapterRead(book.id, chapterIndex);
    if (wantRead !== currently) {
      toggleChapterRead(book.id, chapterIndex, verseCount);
    }
  });

  const readerContent = panel.querySelector("#reader-content");
  chapter.forEach((verseText, index) => {
    const verse = document.createElement("div");
    verse.className = "verse-row";
    const num = document.createElement("span");
    num.className = "verse-number";
    num.textContent = String(index + 1);
    const p = document.createElement("p");
    p.className = "verse-text";
    p.textContent = verseText;
    verse.append(num, p);
    readerContent.appendChild(verse);
  });
}

function renderDailyVersePage() {
  if (!isAuthenticated()) {
    window.location.href = "./index.html";
    return;
  }

  const allVerses = [];
  bibleData.forEach((book) => {
    if (!Array.isArray(book.capitulos)) return;
    book.capitulos.forEach((ch, chapterIndex) => {
      ch.forEach((text, verseIndex) => {
        allVerses.push({
          bookId: book.id,
          bookName: book.nome,
          chapter: chapterIndex + 1,
          verse: verseIndex + 1,
          text,
        });
      });
    });
  });

  const now = Date.now();
  const stored = loadFromStorage(STORAGE_KEYS.DAILY_VERSE, null);
  let daily = stored;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  if (!stored || !stored.timestamp || now - stored.timestamp >= ONE_DAY_MS) {
    const randomIndex = Math.floor(Math.random() * allVerses.length);
    const picked = allVerses[randomIndex];
    daily = { ...picked, timestamp: now };
    saveToStorage(STORAGE_KEYS.DAILY_VERSE, daily);
  }

  const ref = `${daily.bookName} ${daily.chapter}:${daily.verse}`;
  const main = mountShell({
    topTitle: "Versículo do dia",
    topSubtitle: ref,
    back: { href: "./livros.html", label: "← Início" },
    activeNav: "verse",
  });

  const section = document.createElement("section");
  section.className = "panel panel-reader";
  section.innerHTML = `
    <div class="reader-header">
      <div>
        <h2 class="reader-title-heading">${escapeHtml(ref)}</h2>
        <p class="reader-subtitle">Atualizado a cada 24 horas (armazenado neste aparelho).</p>
      </div>
    </div>
    <div class="daily-verse-box">
      <p class="daily-verse-text">“${escapeHtml(daily.text)}”</p>
      <p class="daily-verse-ref">${escapeHtml(ref)}</p>
    </div>
  `;
  main.appendChild(section);
}

function renderPlansPage() {
  if (!isAuthenticated()) {
    window.location.href = "./index.html";
    return;
  }

  const readChapters = [];
  bibleData.forEach((book) => {
    if (!Array.isArray(book.capitulos)) return;
    book.capitulos.forEach((chapter, chapterIndex) => {
      if (getChapterRead(book.id, chapterIndex)) {
        readChapters.push({
          bookId: book.id,
          bookName: book.nome,
          chapterIndex,
          chapterNumber: chapterIndex + 1,
          versesCount: chapter.length,
        });
      }
    });
  });

  const main = mountShell({
    topTitle: "Meus planos",
    topSubtitle: "Capítulos marcados como lidos",
    back: { href: "./livros.html", label: "← Início" },
    activeNav: "plans",
  });

  const section = document.createElement("section");
  section.className = "panel panel-plans";
  section.innerHTML = `
    <div class="plans-header">
      <div>
        <h2>Capítulos lidos</h2>
        <p class="view-description">Toque em “Abrir” para reler ou em “Desmarcar” para tirar da lista.</p>
      </div>
      <div class="stats-box">
        <div class="stats-main">
          <div>
            <span class="stats-label">Progresso</span>
            <span id="plans-stats-percent" class="stats-value">0%</span>
          </div>
          <div>
            <span class="stats-label">Versículos</span>
            <span id="plans-stats-read" class="stats-value">0 / 0</span>
          </div>
        </div>
      </div>
    </div>
    <div id="plans-list" class="plans-list"></div>
  `;
  main.appendChild(section);

  const listEl = section.querySelector("#plans-list");
  if (!readChapters.length) {
    listEl.innerHTML =
      '<p class="empty-state">Você ainda não marcou nenhum capítulo como lido.</p>';
  } else {
    readChapters.forEach((item) => {
      const row = document.createElement("div");
      row.className = "plan-row";

      const mainCol = document.createElement("div");
      mainCol.className = "plan-main";
      const title = document.createElement("div");
      title.className = "plan-title";
      title.textContent = `${item.bookName} ${item.chapterNumber}`;
      const meta = document.createElement("div");
      meta.className = "plan-meta";
      meta.textContent = `${item.versesCount} versículos`;
      mainCol.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "plan-actions";
      const openBtn = document.createElement("a");
      openBtn.className = "btn btn-ghost btn-sm";
      openBtn.href = chapterReaderUrl(item.bookId, item.chapterNumber);
      openBtn.textContent = "Abrir";
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn btn-danger btn-sm";
      removeBtn.textContent = "Desmarcar";
      removeBtn.addEventListener("click", () => {
        toggleChapterRead(item.bookId, item.chapterIndex, item.versesCount);
        renderPlansPage();
      });
      actions.append(openBtn, removeBtn);
      row.append(mainCol, actions);
      listEl.appendChild(row);
    });
  }

  section.querySelector("#plans-stats-percent").textContent = `${stats.percentRead.toFixed(1)}%`;
  section.querySelector("#plans-stats-read").textContent = `${stats.readVerses} / ${stats.totalVerses}`;
}

function updateStatsUI() {
  const percentEl = document.getElementById("stats-percent");
  const readEl = document.getElementById("stats-read");
  if (!percentEl || !readEl) return;
  percentEl.textContent = `${stats.percentRead.toFixed(1)}%`;
  readEl.textContent = `${stats.readVerses} / ${stats.totalVerses}`;
}

function updateGoalSummary() {
  const el = document.getElementById("goal-summary");
  if (!el) return;
  const daily = settings.dailyGoalVerses;
  if (!daily || !stats.totalVerses) {
    el.textContent = "";
    return;
  }
  const daysToFinish = Math.ceil(stats.remainingVerses / daily);
  el.textContent = `Com essa meta, você termina em cerca de ${daysToFinish} dia(s).`;
}

function renderMetaPage() {
  if (!isAuthenticated()) {
    window.location.href = "./index.html";
    return;
  }

  const main = mountShell({
    topTitle: "Meta diária",
    topSubtitle: "Versículos por dia e resumo de progresso",
    back: { href: "./livros.html", label: "← Início" },
    activeNav: "goal",
  });

  const section = document.createElement("section");
  section.className = "panel panel-progress";
  section.innerHTML = `
    <h2>Progresso</h2>
    <p class="view-description">Defina quantos versículos pretende ler por dia e veja o percentual geral.</p>
    <div class="progress-layout">
      <div class="stats-box">
        <div class="stats-main">
          <div>
            <span class="stats-label">% da Bíblia lida</span>
            <span id="stats-percent" class="stats-value">0%</span>
          </div>
          <div>
            <span class="stats-label">Versículos lidos</span>
            <span id="stats-read" class="stats-value">0 / 0</span>
          </div>
        </div>
        <div class="stats-goal">
          <label>
            Meta diária (versículos)
            <input id="input-daily-goal" type="number" min="1" class="input-small" />
          </label>
          <div id="goal-summary" class="goal-summary"></div>
        </div>
      </div>
    </div>
  `;
  main.appendChild(section);

  const inputDailyGoal = section.querySelector("#input-daily-goal");
  inputDailyGoal.value = settings.dailyGoalVerses || "";
  inputDailyGoal.addEventListener("change", () => {
    const value = parseInt(inputDailyGoal.value, 10);
    if (!Number.isNaN(value) && value > 0) {
      settings.dailyGoalVerses = value;
      saveToStorage(STORAGE_KEYS.SETTINGS, settings);
      updateGoalSummary();
    }
  });

  updateStatsUI();
  updateGoalSummary();
}

async function loadBible() {
  try {
    const res = await fetch(BIBLE_URL);
    if (!res.ok) throw new Error("Falha na rede");
    const data = await res.json();

    bibleData = data.filter((item) => Array.isArray(item.capitulos));
    recomputeStats();

    if (CURRENT_PAGE === "index") {
      if (isAuthenticated()) {
        window.location.href = "./livros.html";
      } else {
        renderLoginPage();
      }
    } else if (CURRENT_PAGE === "livros") {
      renderLivrosPage();
    } else if (CURRENT_PAGE === "capitulos") {
      renderCapitulosPage();
    } else if (CURRENT_PAGE === "capitulo") {
      renderCapituloPage();
    } else if (CURRENT_PAGE === "versiculo") {
      renderDailyVersePage();
    } else if (CURRENT_PAGE === "planos") {
      renderPlansPage();
    } else if (CURRENT_PAGE === "meta") {
      renderMetaPage();
    }
  } catch (err) {
    console.error(err);
    appRoot.innerHTML = `<div class="center-container"><div class="card card-login"><h1>Erro ao carregar</h1><p class="subtitle">Não foi possível ler <code>data/biblialivre.json</code>. Use um servidor local (por exemplo, “Live Server” no VS Code) em vez de abrir o arquivo direto pelo disco, ou confira se a pasta <code>data</code> está ao lado dos HTML.</p></div></div>`;
  }
}

loadBible();
