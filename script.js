"use strict";

/* ==========================================
   AG MANGA UNIVERSE — JAVASCRIPT
   Search • Categories • Reader • Forms • UI
========================================== */

const stories = [
  {
    id: 1,
    title: "The Last Shadow",
    author: "AG Creative",
    category: "Manga",
    description: "A mysterious warrior discovers a hidden power in a world of living shadows.",
    symbol: "影",
    style: "",
    content: `Chapter One — The Beginning

The city was silent beneath the moonlight. At the edge of the old district, a young traveller discovered a strange mark glowing on a forgotten stone.

This is placeholder sample content. Replace it with an original story you have permission to publish.`
  },
  {
    id: 2,
    title: "Beyond the Stars",
    author: "Moon Writer",
    category: "Novel",
    description: "A young explorer discovers a signal from beyond the known universe.",
    symbol: "星",
    style: "c2",
    content: `Chapter One — The Journey

The stars had always been a mystery. Tonight, the first signal arrived from somewhere beyond the mapped universe.

This is placeholder sample content. Replace it with your original story.`
  },
  {
    id: 3,
    title: "Silent Promise",
    author: "Ink Studio",
    category: "Story",
    description: "A heartfelt story about promises, friendship and the courage to begin again.",
    symbol: "約",
    style: "c3",
    content: `A Promise to Remember

Some promises are made in a single moment and remembered for a lifetime.

This is placeholder sample content.`
  },
  {
    id: 4,
    title: "Crimson Moon",
    author: "Night Writer",
    category: "Manga",
    description: "Under a crimson moon, a new generation faces an ancient mystery.",
    symbol: "月",
    style: "c4",
    content: `Chapter One — Crimson

The moon turned red above the silent village. Nobody knew why, but the oldest resident remembered the legend.

This is placeholder sample content.`
  },
  {
    id: 5,
    title: "The Hidden Kingdom",
    author: "AG Creative",
    category: "Novel",
    description: "An unexpected discovery leads to a kingdom missing from every map.",
    symbol: "王",
    style: "c5",
    content: `Chapter One — The Map

Behind the bookshelf was a map nobody had seen before. A single name was written across its centre.

This is placeholder sample content.`
  },
  {
    id: 6,
    title: "Zero Horizon",
    author: "Pixel Author",
    category: "Manga",
    description: "One student begins to question the rules of reality in a futuristic city.",
    symbol: "零",
    style: "c6",
    content: `Chapter One — Zero

Every citizen received a number at birth. One morning, the system displayed a number that should not exist.

This is placeholder sample content.`
  },
  {
    id: 7,
    title: "Forgotten Letters",
    author: "Blue Pen",
    category: "Story",
    description: "Old letters reveal a secret that changes a family's understanding of its past.",
    symbol: "文",
    style: "c7",
    content: `The First Letter

The envelope had no return address. Inside, familiar handwriting began with three words: Remember that summer.

This is placeholder sample content.`
  },
  {
    id: 8,
    title: "Forest of Echoes",
    author: "Green Ink",
    category: "Novel",
    description: "A traveller enters a forest where every echo tells a different story.",
    symbol: "森",
    style: "c8",
    content: `Chapter One — The Forest

The path ended where the trees grew thickest. From somewhere deep inside came a voice calling the traveller by name.

This is placeholder sample content.`
  }
];

let toastTimer;
let selectedCoverData = "";

/* Safe HTML text */
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

/* Render story cards */
function renderStories() {
  const search = document
    .getElementById("searchInput")
    ?.value.trim().toLowerCase() || "";

  const category =
    document.getElementById("categoryFilter")?.value || "All";

  const sort =
    document.getElementById("sortFilter")?.value || "latest";

  let filtered = stories.filter(story => {
    const categoryMatch =
      category === "All" || story.category === category;

    const searchable =
      `${story.title} ${story.author} ${story.description}`.toLowerCase();

    return categoryMatch && searchable.includes(search);
  });

  if (sort === "az") {
    filtered.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    filtered.sort((a, b) => b.id - a.id);
  }

  const grid = document.getElementById("storyGrid");
  const count = document.getElementById("resultCount");

  if (!grid) return;

  if (count) {
    count.textContent = `${filtered.length} stories`;
  }

  if (!filtered.length) {
    grid.innerHTML =
      '<div class="empty">No stories found. Try another search.</div>';
    return;
  }

  grid.innerHTML = filtered.map(story => `
    <article class="card">
      <div class="cover ${escapeHTML(story.style)}">
        <span class="tag">${escapeHTML(story.category)}</span>
        <b>${escapeHTML(story.symbol)}</b>
      </div>

      <div class="card-body">
        <h3>${escapeHTML(story.title)}</h3>
        <p>by ${escapeHTML(story.author)}</p>
        <p>${escapeHTML(story.description)}</p>

        <div class="meta">
          <span>${escapeHTML(story.category)}</span>
          <button
            class="accent"
            style="border:0;background:none;font-size:10px"
            onclick="readStory(${Number(story.id)})">
            Read ↗
          </button>
        </div>
      </div>
    </article>
  `).join("");
}

