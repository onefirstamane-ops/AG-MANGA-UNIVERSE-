
"use strict";

/* =========================================================
   AG MANGA UNIVERSE (AG AMU)
   Frontend application controller
   Backend: Render + Flask API
   ========================================================= */

/* 1. CONFIGURATION
   Replace this URL with your actual Render backend URL.
*/
const CONFIG = Object.freeze({
  APP_NAME: "AG MANGA UNIVERSE",
  SHORT_NAME: "AG AMU",
  API_BASE: "https://YOUR-RENDER-SERVICE.onrender.com/api",
  REQUEST_TIMEOUT: 20000,
  PAGE_SIZE: 12,
  MAX_TITLE_LENGTH: 120,
  MAX_DESCRIPTION_LENGTH: 5000,
  MAX_COVER_URL_LENGTH: 2048,
  ADMIN_EMAIL: "onefirstamane@gmail.com"
});

/* 2. APPLICATION STATE */

const state = {
  user: null,
  stories: [],
  myStories: [],
  bookmarks: [],
  currentStory: null,
  currentPage: "home",
  libraryPage: 1,
  librarySearch: "",
  libraryCategory: "all",
  librarySort: "latest",
  loading: false,
  submitting: false,
  adminStories: [],
  initialized: false
};

/* 3. DOM HELPERS */

const $ = (selector, root = document) =>
  root.querySelector(selector);

const $$ = (selector, root = document) =>
  Array.from(root.querySelectorAll(selector));

function byId(id) {
  return document.getElementById(id);
}

function setText(element, value) {
  if (element) {
    element.textContent = value == null ? "" : String(value);
  }
}

function showElement(element) {
  if (element) element.hidden = false;
}

function hideElement(element) {
  if (element) element.hidden = true;
}

function showSection(name) {
  const sections = $$("[data-page], .page-section");

  sections.forEach((section) => {
    const pageName =
      section.dataset.page ||
      section.dataset.section ||
      section.id.replace(/^page-/, "");

    const active = pageName === name;

    section.hidden = !active;
    section.classList.toggle("active", active);
    section.setAttribute("aria-hidden", String(!active));
  });

  state.currentPage = name;

  $$("[data-nav]").forEach((link) => {
    const active = link.dataset.nav === name;
    link.classList.toggle("active", active);

    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  window.scrollTo({
    top: 0,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth"
  });

  closeMobileMenu();
}

/* 4. SAFE HTML UTILITIES */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[char];
  });
}

function safeURL(value) {
  try {
    const url = new URL(String(value), window.location.origin);

    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

function getInitials(name) {
  return String(name || "Reader")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function formatDate(value) {
  if (!value) return "Recently";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return "0";

  return new Intl.NumberFormat("en", {
    notation: number >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1
  }).format(number);
}

function normalizeStory(story = {}) {
  return {
    id: String(story.id ?? story.slug ?? ""),
    title: String(story.title ?? "Untitled Manga"),
    description: String(story.description ?? ""),
    author: String(story.author_name ?? story.author ?? "Unknown Author"),
    category: String(story.category ?? "Other"),
    cover: safeURL(story.cover_url ?? story.cover ?? ""),
    status: String(story.status ?? "approved"),
    createdAt: story.created_at ?? story.createdAt ?? null,
    chapters: Array.isArray(story.chapters) ? story.chapters : [],
    views: Number(story.views ?? 0),
    rating: Number(story.rating ?? 0)
  };
}

/* 5. API CLIENT */

class APIError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = "APIError";
    this.status = status;
    this.data = data;
  }
}

function getAPIBase() {
  const base = CONFIG.API_BASE.trim();

  if (
    !base ||
    base.includes("YOUR-RENDER-SERVICE") ||
    !/^https:\/\/[^/]+/i.test(base)
  ) {
    throw new APIError(
      "Backend URL সেট করা হয়নি। script.js-এর CONFIG.API_BASE-এ তোমার Render URL বসাও।"
    );
  }

  return base.replace(/\/+$/, "");
}

async function apiRequest(path, options = {}) {
  const base = getAPIBase();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    CONFIG.REQUEST_TIMEOUT
  );

  const headers = new Headers(options.headers || {});
  const requestOptions = {
    method: options.method || "GET",
    credentials: "include",
    headers,
    signal: controller.signal
  };

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    requestOptions.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(
      `${base}${path.startsWith("/") ? path : `/${path}`}`,
      requestOptions
    );

    const contentType = response.headers.get("content-type") || "";
    let data = null;

    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = text ? { message: text.slice(0, 500) } : {};
    }

    if (!response.ok) {
      throw new APIError(
        data.message || data.error || `Request failed (${response.status})`,
        response.status,
        data
      );
    }

    return data;
  } catch (error) {
    if (error instanceof APIError) throw error;

    if (error.name === "AbortError") {
      throw new APIError("Request timeout হয়েছে। আবার চেষ্টা করো।");
    }

    throw new APIError(
      "সার্ভারের সঙ্গে যোগাযোগ করা যাচ্ছে না। Backend URL, deployment ও network পরীক্ষা করো।"
    );
  } finally {
    clearTimeout(timeout);
  }
}

