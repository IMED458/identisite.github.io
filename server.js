import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

// Base URL for returned links (set in production, e.g. https://yourdomain.ge)
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

fs.mkdirSync(GIFT_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

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

// -------- Helpers --------
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

  backups
    .slice(BACKUP_KEEP_COUNT)
    .forEach((backup) => fs.rmSync(backup.path, { recursive: true, force: true }));
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

  const safeHours = Number.isFinite(BACKUP_INTERVAL_HOURS) && BACKUP_INTERVAL_HOURS > 0
    ? BACKUP_INTERVAL_HOURS
    : 6;
  const intervalMs = safeHours * 60 * 60 * 1000;

  try {
    const result = createBackupSnapshot("startup");
    if (result.ok) {
      console.log(`Backup created on startup: ${result.backupName}`);
    } else {
      console.log(`Startup backup skipped: ${result.message}`);
    }
  } catch (error) {
    console.error("Startup backup failed:", error.message);
  }

  setInterval(() => {
    try {
      const result = createBackupSnapshot("scheduled");
      if (result.ok) {
        console.log(`Scheduled backup created: ${result.backupName}`);
      }
    } catch (error) {
      console.error("Scheduled backup failed:", error.message);
    }
  }, intervalMs);
}

function guessMusicEmbed(url) {
  if (!url) return "";
  const u = url.trim();

  // YouTube
  const ytMatch =
    u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/) ||
    u.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/);

  if (ytMatch?.[1]) {
    const id = ytMatch[1];
    return `
      <section class="mt-10">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">ჩვენი სიმღერა 🎵</h2>
        <div class="aspect-video w-full overflow-hidden rounded-2xl border border-pink-100 shadow">
          <iframe class="w-full h-full" src="https://www.youtube.com/embed/${id}" title="YouTube video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>
      </section>
    `;
  }

  // Spotify (basic: convert open.spotify.com/... to embed)
  const spMatch = u.match(/open\.spotify\.com\/(track|album|playlist)\/([A-Za-z0-9]+)/);
  if (spMatch) {
    const type = spMatch[1];
    const id = spMatch[2];
    return `
      <section class="mt-10">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">ჩვენი სიმღერა 🎵</h2>
        <div class="w-full overflow-hidden rounded-2xl border border-pink-100 shadow">
          <iframe style="border-radius:12px" src="https://open.spotify.com/embed/${type}/${id}" width="100%" height="152" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
        </div>
      </section>
    `;
  }

  // fallback: show link
  return `
    <section class="mt-10">
      <h2 class="text-2xl font-bold text-gray-800 mb-4">ჩვენი სიმღერა 🎵</h2>
      <a class="text-pink-600 underline" href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer">${escapeHtml(u)}</a>
    </section>
  `;
}

function getTemplateTheme(templateKey = "romantic") {
  const templates = {
    romantic: {
      key: "romantic",
      pageBg: "bg-white",
      heroBg: "linear-gradient(135deg, #fdf2f8 0%, #fff7ed 50%, #fce7f3 100%)",
      gradientText: "linear-gradient(135deg, #ec4899 0%, #f97316 50%, #ec4899 100%)",
      badgeClass: "bg-pink-500 text-white",
      cardClass: "bg-white border border-pink-100 rounded-2xl p-8 shadow-sm",
      ctaClass: "bg-gradient-to-r from-pink-500 via-rose-500 to-orange-400",
      footerClass: "bg-gray-50",
      titleClass: "text-gray-800",
      bodyClass: "text-gray-700",
      mutedClass: "text-gray-500",
    },
    elegant: {
      key: "elegant",
      pageBg: "bg-slate-950 text-slate-100",
      heroBg: "linear-gradient(135deg, #111827 0%, #0f172a 50%, #1f2937 100%)",
      gradientText: "linear-gradient(135deg, #f59e0b 0%, #fbbf24 50%, #d97706 100%)",
      badgeClass: "bg-amber-500 text-slate-950",
      cardClass: "bg-slate-900/90 border border-amber-400/20 rounded-2xl p-8 shadow-sm",
      ctaClass: "bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600",
      footerClass: "bg-slate-900 border-t border-slate-800",
      titleClass: "text-slate-100",
      bodyClass: "text-slate-200",
      mutedClass: "text-slate-400",
    },
    minimal: {
      key: "minimal",
      pageBg: "bg-slate-50",
      heroBg: "linear-gradient(135deg, #f8fafc 0%, #ffffff 50%, #eef2ff 100%)",
      gradientText: "linear-gradient(135deg, #334155 0%, #475569 50%, #334155 100%)",
      badgeClass: "bg-slate-700 text-white",
      cardClass: "bg-white border border-slate-200 rounded-2xl p-8 shadow-sm",
      ctaClass: "bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700",
      footerClass: "bg-slate-100",
      titleClass: "text-slate-800",
      bodyClass: "text-slate-700",
      mutedClass: "text-slate-500",
    },
  };
  return templates[templateKey] || templates.romantic;
}

