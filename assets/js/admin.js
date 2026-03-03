const path = window.location.pathname;
const isLogin = path.endsWith('/admin/login.html') || path.endsWith('admin/login.html');
const isDashboard = path.endsWith('/admin/dashboard.html') || path.endsWith('admin/dashboard.html');

const ADMIN_AUTH_KEY = 'identisite_admin_auth';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';

const collections = {
  settings: 'settings',
  performances: 'performances',
  actors: 'actors',
  gallery: 'gallery',
  news: 'news'
};

const state = {
  activeTab: 'settings',
  currentItems: []
};

function text(el, value) {
  if (el) el.textContent = value;
}

function nowIso() {
  return new Date().toISOString();
}

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getStore(kind) {
  const raw = localStorage.getItem(`identisite_${kind}`);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function setStore(kind, value) {
  localStorage.setItem(`identisite_${kind}`, JSON.stringify(value));
}

function getSettings() {
  const raw = localStorage.getItem('identisite_settings');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function setSettings(payload) {
  localStorage.setItem('identisite_settings', JSON.stringify(payload));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function collectPayload(form, kind) {
  const fd = new FormData(form);
  const payload = {};
  for (const [key, value] of fd.entries()) {
    if (key === 'id' || key === 'imageFile') continue;
    if (value !== '') payload[key] = value;
  }
  payload.updatedAt = nowIso();
  return {
    id: fd.get('id'),
    file: fd.get('imageFile'),
    payload
  };
}

function formFromItem(form, item) {
  const entries = new FormData(form);
  for (const key of entries.keys()) {
    if (key === 'imageFile') continue;
    const input = form.elements.namedItem(key);
    if (!input) continue;
    input.value = item[key] || '';
  }
}

async function saveSettings(form) {
  const msg = document.getElementById('settings-msg');
  const fd = new FormData(form);
  const payload = {
    hero_title: fd.get('hero_title') || '',
    hero_title_en: fd.get('hero_title_en') || '',
    hero_slogan: fd.get('hero_slogan') || '',
    hero_slogan_en: fd.get('hero_slogan_en') || '',
    about_title: fd.get('about_title') || '',
    about_title_en: fd.get('about_title_en') || '',
    about_text_1: fd.get('about_text_1') || '',
    about_text_1_en: fd.get('about_text_1_en') || '',
    about_text_2: fd.get('about_text_2') || '',
    about_text_2_en: fd.get('about_text_2_en') || '',
    about_mission_title: fd.get('about_mission_title') || '',
    about_mission_title_en: fd.get('about_mission_title_en') || '',
    about_mission_text: fd.get('about_mission_text') || '',
    about_mission_text_en: fd.get('about_mission_text_en') || '',
    contact_address: fd.get('contact_address') || '',
    contact_address_en: fd.get('contact_address_en') || '',
    contact_phone: fd.get('contact_phone') || '',
    contact_email: fd.get('contact_email') || '',
    global_ticket_url: fd.get('global_ticket_url') || '',
    global_ticket_url_en: fd.get('global_ticket_url_en') || '',
    updatedAt: nowIso()
  };

  setSettings(payload);
  text(msg, 'შენახულია (ლოკალურად)');
}

function loadSettings() {
  const data = getSettings();
  const form = document.getElementById('settings-form');
  if (!form) return;

  [
    'hero_title',
    'hero_title_en',
    'hero_slogan',
    'hero_slogan_en',
    'about_title',
    'about_title_en',
    'about_text_1',
    'about_text_1_en',
    'about_text_2',
    'about_text_2_en',
    'about_mission_title',
    'about_mission_title_en',
    'about_mission_text',
    'about_mission_text_en',
    'contact_address',
    'contact_address_en',
    'contact_phone',
    'contact_email',
    'global_ticket_url',
    'global_ticket_url_en'
  ].forEach((key) => {
    const input = form.elements.namedItem(key);
    if (input) input.value = data[key] || '';
  });
}

function listByKind(kind) {
  return getStore(kind).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

function humanTitle(kind) {
  if (kind === 'performances') return 'რეპერტუარი';
  if (kind === 'actors') return 'დასი';
  if (kind === 'gallery') return 'გალერია';
  if (kind === 'news') return 'სიახლეები';
  return 'ჩანაწერები';
}

function tabToForm(kind) {
  if (kind === 'settings') return null;
  return document.getElementById(`${kind}-form`);
}

function openTab(kind) {
  state.activeTab = kind;
  document.querySelectorAll('.tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === kind);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.add('hidden'));
  const target = document.getElementById(`tab-${kind}`);
  if (target) target.classList.remove('hidden');
  const title = document.getElementById('list-title');
  text(title, kind === 'settings' ? 'პარამეტრები' : humanTitle(kind));
}

function listMarkup(item) {
  const main = item.title || item.name || item.hero_title || item.id;
  const sub = item.director || item.author || item.role || item.type || item.excerpt || item.contact_phone || '';
  const meta = item.date || item.startTime ? `${item.date || ''} ${item.startTime || ''}`.trim() : '';
  return `<article class="list-item">
    <div class="row">
      <strong>${main}</strong>
      <div class="row">
        <button class="ghost" type="button" data-action="edit" data-id="${item.id}">რედაქტირება</button>
        <button class="danger" type="button" data-action="delete" data-id="${item.id}">წაშლა</button>
      </div>
    </div>
    <p class="small">${sub}</p>
    ${meta ? `<p class="small">${meta}</p>` : ''}
    ${item.image ? `<img class="preview" src="${item.image}" alt="">` : ''}
  </article>`;
}

function renderList() {
  const holder = document.getElementById('admin-list');
  if (!holder) return;
  if (state.activeTab === 'settings') {
    holder.innerHTML = '<div class="small">პარამეტრების რედაქტირება ხდება მარცხენა ფორმიდან.</div>';
    state.currentItems = [];
    return;
  }

  const kind = state.activeTab;
  const items = listByKind(kind);
  state.currentItems = items;

  if (!items.length) {
    holder.innerHTML = '<div class="small">მონაცემები ცარიელია.</div>';
    return;
  }

  holder.innerHTML = items.map((item) => listMarkup(item)).join('');
}

async function upsertEntity(form, kind) {
  const msg = form.querySelector('[data-msg]');
  const { id, file, payload } = collectPayload(form, kind);

  const items = getStore(kind);
  const index = id ? items.findIndex((x) => x.id === id) : -1;

  let existing = null;
  if (index >= 0) existing = items[index];

  if (file && file.size > 0) {
    const imageData = await readFileAsDataUrl(file);
    payload.image = imageData;
  }

  if (!id || index < 0) {
    const entity = {
      id: uid(),
      createdAt: nowIso(),
      ...payload
    };
    items.push(entity);
    form.reset();
    text(msg, 'დამატებულია (ლოკალურად)');
  } else {
    items[index] = {
      ...existing,
      ...payload,
      id: existing.id
    };
    text(msg, 'განახლებულია (ლოკალურად)');
  }

  setStore(kind, items);
  renderList();
}

function bindForms() {
  const settingsForm = document.getElementById('settings-form');
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await saveSettings(settingsForm);
      } catch (err) {
        text(document.getElementById('settings-msg'), err.message);
      }
    });
  }

  ['performances', 'actors', 'gallery', 'news'].forEach((kind) => {
    const form = document.getElementById(`${kind}-form`);
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await upsertEntity(form, kind);
      } catch (err) {
        const msg = form.querySelector('[data-msg]');
        text(msg, err.message);
      }
    });
  });
}

