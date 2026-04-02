import { fetchListings } from "./data-service.js";
import { firebaseReady, loginUser, logoutUser, onAuthChanged, registerUser } from "./firebase.js";

const listingsGrid = document.getElementById("listingsGrid");
const listingCount = document.getElementById("listingCount");
const emptyState = document.getElementById("emptyState");

const searchInput = document.getElementById("searchInput");
const modeFilter = document.getElementById("modeFilter");
const typeFilter = document.getElementById("typeFilter");
const minPriceInput = document.getElementById("minPrice");
const maxPriceInput = document.getElementById("maxPrice");
const searchBtn = document.getElementById("searchBtn");

const openAuthBtn = document.getElementById("openAuthBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userBadge = document.getElementById("userBadge");
const addPropertyLink = document.getElementById("addPropertyLink");

const authModal = document.getElementById("authModal");
const closeAuthModal = document.getElementById("closeAuthModal");
const showLoginTab = document.getElementById("showLoginTab");
const showRegisterTab = document.getElementById("showRegisterTab");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const authMessage = document.getElementById("authMessage");

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

function setAuthMessage(text, isError = false) {
  authMessage.textContent = text;
  authMessage.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function showAuthModal(show) {
  authModal.classList.toggle("hidden", !show);
}

function toggleAuthForms(showRegister) {
  registerForm.classList.toggle("hidden", !showRegister);
  loginForm.classList.toggle("hidden", showRegister);
  setAuthMessage("");
}

function renderAuth(user) {
  currentUser = user;
  const isLoggedIn = Boolean(user);
  openAuthBtn.classList.toggle("hidden", isLoggedIn);
  logoutBtn.classList.toggle("hidden", !isLoggedIn);
  userBadge.classList.toggle("hidden", !isLoggedIn);
  addPropertyLink.classList.toggle("hidden", !isLoggedIn);
  userBadge.textContent = isLoggedIn ? user.displayName || user.email : "";
}

async function loadListings() {
  allListings = await fetchListings();
  renderListings(allListings);
}

if (!firebaseReady) {
  setTimeout(() => {
    setAuthMessage("Firebase keys are missing. You are seeing demo listings until you configure assets/js/firebase-config.js.");
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

openAuthBtn.addEventListener("click", () => showAuthModal(true));
closeAuthModal.addEventListener("click", () => showAuthModal(false));
authModal.addEventListener("click", (event) => {
  if (event.target === authModal) {
    showAuthModal(false);
  }
});

showLoginTab.addEventListener("click", () => toggleAuthForms(false));
showRegisterTab.addEventListener("click", () => toggleAuthForms(true));

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const email = formData.get("email");
  const password = formData.get("password");

  try {
    await loginUser(email, password);
    setAuthMessage("Logged in successfully.");
    loginForm.reset();
    showAuthModal(false);
  } catch (error) {
    setAuthMessage(error.message || "Login failed.", true);
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(registerForm);
  const displayName = formData.get("displayName");
  const email = formData.get("email");
  const password = formData.get("password");

  try {
    await registerUser(displayName, email, password);
    setAuthMessage("Account created. You are now logged in.");
    registerForm.reset();
    showAuthModal(false);
  } catch (error) {
    setAuthMessage(error.message || "Registration failed.", true);
  }
});

logoutBtn.addEventListener("click", async () => {
  if (!currentUser) {
    return;
  }
  await logoutUser();
});

loadListings();
