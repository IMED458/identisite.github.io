import {
  ready,
  auth,
  db,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from "./firebase-client.js";
import { adminAccount, collections } from "./firebase-config.js";
import { uploadConfig } from "./upload-config.js";

const path = window.location.pathname;
const isLogin = path.endsWith("/admin/login.html") || path.endsWith("admin/login.html");
const isDashboard = path.endsWith("/admin/dashboard.html") || path.endsWith("admin/dashboard.html");

const state = {
  activeTab: "settings",
  currentItems: []
};

function text(el, value) {
  if (el) el.textContent = value;
}

function failIfMissingFirebase() {
  if (!ready || !auth || !db) {
    throw new Error("Firebase config is incomplete. Fill assets/js/firebase-config.js");
  }
}

function isCloudinaryReady() {
  return (
    uploadConfig.provider === "cloudinary" &&
    Boolean(uploadConfig.cloudName) &&
    Boolean(uploadConfig.unsignedPreset)
  );
}

async function uploadToCloudinary(kind, file) {
  const endpoint = `https://api.cloudinary.com/v1_1/${uploadConfig.cloudName}/image/upload`;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadConfig.unsignedPreset);
  formData.append("folder", `${uploadConfig.folder}/${kind}`);

  const response = await fetch(endpoint, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error("ფოტოს ატვირთვა ვერ შესრულდა (Cloudinary)");
  }

  const data = await response.json();
  return {
    image: data.secure_url || "",
    imagePath: data.public_id || ""
  };
}

async function uploadImage(kind, file) {
  if (!file || !(file instanceof File) || file.size === 0) return null;
  if (!isCloudinaryReady()) {
    throw new Error("upload-config.js-ში Cloudinary პარამეტრები არ არის შევსებული");
  }
  return uploadToCloudinary(kind, file);
}

// Cloudinary unsigned setup cannot securely delete assets from client-side without secrets.
async function deleteImageFromProvider() {
  return;
}

function collectPayload(form, kind) {
  const fd = new FormData(form);
  const payload = {};
  for (const [key, value] of fd.entries()) {
    if (key === "id" || key === "imageFile") continue;
    if (value !== "") payload[key] = value;
  }

  if (kind === "performances" || kind === "actors" || kind === "news" || kind === "gallery") {
    payload.updatedAt = serverTimestamp();
  }

  return {
    id: fd.get("id"),
    file: fd.get("imageFile"),
    payload
  };
}

function formFromItem(form, item) {
  const entries = new FormData(form);
  for (const key of entries.keys()) {
    if (key === "imageFile") continue;
    const input = form.elements.namedItem(key);
    if (!input) continue;
    input.value = item[key] || "";
  }
}

async function saveSettings(form) {
  const msg = document.getElementById("settings-msg");
  const fd = new FormData(form);
  const payload = {
    hero_title: fd.get("hero_title") || "",
    hero_title_en: fd.get("hero_title_en") || "",
    hero_slogan: fd.get("hero_slogan") || "",
    hero_slogan_en: fd.get("hero_slogan_en") || "",
    about_title: fd.get("about_title") || "",
    about_title_en: fd.get("about_title_en") || "",
    about_text_1: fd.get("about_text_1") || "",
    about_text_1_en: fd.get("about_text_1_en") || "",
    about_text_2: fd.get("about_text_2") || "",
    about_text_2_en: fd.get("about_text_2_en") || "",
    about_mission_title: fd.get("about_mission_title") || "",
    about_mission_title_en: fd.get("about_mission_title_en") || "",
    about_mission_text: fd.get("about_mission_text") || "",
    about_mission_text_en: fd.get("about_mission_text_en") || "",
    contact_address: fd.get("contact_address") || "",
    contact_address_en: fd.get("contact_address_en") || "",
    contact_phone: fd.get("contact_phone") || "",
    contact_email: fd.get("contact_email") || "",
    global_ticket_url: fd.get("global_ticket_url") || "",
    global_ticket_url_en: fd.get("global_ticket_url_en") || "",
    updatedAt: serverTimestamp()
  };

  await setDoc(doc(db, collections.settings, "site"), payload, { merge: true });
  text(msg, "შენახულია");
}

async function loadSettings() {
  const snap = await getDoc(doc(db, collections.settings, "site"));
  if (!snap.exists()) return;
  const data = snap.data();
  const form = document.getElementById("settings-form");
  if (!form) return;

  [
    "hero_title",
    "hero_title_en",
    "hero_slogan",
    "hero_slogan_en",
    "about_title",
    "about_title_en",
    "about_text_1",
    "about_text_1_en",
    "about_text_2",
    "about_text_2_en",
    "about_mission_title",
    "about_mission_title_en",
    "about_mission_text",
    "about_mission_text_en",
    "contact_address",
    "contact_address_en",
    "contact_phone",
    "contact_email",
    "global_ticket_url",
    "global_ticket_url_en"
  ].forEach((key) => {
    const input = form.elements.namedItem(key);
    if (input) input.value = data[key] || "";
  });
}