/* 6. TOAST NOTIFICATIONS */

let toastTimer = null;

function toast(message, type = "info", duration = 3500) {
  let container = byId("toast-container");

  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }

  const item = document.createElement("div");
  item.className = `toast toast-${type}`;
  item.textContent = String(message);
  item.setAttribute("role", type === "error" ? "alert" : "status");

  container.appendChild(item);

  requestAnimationFrame(() => {
    item.classList.add("show");
  });

  window.setTimeout(() => {
    item.classList.remove("show");
    window.setTimeout(() => item.remove(), 250);
  }, duration);

  clearTimeout(toastTimer);
}

function showError(error, fallback = "কিছু একটা সমস্যা হয়েছে।") {
  const message =
    error instanceof Error ? error.message : fallback;

  toast(message || fallback, "error", 5000);
}

/* 7. LOADING AND ERROR STATES */

function setButtonLoading(button, loading, loadingText = "Please wait...") {
  if (!button) return;

  if (loading) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent.trim();
    }

    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = loadingText;
  } else {
    button.disabled = false;
    button.removeAttribute("aria-busy");

    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }
}

function showLoading(target, message = "Loading...") {
  if (!target) return;

  target.innerHTML = `
    <div class="loading-state" role="status" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true"></span>
      <p>${escapeHTML(message)}</p>
    </div>
  `;
}

function showEmptyState(target, title, description = "") {
  if (!target) return;

  target.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon" aria-hidden="true">◈</div>
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(description)}</p>
    </div>
  `;
}

function showRetryState(target, message, retryCallback) {
  if (!target) return;

  target.replaceChildren();

  const wrapper = document.createElement("div");
  wrapper.className = "error-state";

  const text = document.createElement("p");
  text.textContent = message;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-primary";
  button.textContent = "Try Again";
  button.addEventListener("click", retryCallback);

  wrapper.append(text, button);
  target.appendChild(wrapper);
}

/* 8. MOBILE MENU */

function closeMobileMenu() {
  const menu = $(".main-nav, .navbar-menu, [data-mobile-menu]");
  const toggle = $("[data-menu-toggle]");

  if (menu) menu.classList.remove("open");

  if (toggle) {
    toggle.setAttribute("aria-expanded", "false");
  }

  document.body.classList.remove("menu-open");
}

function toggleMobileMenu() {
  const menu = $(".main-nav, .navbar-menu, [data-mobile-menu]");
  const toggle = $("[data-menu-toggle]");

  if (!menu) return;

  const open = !menu.classList.contains("open");

  menu.classList.toggle("open", open);
  document.body.classList.toggle("menu-open", open);

  if (toggle) {
    toggle.setAttribute("aria-expanded", String(open));
  }
}

/* 9. STORY CARD RENDERING */

function storyCard(storyInput) {
  const story = normalizeStory(storyInput);
  const bookmarked = state.bookmarks.includes(story.id);
  const cover = story.cover
    ? `
      <img
        class="manga-cover"
        src="${escapeHTML(story.cover)}"
        alt="${escapeHTML(story.title)} cover"
        loading="lazy"
        decoding="async"
      >
    `
    : `
      <div class="manga-cover-placeholder" aria-hidden="true">
        <span>AG</span>
        <small>MANGA UNIVERSE</small>
      </div>
    `;

  return `
    <article class="manga-card" data-story-card="${escapeHTML(story.id)}">
      <button
        type="button"
        class="manga-card-cover"
        data-open-story="${escapeHTML(story.id)}"
        aria-label="Read ${escapeHTML(story.title)}"
      >
        ${cover}
        <span class="manga-card-category">
          ${escapeHTML(story.category)}
        </span>
      </button>

      <div class="manga-card-body">
        <h3 class="manga-card-title">
          <button
            type="button"
            class="text-button"
            data-open-story="${escapeHTML(story.id)}"
          >
            ${escapeHTML(story.title)}
          </button>
        </h3>

        <p class="manga-card-author">
          By ${escapeHTML(story.author)}
        </p>

        <div class="manga-card-meta">
          <span>${formatNumber(story.views)} views</span>
          <button
            type="button"
            class="bookmark-button ${bookmarked ? "is-bookmarked" : ""}"
            data-bookmark="${escapeHTML(story.id)}"
            aria-pressed="${String(bookmarked)}"
            aria-label="${bookmarked ? "Remove bookmark" : "Add bookmark"}"
          >
            ${bookmarked ? "★ Saved" : "☆ Save"}
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderStoryGrid(target, stories) {
  if (!target) return;

  if (!stories.length) {
    showEmptyState(
      target,
      "No manga found",
      "Try another search or check back later."
    );
    return;
  }

  target.innerHTML = stories.map(storyCard).join("");
}