function bindListActions() {
  const holder = document.getElementById('admin-list');
  if (!holder) return;

  holder.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const id = target.dataset.id;
    const action = target.dataset.action;
    if (!id || !action) return;

    const kind = state.activeTab;
    const item = state.currentItems.find((x) => x.id === id);
    if (!item) return;

    if (action === 'edit') {
      const form = tabToForm(kind);
      if (!form) return;
      form.elements.namedItem('id').value = item.id;
      formFromItem(form, item);
      return;
    }

    if (action === 'delete') {
      if (!confirm('წაშლა ნამდვილად გსურთ?')) return;
      const items = getStore(kind).filter((x) => x.id !== id);
      setStore(kind, items);
      renderList();
    }
  });
}

function bindTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      openTab(tab.dataset.tab);
      renderList();
    });
  });
}

function loginFlow() {
  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    text(errorEl, '');

    const fd = new FormData(form);
    const username = String(fd.get('username') || '').trim();
    const password = String(fd.get('password') || '');

    if (username !== ADMIN_USER || password !== ADMIN_PASS) {
      text(errorEl, 'არასწორი მონაცემები');
      return;
    }

    localStorage.setItem(ADMIN_AUTH_KEY, '1');
    window.location.replace('./dashboard.html');
  });
}

function dashboardFlow() {
  if (localStorage.getItem(ADMIN_AUTH_KEY) !== '1') {
    window.location.replace('./login.html');
    return;
  }

  loadSettings();
  bindTabs();
  bindForms();
  bindListActions();
  openTab('settings');
  renderList();

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem(ADMIN_AUTH_KEY);
      window.location.replace('./login.html');
    });
  }
}

if (isLogin) loginFlow();
if (isDashboard) dashboardFlow();
