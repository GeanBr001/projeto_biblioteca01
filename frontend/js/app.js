// Controlador principal da aplicação ATUALIZADO
// Este arquivo contém a integração do carrinho dinâmica.

import { API_BASE, SESSION_KEY, STATUS_COLORS, STATUS_LABELS, ROLE_LABELS } from './config.js';
import { runValidation } from './validators.js';
import { formatPrice, deriveStatus, escapeHtml } from './helpers.js';
import { tagHtml, coverHtml, buildField, addressFieldsHtml, buildPaginationHtml } from './ui.js';
import { apiFetch, mapBookFormToApi } from './api.js';
import { State, VIEW_MODE, ACTIVE_TAB, showToast, showConfirm, confirmYes, confirmNo } from './state.js';
import { currentTheme, toggleTheme } from './theme.js';

export const App = {

  // tenta puxar a sessão salva. se der bom, abre o app, se não, pede login.
init() {
    try {
        const saved = localStorage.getItem(SESSION_KEY);

        if (saved) {
            State.auth.currentUser = JSON.parse(saved);

            State.auth.viewMode =
                State.auth.currentUser.role === 'admin'
                    ? VIEW_MODE.ADMIN
                    : VIEW_MODE.CLIENT;
        }
    } catch {
        localStorage.removeItem(SESSION_KEY);
        State.auth.currentUser = null;
    }

    if (State.auth.currentUser) {
        this.showApp();
    } else {
        this.showLogin('login');
    }
},

  // LOGIN E CADASTRO
  showLogin(mode) {
    document.getElementById('login-page').style.display = '';
    document.getElementById('app-shell').style.display = 'none';
    this._renderLoginForm(mode);
  },

  _renderLoginForm(mode) {
    document.getElementById('login-heading').textContent = mode === 'login' ? 'Bem-vindo' : 'Criar conta';
    document.getElementById('server-msg').style.display = 'none';
    const isRegister = mode === 'register';

    document.getElementById('login-box').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        ${isRegister ? buildField({ label: 'Nome completo', name: 'name', placeholder: 'Ex: João Silva', required: true, colSpan: 2 }) : ''}
        ${buildField({ label: 'E-mail', name: 'email', type: 'email', placeholder: 'Ex: joao@email.com', required: true, colSpan: 2 })}
        ${buildField({ label: 'Senha', name: 'password', type: 'password', placeholder: '••••••', required: true, colSpan: 2 })}
        ${isRegister ? `
          ${buildField({ label: 'Telefone', name: 'phone', placeholder: 'Ex: (41) 99999-9999', colSpan: 2 })}
          <div style="grid-column:span 2">${addressFieldsHtml()}</div>
        ` : ''}
        <div style="grid-column:span 2;margin-top:4px">
          <button class="btn-lib btn-primary-lib full" id="login-submit-btn" onclick="App.submitLogin('${mode}')">
            ${mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </div>
      </div>`;

    document.getElementById('login-toggle-row').innerHTML =
      (mode === 'login' ? 'Não tem conta? ' : 'Já tem conta? ') +
      `<button class="login-toggle" onclick="App.showLogin('${mode === 'login' ? 'register' : 'login'}')">
        ${mode === 'login' ? 'Cadastre-se' : 'Entrar'}
      </button>`;
  },

  async submitLogin(mode) {
    const box = document.getElementById('login-box');
    const formData = {};
    box.querySelectorAll('[name]').forEach(input => { formData[input.name] = input.value; });

    const fields = mode === 'login'
      ? ['email', 'password']
      : ['name', 'email', 'password', 'phone', 'street', 'city', 'state', 'zipCode'];

    const errors = runValidation(fields, formData);
    if (Object.keys(errors).length) {
      fields.forEach(field => {
        const input = box.querySelector(`[name="${field}"]`);
        if (!input) return;
        const parent = input.closest('div');
        parent.querySelector('.field-error')?.remove();
        if (errors[field]) {
          input.classList.add('err');
          parent.querySelector('.field-label')?.classList.add('error');
          const errEl = document.createElement('span');
          errEl.className = 'field-error';
          errEl.textContent = '⚠ ' + errors[field];
          input.before(errEl);
        }
      });
      return;
    }

    const btn = document.getElementById('login-submit-btn');
    btn.disabled = true; btn.textContent = '…';
    try {
      if (mode === 'login') {
        const { user } = await apiFetch(`${API_BASE}/users/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: formData.email.trim(), password: formData.password }),
        });
        localStorage.setItem(SESSION_KEY, JSON.stringify(user));
        State.auth.currentUser = user;
        State.auth.viewMode = user.role === 'admin' ? VIEW_MODE.ADMIN : VIEW_MODE.CLIENT;
        this.showApp();
      } else {
        await apiFetch(`${API_BASE}/users/clientes`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: formData.name.trim(), email: formData.email.trim(),
            password: formData.password, telefone: formData.phone,
            endereco: { rua: formData.street.trim(), numero: formData.number, bairro: formData.neighborhood, cidade: formData.city.trim(), estado: formData.state.trim(), cep: formData.zipCode.trim() }
          }),
        });
        this._showServerMsg('Cadastro realizado! Faça login.', true);
        this.showLogin('login');
      }
    } catch (err) {
      btn.disabled = false; btn.textContent = mode === 'login' ? 'Entrar' : 'Criar conta';
      this._showServerMsg(err.message, false);
    }
  },

  _showServerMsg(message, isSuccess) {
    const el = document.getElementById('server-msg');
    el.className = 'server-msg ' + (isSuccess ? 'ok' : 'err');
    el.textContent = message;
    el.style.display = '';
  },

  logout() {
    localStorage.removeItem(SESSION_KEY);
    State.auth.currentUser = null;
    State.auth.viewMode = VIEW_MODE.CLIENT;

    window.location.href = "home.html";
},

  // APP SHELL
  showApp() {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('app-shell').style.display = '';
    this._renderHeader();
    this.goList();
    this.loadBooks();
  },

  _renderHeader() {
    const user = State.auth.currentUser;
    const isAdmin = user.role === 'admin';
    const inAdmin = isAdmin && State.auth.viewMode === VIEW_MODE.ADMIN;

    document.getElementById('admin-badge').style.display = inAdmin ? '' : 'none';
    document.getElementById('main-nav').style.display = inAdmin ? '' : 'none';

    document.getElementById('user-chip-wrap').innerHTML = `
      <button class="chip-btn" onclick="App.toggleChip()">
        <div class="chip-avatar">${user.name?.charAt(0).toUpperCase()}</div>
        <span class="chip-name">${escapeHtml(user.name)}</span>
        ${isAdmin ? tagHtml('admin', '#ff9f43') : ''}
      </button>
      <div class="chip-dropdown" id="chip-dd">
        <div class="chip-dd-header">
          <div class="name">${escapeHtml(user.name)}</div>
          <div class="email">${escapeHtml(user.email)}</div>
        </div>
        ${isAdmin ? `
          <button class="chip-dd-btn switch" onclick="App.toggleViewMode()">
            ${inAdmin ? '👁 Ver como cliente' : '⚙ Painel admin'}
          </button>` : ''}
        <button class="chip-dd-btn theme" data-theme-toggle onclick="toggleTheme()">${currentTheme() === 'dark' ? '☀ Tema claro' : '🌙 Tema escuro'}</button>
        <button class="chip-dd-btn logout" onclick="App.logout()">Sair</button>
      </div>`;

    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        State.auth.activeTab = btn.dataset.tab;
        this.goList();
        State.auth.activeTab === ACTIVE_TAB.LIVROS ? this.loadBooks() : this.loadUsers();
      };
    });

    document.querySelectorAll('.nav-tab-mobile').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.nav-tab-mobile').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === btn.dataset.tab));
        btn.classList.add('active');
        State.auth.activeTab = btn.dataset.tab;
        document.getElementById('mobile-nav-drawer').classList.remove('open');
        this.goList();
        State.auth.activeTab === ACTIVE_TAB.LIVROS ? this.loadBooks() : this.loadUsers();
      };
    });
  },

  toggleChip() { document.getElementById('chip-dd')?.classList.toggle('open'); },

  toggleViewMode() {
    State.auth.viewMode = State.auth.viewMode === VIEW_MODE.ADMIN ? VIEW_MODE.CLIENT : VIEW_MODE.ADMIN;
    State.auth.activeTab = ACTIVE_TAB.LIVROS;
    document.getElementById('chip-dd')?.classList.remove('open');
    document.querySelectorAll('.nav-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === ACTIVE_TAB.LIVROS);
    });
    this._renderHeader();
    this.goList();
    this.loadBooks();
  },

  _showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  goList() {
    this._showPage('page-list');
    const inAdmin = State.auth.currentUser?.role === 'admin' && State.auth.viewMode === VIEW_MODE.ADMIN;
    document.getElementById('books-section').style.display =
      (State.auth.viewMode === VIEW_MODE.CLIENT || State.auth.activeTab === ACTIVE_TAB.LIVROS) ? '' : 'none';
    document.getElementById('users-section').style.display =
      (inAdmin && State.auth.activeTab === ACTIVE_TAB.USUARIOS) ? '' : 'none';
    const statusFilter = document.getElementById('books-status-filter');
    if (statusFilter) statusFilter.style.display = inAdmin ? '' : 'none';
    document.getElementById('books-admin-bar').style.display = inAdmin ? '' : 'none';
  },

  toggleHamburger() { document.getElementById('mobile-nav-drawer')?.classList.toggle('open'); },

  goCreate(section) {
    if (section === ACTIVE_TAB.LIVROS) {
      State.books.newForm = { title: '', description: '', price: '', stock: '', status: 'active', categoryId: '', author: '' };
      State.books.newFormErrors = {};
      State.books.newCoverFile = null;
      this._renderCreateBook();
      this._showPage('page-create-book');
    } else {
      State.users.newForm = { name: '', email: '', password: '', phone: '', role: 'client', street: '', number: '', neighborhood: '', city: '', state: '', zipCode: '' };
      State.users.newFormErrors = {};
      this._renderCreateUser();
      this._showPage('page-create-user');
    }
  },

  // GESTÃO DE LIVROS
  async loadBooks() {
    document.getElementById('books-loading').style.display = 'flex';
    document.getElementById('books-grid').style.display = 'none';
    document.getElementById('books-empty').style.display = 'none';
    try {
      State.books.all = await apiFetch(`${API_BASE}/products/produtos`);
      this.renderBookGrid();
    } catch { /* erro silencioso */ }
    document.getElementById('books-loading').style.display = 'none';
  },

  _getBookFilters() {
    return {
      search: document.getElementById('books-search')?.value.trim() || '',
      status: document.getElementById('books-status-filter')?.value || '',
      minPrice: document.getElementById('books-min-price')?.value || '',
      maxPrice: document.getElementById('books-max-price')?.value || '',
      sortBy: document.getElementById('books-sort')?.value || 'name_asc',
    };
  },

  _applyBookFilters(books) {
    const { search, status, minPrice, maxPrice, sortBy } = this._getBookFilters();
    const inAdmin = State.auth.currentUser?.role === 'admin' && State.auth.viewMode === VIEW_MODE.ADMIN;
    let result = books.filter(book => {
      if (!inAdmin && book.status !== 'active') return false;
      if (search && !book.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (status && book.status !== status) return false;
      if (minPrice !== '' && Number(book.price) < Number(minPrice)) return false;
      if (maxPrice !== '' && Number(book.price) > Number(maxPrice)) return false;
      return true;
    });
    const collator = new Intl.Collator('pt-BR');
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc': return collator.compare(a.name, b.name);
        case 'name_desc': return collator.compare(b.name, a.name);
        case 'price_asc': return Number(a.price) - Number(b.price);
        case 'price_desc': return Number(b.price) - Number(a.price);
        case 'stock_asc': return Number(a.stock) - Number(b.stock);
        case 'stock_desc': return Number(b.stock) - Number(a.stock);
        default: return 0;
      }
    });
    return result;
  },

  renderBookGrid() {
    const filtered = this._applyBookFilters(State.books.all);
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / State.books.perPage));
    if (State.books.page > totalPages) State.books.page = totalPages;
    const start = (State.books.page - 1) * State.books.perPage;
    const pageItems = filtered.slice(start, start + State.books.perPage);
    const gridEl = document.getElementById('books-grid');
    const emptyEl = document.getElementById('books-empty');
    const emptyMsgEl = document.getElementById('books-empty-msg');
    const countEl = document.getElementById('books-results-count');
    const paginationEl = document.getElementById('books-pagination');

    countEl.textContent = `${total} ${total === 1 ? 'livro' : 'livros'}`;
    const hasFilters = this._hasActiveBookFilters();
    document.getElementById('books-clear-btn').style.display = hasFilters ? '' : 'none';

    if (!pageItems.length) {
      gridEl.style.display = 'none';
      emptyEl.style.display = '';
      emptyMsgEl.textContent = hasFilters ? 'Nenhum livro encontrado.' : 'Nenhum livro cadastrado.';
      paginationEl.innerHTML = '';
      return;
    }

    emptyEl.style.display = 'none';
    gridEl.style.display = '';
    const inAdmin = State.auth.currentUser?.role === 'admin' && State.auth.viewMode === VIEW_MODE.ADMIN;

    gridEl.innerHTML = pageItems.map((book, index) => `
      <div class="book-card" style="animation-delay:${index * .03}s;opacity:${book.status === 'inactive' && !inAdmin ? .4 : 1}" onclick="App.openBook(${book.id})">
        <div class="book-card-img">${coverHtml(book.cover_image, 90)}</div>
        <div class="book-card-body">
          <h3 class="book-card-title">${escapeHtml(book.name)}</h3>
          <div class="book-card-price">${formatPrice(book.price)}</div>
          <div class="book-card-status" style="color:${STATUS_COLORS[book.status] || 'var(--text)'}">${STATUS_LABELS[book.status] || ''}</div>
          
          <!-- BOTAO DE COMPRA NA LISTAGEM -->
          ${!inAdmin ? `
            <button class="btn-lib btn-primary-lib sm full mt-2" 
              ${book.status !== 'active' || book.stock <= 0 ? 'disabled' : ''} 
              onclick="event.stopPropagation(); App.addToCartById(${book.id})">
              ${book.stock <= 0 ? 'Esgotado' : 'Comprar'}
            </button>
          ` : ''}
        </div>
      </div>`).join('');

    paginationEl.innerHTML = buildPaginationHtml(State.books.page, totalPages, 'App.goBooksPage');
  },

  _hasActiveBookFilters() {
    const f = this._getBookFilters();
    return !!(f.search || f.status || f.minPrice || f.maxPrice);
  },

  onBookFilterChange() { State.books.page = 1; this.renderBookGrid(); },
  goBooksPage(page) { State.books.page = page; this.renderBookGrid(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  updateBooksPerPage(v) { State.books.perPage = Number(v); State.books.page = 1; this.renderBookGrid(); },
  clearBookFilters() {
    ['books-search', 'books-status-filter', 'books-min-price', 'books-max-price'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    State.books.page = 1; this.renderBookGrid();
  },

  // DETALHES DO LIVRO
// --- 1. ATUALIZE A FUNÇÃO openBook PARA INCLUIR O CAMPO PAGES ---

  async openBook(bookId) {
    const book = State.books.all.find(b => b.id === bookId);
    if (!book) return;
    State.books.selected = book;
    State.reloadCallback = () => this.loadBooks();
    State.books.isEditing = false;
    State.books.editCoverFile = null;
    State.books.editForm = {
      title: book.name, 
      description: book.description || '',
      price: String(book.price), 
      stock: String(book.stock),
      pages: String(book.pages || ''), // NOVO CAMPO
      status: book.status, 
      categoryId: book.category_id ?? '', 
      author: '',
    };
    State.books.editErrors = {};
    this._showPage('page-book-detail');
    await this._renderBookDetail();
  },

// --- 2. ATUALIZE A FUNÇÃO _renderBookDetail ---

  async _renderBookDetail() {
    const book = State.books.selected;
    const inAdmin = State.auth.currentUser?.role === 'admin' && State.auth.viewMode === VIEW_MODE.ADMIN;
    let authors = [];
    try { authors = await apiFetch(`${API_BASE}/products/produtos/${book.id}/autores`); } catch { /* sem autores */ }

    if (!State.books.editForm.author && authors.length) {
      State.books.editForm.author = authors.map(a => a.name).join(', ');
    }

    const el = document.getElementById('book-detail-content');

    if (State.books.isEditing && inAdmin) {
      const f = State.books.editForm;
      const e = State.books.editErrors;
      el.innerHTML = `
        <div>
          ${coverHtml(book.cover_image, 180)}
          <label class="cover-upload-label ${State.books.editCoverFile ? 'has-file' : ''}" id="cover-upload-lbl">
            <input type="file" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="App.onCoverPick(this,'edit')">
            ${State.books.editCoverFile ? `✓ ${State.books.editCoverFile.name}` : '+ Nova capa'}
          </label>
        </div>
        <div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:20px">
            ${buildField({ label: 'Título', name: 'title', value: f.title, placeholder: 'Ex: Dom Casmurro', required: true, error: e.title, colSpan: 2 })}
            ${buildField({ label: 'Autor', name: 'author', value: f.author, placeholder: 'Ex: Machado de Assis', required: true, error: e.author, colSpan: 2 })}
            ${buildField({ label: 'Descrição', name: 'description', value: f.description, placeholder: 'Sinopse…', as: 'textarea', colSpan: 2 })}
            ${buildField({ label: 'Preço (R$)', name: 'price', value: f.price, placeholder: '0 = GRÁTIS', type: 'number', required: true, error: e.price, hint: !e.price && f.price !== '' ? formatPrice(f.price) : '' })}
            ${buildField({ label: 'Estoque', name: 'stock', value: f.stock, placeholder: '0', type: 'number', required: true, error: e.stock })}
            ${buildField({ label: 'Páginas', name: 'pages', value: f.pages, placeholder: 'Ex: 320', type: 'number' })} <!-- NOVO CAMPO NA EDIÇÃO -->
            ${buildField({ label: 'ID Categoria', name: 'categoryId', value: f.categoryId, placeholder: '0 = Ação, 1 = Fantasia…' })}
            ${buildField({ label: 'Status', name: 'status', value: f.status, as: 'select', options: [{ value: 'active', label: 'Disponível' }, { value: 'inactive', label: 'Indisponível' }, { value: 'out_of_stock', label: 'Esgotado' }] })}
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn-lib btn-primary-lib" id="book-save-btn" onclick="App.saveBook()">Salvar alterações</button>
            <button class="btn-lib btn-ghost-lib" onclick="App.cancelBookEdit()">Cancelar</button>
          </div>
        </div>`;
      this._bindForm(el, State.books.editForm, State.books.editErrors);
    } else {
      const canBuy = book.status === 'active' && book.stock > 0;
      el.innerHTML = `
        <div>${coverHtml(book.cover_image, 180)}</div>
        <div>
          <span class="detail-author">${authors.map(a => escapeHtml(a.name)).join(', ') || 'Autor desconhecido'}</span>
          <h1 class="detail-title">${escapeHtml(book.name)}</h1>
          ${book.description ? `<span class="detail-desc">${escapeHtml(book.description)}</span>` : ''}
          <div style="display:flex;gap:24px;margin-bottom:20px;flex-wrap:wrap;align-items:baseline">
            <div><div class="detail-stat-label">Preço</div><div class="detail-stat-val" style="color:${Number(book.price) === 0 ? 'var(--blue)' : 'var(--accent)'}">${formatPrice(book.price)}</div></div>
            <div><div class="detail-stat-label">Estoque</div><div class="detail-stat-val">${book.stock} un.</div></div>
            ${book.pages ? `<div><div class="detail-stat-label">Páginas</div><div class="detail-stat-val">${book.pages} pág.</div></div>` : ''} <!-- NOVO CAMPO NA VISTA -->
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            ${inAdmin ? `
              <button class="btn-lib btn-primary-lib" onclick="App.startBookEdit()">Editar</button>
              <button class="btn-lib btn-danger-lib" onclick="App.confirmDeleteBook()">Remover</button>
            ` : `
              <button class="btn-lib btn-primary-lib" ${!canBuy ? 'disabled' : ''} onclick="App.addToCartById(${book.id})">
                ${book.status === 'inactive' ? 'Indisponível' : book.stock === 0 ? 'Esgotado' : 'Comprar agora'}
              </button>
            `}
          </div>
        </div>`;
    }
  },


  // FUNÇÃO DE INTEGRAÇÃO DO CARRINHO
  addToCartById(id) {
    const book = State.books.all.find(b => b.id === id);
    if (book) this.addToCart(book, []);
  },

  addToCart(book, authors) {
    let cart = JSON.parse(localStorage.getItem('biblioteca_carrinho')) || [];
    const index = cart.findIndex(item => item.id === book.id);
    const authorNames = authors && authors.length ? authors.map(a => a.name).join(', ') : 'Autor desconhecido';

    if (index !== -1) {
      cart[index].qty += 1;
    } else {
      cart.push({
        id: book.id, title: book.name, author: authorNames,
        price: Number(book.price), emoji: '📖', tag: 'Livro',
        color: 'linear-gradient(135deg, #38201a, #5a3a28)', qty: 1
      });
    }
    localStorage.setItem('biblioteca_carrinho', JSON.stringify(cart));
    showToast(`"${book.name}" adicionado ao carrinho!`, 'ok');
  },

  onCoverPick(input, context) {
    const file = input.files[0];
    if (!file) return;
    if (context === 'edit') {
      State.books.editCoverFile = file;
      const lbl = document.getElementById('cover-upload-lbl');
      if (lbl) { lbl.classList.add('has-file'); lbl.childNodes[lbl.childNodes.length - 1].textContent = `✓ ${file.name}`; }
    } else {
      State.books.newCoverFile = file;
      const lbl = document.getElementById('new-cover-lbl');
      if (lbl) { lbl.classList.add('has-file'); lbl.querySelector('span').textContent = `✓ ${file.name}`; }
    }
  },

  startBookEdit() { State.books.isEditing = true; this._renderBookDetail(); },
  cancelBookEdit() { State.books.isEditing = false; State.books.editCoverFile = null; this._renderBookDetail(); },

  async saveBook() {
    const book = State.books.selected;
    const form = State.books.editForm;
    const errors = runValidation(['title', 'price', 'stock', 'author'], form);
    if (Object.keys(errors).length) { State.books.editErrors = errors; this._renderBookDetail(); return; }
    const finalStatus = deriveStatus(form.stock, form.status);
    const btn = document.getElementById('book-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
      await apiFetch(`${API_BASE}/products/produtos/${book.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...mapBookFormToApi(form), status: finalStatus }),
      });
      if (form.author.trim()) {
        await apiFetch(`${API_BASE}/products/autores`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: form.author.trim(), productId: book.id }),
        });
      }
      if (State.books.editCoverFile) {
        const fd = new FormData(); fd.append('cover', State.books.editCoverFile);
        await fetch(`${API_BASE}/products/produtos/${book.id}/cover`, { method: 'PUT', body: fd });
      }
      const updatedList = await apiFetch(`${API_BASE}/products/produtos`);
      State.books.all = updatedList;
      const updated = updatedList.find(b => b.id === book.id);
      if (updated) State.books.selected = updated;
      State.books.isEditing = false; State.books.editCoverFile = null; State.books.editErrors = {};
      showToast(`"${form.title}" atualizado com sucesso!`, 'ok');
      this._renderBookDetail();
    } catch (err) {
      showToast(err.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar alterações'; }
    }
  },

  confirmDeleteBook() {
    showConfirm(`Remover "${State.books.selected?.name}"?\nEsta ação não pode ser desfeita.`, async () => {
      try {
        await apiFetch(`${API_BASE}/products/produtos/${State.books.selected.id}`, { method: 'DELETE' });
        showToast('Livro removido.', 'ok');
        State.reloadCallback?.(); this.goList();
      } catch (err) { showToast(err.message, 'error'); }
    });
  },

  // GESTÃO DE USUÁRIOS
  async loadUsers() {
    document.getElementById('users-loading').style.display = 'flex';
    document.getElementById('users-list').style.display = 'none';
    document.getElementById('users-empty').style.display = 'none';
    try {
      State.users.all = await apiFetch(`${API_BASE}/users/clientes`);
      this.renderUserList();
    } catch { /* erro silencioso */ }
    document.getElementById('users-loading').style.display = 'none';
  },

  _getUserFilters() {
    return {
      search: document.getElementById('users-search')?.value.trim() || '',
      role: document.getElementById('users-role-filter')?.value || '',
      status: document.getElementById('users-status-filter')?.value || '',
    };
  },

  _applyUserFilters(users) {
    const { search, role, status } = this._getUserFilters();
    return users.filter(user => {
      if (search && !user.name.toLowerCase().includes(search.toLowerCase()) && !user.email.toLowerCase().includes(search.toLowerCase())) return false;
      if (role && user.role !== role) return false;
      if (status && String(user.active) !== status) return false;
      return true;
    });
  },

  renderUserList() {
    const filtered = this._applyUserFilters(State.users.all);
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / State.users.perPage));
    if (State.users.page > totalPages) State.users.page = totalPages;
    const start = (State.users.page - 1) * State.users.perPage;
    const pageItems = filtered.slice(start, start + State.users.perPage);
    const listEl = document.getElementById('users-list');
    const emptyEl = document.getElementById('users-empty');
    const paginationEl = document.getElementById('users-pagination');
    document.getElementById('users-results-count').textContent = `${total} ${total === 1 ? 'usuário' : 'usuários'}`;
    const hasFilters = this._hasActiveUserFilters();
    document.getElementById('users-clear-btn').style.display = hasFilters ? '' : 'none';
    if (!pageItems.length) {
      listEl.style.display = 'none'; emptyEl.style.display = ''; paginationEl.innerHTML = ''; return;
    }
    emptyEl.style.display = 'none'; listEl.style.display = '';
    listEl.innerHTML = pageItems.map((user, index) => `
      <div class="user-row" style="animation-delay:${index * .03}s" onclick="App.openUser(${user.id})">
        <div class="user-avatar-sm">${user.name?.charAt(0).toUpperCase()}</div>
        <div style="min-width:0"><span class="user-name">${escapeHtml(user.name)}</span><span class="user-email">${escapeHtml(user.email)}</span></div>
        ${tagHtml(ROLE_LABELS[user.role] ?? user.role, user.role === 'admin' ? 'var(--orange)' : 'var(--blue)')}
      </div>`).join('');
    paginationEl.innerHTML = buildPaginationHtml(State.users.page, totalPages, 'App.goUsersPage');
  },

  _hasActiveUserFilters() { const f = this._getUserFilters(); return !!(f.search || f.role || f.status); },
  onUserFilterChange() { State.users.page = 1; this.renderUserList(); },
  goUsersPage(page) { State.users.page = page; this.renderUserList(); },
  updateUsersPerPage(value) { State.users.perPage = Number(value); State.users.page = 1; this.renderUserList(); },
  clearUserFilters() {
    ['users-search', 'users-role-filter', 'users-status-filter'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    State.users.page = 1; this.renderUserList();
  },

  // DETALHES DO USUÁRIO
  openUser(userId) {
    const user = State.users.all.find(u => u.id === userId);
    if (!user) return;
    State.users.selected = user;
    State.reloadCallback = () => this.loadUsers();
    State.users.isEditing = false; State.users.editErrors = {};
    State.users.editForm = { name: user.name || '', email: user.email || '', phone: user.phone || '', role: user.role || 'client', street: user.street || '', number: '', neighborhood: '', city: user.city || '', state: '', zipCode: '' };
    this._renderUserDetail(); this._showPage('page-user-detail');
  },

  _renderUserDetail() {
    const user = State.users.selected;
    const f = State.users.editForm;
    const e = State.users.editErrors;
    const el = document.getElementById('user-detail-content');
    el.innerHTML = `
      <div class="ud-avatar">${user.name?.charAt(0).toUpperCase()}</div>
      <h1 class="ud-title">${escapeHtml(user.name)}</h1>
      <div style="display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap">${tagHtml(ROLE_LABELS[user.role] ?? user.role, user.role === 'admin' ? 'var(--orange)' : 'var(--blue)')}</div>
      ${State.users.isEditing ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:20px;background:var(--bg2);border:1px solid var(--border);border-radius:3px;padding:clamp(14px,3vw,20px)">
          ${buildField({ label: 'Nome', name: 'name', value: f.name, placeholder: 'João Silva', required: true, error: e.name, colSpan: 2 })}
          ${buildField({ label: 'E-mail', name: 'email', value: f.email, placeholder: 'joao@email.com', required: true, error: e.email, colSpan: 2, type: 'email' })}
          ${buildField({ label: 'Telefone', name: 'phone', value: f.phone, placeholder: '(41) 99999-9999', error: e.phone })}
          ${buildField({ label: 'Função', name: 'role', value: f.role, as: 'select', options: [{ value: 'client', label: 'Cliente' }, { value: 'admin', label: 'Administrador' }] })}
          <div style="grid-column:span 2">${addressFieldsHtml(f, e)}</div>
        </div>
      ` : `
        <div class="info-grid">${[['E-mail', user.email], ['Telefone', user.phone || '—'], ['Cidade', user.city || '—'], ['Rua', user.street || '—']].map(([label, value]) => `<div class="info-cell"><div class="info-cell-label">${label}</div><div class="info-cell-val">${escapeHtml(value)}</div></div>`).join('')}</div>
      `}
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${State.users.isEditing ? `<button class="btn-lib btn-primary-lib" id="user-save-btn" onclick="App.saveUser()">Salvar alterações</button><button class="btn-lib btn-ghost-lib" onclick="App.cancelUserEdit()">Cancelar</button>` : `<button class="btn-lib btn-primary-lib" onclick="App.startUserEdit()">Editar</button><button class="btn-lib btn-danger-lib" onclick="App.confirmDeleteUser()">Remover</button>`}
      </div>`;
    if (State.users.isEditing) this._bindForm(el, State.users.editForm, State.users.editErrors);
  },

  startUserEdit() { State.users.isEditing = true; this._renderUserDetail(); },
  cancelUserEdit() { State.users.isEditing = false; this._renderUserDetail(); },
  async saveUser() {
    const form = State.users.editForm;
    const errors = runValidation(['name', 'email', 'phone'], form);
    if (Object.keys(errors).length) { State.users.editErrors = errors; this._renderUserDetail(); return; }
    const btn = document.getElementById('user-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
      await apiFetch(`${API_BASE}/users/clientes/${State.users.selected.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: form.name.trim(), email: form.email.trim(), telefone: form.phone, role: form.role, rua: form.street, numero: form.number, bairro: form.neighborhood, cidade: form.city, estado: form.state, cep: form.zipCode }) });
      State.users.selected = { ...State.users.selected, name: form.name.trim(), email: form.email.trim(), phone: form.phone, role: form.role, street: form.street, city: form.city };
      State.users.isEditing = false; State.users.editErrors = {}; showToast(`"${form.name}" atualizado com sucesso!`, 'ok'); this._renderUserDetail();
    } catch (err) { showToast(err.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Salvar alterações'; } }
  },

  confirmDeleteUser() {
    showConfirm(`Remover "${State.users.selected?.name}"?\nEsta ação não pode ser desfeita.`, async () => {
      try {
        await apiFetch(`${API_BASE}/users/clientes/${State.users.selected.id}`, { method: 'DELETE' });
        showToast('Usuário removido.', 'ok'); State.reloadCallback?.(); this.goList();
      } catch (err) { showToast(err.message, 'error'); }
    });
  },

  // CADASTRO DE NOVO LIVRO
  _renderCreateBook() {
    const f = State.books.newForm; const e = State.books.newFormErrors;
    document.getElementById('create-book-form').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px">
        ${buildField({ label: 'Título', name: 'title', value: f.title, placeholder: 'Ex: Dom Casmurro', required: true, error: e.title, colSpan: 2 })}
        ${buildField({ label: 'Autor', name: 'author', value: f.author, placeholder: 'Ex: Machado de Assis', required: true, error: e.author, colSpan: 2 })}
        ${buildField({ label: 'Descrição', name: 'description', value: f.description, placeholder: 'Sinopse…', as: 'textarea', colSpan: 2 })}
        ${buildField({ label: 'Preço (R$)', name: 'price', value: f.price, placeholder: '0 = GRÁTIS', type: 'number', required: true, error: e.price, hint: !e.price && f.price !== '' ? formatPrice(f.price) : '' })}
        ${buildField({ label: 'Estoque', name: 'stock', value: f.stock, placeholder: '0', type: 'number', required: true, error: e.stock, hint: !e.stock && f.stock !== '' ? `→ ${STATUS_LABELS[deriveStatus(f.stock, f.status)] ?? ''}` : '' })}
        ${buildField({ label: 'ID Categoria', name: 'categoryId', value: f.categoryId, placeholder: '0 = Ação, 1 = Fantasia…' })}
        ${buildField({ label: 'Status', name: 'status', value: f.status, as: 'select', options: [{ value: 'active', label: 'Disponível' }, { value: 'inactive', label: 'Indisponível' }, { value: 'out_of_stock', label: 'Esgotado' }] })}
        <div style="grid-column:span 2"><label class="field-label">Capa</label><label class="cover-upload-label" id="new-cover-lbl"><input type="file" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="App.onCoverPick(this,'new')"><span>${State.books.newCoverFile ? `✓ ${State.books.newCoverFile.name}` : '+ Clique ou arraste uma imagem'}</span></label></div>
        <div style="grid-column:span 2"><button class="btn-lib btn-primary-lib full" id="create-book-btn" onclick="App.submitCreateBook()">Cadastrar livro</button></div>
      </div>`;
    this._bindForm(document.getElementById('create-book-form'), State.books.newForm, State.books.newFormErrors);
  },

  async submitCreateBook() {
    const form = State.books.newForm;
    const errors = runValidation(['title', 'price', 'stock', 'author'], form);
    if (Object.keys(errors).length) { State.books.newFormErrors = errors; this._renderCreateBook(); return; }
    const finalStatus = deriveStatus(form.stock, form.status);
    const btn = document.getElementById('create-book-btn');
    btn.disabled = true; btn.textContent = '…';
    try {
      await apiFetch(`${API_BASE}/products/produtos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...mapBookFormToApi(form), status: finalStatus }) });
      const updatedList = await apiFetch(`${API_BASE}/products/produtos`);
      State.books.all = updatedList;
      const created = updatedList.find(b => b.name === form.title.trim());
      if (created) {
        if (form.author.trim()) await apiFetch(`${API_BASE}/products/autores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: form.author.trim(), productId: created.id }) });
        if (State.books.newCoverFile) { const fd = new FormData(); fd.append('cover', State.books.newCoverFile); await fetch(`${API_BASE}/products/produtos/${created.id}/cover`, { method: 'PUT', body: fd }); }
      }
      showToast(`"${form.title}" cadastrado com sucesso!`, 'ok'); this.goList(); this.renderBookGrid();
    } catch (err) { showToast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Cadastrar livro'; }
  },

  // CADASTRO DE NOVO USUÁRIO
  _renderCreateUser() {
    const f = State.users.newForm; const e = State.users.newFormErrors;
    document.getElementById('create-user-form').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px">
        ${buildField({ label: 'Nome', name: 'name', value: f.name, placeholder: 'João Silva', required: true, error: e.name, colSpan: 2 })}
        ${buildField({ label: 'E-mail', name: 'email', value: f.email, placeholder: 'joao@email.com', required: true, error: e.email, type: 'email' })}
        ${buildField({ label: 'Senha', name: 'password', value: f.password, placeholder: '••••••', required: true, error: e.password, type: 'password' })}
        ${buildField({ label: 'Telefone', name: 'phone', value: f.phone, placeholder: '(41) 99999-9999', error: e.phone })}
        ${buildField({ label: 'Função', name: 'role', value: f.role, as: 'select', options: [{ value: 'client', label: 'Cliente' }, { value: 'admin', label: 'Administrador' }] })}
        <div style="grid-column:span 2">${addressFieldsHtml(f, e)}</div>
        <div style="grid-column:span 2"><button class="btn-lib btn-primary-lib full" id="create-user-btn" onclick="App.submitCreateUser()">Cadastrar usuário</button></div>
      </div>`;
    this._bindForm(document.getElementById('create-user-form'), State.users.newForm, State.users.newFormErrors);
  },

  async submitCreateUser() {
    const form = State.users.newForm;
    const errors = runValidation(['name', 'email', 'password', 'phone', 'street', 'city', 'state', 'zipCode'], form);
    if (Object.keys(errors).length) { State.users.newFormErrors = errors; this._renderCreateUser(); return; }
    const btn = document.getElementById('create-user-btn');
    btn.disabled = true; btn.textContent = '…';
    try {
      await apiFetch(`${API_BASE}/users/clientes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: form.name.trim(), email: form.email.trim(), password: form.password, telefone: form.phone, role: form.role, endereco: { rua: form.street.trim(), numero: form.number, bairro: form.neighborhood, cidade: form.city.trim(), estado: form.state.trim(), cep: form.zipCode.trim() } }) });
      showToast(`"${form.name}" cadastrado com sucesso!`, 'ok'); this.goList(); this.loadUsers();
    } catch (err) { showToast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Cadastrar usuário'; }
  },

  // SINCRONIZAÇÃO DINÂMICA DOS FORMULÁRIOS
  _bindForm(container, formObject, errorsObject) {
    container.querySelectorAll('[name]').forEach(input => {
      input.addEventListener('input', () => {
        formObject[input.name] = input.value;
        if (input.name === 'stock' && formObject.status !== undefined) {
          formObject.status = deriveStatus(input.value, formObject.status);
          const statusSelect = container.querySelector('[name="status"]'); if (statusSelect) statusSelect.value = formObject.status;
        }
        if (input.name === 'price' || input.name === 'stock') {
          const hintEl = input.parentElement.querySelector('.field-hint');
          if (hintEl) hintEl.textContent = input.name === 'price' ? (input.value !== '' ? formatPrice(input.value) : '') : (input.value !== '' ? `→ ${STATUS_LABELS[deriveStatus(input.value, formObject.status)] ?? ''}` : '');
        }
        if (errorsObject[input.name]) {
          errorsObject[input.name] = null; input.classList.remove('err');
          input.closest('div')?.querySelector('.field-label')?.classList.remove('error');
          input.closest('div')?.querySelector('.field-error')?.remove();
        }
      });
    });
  },

  handleInput(_input) { },
  blurInput(_input) { },
  confirmYes,
  confirmNo,
};
