import { fetchListings } from "./data-service.js";
import { firebaseReady, logoutUser, onAuthChanged } from "./firebase.js";
import { initUnreadBadge } from "./unread-badge.js";

const listingsGrid = document.getElementById("listingsGrid");
const listingCount = document.getElementById("listingCount");
const emptyState = document.getElementById("emptyState");

const searchInput = document.getElementById("searchInput");
const modeFilter = document.getElementById("modeFilter");
const typeFilter = document.getElementById("typeFilter");
const minPriceInput = document.getElementById("minPrice");
const maxPriceInput = document.getElementById("maxPrice");
const searchBtn = document.getElementById("searchBtn");

const authLink = document.getElementById("authLink");
const logoutBtn = document.getElementById("logoutBtn");
const userBadge = document.getElementById("userBadge");
const addPropertyLink = document.getElementById("addPropertyLink");
const profileLink = document.getElementById("profileLink");
const chatLink = document.getElementById("chatLink");

let allListings = [];
let currentUser = null;

function formatPrice(price) {
  const formatted = new Intl.NumberFormat("hu-HU").format(price || 0);
  return `${formatted} HUF`;
}

function formatMode(mode) {
  return mode === "sale" ? "For Sale" : "For Rent";
}

function formatType(type) {
  return type === "house" ? "House" : "Apartment";
}

function firstImage(listing) {
  if (Array.isArray(listing.imageUrls) && listing.imageUrls.length) {
    return listing.imageUrls[0];
  }
  return "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderListings(items) {
  listingsGrid.innerHTML = "";
  listingCount.textContent = `${items.length} listing${items.length === 1 ? "" : "s"}`;

  if (!items.length) {
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  const cards = items.map((listing) => {
    return `
      <article class="card">
        <img src="${escapeHtml(firstImage(listing))}" alt="${escapeHtml(listing.title)}" loading="lazy" />
        <div class="card-body">
          <h3>${escapeHtml(listing.title)}</h3>
          <p class="price">${formatPrice(listing.price)}</p>
          <p class="meta">${escapeHtml(listing.city)} ${escapeHtml(listing.district || "")}</p>
          <p class="meta">${escapeHtml(formatType(listing.type))} • ${escapeHtml(formatMode(listing.mode))}</p>
          <div>
            <span class="tag">${escapeHtml(Number(listing.sizeM2 || 0).toString())} m2</span>
            <span class="tag">${escapeHtml(Number(listing.rooms || 0).toString())} rooms</span>
          </div>
          <p>
            <a class="btn primary" href="property.html?id=${encodeURIComponent(listing.id)}">Open Listing</a>
          </p>
        </div>
      </article>
    `;
  });

  listingsGrid.innerHTML = cards.join("");
}

function applyFilters() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const selectedMode = modeFilter.value;
  const selectedType = typeFilter.value;
  const minPrice = Number(minPriceInput.value || 0);
  const maxPrice = Number(maxPriceInput.value || Infinity);

  const filtered = allListings.filter((listing) => {
    const searchable = `${listing.title} ${listing.city} ${listing.district || ""} ${listing.address || ""}`.toLowerCase();
    const modeMatch = selectedMode === "all" || listing.mode === selectedMode;
    const typeMatch = selectedType === "all" || listing.type === selectedType;
    const price = Number(listing.price || 0);
    const priceMatch = price >= minPrice && price <= maxPrice;
    const textMatch = !searchTerm || searchable.includes(searchTerm);

    return modeMatch && typeMatch && priceMatch && textMatch;
  });

  renderListings(filtered);
}

function renderAuth(user) {
  currentUser = user;
  const isLoggedIn = Boolean(user);
  authLink.classList.toggle("hidden", isLoggedIn);
  logoutBtn.classList.toggle("hidden", !isLoggedIn);
  userBadge.classList.toggle("hidden", !isLoggedIn);
  addPropertyLink.classList.toggle("hidden", !isLoggedIn);
  profileLink.classList.toggle("hidden", !isLoggedIn);
  chatLink.classList.toggle("hidden", !isLoggedIn);
  userBadge.textContent = isLoggedIn ? user.displayName || user.email : "";
}

async function loadListings() {
  allListings = await fetchListings();
  renderListings(allListings);
}

if (!firebaseReady) {
  setTimeout(() => {
    const note = document.createElement("p");
    note.className = "auth-message";
    note.textContent = "Firebase keys are missing. You are seeing demo listings until you configure assets/js/firebase-config.js.";
    document.querySelector("main")?.prepend(note);
  }, 150);
}

onAuthChanged((user) => {
  renderAuth(user);
});

searchBtn.addEventListener("click", applyFilters);
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    applyFilters();
  }
});
modeFilter.addEventListener("change", applyFilters);
typeFilter.addEventListener("change", applyFilters);
minPriceInput.addEventListener("input", applyFilters);
maxPriceInput.addEventListener("input", applyFilters);

logoutBtn.addEventListener("click", async () => {
  if (!currentUser) {
    return;
  }
  await logoutUser();
});

loadListings();
initUnreadBadge();
