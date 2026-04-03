import { EmailAuthProvider, reauthenticateWithCredential, reload, sendEmailVerification, updatePassword, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { deleteListing, fetchAdminListings, fetchFavoriteCountsByListingIds, fetchFavoriteListingIds, fetchInquiryCountsByListingIds, fetchListingsByIds, fetchUserListings, fetchUserProfile, isUserAdmin, toggleFavoriteListing, updateListing, upsertUserProfile } from "./data-service.js";
import { auth, logoutUser, onAuthChanged } from "./firebase.js";
import { initUnreadBadge } from "./unread-badge.js";

const profileForm = document.getElementById("profileForm");
const profileMessage = document.getElementById("profileMessage");
const myListings = document.getElementById("myListings");
const emptyListings = document.getElementById("emptyListings");
const followedListings = document.getElementById("followedListings");
const emptyFollowedListings = document.getElementById("emptyFollowedListings");
const userBadge = document.getElementById("userBadge");
const logoutBtn = document.getElementById("logoutBtn");
const addPropertyLink = document.getElementById("addPropertyLink");
const myListingsHeading = document.getElementById("myListingsHeading");
const myListingsSection = document.getElementById("myListingsSection");
const myListingsSearch = document.getElementById("myListingsSearch");
const followedSearch = document.getElementById("followedSearch");
const passwordForm = document.getElementById("passwordForm");
const verifyEmailBtn = document.getElementById("verifyEmailBtn");
const refreshEmailStatusBtn = document.getElementById("refreshEmailStatusBtn");
const emailVerificationStatus = document.getElementById("emailVerificationStatus");
const accountMessage = document.getElementById("accountMessage");

let currentUser = null;
let currentUserIsAdmin = false;
let cachedMyListings = [];
let cachedMyListingsStats = {};
let cachedFollowedListings = [];

function setMessage(text, isError = false) {
  profileMessage.textContent = text;
  profileMessage.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function setAccountMessage(text, isError = false) {
  if (!accountMessage) return;
  accountMessage.textContent = text;
  accountMessage.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function renderEmailVerificationState() {
  if (!emailVerificationStatus || !currentUser) {
    return;
  }

  if (currentUser.emailVerified) {
    emailVerificationStatus.textContent = "Email is verified.";
    verifyEmailBtn?.setAttribute("disabled", "true");
  } else {
    emailVerificationStatus.textContent = "Email is not verified yet.";
    verifyEmailBtn?.removeAttribute("disabled");
  }
}

function isPasswordProviderUser(user) {
  if (!user || !Array.isArray(user.providerData)) {
    return false;
  }
  return user.providerData.some((provider) => provider?.providerId === "password");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPrice(price) {
  return `${new Intl.NumberFormat("en-ET").format(price || 0)} ETB`;
}

function firstImage(urls) {
  if (Array.isArray(urls) && urls.length) {
    return urls[0];
  }
  return "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80";
}

function matchesQuery(listing, query) {
  const q = query.toLowerCase();
  return [
    listing.title,
    listing.city,
    listing.district,
    listing.type,
    listing.mode,
    listing.status,
    listing.userEmail,
    listing.contactName
  ].some((val) => val && val.toLowerCase().includes(q));
}

function matchesFilters(listing, f) {
  if (f.type && listing.type !== f.type) return false;
  if (f.mode && listing.mode !== f.mode) return false;
  if (f.status && (listing.status || "active") !== f.status) return false;
  if (f.roomsMin > 0 && (listing.rooms || 0) < f.roomsMin) return false;
  if (f.roomsMax > 0 && (listing.rooms || 0) > f.roomsMax) return false;
  if (f.priceMin > 0 && (listing.price || 0) < f.priceMin) return false;
  if (f.priceMax > 0 && (listing.price || 0) > f.priceMax) return false;
  if (f.sizeMin > 0 && (listing.sizeM2 || 0) < f.sizeMin) return false;
  if (f.sizeMax > 0 && (listing.sizeM2 || 0) > f.sizeMax) return false;
  if (f.furnished === "yes" && listing.furnished !== true) return false;
  if (f.furnished === "no" && listing.furnished !== false) return false;
  if (f.parking === "yes" && listing.parking !== true) return false;
  if (f.parking === "no" && listing.parking !== false) return false;
  return true;
}

function readFilters(prefix) {
  const g = (id) => document.getElementById(id)?.value || "";
  const n = (id) => Number(document.getElementById(id)?.value) || 0;
  return {
    type: g(`${prefix}FilterType`),
    mode: g(`${prefix}FilterMode`),
    status: g(`${prefix}FilterStatus`),
    furnished: g(`${prefix}FilterFurnished`),
    parking: g(`${prefix}FilterParking`),
    roomsMin: n(`${prefix}FilterRoomsMin`),
    roomsMax: n(`${prefix}FilterRoomsMax`),
    priceMin: n(`${prefix}FilterPriceMin`),
    priceMax: n(`${prefix}FilterPriceMax`),
    sizeMin: n(`${prefix}FilterSizeMin`),
    sizeMax: n(`${prefix}FilterSizeMax`)
  };
}

function applyMyListingsSearch() {
  const q = (myListingsSearch?.value || "").trim();
  const f = readFilters("my");
  let filtered = q ? cachedMyListings.filter((l) => matchesQuery(l, q)) : [...cachedMyListings];
  filtered = filtered.filter((l) => matchesFilters(l, f));
  renderMyListings(filtered, cachedMyListingsStats);
}

function applyFollowedSearch() {
  const q = (followedSearch?.value || "").trim();
  const f = readFilters("fl");
  let filtered = q ? cachedFollowedListings.filter((l) => matchesQuery(l, q)) : [...cachedFollowedListings];
  filtered = filtered.filter((l) => matchesFilters(l, f));
  renderFollowedListings(filtered);
}

function renderMyListings(listings, stats = {}) {
  const favoriteCounts = stats.favoriteCounts || {};
  const inquiryCounts = stats.inquiryCounts || {};
  myListings.innerHTML = "";

  if (!listings.length) {
    emptyListings.classList.remove("hidden");
    return;
  }

  emptyListings.classList.add("hidden");
  myListings.innerHTML = listings
    .map((listing) => {
      const canManageListing = currentUserIsAdmin || (currentUser && listing.userId === currentUser.uid);
      const ownerLabel = listing.userEmail || listing.contactName || "Unknown owner";
      return `
        <article class="card">
          <img src="${escapeHtml(firstImage(listing.imageUrls))}" alt="${escapeHtml(listing.title)}" loading="lazy" />
          <div class="card-body">
            <h3>${escapeHtml(listing.title)}</h3>
            <p class="price">${formatPrice(listing.price)}</p>
            <p class="meta">Owner: ${escapeHtml(ownerLabel)}</p>
            <p class="meta">Status: ${escapeHtml(listing.status || "active")}</p>
            <p class="meta">Views: ${escapeHtml(String(listing.viewsCount || 0))}</p>
            <p class="meta">Saved by users: ${escapeHtml(String(favoriteCounts[listing.id] || 0))}</p>
            <p class="meta">Inquiries (chats): ${escapeHtml(String(inquiryCounts[listing.id] || 0))}</p>
            <div class="profile-card-actions">
              <a class="btn ghost" href="property.html?id=${encodeURIComponent(listing.id)}">Open</a>
              ${canManageListing ? `<a class="btn ghost" href="edit-property.html?id=${encodeURIComponent(listing.id)}">Edit</a>` : ""}
              ${canManageListing ? `<button class="btn ghost" data-toggle-status-id="${escapeHtml(listing.id)}" data-next-status="${listing.status === "archived" ? "active" : "archived"}" type="button">${listing.status === "archived" ? "Activate" : "Archive"}</button>` : ""}
              ${canManageListing ? `<button class="btn ghost danger-btn" data-delete-id="${escapeHtml(listing.id)}" type="button">Delete</button>` : ""}
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  myListings.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const listingId = button.getAttribute("data-delete-id");
      if (!listingId || !currentUser) {
        return;
      }

      const confirmed = window.confirm("Delete this listing?");
      if (!confirmed) {
        return;
      }

      try {
        await deleteListing(listingId, currentUser);
        await loadDashboard();
      } catch (error) {
        setMessage(error.message || "Could not delete listing.", true);
      }
    });
  });

  myListings.querySelectorAll("[data-toggle-status-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const listingId = button.getAttribute("data-toggle-status-id");
      const nextStatus = button.getAttribute("data-next-status") || "archived";
      if (!listingId || !currentUser) {
        return;
      }

      try {
        await updateListing(listingId, { status: nextStatus }, currentUser);
        await loadDashboard();
      } catch (error) {
        setMessage(error.message || "Could not update listing status.", true);
      }
    });
  });
}

function renderFollowedListings(listings) {
  followedListings.innerHTML = "";

  if (!listings.length) {
    emptyFollowedListings.classList.remove("hidden");
    return;
  }

  emptyFollowedListings.classList.add("hidden");
  followedListings.innerHTML = listings
    .map((listing) => {
      return `
        <article class="card">
          <button class="favorite-btn is-favorite" data-unfollow-id="${escapeHtml(listing.id)}" type="button" aria-label="Unfollow listing">♥</button>
          <img src="${escapeHtml(firstImage(listing.imageUrls))}" alt="${escapeHtml(listing.title)}" loading="lazy" />
          <div class="card-body">
            <h3>${escapeHtml(listing.title)}</h3>
            <p class="price">${formatPrice(listing.price)}</p>
            <p class="meta">${escapeHtml(listing.city)} ${escapeHtml(listing.district || "")}</p>
            <div class="profile-card-actions">
              <a class="btn ghost" href="property.html?id=${encodeURIComponent(listing.id)}">Open</a>
              <button class="btn ghost" data-unfollow-id="${escapeHtml(listing.id)}" type="button">Unfollow</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  followedListings.querySelectorAll("[data-unfollow-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const listingId = button.getAttribute("data-unfollow-id");
      if (!listingId || !currentUser) {
        return;
      }

      try {
        await toggleFavoriteListing(currentUser, listingId);
        await loadDashboard();
      } catch (error) {
        setMessage(error.message || "Could not unfollow listing.", true);
      }
    });
  });
}

async function loadDashboard() {
  if (!currentUser) {
    return;
  }

  try {
    const [profile, favoriteIds] = await Promise.all([
      fetchUserProfile(currentUser.uid),
      fetchFavoriteListingIds(currentUser.uid)
    ]);

    const listings = currentUserIsAdmin
      ? await fetchAdminListings()
      : await fetchUserListings(currentUser.uid);

    const followed = await fetchListingsByIds(favoriteIds);
    let myListingStats = { favoriteCounts: {}, inquiryCounts: {} };

    if (currentUserIsAdmin && listings.length) {
      const listingIds = listings.map((listing) => listing.id);
      const [favoriteCounts, inquiryCounts] = await Promise.all([
        fetchFavoriteCountsByListingIds(listingIds),
        fetchInquiryCountsByListingIds(null, listingIds)
      ]);
      myListingStats = { favoriteCounts, inquiryCounts };
    }

    cachedMyListings = listings;
    cachedMyListingsStats = myListingStats;
    cachedFollowedListings = followed;

    profileForm.elements.namedItem("displayName").value = profile?.displayName || currentUser.displayName || "";
    profileForm.elements.namedItem("phone").value = profile?.phone || "";
    profileForm.elements.namedItem("bio").value = profile?.bio || "";

    if (myListingsSearch) myListingsSearch.value = "";
    if (followedSearch) followedSearch.value = "";
    renderMyListings(listings, myListingStats);
    renderFollowedListings(followed);
  } catch (error) {
    setMessage(error.message || "Could not load profile dashboard.", true);
    renderMyListings([]);
    renderFollowedListings([]);
  }
}

onAuthChanged(async (user) => {
  if (!user) {
    window.location.href = "auth.html";
    return;
  }

  currentUser = user;
  const canPublish = await isUserAdmin(user.uid);
  currentUserIsAdmin = canPublish;
  addPropertyLink?.classList.toggle("hidden", !canPublish);
  myListingsHeading?.classList.toggle("hidden", !canPublish);
  myListingsSection?.classList.toggle("hidden", !canPublish);
  const myListingsTitle = document.getElementById("myListingsTitle");
  if (myListingsTitle) {
    myListingsTitle.textContent = canPublish ? "All Listings (Admin)" : "My Listings";
  }
  userBadge.textContent = user.displayName || user.email || "User";
  renderEmailVerificationState();

  if (passwordForm) {
    const canChangePassword = isPasswordProviderUser(user);
    Array.from(passwordForm.querySelectorAll("input, button")).forEach((element) => {
      if (canChangePassword) {
        element.removeAttribute("disabled");
      } else {
        element.setAttribute("disabled", "true");
      }
    });

    if (!canChangePassword) {
      setAccountMessage("Password change is only available for email/password accounts.");
    }
  }

  await loadDashboard();
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser || !auth.currentUser) {
    return;
  }

  const displayName = profileForm.elements.namedItem("displayName").value.trim();
  const phone = profileForm.elements.namedItem("phone").value.trim();
  const bio = profileForm.elements.namedItem("bio").value.trim();

  try {
    await updateProfile(auth.currentUser, { displayName });
    await upsertUserProfile(currentUser.uid, { displayName, phone, bio });
    setMessage("Profile saved.");
    userBadge.textContent = displayName || currentUser.email || "User";
  } catch (error) {
    setMessage(error.message || "Could not save profile.", true);
  }
});

logoutBtn.addEventListener("click", async () => {
  await logoutUser();
  window.location.href = "auth.html";
});

verifyEmailBtn?.addEventListener("click", async () => {
  if (!auth?.currentUser) {
    return;
  }

  try {
    await sendEmailVerification(auth.currentUser);
    setAccountMessage("Verification email sent. Check your inbox and spam folder.");
  } catch (error) {
    setAccountMessage(error.message || "Could not send verification email.", true);
  }
});

refreshEmailStatusBtn?.addEventListener("click", async () => {
  if (!auth?.currentUser) {
    return;
  }

  try {
    await reload(auth.currentUser);
    currentUser = auth.currentUser;
    renderEmailVerificationState();
    setAccountMessage(currentUser.emailVerified ? "Email is verified." : "Email is still not verified.");
  } catch (error) {
    setAccountMessage(error.message || "Could not refresh email status.", true);
  }
});

passwordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!auth?.currentUser || !isPasswordProviderUser(auth.currentUser)) {
    return;
  }

  const currentPassword = document.getElementById("currentPassword")?.value || "";
  const newPassword = document.getElementById("newPassword")?.value || "";
  const confirmPassword = document.getElementById("confirmPassword")?.value || "";

  if (!currentPassword || !newPassword || !confirmPassword) {
    setAccountMessage("Please fill out all password fields.", true);
    return;
  }

  if (newPassword.length < 6) {
    setAccountMessage("New password must be at least 6 characters.", true);
    return;
  }

  if (newPassword !== confirmPassword) {
    setAccountMessage("New password and confirmation do not match.", true);
    return;
  }

  try {
    const credential = EmailAuthProvider.credential(auth.currentUser.email || "", currentPassword);
    await reauthenticateWithCredential(auth.currentUser, credential);
    await updatePassword(auth.currentUser, newPassword);
    passwordForm.reset();
    setAccountMessage("Password updated successfully.");
  } catch (error) {
    setAccountMessage(error.message || "Could not update password.", true);
  }
});