/* 10. STORY COLLECTIONS */

function findGrid(...selectors) {
  for (const selector of selectors) {
    const element = $(selector);
    if (element) return element;
  }

  return null;
}

async function loadStories({ force = false } = {}) {
  const homeGrid = findGrid(
    "#featured-manga",
    "#home-manga-grid",
    "[data-story-list='featured']"
  );

  const libraryGrid = findGrid(
    "#manga-grid",
    "#library-grid",
    "[data-story-list='library']"
  );

  if (!force && state.stories.length) {
    renderHome();
    renderLibrary();
    return state.stories;
  }

  if (homeGrid) showLoading(homeGrid, "Discovering manga...");
  if (libraryGrid) showLoading(libraryGrid, "Loading library...");

  try {
    const result = await apiRequest("/stories");

    const list = Array.isArray(result)
      ? result
      : result.stories || result.items || [];

    state.stories = list
      .map(normalizeStory)
      .filter((story) => story.id && story.status === "approved");

    renderHome();
    renderLibrary();

    return state.stories;
  } catch (error) {
    if (homeGrid) {
      showRetryState(
        homeGrid,
        "Manga library could not be loaded.",
        () => loadStories({ force: true })
      );
    }

    if (libraryGrid) {
      showRetryState(
        libraryGrid,
        "Library could not be loaded.",
        () => loadStories({ force: true })
      );
    }

    throw error;
  }
}

