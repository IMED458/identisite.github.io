import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

const BASE_URL = process.env.BASE_URL || "";
const BACKUP_ENABLED = process.env.BACKUP_ENABLED !== "false";
const BACKUP_INTERVAL_HOURS = Number(process.env.BACKUP_INTERVAL_HOURS || 6);
const BACKUP_KEEP_COUNT = Number(process.env.BACKUP_KEEP_COUNT || 10);
const BACKUP_ADMIN_TOKEN = process.env.BACKUP_ADMIN_TOKEN || "";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const __dirname = path.resolve();
const candidatePublic = path.join(__dirname, "public");
const PUBLIC_DIR = fs.existsSync(candidatePublic) ? candidatePublic : __dirname;
const GIFT_DIR = path.join(PUBLIC_DIR, "gift");
const BACKUP_DIR = path.join(__dirname, "backups");
const TEMPLATE_DIR = path.join(__dirname, "templates");
const DB_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DB_DIR, "gifts-index.json");

fs.mkdirSync(GIFT_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(DB_DIR, { recursive: true });

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, "[]", "utf-8");
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (!ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
  })
);

function isValidSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeFileName(originalName) {
  const ext = path.extname(originalName).toLowerCase().slice(0, 10);
  const base = path
    .basename(originalName, path.extname(originalName))
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
  const rand = crypto.randomBytes(4).toString("hex");
  return `${base || "file"}-${rand}${ext || ""}`;
}

function backupStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("gift-backup-"))
    .map((entry) => {
      const fullPath = path.join(BACKUP_DIR, entry.name);
      const stat = fs.statSync(fullPath);
      return {
        name: entry.name,
        path: fullPath,
        createdAt: stat.birthtime.toISOString(),
        mtime: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => (a.name < b.name ? 1 : -1));
}

function cleanupOldBackups() {
  const backups = listBackups();
  if (backups.length <= BACKUP_KEEP_COUNT) return;
  backups.slice(BACKUP_KEEP_COUNT).forEach((backup) => {
    fs.rmSync(backup.path, { recursive: true, force: true });
  });
}

function createBackupSnapshot(reason = "scheduled") {
  if (!fs.existsSync(GIFT_DIR)) {
    return { ok: false, message: "Gift directory not found." };
  }

  const backupName = `gift-backup-${backupStamp()}`;
  const backupPath = path.join(BACKUP_DIR, backupName);
  fs.cpSync(GIFT_DIR, backupPath, { recursive: true, force: true });

  const metadata = {
    reason,
    createdAt: new Date().toISOString(),
    source: GIFT_DIR,
    backupName,
  };
  fs.writeFileSync(path.join(backupPath, "_meta.json"), JSON.stringify(metadata, null, 2), "utf-8");

  cleanupOldBackups();
  return { ok: true, backupName, backupPath };
}

function startBackupScheduler() {
  if (!BACKUP_ENABLED) {
    console.log("Backup scheduler is disabled.");
    return;
  }

  const safeHours = Number.isFinite(BACKUP_INTERVAL_HOURS) && BACKUP_INTERVAL_HOURS > 0 ? BACKUP_INTERVAL_HOURS : 6;
  const intervalMs = safeHours * 60 * 60 * 1000;

  try {
    const result = createBackupSnapshot("startup");
    if (result.ok) console.log(`Backup created on startup: ${result.backupName}`);
  } catch (error) {
    console.error("Startup backup failed:", error.message);
  }

  setInterval(() => {
    try {
      const result = createBackupSnapshot("scheduled");
      if (result.ok) console.log(`Scheduled backup created: ${result.backupName}`);
    } catch (error) {
      console.error("Scheduled backup failed:", error.message);
    }
  }, intervalMs);
}

function guessMusicEmbed(url) {
  if (!url) return "<p class=\"text-gray-500\">მუსიკის ბმული არ არის დამატებული</p>";
  const u = url.trim();

  const ytMatch =
    u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/) ||
    u.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/);

  if (ytMatch?.[1]) {
    const id = ytMatch[1];
    return `<div class=\"aspect-video w-full overflow-hidden rounded-xl\"><iframe class=\"w-full h-full\" src=\"https://www.youtube.com/embed/${id}\" frameborder=\"0\" allowfullscreen></iframe></div>`;
  }

  const spMatch = u.match(/open\.spotify\.com\/(track|album|playlist)\/([A-Za-z0-9]+)/);
  if (spMatch) {
    const type = spMatch[1];
    const id = spMatch[2];
    return `<iframe style=\"border-radius:12px\" src=\"https://open.spotify.com/embed/${type}/${id}\" width=\"100%\" height=\"152\" frameborder=\"0\" loading=\"lazy\"></iframe>`;
  }

  return `<a class=\"underline text-pink-600\" href=\"${escapeHtml(u)}\" target=\"_blank\" rel=\"noopener\">${escapeHtml(u)}</a>`;
}

