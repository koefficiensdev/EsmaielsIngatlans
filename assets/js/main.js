import { fetchFavoriteListingIds, fetchListings, isUserAdmin, toggleFavoriteListing } from "./data-service.js";
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
const sortBy = document.getElementById("sortBy");
const toggleAdvancedFiltersBtn = document.getElementById("toggleAdvancedFilters");
const advancedFilters = document.getElementById("advancedFilters");
const minSizeInput = document.getElementById("minSize");
const maxSizeInput = document.getElementById("maxSize");
const minRoomsInput = document.getElementById("minRooms");
const maxRoomsInput = document.getElementById("maxRooms");
const minBathroomsInput = document.getElementById("minBathrooms");
const maxBathroomsInput = document.getElementById("maxBathrooms");
const minFloorInput = document.getElementById("minFloor");
const maxFloorInput = document.getElementById("maxFloor");
const minYearBuiltInput = document.getElementById("minYearBuilt");
const maxYearBuiltInput = document.getElementById("maxYearBuilt");
const conditionFilter = document.getElementById("conditionFilter");
const heatingFilter = document.getElementById("heatingFilter");
const energyRatingFilter = document.getElementById("energyRatingFilter");
const furnishedFilter = document.getElementById("furnishedFilter");
const parkingFilter = document.getElementById("parkingFilter");
const balconyFilter = document.getElementById("balconyFilter");
const petsFilter = document.getElementById("petsFilter");
const searchBtn = document.getElementById("searchBtn");

const authLink = document.getElementById("authLink");
const logoutBtn = document.getElementById("logoutBtn");
const userBadge = document.getElementById("userBadge");
const addPropertyLink = document.getElementById("addPropertyLink");
const profileLink = document.getElementById("profileLink");
const chatLink = document.getElementById("chatLink");
const postPropertyBtn = document.getElementById("postPropertyBtn");

let allListings = [];
let currentUser = null;
let favoriteListingIds = new Set();
const LISTINGS_WARM_CACHE_KEY = "homepage-listings-cache-v1";