function renderHome() {
  const featured = findGrid(
    "#featured-manga",
    "#home-manga-grid",
    "[data-story-list='featured']"
  );

  const latest = findGrid(
    "#latest-manga",
    "[data-story-list='latest']"
  );

  const sorted = [...state.stories].sort((a, b) => {
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  renderStoryGrid(featured, sorted.slice(0, 8));
  renderStoryGrid(latest, sorted.slice(0, 6));

  setText(byId("total-manga"), formatNumber(state.stories.length));
}

function getFilteredStories() {
  let result = [...state.stories];

  const query = state.librarySearch.trim().toLowerCase();

  if (query) {
    result = result.filter((story) => {
      const searchable = [
        story.title,
        story.description,
        story.author,
        story.category
      ].join(" ").toLowerCase();

      return searchable.includes(query);
    });
  }

  if (state.libraryCategory !== "all") {
    result = result.filter(
      (story) =>
        story.category.toLowerCase() ===
        state.libraryCategory.toLowerCase()
    );
  }

  if (state.librarySort === "title") {
    result.sort((a, b) => a.title.localeCompare(b.title));
  } else if (state.librarySort === "popular") {
    result.sort((a, b) => b.views - a.views);
  } else {
    result.sort(
      (a, b) =>
        new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
  }

  return result;
}

function renderLibrary() {
  const grid = findGrid(
    "#manga-grid",
    "#library-grid",
    "[data-story-list='library']"
  );

  if (!grid) return;

  const filtered = getFilteredStories();
  const pageSize = CONFIG.PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));

  state.libraryPage = Math.min(state.libraryPage, pageCount);

  const start = (state.libraryPage - 1) * pageSize;
  const current = filtered.slice(start, start + pageSize);

  renderStoryGrid(grid, current);
  renderPagination(pageCount);

  setText(byId("library-result-count"), `${filtered.length} manga found`);
}

function renderPagination(pageCount) {
  const container = byId("pagination");
  if (!container) return;

  if (pageCount <= 1) {
    container.replaceChildren();
    return;
  }

  container.innerHTML = `
    <button
      type="button"
      data-library-page="${state.libraryPage - 1}"
      ${state.libraryPage <= 1 ? "disabled" : ""}
    >Previous</button>

    <span>Page ${state.libraryPage} of ${pageCount}</span>

    <button
      type="button"
      data-library-page="${state.libraryPage + 1}"
      ${state.libraryPage >= pageCount ? "disabled" : ""}
    >Next</button>
  `;
}

/* 11. SEARCH, FILTER AND SORT */

function handleSearch(event) {
  state.librarySearch = event.target.value || "";
  state.libraryPage = 1;
  renderLibrary();
}

function handleCategoryChange(event) {
  state.libraryCategory = event.target.value || "all";
  state.libraryPage = 1;
  renderLibrary();
}

function handleSortChange(event) {
  state.librarySort = event.target.value || "latest";
  state.libraryPage = 1;
  renderLibrary();
}

/* 12. STORY DETAILS AND READER */

function findStory(id) {
  return state.stories.find((story) => story.id === String(id)) ||
    state.myStories.find((story) => story.id === String(id)) ||
    state.adminStories.find((story) => story.id === String(id)) ||
    null;
}

async function openStory(id) {
  const story = findStory(id);

  if (story) {
    state.currentStory = story;
    renderReader(story);
    showSection("reader");
    return;
  }

  const reader = byId("reader-content");
  if (reader) showLoading(reader, "Opening manga...");

  try {
    const result = await apiRequest(`/stories/${encodeURIComponent(id)}`);
    const fetched = normalizeStory(result.story || result);

    if (!fetched.id) {
      throw new APIError("এই manga পাওয়া যায়নি।");
    }

    state.currentStory = fetched;
    renderReader(fetched);
    showSection("reader");
  } catch (error) {
    if (reader) {
      showRetryState(reader, error.message, () => openStory(id));
    } else {
      showError(error);
    }
  }
}

function renderReader(storyInput) {
  const story = normalizeStory(storyInput);
  const target = byId("reader-content") || byId("reader");

  if (!target) return;

  const chapters = story.chapters;

  target.innerHTML = `
    <article class="reader-story">
      <button type="button" class="btn btn-secondary" data-page-back>
        ← Back
      </button>

      <header class="reader-header">
        ${
          story.cover
            ? `<img class="reader-cover" src="${escapeHTML(story.cover)}" alt="${escapeHTML(story.title)} cover">`
            : ""
        }

        <div class="reader-info">
          <p class="eyebrow">${escapeHTML(story.category)}</p>
          <h1>${escapeHTML(story.title)}</h1>
          <p>By ${escapeHTML(story.author)}</p>
          <p>${escapeHTML(story.description)}</p>
          <button
            type="button"
            class="btn btn-primary"
            data-bookmark="${escapeHTML(story.id)}"
          >
            ${state.bookmarks.includes(story.id) ? "★ Saved" : "☆ Bookmark"}
          </button>
        </div>
      </header>

      <section class="chapter-list">
        <h2>Chapters</h2>
        ${
          chapters.length
            ? chapters.map((chapter, index) => {
                const title = chapter.title || `Chapter ${index + 1}`;
                const chapterId = chapter.id ?? index;

                return `
                  <button
                    type="button"
                    class="chapter-item"
                    data-open-chapter="${escapeHTML(chapterId)}"
                  >
                    <span>${escapeHTML(title)}</span>
                    <span>Read →</span>
                  </button>
                `;
              }).join("")
            : `<p class="empty-message">No chapters are available yet.</p>`
        }
      </section>
    </article>
  `;
}

function openChapter(chapterId) {
  const story = state.currentStory;

  if (!story) {
    toast("আগে একটি manga নির্বাচন করো।", "error");
    return;
  }

  const chapter = story.chapters.find(
    (item, index) =>
      String(item.id ?? index) === String(chapterId)
  );

  if (!chapter) {
    toast("এই chapter পাওয়া যায়নি।", "error");
    return;
  }

  const target = byId("chapter-reader") || byId("reader-content");
  if (!target) return;

  const pages = Array.isArray(chapter.pages) ? chapter.pages : [];

  target.innerHTML = `
    <div class="chapter-reading-view">
      <button type="button" class="btn btn-secondary" data-reader-back>
        ← Chapters
      </button>

      <h1>${escapeHTML(chapter.title || "Chapter")}</h1>

      <div class="chapter-pages">
        ${
          pages.length
            ? pages.map((page, index) => {
                const src = safeURL(
                  typeof page === "string" ? page : page.image_url || page.url
                );

                if (!src) return "";

                return `
                  <img
                    class="chapter-page"
                    src="${escapeHTML(src)}"
                    alt="Page ${index + 1}"
                    loading="${index < 2 ? "eager" : "lazy"}"
                    decoding="async"
                  >
                `;
              }).join("")
            : `<p class="empty-message">No chapter pages are available.</p>`
        }
      </div>

      <button type="button" class="btn btn-secondary" data-reader-back>
        Back to Chapters
      </button>
    </div>
  `;

  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* 13. BOOKMARKS */

function loadBookmarks() {
  try {
    const saved = JSON.parse(
      localStorage.getItem("agamu.bookmarks") || "[]"
    );

    state.bookmarks = Array.isArray(saved)
      ? saved.map(String)
      : [];
  } catch {
    state.bookmarks = [];
  }
}

function saveBookmarks() {
  try {
    localStorage.setItem(
      "agamu.bookmarks",
      JSON.stringify(state.bookmarks)
    );
  } catch {
    toast("Bookmarks এই ডিভাইসে সংরক্ষণ করা যায়নি।", "error");
  }
}

function toggleBookmark(id) {
  const storyId = String(id);

  if (!storyId) return;

  if (state.bookmarks.includes(storyId)) {
    state.bookmarks = state.bookmarks.filter(
      (item) => item !== storyId
    );
    toast("Bookmark সরানো হয়েছে।", "info");
  } else {
    state.bookmarks.push(storyId);
    toast("Bookmark সংরক্ষণ করা হয়েছে।", "success");
  }

  saveBookmarks();
  renderHome();
  renderLibrary();
  renderBookmarks();

  if (state.currentStory) {
    renderReader(state.currentStory);
  }
}

function renderBookmarks() {
  const target = byId("bookmarks-grid");
  if (!target) return;

  const savedStories = state.bookmarks
    .map((id) => findStory(id))
    .filter(Boolean);

  renderStoryGrid(target, savedStories);
}

/* 14. AUTHENTICATION */

function getFormValue(form, name) {
  const element = form.elements.namedItem(name);
  return element ? String(element.value || "").trim() : "";
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 8;
}

function getAuthForm() {
  return byId("auth-form") || byId("login-form");
}

async function login(email, password) {
  if (!validateEmail(email)) {
    throw new Error("সঠিক email address দাও।");
  }

  if (!password) {
    throw new Error("Password লিখো।");
  }

  const result = await apiRequest("/auth/login", {
    method: "POST",
    body: { email, password }
  });

  state.user = result.user || null;
  updateAuthUI();

  toast("Login সফল হয়েছে।", "success");
  await refreshUserData();

  return result;
}

async function register(name, email, password) {
  if (name.length < 2 || name.length > 60) {
    throw new Error("নাম ২ থেকে ৬০ অক্ষরের মধ্যে হতে হবে।");
  }

  if (!validateEmail(email)) {
    throw new Error("সঠিক email address দাও।");
  }

  if (!validatePassword(password)) {
    throw new Error("Password কমপক্ষে ৮ অক্ষরের হতে হবে।");
  }

  const result = await apiRequest("/auth/register", {
    method: "POST",
    body: { name, email, password }
  });

  toast(
    result.message || "Account তৈরি হয়েছে। এখন login করো।",
    "success",
    5000
  );

  return result;
}

async function logout() {
  try {
    await apiRequest("/auth/logout", { method: "POST" });
  } catch (error) {
    console.warn("Logout request failed:", error.message);
  }

  state.user = null;
  state.myStories = [];
  state.adminStories = [];

  updateAuthUI();
  showSection("home");
  toast("Logout সম্পন্ন হয়েছে।", "success");
}

async function requestPasswordReset(email) {
  if (!validateEmail(email)) {
    throw new Error("সঠিক email address দাও।");
  }

  const result = await apiRequest("/auth/forgot-password", {
    method: "POST",
    body: { email }
  });

  toast(
    result.message ||
      "যদি email-এর জন্য account থাকে, reset instructions পাঠানো হবে।",
    "success",
    5000
  );

  return result;
}

async function checkCurrentUser() {
  try {
    const result = await apiRequest("/auth/me");
    state.user = result.user || null;
  } catch (error) {
    if (error.status !== 401 && error.status !== 403) {
      console.warn("Could not restore session:", error.message);
    }

    state.user = null;
  }

  updateAuthUI();
}

function updateAuthUI() {
  const user = state.user;
  const loggedIn = Boolean(user);

  $$("[data-auth-required]").forEach((element) => {
    element.hidden = !loggedIn;
  });

  $$("[data-guest-only]").forEach((element) => {
    element.hidden = loggedIn;
  });

  $$("[data-user-name]").forEach((element) => {
    setText(element, user?.name || user?.username || "Reader");
  });

  $$("[data-user-email]").forEach((element) => {
    setText(element, user?.email || "");
  });

  $$("[data-user-avatar]").forEach((element) => {
    setText(element, getInitials(user?.name || user?.email));
  });

  $$("[data-admin-only]").forEach((element) => {
    element.hidden = !user || user.role !== "admin";
  });
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector("[type='submit']");
  const formType = form.dataset.authForm || form.id;

  try {
    setButtonLoading(button, true, "Please wait...");

    if (formType.includes("register") || formType.includes("signup")) {
      const name =
        getFormValue(form, "name") ||
        getFormValue(form, "username");

      const email = getFormValue(form, "email");
      const password = getFormValue(form, "password");
      const confirmPassword = getFormValue(form, "confirm_password");

      if (confirmPassword && password !== confirmPassword) {
        throw new Error("দুটি password মিলছে না।");
      }

      await register(name, email, password);
      form.reset();
      showSection("login");
    } else if (formType.includes("forgot") || formType.includes("reset")) {
      const email = getFormValue(form, "email");
      await requestPasswordReset(email);
      form.reset();
    } else {
      const email = getFormValue(form, "email");
      const password = getFormValue(form, "password");

      await login(email, password);
      form.reset();
      showSection("profile");
    }
  } catch (error) {
    showError(error);
  } finally {
    setButtonLoading(button, false);
  }
}

/* 15. PROFILE AND PERSONAL STORIES */

async function refreshUserData() {
  updateAuthUI();

  if (!state.user) return;

  await Promise.allSettled([
    loadMyStories(),
    loadProfileDetails()
  ]);
}

async function loadProfileDetails() {
  if (!state.user) return;

  const name = byId("profile-name");
  const email = byId("profile-email");

  setText(name, state.user.name || state.user.username || "Reader");
  setText(email, state.user.email || "");
}

async function loadMyStories() {
  if (!state.user) return;

  const target = byId("my-stories-grid");
  if (target) showLoading(target, "Loading your submissions...");

  try {
    const result = await apiRequest("/my/stories");
    const list = Array.isArray(result)
      ? result
      : result.stories || [];

    state.myStories = list.map(normalizeStory);

    renderMyStories();
  } catch (error) {
    if (target) {
      showRetryState(
        target,
        "Your submissions could not be loaded.",
        loadMyStories
      );
    }
  }
}

function renderMyStories() {
  const target = byId("my-stories-grid");
  if (!target) return;

  if (!state.myStories.length) {
    showEmptyState(
      target,
      "No submissions yet",
      "Submit your original or properly licensed manga story to get started."
    );
    return;
  }

  target.innerHTML = state.myStories.map((story) => `
    <article class="submission-card">
      <h3>${escapeHTML(story.title)}</h3>
      <p>${escapeHTML(story.description.slice(0, 180))}</p>
      <span class="status-badge status-${escapeHTML(story.status)}">
        ${escapeHTML(story.status)}
      </span>
    </article>
  `).join("");
}

/* 16. STORY SUBMISSION */

async function submitStory(form) {
  if (!state.user) {
    throw new Error("Story submit করতে আগে login করো।");
  }

  const title = getFormValue(form, "title");
  const description = getFormValue(form, "description");
  const category = getFormValue(form, "category") || "Other";
  const coverURL = getFormValue(form, "cover_url");

  if (title.length < 2 || title.length > CONFIG.MAX_TITLE_LENGTH) {
    throw new Error("Title ২ থেকে ১২০ অক্ষরের মধ্যে হতে হবে।");
  }

  if (
    description.length < 20 ||
    description.length > CONFIG.MAX_DESCRIPTION_LENGTH
  ) {
    throw new Error("Description ২০ থেকে ৫০০০ অক্ষরের মধ্যে লিখো।");
  }

  if (coverURL && coverURL.length > CONFIG.MAX_COVER_URL_LENGTH) {
    throw new Error("Cover URL অনেক বড়।");
  }

  const safeCover = coverURL ? safeURL(coverURL) : "";

  if (coverURL && !safeCover) {
    throw new Error("Cover URL সঠিক নয়।");
  }

  const result = await apiRequest("/stories", {
    method: "POST",
    body: {
      title,
      description,
      category,
      cover_url: safeCover || null
    }
  });

  toast(
    result.message ||
      "Submission পাঠানো হয়েছে। Admin review-এর পর প্রকাশিত হবে।",
    "success",
    5000
  );

  form.reset();
  await loadMyStories();

  return result;
}

async function handleStorySubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector("[type='submit']");

  try {
    setButtonLoading(button, true, "Submitting...");
    await submitStory(form);
  } catch (error) {
    showError(error);
  } finally {
    setButtonLoading(button, false);
  }
}

/* 17. ADMIN PANEL */

function isAdmin() {
  return Boolean(state.user && state.user.role === "admin");
}

async function loadAdminStories() {
  if (!isAdmin()) {
    throw new Error("এই প্যানেল শুধু Admin-এর জন্য।");
  }

  const target = byId("admin-stories-list");
  if (target) showLoading(target, "Loading pending submissions...");

  try {
    const result = await apiRequest("/admin/stories");
    const list = Array.isArray(result)
      ? result
      : result.stories || [];

    state.adminStories = list.map(normalizeStory);
    renderAdminStories();
  } catch (error) {
    if (target) {
      showRetryState(
        target,
        "Admin submissions could not be loaded.",
        loadAdminStories
      );
    }

    throw error;
  }
}

function renderAdminStories() {
  const target = byId("admin-stories-list");
  if (!target) return;

  if (!state.adminStories.length) {
    showEmptyState(
      target,
      "No submissions",
      "There are currently no stories awaiting review."
    );
    return;
  }

  target.innerHTML = state.adminStories.map((story) => `
    <article class="admin-story-card" data-admin-story="${escapeHTML(story.id)}">
      <div class="admin-story-content">
        <h3>${escapeHTML(story.title)}</h3>
        <p>${escapeHTML(story.description.slice(0, 300))}</p>
        <p>By ${escapeHTML(story.author)}</p>
        <span class="status-badge status-${escapeHTML(story.status)}">
          ${escapeHTML(story.status)}
        </span>
      </div>

      <div class="admin-story-actions">
        <button
          type="button"
          class="btn btn-primary"
          data-review-story="${escapeHTML(story.id)}"
          data-review-status="approved"
        >Approve</button>

        <button
          type="button"
          class="btn btn-danger"
          data-review-story="${escapeHTML(story.id)}"
          data-review-status="rejected"
        >Reject</button>
      </div>
    </article>
  `).join("");
}

async function reviewStory(id, status) {
  if (!isAdmin()) {
    throw new Error("Admin permission প্রয়োজন।");
  }

  if (!["approved", "rejected"].includes(status)) {
    throw new Error("Invalid review status.");
  }

  const confirmed = window.confirm(
    status === "approved"
      ? "এই story প্রকাশের অনুমোদন দেবে?"
      : "এই story reject করবে?"
  );

  if (!confirmed) return;

  await apiRequest(`/admin/stories/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { status }
  });

  toast(
    status === "approved"
      ? "Story approved হয়েছে।"
      : "Story rejected হয়েছে।",
    "success"
  );

  await loadAdminStories();
  await loadStories({ force: true });
}

/* 18. THEME */

function getSavedTheme() {
  try {
    return localStorage.getItem("agamu.theme");
  } catch {
    return null;
  }
}

function applyTheme(theme) {
  const chosen = theme === "light" ? "light" : "dark";

  document.documentElement.dataset.theme = chosen;
  document.documentElement.classList.toggle("light-theme", chosen === "light");
  document.documentElement.classList.toggle("dark-theme", chosen === "dark");

  const button = $("[data-theme-toggle]");

  if (button) {
    button.setAttribute("aria-pressed", String(chosen === "light"));
    button.setAttribute(
      "aria-label",
      chosen === "light" ? "Switch to dark theme" : "Switch to light theme"
    );
    button.textContent = chosen === "light" ? "☾" : "☼";
  }

  try {
    localStorage.setItem("agamu.theme", chosen);
  } catch {
    // Theme still works for the current page.
  }
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
}

/* 19. DIALOGS */

function openDialog(id) {
  const dialog = byId(id);

  if (!dialog) return;

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.hidden = false;
    dialog.classList.add("open");
  }
}

function closeDialog(dialog) {
  if (!dialog) return;

  if (typeof dialog.close === "function" && dialog.open) {
    dialog.close();
  } else {
    dialog.hidden = true;
    dialog.classList.remove("open");
  }
}

/* 20. IMAGE ERROR FALLBACK */

document.addEventListener("error", (event) => {
  const image = event.target;

  if (!(image instanceof HTMLImageElement)) return;
  if (image.dataset.fallbackApplied === "true") return;

  image.dataset.fallbackApplied = "true";
  image.classList.add("image-load-error");
  image.removeAttribute("src");
  image.alt = image.alt || "Image unavailable";
}, true);

/* 21. GLOBAL EVENT DELEGATION */

document.addEventListener("click", async (event) => {
  const target = event.target instanceof Element
    ? event.target
    : null;

  if (!target) return;

  const menuToggle = target.closest("[data-menu-toggle]");

  if (menuToggle) {
    toggleMobileMenu();
    return;
  }

  const nav = target.closest("[data-nav]");

  if (nav) {
    event.preventDefault();
    const page = nav.dataset.nav;

    if (page === "admin" && !isAdmin()) {
      toast("Admin access প্রয়োজন।", "error");
      return;
    }

    showSection(page);

    if (page === "bookmarks") renderBookmarks();
    if (page === "profile") await refreshUserData();
    if (page === "admin") {
      try {
        await loadAdminStories();
      } catch (error) {
        showError(error);
      }
    }

    return;
  }

  const openPage = target.closest("[data-open-page]");

  if (openPage) {
    const page = openPage.dataset.openPage;

    if (page === "admin" && !isAdmin()) {
      toast("Admin access প্রয়োজন।", "error");
      return;
    }

    showSection(page);
    return;
  }

  const storyButton = target.closest("[data-open-story]");

  if (storyButton) {
    await openStory(storyButton.dataset.openStory);
    return;
  }

  const bookmarkButton = target.closest("[data-bookmark]");

  if (bookmarkButton) {
    toggleBookmark(bookmarkButton.dataset.bookmark);
    return;
  }

  const pagination = target.closest("[data-library-page]");

  if (pagination && !pagination.disabled) {
    const nextPage = Number(pagination.dataset.libraryPage);

    if (Number.isInteger(nextPage) && nextPage >= 1) {
      state.libraryPage = nextPage;
      renderLibrary();

      const grid = findGrid("#manga-grid", "#library-grid");
      grid?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    return;
  }

  const chapterButton = target.closest("[data-open-chapter]");

  if (chapterButton) {
    openChapter(chapterButton.dataset.openChapter);
    return;
  }

  if (target.closest("[data-page-back]")) {
    showSection("library");
    return;
  }

  if (target.closest("[data-reader-back]")) {
    if (state.currentStory) {
      renderReader(state.currentStory);
    }
    return;
  }

  if (target.closest("[data-theme-toggle]")) {
    toggleTheme();
    return;
  }

  if (target.closest("[data-logout]")) {
    await logout();
    return;
  }

  const reviewButton = target.closest("[data-review-story]");

  if (reviewButton) {
    try {
      setButtonLoading(reviewButton, true, "Saving...");
      await reviewStory(
        reviewButton.dataset.reviewStory,
        reviewButton.dataset.reviewStatus
      );
    } catch (error) {
      showError(error);
    } finally {
      setButtonLoading(reviewButton, false);
    }

    return;
  }

  const dialogOpen = target.closest("[data-dialog-open]");

  if (dialogOpen) {
    openDialog(dialogOpen.dataset.dialogOpen);
    return;
  }

  const dialogClose = target.closest("[data-dialog-close]");

  if (dialogClose) {
    closeDialog(
      dialogClose.closest("dialog, [role='dialog']")
    );
    return;
  }

  if (target.matches("dialog")) {
    const rect = target.getBoundingClientRect();

    const outside =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;

    if (outside) closeDialog(target);
  }
});

/* 22. FORM EVENTS */

document.addEventListener("submit", async (event) => {
  const form = event.target;

  if (!(form instanceof HTMLFormElement)) return;

  if (
    form.matches(
      "#auth-form, #login-form, #register-form, #signup-form, #forgot-password-form, [data-auth-form]"
    )
  ) {
    await handleAuthSubmit(event);
    return;
  }

  if (
    form.matches(
      "#story-submit-form, #submit-story-form, [data-story-submit]"
    )
  ) {
    await handleStorySubmit(event);
  }
});

/* 23. INPUT EVENTS */

document.addEventListener("input", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLInputElement)) return;

  if (
    target.matches(
      "#manga-search, #library-search, [data-library-search]"
    )
  ) {
    handleSearch(event);
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLSelectElement)) return;

  if (target.matches("#category-filter, [data-category-filter]")) {
    handleCategoryChange(event);
  }

  if (target.matches("#sort-filter, [data-sort-filter]")) {
    handleSortChange(event);
  }
});

/* 24. NETWORK STATUS */

window.addEventListener("online", () => {
  toast("Internet connection restored.", "success");
});

window.addEventListener("offline", () => {
  toast("তুমি offline আছো। নতুন data লোড নাও হতে পারে।", "error", 5000);
});

/* 25. INITIALIZATION */

async function initializeApp() {
  if (state.initialized) return;

  state.initialized = true;

  applyTheme(getSavedTheme() || "dark");
  loadBookmarks();

  const year = byId("current-year");

  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  await checkCurrentUser();

  try {
    await loadStories({ force: true });
  } catch (error) {
    console.error("Manga library initialization failed:", error.message);
  }

  renderBookmarks();
  updateAuthUI();

  document.documentElement.classList.add("app-ready");

  const loader = byId("app-loader");

  if (loader) {
    loader.classList.add("loader-finished");

    window.setTimeout(() => {
      loader.hidden = true;
    }, 350);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp, {
    once: true
  });
} else {
  initializeApp();
}

/* 26. PUBLIC API FOR OPTIONAL HTML INTEGRATION */

window.AGAMU = Object.freeze({
  config: CONFIG,
  state,
  apiRequest,
  loadStories,
  loadMyStories,
  loadAdminStories,
  openStory,
  openChapter,
  showSection,
  toggleBookmark,
  toggleTheme,
  toast,
  logout
});