/* Category filter */
function filterCategory(category) {
  const select = document.getElementById("categoryFilter");

  if (select) select.value = category;

  renderStories();

  document.getElementById("explore")
    ?.scrollIntoView({ behavior: "smooth" });
}

/* Story reader */
function readStory(id) {
  const story = stories.find(item => item.id === Number(id));

  if (!story) return;

  document.getElementById("readerTitle").textContent = story.title;
  document.getElementById("readerMeta").textContent =
    `${story.category} · by ${story.author}`;

  document.getElementById("readerDescription").textContent =
    story.description;

  document.getElementById("readerContent").textContent =
    story.content;

  openModal("reader");
}

/* Modal controls */
function openModal(id) {
  const modal = document.getElementById(id);

  if (modal) {
    modal.classList.add("open");
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);

  if (modal) {
    modal.classList.remove("open");
  }
}

function switchModal(from, to) {
  closeModal(from);
  openModal(to);
}

/* Toast message */
function showToast(message) {
  const toast = document.getElementById("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

/* Account forms — backend required for real accounts */
function accountAction(event, type) {
  event.preventDefault();

  if (type === "register") {
    const passwords =
      event.target.querySelectorAll('input[type="password"]');

    if (
      passwords.length === 2 &&
      passwords[0].value !== passwords[1].value
    ) {
      showToast("Passwords do not match.");
      return;
    }
  }

  const messages = {
    login: "Connect the backend to sign in securely.",
    register: "Connect the backend to create your account.",
    forgot: "Connect the backend and email service to reset passwords."
  };

  closeModal(type);
  showToast(messages[type]);
}

/* Cover image preview */
document.getElementById("coverFile")
  ?.addEventListener("change", function (event) {
    const file = event.target.files?.[0];

    selectedCoverData = "";

    if (!file) {
      document.getElementById("coverPreview")
        ?.classList.add("hidden");
      return;
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowedTypes.includes(file.type)) {
      showToast("Choose a JPG, PNG or WebP image.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast("Image must be smaller than 5 MB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = function () {
      selectedCoverData = String(reader.result || "");

      const image = document.getElementById("previewImg");

      if (image) image.src = selectedCoverData;

      document.getElementById("coverPreview")
        ?.classList.remove("hidden");
    };

    reader.readAsDataURL(file);
  });

/* Story submission preview */
document.getElementById("storyForm")
  ?.addEventListener("submit", function (event) {
    event.preventDefault();

    const title =
      document.getElementById("newTitle").value.trim();

    const author =
      document.getElementById("newAuthor").value.trim();

    const category =
      document.getElementById("newCategory").value;

    const description =
      document.getElementById("newDescription").value.trim();

    const content =
      document.getElementById("newContent").value.trim();

    const rights =
      document.getElementById("rights").checked;

    if (!rights) {
      showToast("Confirm that you have permission to submit this work.");
      return;
    }

    document.getElementById("previewTitle").textContent = title;

    document.getElementById("previewMeta").textContent =
      `${category} · by ${author}`;

    document.getElementById("previewDescription").textContent =
      description;

    document.getElementById("previewContent").textContent =
      content;

    closeModal("submit");
    openModal("preview");
  });

/* Close modal by clicking outside */
document.querySelectorAll(".modal").forEach(modal => {
  modal.addEventListener("click", event => {
    if (event.target === modal) {
      modal.classList.remove("open");
    }
  });
});

/* Escape key closes open modals */
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    document.querySelectorAll(".modal.open").forEach(modal => {
      modal.classList.remove("open");
    });
  }
});

/* Footer year */
const year = document.getElementById("year");

if (year) {
  year.textContent = new Date().getFullYear();
}

/* Start application */
renderStories();