function renderUploadedPhotos(photoUrls = []) {
  if (!photoUrls.length) {
    return "<p class=\"text-gray-500 col-span-full\">ფოტოები არ არის ატვირთული</p>";
  }

  return photoUrls
    .map(
      (url) =>
        `<div class=\"overflow-hidden rounded-2xl bg-white/70\"><img src=\"${escapeHtml(url)}\" alt=\"photo\" class=\"w-full h-56 object-cover\" loading=\"lazy\"></div>`
    )
    .join("");
}

function renderUploadedVideo(videoUrl = "") {
  if (!videoUrl) {
    return "<p class=\"text-gray-500 py-8\">ვიდეო არ არის ატვირთული</p>";
  }
  return `<video class=\"w-full rounded-xl\" controls src=\"${escapeHtml(videoUrl)}\"></video>`;
}

function loadTemplate(templateType) {
  const normalized = templateType === "wife" ? "wife" : "girlfriend";
  const filePath = path.join(TEMPLATE_DIR, `${normalized}.html`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Template not found: ${normalized}`);
  }
  return fs.readFileSync(filePath, "utf-8");
}

function replaceVars(template, vars) {
  let output = template;
  Object.entries(vars).forEach(([key, value]) => {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    output = output.replace(pattern, value ?? "");
  });
  return output;
}

function appendGiftToIndex(entry) {
  try {
    const current = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    current.unshift(entry);
    fs.writeFileSync(DB_FILE, JSON.stringify(current.slice(0, 2000), null, 2), "utf-8");
  } catch {
    fs.writeFileSync(DB_FILE, JSON.stringify([entry], null, 2), "utf-8");
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(__dirname, ".uploads_tmp");
    fs.mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => cb(null, safeFileName(file.originalname)),
});

function fileFilter(req, file, cb) {
  if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image/video files are allowed."));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 30 * 1024 * 1024,
    files: 20,
  },
});

app.use(express.static(PUBLIC_DIR));

app.get("/api/backups", (req, res) => {
  const backups = listBackups().map((item) => ({ name: item.name, createdAt: item.createdAt, mtime: item.mtime }));
  res.json({ enabled: BACKUP_ENABLED, intervalHours: BACKUP_INTERVAL_HOURS, keepCount: BACKUP_KEEP_COUNT, count: backups.length, backups });
});

app.post("/api/backups/run", (req, res) => {
  if (BACKUP_ADMIN_TOKEN && req.header("x-backup-token") !== BACKUP_ADMIN_TOKEN) {
    return res.status(401).json({ error: "Unauthorized backup token." });
  }
  try {
    const result = createBackupSnapshot("manual");
    if (!result.ok) return res.status(400).json({ error: result.message });
    return res.json({ ok: true, backupName: result.backupName });
  } catch {
    return res.status(500).json({ error: "Manual backup failed." });
  }
});

app.post(
  "/api/generate",
  upload.fields([
    { name: "photos", maxCount: 15 },
    { name: "video", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        templateType,
        slug,
        recipientName,
        senderName,
        heroTitle,
        heroSubtitle,
        loveMessage,
        ourStory,
        memoryStory,
        reason1,
        reason2,
        reason3,
        reason4,
        reason5,
        finalMessage,
        musicLink,
        dateInviteText,
      } = req.body;

      if (!slug || !isValidSlug(slug)) {
        return res.status(400).json({ error: "საიტის სახელი არასწორია (მხოლოდ a-z, 0-9 და -)." });
      }

      const siteDir = path.join(GIFT_DIR, slug);
      if (fs.existsSync(siteDir)) {
        return res.status(409).json({ error: "ეს საიტის სახელი უკვე დაკავებულია. სცადე სხვა." });
      }

      const photosDir = path.join(siteDir, "assets", "photos");
      const videoDir = path.join(siteDir, "assets", "video");
      fs.mkdirSync(photosDir, { recursive: true });
      fs.mkdirSync(videoDir, { recursive: true });

      const uploadedPhotos = (req.files?.photos || []).map((f) => {
        const target = path.join(photosDir, f.filename);
        fs.renameSync(f.path, target);
        return `/gift/${slug}/assets/photos/${f.filename}`;
      });

      let uploadedVideoPath = "";
      const videoFile = (req.files?.video || [])[0];
      if (videoFile) {
        const target = path.join(videoDir, videoFile.filename);
        fs.renameSync(videoFile.path, target);
        uploadedVideoPath = `/gift/${slug}/assets/video/${videoFile.filename}`;
      }

      const templateRaw = loadTemplate(templateType);
      const musicEmbed = guessMusicEmbed(musicLink || "");
      const uploadedPhotosHtml = renderUploadedPhotos(uploadedPhotos);
      const uploadedVideoHtml = renderUploadedVideo(uploadedVideoPath);
      const inviteSection = dateInviteText
        ? `<div class=\"max-w-3xl mx-auto bg-white rounded-2xl p-6 shadow border border-pink-100\"><h3 class=\"text-2xl mb-3 text-rose-700\">პაემანზე მოწვევა</h3><p class=\"text-lg text-rose-700\">${escapeHtml(dateInviteText)}</p></div>`
        : "";

      const rendered = replaceVars(templateRaw, {
        recipient_name: escapeHtml(recipientName || ""),
        sender_name: escapeHtml(senderName || ""),
        hero_title: escapeHtml(heroTitle || ""),
        hero_subtitle: escapeHtml(heroSubtitle || ""),
        love_message: escapeHtml(loveMessage || ""),
        message: escapeHtml(loveMessage || ""),
        our_story: escapeHtml(ourStory || ""),
        memory_story: escapeHtml(memoryStory || ""),
        reason_1: escapeHtml(reason1 || ""),
        reason_2: escapeHtml(reason2 || ""),
        reason_3: escapeHtml(reason3 || ""),
        reason_4: escapeHtml(reason4 || ""),
        reason_5: escapeHtml(reason5 || ""),
        final_message: escapeHtml(finalMessage || ""),
        uploaded_photos: uploadedPhotosHtml,
        uploaded_video: uploadedVideoHtml,
        music_embed: musicEmbed,
        date_invite_section: inviteSection,
        video_placeholder: uploadedVideoPath ? "" : "ვიდეო არ არის ატვირთული",
        music_placeholder: musicLink ? escapeHtml(musicLink) : "მუსიკის ბმული არ არის დამატებული",
        photo_1: uploadedPhotos[0] ? "ფოტო #1" : "ფოტო #1",
        photo_2: uploadedPhotos[1] ? "ფოტო #2" : "ფოტო #2",
        photo_3: uploadedPhotos[2] ? "ფოტო #3" : "ფოტო #3",
        photo_4: uploadedPhotos[3] ? "ფოტო #4" : "ფოტო #4",
        photo_5: uploadedPhotos[4] ? "ფოტო #5" : "ფოტო #5",
      });

      fs.writeFileSync(path.join(siteDir, "index.html"), rendered, "utf-8");

      const meta = {
        id: slug,
        templateType: templateType === "wife" ? "wife" : "girlfriend",
        slug,
        recipientName,
        senderName,
        createdAt: new Date().toISOString(),
        photosCount: uploadedPhotos.length,
        hasVideo: Boolean(uploadedVideoPath),
      };
      fs.writeFileSync(path.join(siteDir, "data.json"), JSON.stringify(meta, null, 2), "utf-8");
      appendGiftToIndex(meta);

      const proto = req.protocol;
      const host = req.get("host");
      const resolvedBase = BASE_URL || `${proto}://${host}`;
      const url = `${resolvedBase}/gift/${slug}/`;

      return res.json({ url });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "შეცდომა გენერაციისას. სცადე თავიდან." });
    }
  }
);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  startBackupScheduler();
});
