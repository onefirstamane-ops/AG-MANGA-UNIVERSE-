
"use strict";

// Render deploy হওয়ার পর নিজের API URL এখানে বসাবে।
const API_BASE = "https://YOUR-RENDER-SERVICE.onrender.com/api";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = { user: null, stories: [], page: "home" };
const bookmarks = new Set();

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[c]);
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3000);
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function showPage(name) {
  const page = $(`#page-${name}`);
  if (!page) return;
  state.page = name;
  $$(".page").forEach(el => el.classList.toggle("active", el === page));
  $$(".nav-link[data-page]").forEach(el =>
    el.classList.toggle("active", el.dataset.page === name)
  );
  $("#mainNav").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (name === "library") renderLibrary();
  if (name === "bookmarks") renderBookmarks();
  if (name === "profile") loadProfile();
  if (name === "home") renderHome();
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-page]");
  if (!button) return;
  event.preventDefault();
  showPage(button.dataset.page);
});

$("#menuToggle").addEventListener("click", () =>
  $("#mainNav").classList.toggle("open")
);

function storyCard(story) {
  const saved = bookmarks.has(story.id);
  const cover = story.cover_url
    ? `<img src="${escapeHTML(story.cover_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.textContent='AG AMU'">`
    : "AG AMU";

  return `<article class="story-card">
    <div class="cover">${cover}</div>
    <div class="story-info">
      <span class="story-meta">${escapeHTML(story.category || "Story")}</span>
      <h3>${escapeHTML(story.title)}</h3>
      <p>${escapeHTML((story.synopsis || "").slice(0, 125))}${(story.synopsis || "").length > 125 ? "…" : ""}</p>
      <p>By ${escapeHTML(story.author_name || "AG AMU Creator")}</p>
      <div class="story-actions">
        <button class="small-btn" data-read="${Number(story.id)}">Read</button>
        <button class="small-btn" data-bookmark="${Number(story.id)}">${saved ? "★ Saved" : "☆ Save"}</button>
      </div>
    </div>
  </article>`;
}

function renderCards(container, list, emptyMessage) {
  if (!list.length) {
    container.innerHTML = `<p class="empty-state">${escapeHTML(emptyMessage)}</p>`;
    return;
  }
  container.innerHTML = list.map(storyCard).join("");
}

function renderHome() {
  const published = state.stories.filter(s => s.status === "approved");
  renderCards($("#homeStories"), published.slice(0, 4), "No published stories yet. Be the first creator!");
}

function renderLibrary() {
  const term = ($("#searchInput").value || "").trim().toLowerCase();
  const category = $("#categoryFilter").value;
  const list = state.stories.filter(s => s.status === "approved")
    .filter(s => !category || s.category === category)
    .filter(s => !term || `${s.title} ${s.synopsis} ${s.author_name}`.toLowerCase().includes(term));
  renderCards($("#libraryStories"), list, "No stories found. Try another search.");
}

function renderBookmarks() {
  const list = state.stories.filter(s => bookmarks.has(s.id) && s.status === "approved");
  renderCards($("#bookmarkStories"), list, "Your saved stories will appear here.");
}

document.addEventListener("click", async event => {
  const readButton = event.target.closest("[data-read]");
  const saveButton = event.target.closest("[data-bookmark]");

  if (saveButton) {
    const id = Number(saveButton.dataset.bookmark);
    if (bookmarks.has(id)) bookmarks.delete(id);
    else bookmarks.add(id);
    renderHome();
    renderLibrary();
    renderBookmarks();
    toast(bookmarks.has(id) ? "Added to bookmarks." : "Removed from bookmarks.");
  }

  if (readButton) {
    try {
      const data = await api(`/stories/${Number(readButton.dataset.read)}`);
      const story = data.story;
      $("#readerContent").innerHTML = `
        <span class="eyebrow">${escapeHTML(story.category)}</span>
        <h1>${escapeHTML(story.title)}</h1>
        <p class="muted">By ${escapeHTML(story.author_name)}</p>
        <p>${escapeHTML(story.synopsis)}</p>
        <hr>
        <h2>Chapter 1</h2>
        <div class="reader-body">${escapeHTML(story.content)}</div>`;
      showPage("reader");
    } catch (error) {
      toast(error.message);
    }
  }
});

$$("[data-category]").forEach(button => {
  button.addEventListener("click", () => {
    $("#categoryFilter").value = button.dataset.category;
    showPage("library");
  });
});

$("#searchBtn").addEventListener("click", renderLibrary);
$("#searchInput").addEventListener("input", renderLibrary);
$("#categoryFilter").addEventListener("change", renderLibrary);

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setMessage(id, message) {
  $(id).textContent = message;
}

$("#registerForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  setMessage("#registerMessage", "Creating account...");
  try {
    const data = await api("/auth/register", {
      method: "POST", body: JSON.stringify(formData(form))
    });
    setMessage("#registerMessage", data.message || "Account created. Please login.");
    form.reset();
    showPage("login");
  } catch (error) {
    setMessage("#registerMessage", error.message);
  }
});