myListingsSearch?.addEventListener("input", applyMyListingsSearch);
followedSearch?.addEventListener("input", applyFollowedSearch);

function initFilterPanel(panelId, btnId, clearBtnId, applyFn, filterInputIds) {
  const panel = document.getElementById(panelId);
  const btn = document.getElementById(btnId);
  const clearBtn = document.getElementById(clearBtnId);
  if (!panel || !btn) return;

  btn.addEventListener("click", () => {
    const isOpen = !panel.classList.contains("hidden");
    panel.classList.toggle("hidden", isOpen);
    btn.classList.toggle("active", !isOpen);
    btn.textContent = isOpen ? "Filters \u25be" : "Filters \u25b4";
  });

  filterInputIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", applyFn);
  });

  clearBtn?.addEventListener("click", () => {
    filterInputIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    applyFn();
  });
}

const myFilterIds = [
  "myFilterType", "myFilterMode", "myFilterStatus", "myFilterFurnished", "myFilterParking",
  "myFilterRoomsMin", "myFilterRoomsMax",
  "myFilterPriceMin", "myFilterPriceMax",
  "myFilterSizeMin", "myFilterSizeMax"
];

const flFilterIds = [
  "flFilterType", "flFilterMode", "flFilterFurnished", "flFilterParking",
  "flFilterRoomsMin", "flFilterRoomsMax",
  "flFilterPriceMin", "flFilterPriceMax",
  "flFilterSizeMin", "flFilterSizeMax"
];

initFilterPanel("myListingsFilterPanel", "myListingsFilterBtn", "myFilterClear", applyMyListingsSearch, myFilterIds);
initFilterPanel("followedFilterPanel", "followedFilterBtn", "flFilterClear", applyFollowedSearch, flFilterIds);

initUnreadBadge();