function formatPrice(price) {
  const formatted = new Intl.NumberFormat("en-ET").format(price || 0);
  return `${formatted} ETB`;
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
    const isFavorite = favoriteListingIds.has(listing.id);
    return `
      <article class="card">
        <button class="favorite-btn ${isFavorite ? "is-favorite" : ""}" data-favorite-id="${escapeHtml(listing.id)}" type="button" aria-label="${isFavorite ? "Remove from favorites" : "Add to favorites"}">${isFavorite ? "♥" : "♡"}</button>
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

  listingsGrid.querySelectorAll("[data-favorite-id]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const listingId = button.getAttribute("data-favorite-id");
      if (!listingId) {
        return;
      }

      if (!currentUser) {
        window.location.href = "auth.html";
        return;
      }

      try {
        const result = await toggleFavoriteListing(currentUser, listingId);
        if (result.isFavorite) {
          favoriteListingIds.add(listingId);
        } else {
          favoriteListingIds.delete(listingId);
        }

        button.classList.toggle("is-favorite", result.isFavorite);
        button.textContent = result.isFavorite ? "♥" : "♡";
        button.setAttribute("aria-label", result.isFavorite ? "Remove from favorites" : "Add to favorites");
      } catch (error) {
        const note = document.createElement("p");
        note.className = "auth-message";
        note.textContent = error?.message || "Could not update followed listing.";
        document.querySelector("main")?.prepend(note);
      }
    });
  });
}

async function syncFavorites(user) {
  if (!user) {
    favoriteListingIds = new Set();
    return;
  }

  const ids = await fetchFavoriteListingIds(user.uid);
  favoriteListingIds = new Set(ids);
}

function applyFilters() {
  const numberOr = (value, fallback) => {
    if (value === "" || value === null || typeof value === "undefined") {
      return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const triStateMatch = (filterValue, listingValue) => {
    if (filterValue === "any") {
      return true;
    }
    if (filterValue === "yes") {
      return listingValue === true;
    }
    return listingValue === false;
  };

  const searchTerm = searchInput.value.trim().toLowerCase();
  const selectedMode = modeFilter.value;
  const selectedType = typeFilter.value;
  const minPrice = Number(minPriceInput.value || 0);
  const maxPrice = Number(maxPriceInput.value || Infinity);
  const minSize = numberOr(minSizeInput.value, 0);
  const maxSize = numberOr(maxSizeInput.value, Infinity);
  const minRooms = numberOr(minRoomsInput.value, 0);
  const maxRooms = numberOr(maxRoomsInput.value, Infinity);
  const minBathrooms = numberOr(minBathroomsInput.value, 0);
  const maxBathrooms = numberOr(maxBathroomsInput.value, Infinity);
  const minFloor = numberOr(minFloorInput.value, 0);
  const maxFloor = numberOr(maxFloorInput.value, Infinity);
  const minYearBuilt = numberOr(minYearBuiltInput.value, 0);
  const maxYearBuilt = numberOr(maxYearBuiltInput.value, Infinity);

  const filtered = allListings.filter((listing) => {
    const searchable = `${listing.title} ${listing.city} ${listing.district || ""} ${listing.address || ""}`.toLowerCase();
    const modeMatch = selectedMode === "all" || listing.mode === selectedMode;
    const typeMatch = selectedType === "all" || listing.type === selectedType;
    const price = Number(listing.price || 0);
    const size = Number(listing.sizeM2 || 0);
    const rooms = Number(listing.rooms || 0);
    const bathrooms = Number(listing.bathrooms || 0);
    const floor = Number(listing.floor || 0);
    const yearBuilt = Number(listing.yearBuilt || 0);
    const priceMatch = price >= minPrice && price <= maxPrice;
    const sizeMatch = size >= minSize && size <= maxSize;
    const roomMatch = rooms >= minRooms && rooms <= maxRooms;
    const bathroomMatch = bathrooms >= minBathrooms && bathrooms <= maxBathrooms;
    const floorMatch = floor >= minFloor && floor <= maxFloor;
    const yearBuiltMatch = yearBuilt >= minYearBuilt && yearBuilt <= maxYearBuilt;
    const conditionMatch = conditionFilter.value === "all" || listing.condition === conditionFilter.value;
    const heatingMatch = heatingFilter.value === "all" || listing.heating === heatingFilter.value;
    const energyRatingMatch = energyRatingFilter.value === "all" || listing.energyRating === energyRatingFilter.value;
    const furnishedMatch = triStateMatch(furnishedFilter.value, listing.furnished);
    const parkingMatch = triStateMatch(parkingFilter.value, listing.parking);
    const balconyMatch = triStateMatch(balconyFilter.value, listing.balcony);
    const petsMatch = triStateMatch(petsFilter.value, listing.petsAllowed);
    const textMatch = !searchTerm || searchable.includes(searchTerm);

    return modeMatch && typeMatch && priceMatch && sizeMatch && roomMatch && bathroomMatch && floorMatch && yearBuiltMatch && conditionMatch && heatingMatch && energyRatingMatch && furnishedMatch && parkingMatch && balconyMatch && petsMatch && textMatch;
  });

  const sorted = [...filtered];
  if (sortBy.value === "priceAsc") {
    sorted.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
  } else if (sortBy.value === "priceDesc") {
    sorted.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
  } else if (sortBy.value === "sizeDesc") {
    sorted.sort((a, b) => Number(b.sizeM2 || 0) - Number(a.sizeM2 || 0));
  } else if (sortBy.value === "viewsDesc") {
    sorted.sort((a, b) => Number(b.viewsCount || 0) - Number(a.viewsCount || 0));
  } else {
    sorted.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }

  renderListings(sorted);
}

async function renderAuth(user) {
  currentUser = user;
  const isLoggedIn = Boolean(user);
  const canPublish = isLoggedIn ? await isUserAdmin(user.uid) : false;
  authLink.classList.toggle("hidden", isLoggedIn);
  logoutBtn.classList.toggle("hidden", !isLoggedIn);
  userBadge.classList.toggle("hidden", !isLoggedIn);
  addPropertyLink.classList.toggle("hidden", !canPublish);
  postPropertyBtn?.classList.toggle("hidden", !canPublish);
  profileLink.classList.toggle("hidden", !isLoggedIn);
  chatLink.classList.toggle("hidden", !isLoggedIn);
  userBadge.textContent = isLoggedIn ? user.displayName || user.email : "";
}

async function loadListings() {
  try {
    const cachedRaw = window.localStorage.getItem(LISTINGS_WARM_CACHE_KEY);
    if (cachedRaw) {
      const cachedListings = JSON.parse(cachedRaw);
      if (Array.isArray(cachedListings) && cachedListings.length) {
        allListings = cachedListings;
        renderListings(allListings);
      }
    }
  } catch (error) {
    // Ignore malformed cache and continue with live fetch.
  }

  allListings = await fetchListings();
  renderListings(allListings);
  try {
    window.localStorage.setItem(LISTINGS_WARM_CACHE_KEY, JSON.stringify(allListings));
  } catch (error) {
    // Cache write failures are non-blocking.
  }
}

if (!firebaseReady) {
  setTimeout(() => {
    const note = document.createElement("p");
    note.className = "auth-message";
    note.textContent = "Firebase keys are missing. You are seeing demo listings until you configure assets/js/firebase-config.js.";
    document.querySelector("main")?.prepend(note);
  }, 150);
}

onAuthChanged(async (user) => {
  await Promise.all([syncFavorites(user), renderAuth(user)]);
  applyFilters();
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
sortBy.addEventListener("change", applyFilters);

[
  minSizeInput,
  maxSizeInput,
  minRoomsInput,
  maxRoomsInput,
  minBathroomsInput,
  maxBathroomsInput,
  minFloorInput,
  maxFloorInput,
  minYearBuiltInput,
  maxYearBuiltInput,
  conditionFilter,
  heatingFilter,
  energyRatingFilter,
  furnishedFilter,
  parkingFilter,
  balconyFilter,
  petsFilter
].forEach((control) => {
  control.addEventListener("change", applyFilters);
  control.addEventListener("input", applyFilters);
});

toggleAdvancedFiltersBtn.addEventListener("click", () => {
  const willShow = advancedFilters.classList.contains("hidden");
  advancedFilters.classList.toggle("hidden", !willShow);
  toggleAdvancedFiltersBtn.textContent = willShow ? "Hide Extra Filters" : "More Filters";
});

logoutBtn.addEventListener("click", async () => {
  if (!currentUser) {
    return;
  }
  await logoutUser();
});

loadListings();
initUnreadBadge();