function generateGiftHtml(payload) {
  const {
    recipientName,
    senderName,
    relationshipType,
    message,
    story,
    reasons = [],
    closingMessage,
    dateInviteText,
    musicLink,
    photos = [],
    videoPath = "",
    slug,
    template,
  } = payload;

  const relationshipLabel = {
    girlfriend: "შეყვარებული",
    wife: "მეუღლე",
    mother: "დედა",
    friend: "მეგობარი",
    other: "ძვირფასი ადამიანი",
  }[relationshipType] || "ძვირფასი ადამიანი";

  const reasonsLis = reasons
    .filter(Boolean)
    .slice(0, 10)
    .map((r) => `<li class="flex gap-3"><span class="text-green-500">✓</span><span>${escapeHtml(r)}</span></li>`)
    .join("");

  const photosGrid = photos.length
    ? `
      <section class="mt-10">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">ჩვენი მომენტები 📸</h2>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          ${photos
            .map(
              (p) => `
            <a href="${escapeHtml(p)}" target="_blank" rel="noopener" class="block overflow-hidden rounded-2xl border border-pink-100 shadow-sm hover:shadow transition">
              <img src="${escapeHtml(p)}" alt="photo" class="w-full h-40 object-cover"/>
            </a>`
            )
            .join("")}
        </div>
      </section>
    `
    : "";

  const videoSection = videoPath
    ? `
      <section class="mt-10">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">ვიდეო 🎬</h2>
        <div class="overflow-hidden rounded-2xl border border-pink-100 shadow">
          <video class="w-full" controls src="${escapeHtml(videoPath)}"></video>
        </div>
      </section>
    `
    : "";

  const musicEmbed = guessMusicEmbed(musicLink);

  const safeRecipient = escapeHtml(recipientName || "");
  const safeSender = escapeHtml(senderName || "");
  const safeMessage = escapeHtml(message || "");
  const safeStory = escapeHtml(story || "");
  const safeClosing = escapeHtml(closingMessage || "გილოცავ 8 მარტს ❤️");
  const safeDateInviteText = escapeHtml(dateInviteText || "");
  const theme = getTemplateTheme(template);

  return `<!doctype html>
<html lang="ka" class="h-full">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${safeRecipient ? `${safeRecipient} — 8 მარტის საჩუქარი` : "8 მარტის საჩუქარი"}</title>
  <script src="https://cdn.tailwindcss.com/3.4.17"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Georgian:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { font-family: 'Noto Sans Georgian', sans-serif; }
    .gradient-text {
      background: ${theme.gradientText};
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .hero-gradient {
      background: ${theme.heroBg};
    }
  </style>
</head>
<body class="min-h-full ${theme.pageBg}">
  <header class="hero-gradient py-16 px-6">
    <div class="max-w-4xl mx-auto text-center">
      <div class="inline-block ${theme.badgeClass} text-sm font-medium px-4 py-1 rounded-full mb-6">💐 8 მარტი</div>
      <h1 class="text-4xl md:text-5xl font-bold leading-tight mb-4">
        <span class="gradient-text">${safeRecipient || "ძვირფასო"}</span><br/>
        <span class="${theme.titleClass}">გილოცავ ქალთა დღეს ❤️</span>
      </h1>
      <p class="text-lg ${theme.bodyClass} max-w-2xl mx-auto">
        ${safeSender ? `${safeSender}-სგან —` : ""} შენ ხარ ჩემი ${escapeHtml(relationshipLabel)} და მინდა ეს პატარა საიტი მხოლოდ შენთვის იყოს.
      </p>
      ${slug ? `<p class="text-sm ${theme.mutedClass} mt-4">საიტის სახელი: <span class="font-medium">${escapeHtml(slug)}</span></p>` : ""}
      <p class="text-xs ${theme.mutedClass} mt-2">შაბლონი: ${escapeHtml(theme.key)}</p>
    </div>
  </header>

  <main class="max-w-4xl mx-auto px-6 py-12">
    <section class="${theme.cardClass}">
      <h2 class="text-2xl font-bold ${theme.titleClass} mb-4">სიყვარულის წერილი 💌</h2>
      <p class="${theme.bodyClass} leading-relaxed whitespace-pre-line">${safeMessage}</p>
    </section>

    ${safeStory ? `
    <section class="mt-10">
      <h2 class="text-2xl font-bold ${theme.titleClass} mb-4">ჩვენი ისტორია 📖</h2>
      <div class="${theme.cardClass}">
        <p class="${theme.bodyClass} leading-relaxed whitespace-pre-line">${safeStory}</p>
      </div>
    </section>` : ""}

    ${reasonsLis ? `
    <section class="mt-10">
      <h2 class="text-2xl font-bold ${theme.titleClass} mb-4">რატომ მიყვარხარ ✨</h2>
      <div class="${theme.cardClass}">
        <ul class="space-y-3 ${theme.bodyClass}">${reasonsLis}</ul>
      </div>
    </section>` : ""}

    ${safeDateInviteText ? `
    <section class="mt-10">
      <h2 class="text-2xl font-bold ${theme.titleClass} mb-4">პაემნის მოწვევა 💌</h2>
      <div class="${theme.cardClass}">
        <p class="${theme.bodyClass} leading-relaxed whitespace-pre-line">${safeDateInviteText}</p>
      </div>
    </section>` : ""}

    ${photosGrid}
    ${videoSection}
    ${musicEmbed}

    <section class="mt-12 text-center ${theme.ctaClass} rounded-3xl p-10 text-white shadow">
      <div class="text-5xl mb-4">💝</div>
      <h2 class="text-2xl md:text-3xl font-bold mb-3">და ბოლოს…</h2>
      <p class="text-lg opacity-95 whitespace-pre-line">${safeClosing}</p>
    </section>
  </main>

  <footer class="${theme.footerClass} py-8 px-6 text-center">
    <p class="${theme.mutedClass} text-sm">© ${new Date().getFullYear()} | ეს გვერდი შეიქმნა სიყვარულით ❤️</p>
  </footer>
</body>
</html>`;
}