$("#loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  setMessage("#loginMessage", "Signing in...");
  try {
    await api("/auth/login", {
      method: "POST", body: JSON.stringify(formData(event.currentTarget))
    });
    await refreshSession();
    event.currentTarget.reset();
    toast("Welcome to AG AMU!");
    showPage("profile");
  } catch (error) {
    setMessage("#loginMessage", error.message);
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  try {
    await api("/auth/logout", { method: "POST", body: "{}" });
  } catch (_) {}
  state.user = null;
  updateAuthUI();
  toast("Logged out.");
  showPage("home");
});

$("#forgotForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const data = await api("/auth/forgot-password", {
      method: "POST", body: JSON.stringify(formData(event.currentTarget))
    });
    setMessage("#forgotMessage", data.message || "If the account exists, reset instructions will be sent.");
  } catch (error) {
    setMessage("#forgotMessage", error.message);
  }
});

$("#storyForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!state.user) {
    toast("Please login before submitting a story.");
    showPage("login");
    return;
  }

  setMessage("#storyMessage", "Submitting story...");
  try {
    const data = await api("/stories", {
      method: "POST", body: JSON.stringify(formData(event.currentTarget))
    });
    setMessage("#storyMessage", data.message || "Submitted for review.");
    event.currentTarget.reset();
  } catch (error) {
    setMessage("#storyMessage", error.message);
  }
});

function updateAuthUI() {
  $("#authNav").hidden = !!state.user;
  $("#profileNav").hidden = !state.user;
  $("#logoutBtn").hidden = !state.user;
}

async function refreshSession() {
  try {
    const data = await api("/auth/me");
    state.user = data.user || null;
  } catch (_) {
    state.user = null;
  }
  updateAuthUI();
}

async function loadStories() {
  try {
    const data = await api("/stories");
    state.stories = data.stories || [];
  } catch (error) {
    state.stories = [];
    toast("Could not load stories. Check Backend URL and deployment.");
  }
  renderHome();
  renderLibrary();
}

async function loadProfile() {
  if (!state.user) {
    $("#profileContent").innerHTML =
      '<p>Please <button class="text-btn" data-page="login">login</button> to view your profile.</p>';
    $("#myStories").innerHTML = "";
    $("#adminSection").hidden = true;
    return;
  }

  $("#profileContent").innerHTML = `
    <h2>${escapeHTML(state.user.display_name)}</h2>
    <p class="muted">${escapeHTML(state.user.email)}</p>
    <p>Role: ${escapeHTML(state.user.role)}</p>`;

  try {
    const data = await api("/my/stories");
    const list = data.stories || [];
    $("#myStories").innerHTML = list.length
      ? list.map(s => `<div class="admin-row"><h3>${escapeHTML(s.title)}</h3>
          <p>${escapeHTML(s.category)} · Status: <b>${escapeHTML(s.status)}</b></p></div>`).join("")
      : '<p class="muted">You have not submitted any stories yet.</p>';
  } catch (error) {
    $("#myStories").textContent = error.message;
  }

  $("#adminSection").hidden = state.user.role !== "admin";
  if (state.user.role === "admin") loadAdmin();
}

async function loadAdmin() {
  if (!state.user || state.user.role !== "admin") return;
  try {
    const data = await api("/admin/stories");
    const list = data.stories || [];
    $("#adminStories").innerHTML = list.length ? list.map(s => `
      <div class="admin-row">
        <h3>${escapeHTML(s.title)}</h3>
        <p>${escapeHTML(s.category)} · ${escapeHTML(s.author_name)} · ${escapeHTML(s.status)}</p>
        <p>${escapeHTML(s.synopsis)}</p>
        <button class="btn primary" data-review="${Number(s.id)}" data-status="approved">Approve</button>
        <button class="btn secondary" data-review="${Number(s.id)}" data-status="rejected">Reject</button>
      </div>`).join("") : '<p class="muted">No submissions to review.</p>';
  } catch (error) {
    $("#adminStories").textContent = error.message;
  }
}

$("#refreshAdmin").addEventListener("click", loadAdmin);

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-review]");
  if (!button) return;
  try {
    await api(`/admin/stories/${Number(button.dataset.review)}`, {
      method: "PATCH", body: JSON.stringify({ status: button.dataset.status })
    });
    toast("Story status updated.");
    await loadAdmin();
    await loadStories();
  } catch (error) {
    toast(error.message);
  }
});

$("#year").textContent = new Date().getFullYear();

(async function init() {
  if (API_BASE.includes("YOUR-RENDER-SERVICE")) {
    $("#homeStories").innerHTML =
      '<p class="empty-state">Backend URL এখনো সেট করা হয়নি। Render deploy করার পর script.js-এ URL বসাও।</p>';
    $("#libraryStories").innerHTML =
      '<p class="empty-state">Backend URL সেট করার পর Public Stories এখানে দেখা যাবে।</p>';
    return;
  }
  await refreshSession();
  await loadStories();
})();
