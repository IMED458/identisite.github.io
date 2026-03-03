import {
  pullSettingsFromCloud,
  pushSettingsToCloud,
  pullCollectionFromCloud,
  pushItemToCloud,
  removeItemFromCloud,
  signInAdmin,
  signOutAdmin,
  waitForAuthState
} from './firebase-data.js';

const path = window.location.pathname;
const isLogin = path.endsWith('/admin/login.html') || path.endsWith('admin/login.html');
const isDashboard = path.endsWith('/admin/dashboard.html') || path.endsWith('admin/dashboard.html');

const collections = {
  settings: 'settings',
  services: 'services',
  trusted: 'trusted',
  portfolio: 'portfolio',
  team: 'team',
  why: 'why',
  process: 'process',
  testimonials: 'testimonials',
  blog: 'blog',
  faq: 'faq'
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

function collectPayload(form) {
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
  const prev = getSettings();
  const payload = {
    ...prev,
    hero_title: fd.get('hero_title') || '',
    hero_subtitle: fd.get('hero_subtitle') || '',
    contact_email: fd.get('contact_email') || '',
    contact_phone: fd.get('contact_phone') || '',
    contact_address: fd.get('contact_address') || '',
    updatedAt: nowIso()
  };

  const logoFile = fd.get('site_logo');
  if (logoFile && logoFile.size > 0) {
    payload.logo_data_url = await readFileAsDataUrl(logoFile);
    payload.logo_name = logoFile.name || 'identisite.png';
  }

  setSettings(payload);
  try {
    await pushSettingsToCloud(payload);
  } catch (err) {
    text(msg, `Firebase შეცდომა: ${err.message}`);
    return;
  }
  const preview = document.getElementById('logo-preview');
  if (preview && payload.logo_data_url) {
    preview.src = payload.logo_data_url;
    preview.classList.remove('hidden');
  }
  text(msg, 'შენახულია (Firebase + ლოკალურად)');
}

function loadSettings() {
  const data = getSettings();
  const form = document.getElementById('settings-form');
  if (!form) return;

  ['hero_title', 'hero_subtitle', 'contact_email', 'contact_phone', 'contact_address'].forEach((key) => {
    const input = form.elements.namedItem(key);
    if (input) input.value = data[key] || '';
  });

  const preview = document.getElementById('logo-preview');
  if (preview && data.logo_data_url) {
    preview.src = data.logo_data_url;
    preview.classList.remove('hidden');
  }

  const aboutFields = [
    'about_title',
    'about_subtitle',
    'about_history_title',
    'about_history_text',
    'about_philosophy_title',
    'about_point_1',
    'about_point_2',
    'about_point_3',
    'about_point_4'
  ];
  aboutFields.forEach((key) => {
    const aboutInput = document.getElementById(key);
    if (aboutInput) aboutInput.value = data[key] || '';
  });
}

async function saveAbout(form) {
  const msg = document.getElementById('about-msg');
  const fd = new FormData(form);
  const prev = getSettings();
  const payload = {
    ...prev,
    about_title: fd.get('about_title') || '',
    about_subtitle: fd.get('about_subtitle') || '',
    about_history_title: fd.get('about_history_title') || '',
    about_history_text: fd.get('about_history_text') || '',
    about_philosophy_title: fd.get('about_philosophy_title') || '',
    about_point_1: fd.get('about_point_1') || '',
    about_point_2: fd.get('about_point_2') || '',
    about_point_3: fd.get('about_point_3') || '',
    about_point_4: fd.get('about_point_4') || '',
    updatedAt: nowIso()
  };

  setSettings(payload);
  try {
    await pushSettingsToCloud(payload);
  } catch (err) {
    text(msg, `Firebase შეცდომა: ${err.message}`);
    return;
  }
  text(msg, 'შენახულია (Firebase + ლოკალურად)');
}

function listByKind(kind) {
  return getStore(kind).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

function humanTitle(kind) {
  if (kind === 'about') return 'ჩვენ შესახებ';
  if (kind === 'services') return 'სერვისები';
  if (kind === 'trusted') return 'ჩვენ გვენდობიან';
  if (kind === 'portfolio') return 'პორტფოლიო';
  if (kind === 'team') return 'გუნდი';
  if (kind === 'why') return 'რატომ ჩვენ';
  if (kind === 'process') return 'პროცესი';
  if (kind === 'testimonials') return 'შეფასებები';
  if (kind === 'blog') return 'ბლოგი';
  if (kind === 'faq') return 'FAQ';
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
  const main = item.title || item.name || item.question || item.hero_title || item.id;
  const sub = item.description || item.role || item.position || item.category || item.excerpt || item.answer || item.quote || '';
  const meta = item.date || item.read_time ? `${item.date || ''} ${item.read_time || ''}`.trim() : '';
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
  if (state.activeTab === 'settings' || state.activeTab === 'about') {
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
  const { id, file, payload } = collectPayload(form);

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
    await pushItemToCloud(kind, entity);
    items.push(entity);
    form.reset();
    text(msg, 'დამატებულია (Firebase + ლოკალურად)');
  } else {
    const merged = {
      ...existing,
      ...payload,
      id: existing.id
    };
    await pushItemToCloud(kind, merged);
    items[index] = merged;
    text(msg, 'განახლებულია (Firebase + ლოკალურად)');
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

  const aboutForm = document.getElementById('about-form');
  if (aboutForm) {
    aboutForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await saveAbout(aboutForm);
      } catch (err) {
        text(document.getElementById('about-msg'), err.message);
      }
    });
  }

  ['services', 'trusted', 'portfolio', 'team', 'why', 'process', 'testimonials', 'blog', 'faq'].forEach((kind) => {
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
      (async () => {
        try {
          await removeItemFromCloud(kind, id);
        } catch (err) {
          alert(`Firebase წაშლის შეცდომა: ${err.message}`);
          return;
        }
        const items = getStore(kind).filter((x) => x.id !== id);
        setStore(kind, items);
        renderList();
      })();
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

  waitForAuthState().then((user) => {
    if (user) window.location.replace('./dashboard.html');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    text(errorEl, '');

    const fd = new FormData(form);
    const email = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');
    try {
      await signInAdmin(email, password);
      window.location.replace('./dashboard.html');
    } catch (err) {
      text(errorEl, 'ავტორიზაცია ვერ შესრულდა. შეამოწმე Email/Password');
    }
  });
}

function dashboardFlow() {
  bindTabs();
  bindForms();
  bindListActions();
  openTab('settings');

  (async () => {
    const user = await waitForAuthState();
    if (!user) {
      window.location.replace('./login.html');
      return;
    }

    try {
      const cloudSettings = await pullSettingsFromCloud();
      if (cloudSettings && Object.keys(cloudSettings).length) setSettings(cloudSettings);

      const kinds = ['services', 'trusted', 'portfolio', 'team', 'why', 'process', 'testimonials', 'blog', 'faq'];
      for (const kind of kinds) {
        const cloudItems = await pullCollectionFromCloud(kind);
        if (Array.isArray(cloudItems)) setStore(kind, cloudItems);
      }
    } catch (err) {
      const msg = document.getElementById('settings-msg');
      text(msg, `Firebase წაკითხვის შეცდომა: ${err.message}`);
    }

    loadSettings();
    renderList();
  })();

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await signOutAdmin();
      window.location.replace('./login.html');
    });
  }
}

if (isLogin) loginFlow();
if (isDashboard) dashboardFlow();