// -------- Multer config --------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // we temporarily store in /tmp-like folder; then move after validating slug
    const tempDir = path.join(__dirname, ".uploads_tmp");
    fs.mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, safeFileName(file.originalname));
  },
});

function fileFilter(req, file, cb) {
  const ok =
    file.mimetype.startsWith("image/") ||
    file.mimetype.startsWith("video/");
  if (!ok) return cb(new Error("Only image/video files are allowed."));
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 30 * 1024 * 1024, // 30MB per file
    files: 20,
  },
});

// -------- Routes --------
app.use(express.static(PUBLIC_DIR));

app.get("/api/backups", (req, res) => {
  const backups = listBackups().map((item) => ({
    name: item.name,
    createdAt: item.createdAt,
    mtime: item.mtime,
  }));
  return res.json({
    enabled: BACKUP_ENABLED,
    intervalHours: BACKUP_INTERVAL_HOURS,
    keepCount: BACKUP_KEEP_COUNT,
    count: backups.length,
    backups,
  });
});

app.post("/api/backups/run", (req, res) => {
  if (BACKUP_ADMIN_TOKEN && req.header("x-backup-token") !== BACKUP_ADMIN_TOKEN) {
    return res.status(401).json({ error: "Unauthorized backup token." });
  }

  try {
    const result = createBackupSnapshot("manual");
    if (!result.ok) {
      return res.status(400).json({ error: result.message });
    }
    return res.json({
      ok: true,
      backupName: result.backupName,
    });
  } catch (error) {
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
        template,
        slug,
        recipientName,
        senderName,
        relationshipType,
        message,
        story,
        closingMessage,
        dateInviteText,
        musicLink,
      } = req.body;

      const reasonsRaw = req.body.reasons || [];
      const reasons = Array.isArray(reasonsRaw) ? reasonsRaw : [reasonsRaw];

      if (!slug || !isValidSlug(slug)) {
        return res.status(400).json({ error: "საიტის სახელი არასწორია (მხოლოდ a-z, 0-9 და -)." });
      }

      const siteDir = path.join(GIFT_DIR, slug);
      if (fs.existsSync(siteDir)) {
        return res.status(409).json({ error: "ეს საიტის სახელი უკვე დაკავებულია. სცადე სხვა." });
      }

      // create dirs
      const photosDir = path.join(siteDir, "assets", "photos");
      const videoDir = path.join(siteDir, "assets", "video");
      fs.mkdirSync(photosDir, { recursive: true });
      fs.mkdirSync(videoDir, { recursive: true });

      // move files from temp
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

      const html = generateGiftHtml({
        template,
        slug,
        recipientName,
        senderName,
        relationshipType,
        message,
        story,
        reasons,
        closingMessage,
        dateInviteText,
        musicLink,
        photos: uploadedPhotos,
        videoPath: uploadedVideoPath,
      });

      fs.writeFileSync(path.join(siteDir, "index.html"), html, "utf-8");

      // cleanup temp dir leftovers if any (best-effort)
      // (Not strictly necessary; multer temp dir may accumulate if errors happen)
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