async function listByKind(kind) {
  const listRef = collection(db, collections[kind] || kind);
  try {
    const snap = await getDocs(query(listRef, orderBy("updatedAt", "desc")));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    const snap = await getDocs(listRef);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
}

function humanTitle(kind) {
  if (kind === "performances") return "რეპერტუარი";
  if (kind === "actors") return "დასი";
  if (kind === "gallery") return "გალერია";
  if (kind === "news") return "სიახლეები";
  return "ჩანაწერები";
}

function tabToForm(kind) {
  if (kind === "settings") return null;
  return document.getElementById(`${kind}-form`);
}

function openTab(kind) {
  state.activeTab = kind;
  document.querySelectorAll(".tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === kind);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.add("hidden"));
  const target = document.getElementById(`tab-${kind}`);
  if (target) target.classList.remove("hidden");
  const title = document.getElementById("list-title");
  text(title, kind === "settings" ? "პარამეტრები" : humanTitle(kind));
}

function listMarkup(item) {
  const main = item.title || item.name || item.hero_title || item.id;
  const sub = item.director || item.author || item.role || item.type || item.excerpt || item.contact_phone || "";
  const meta = item.date || item.startTime ? `${item.date || ""} ${item.startTime || ""}`.trim() : "";
  return `<article class="list-item">
    <div class="row">
      <strong>${main}</strong>
      <div class="row">
        <button class="ghost" type="button" data-action="edit" data-id="${item.id}">რედაქტირება</button>
        <button class="danger" type="button" data-action="delete" data-id="${item.id}">წაშლა</button>
      </div>
    </div>
    <p class="small">${sub}</p>
    ${meta ? `<p class="small">${meta}</p>` : ""}
    ${item.image ? `<img class="preview" src="${item.image}" alt="">` : ""}
  </article>`;
}

async function renderList() {
  const holder = document.getElementById("admin-list");
  if (!holder) return;
  if (state.activeTab === "settings") {
    holder.innerHTML = '<div class="small">პარამეტრების რედაქტირება ხდება მარცხენა ფორმიდან.</div>';
    state.currentItems = [];
    return;
  }

  const kind = state.activeTab;
  const items = await listByKind(kind);
  state.currentItems = items;

  if (!items.length) {
    holder.innerHTML = '<div class="small">მონაცემები ცარიელია.</div>';
    return;
  }

  holder.innerHTML = items.map((item) => listMarkup(item)).join("");
}

async function upsertEntity(form, kind) {
  const msg = form.querySelector("[data-msg]");
  const { id, file, payload } = collectPayload(form, kind);

  let current = null;
  if (id) {
    const snap = await getDoc(doc(db, collections[kind], id));
    current = snap.exists() ? snap.data() : null;
  }

  if (file && file.size > 0) {
    const uploaded = await uploadImage(kind, file);
    if (uploaded) {
      Object.assign(payload, uploaded);
      if (current?.imagePath) {
        await deleteImageFromProvider(current.imagePath);
      }
    }
  }

  if (!id) {
    payload.createdAt = serverTimestamp();
    await addDoc(collection(db, collections[kind]), payload);
    form.reset();
    text(msg, "დამატებულია");
  } else {
    await updateDoc(doc(db, collections[kind], id), payload);
    text(msg, "განახლებულია");
  }

  await renderList();
}

function bindForms() {
  const settingsForm = document.getElementById("settings-form");
  if (settingsForm) {
    settingsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await saveSettings(settingsForm);
      } catch (err) {
        text(document.getElementById("settings-msg"), err.message);
      }
    });
  }

  ["performances", "actors", "gallery", "news"].forEach((kind) => {
    const form = document.getElementById(`${kind}-form`);
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await upsertEntity(form, kind);
      } catch (err) {
        const msg = form.querySelector("[data-msg]");
        text(msg, err.message);
      }
    });
  });
}

function bindListActions() {
  const holder = document.getElementById("admin-list");
  if (!holder) return;

  holder.addEventListener("click", async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const id = target.dataset.id;
    const action = target.dataset.action;
    if (!id || !action) return;

    const kind = state.activeTab;
    const item = state.currentItems.find((x) => x.id === id);
    if (!item) return;

    if (action === "edit") {
      const form = tabToForm(kind);
      if (!form) return;
      form.elements.namedItem("id").value = item.id;
      formFromItem(form, item);
      return;
    }

    if (action === "delete") {
      if (!confirm("წაშლა ნამდვილად გსურთ?")) return;
      await deleteDoc(doc(db, collections[kind], id));
      if (item.imagePath) {
        await deleteImageFromProvider(item.imagePath);
      }
      await renderList();
    }
  });
}

function bindTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", async () => {
      openTab(tab.dataset.tab);
      await renderList();
    });
  });
}

async function loginFlow() {
  const form = document.getElementById("login-form");
  const errorEl = document.getElementById("login-error");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    text(errorEl, "");

    try {
      failIfMissingFirebase();
      const fd = new FormData(form);
      const username = String(fd.get("username") || "").trim();
      const password = String(fd.get("password") || "");

      if (username !== adminAccount.username) {
        throw new Error("არასწორი username");
      }
      if (!adminAccount.email) {
        throw new Error("firebase-config.js-ში admin email არ არის შევსებული");
      }

      await signInWithEmailAndPassword(auth, adminAccount.email, password);
      window.location.replace("./dashboard.html");
    } catch (err) {
      text(errorEl, err.message || "ავტორიზაცია ვერ შესრულდა");
    }
  });
}

async function dashboardFlow() {
  failIfMissingFirebase();

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.replace("./login.html");
      return;
    }

    if (adminAccount.uid && user.uid !== adminAccount.uid) {
      await signOut(auth);
      window.location.replace("./login.html");
      return;
    }

    await loadSettings();
    bindTabs();
    bindForms();
    bindListActions();
    openTab("settings");
    await renderList();
  });

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await signOut(auth);
      window.location.replace("./login.html");
    });
  }
}

if (isLogin) {
  loginFlow().catch((err) => {
    text(document.getElementById("login-error"), err.message);
  });
}

if (isDashboard) {
  dashboardFlow().catch(() => {
    window.location.replace("./login.html");
  });
}
