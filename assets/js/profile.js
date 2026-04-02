import { updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { deleteListing, fetchUserListings, fetchUserProfile, updateListing, upsertUserProfile } from "./data-service.js";
import { auth, logoutUser, onAuthChanged } from "./firebase.js";
import { initUnreadBadge } from "./unread-badge.js";

const profileForm = document.getElementById("profileForm");
const profileMessage = document.getElementById("profileMessage");
const myListings = document.getElementById("myListings");
const emptyListings = document.getElementById("emptyListings");
const userBadge = document.getElementById("userBadge");
const logoutBtn = document.getElementById("logoutBtn");

let currentUser = null;

function setMessage(text, isError = false) {
  profileMessage.textContent = text;
  profileMessage.style.color = isError ? "var(--danger)" : "var(--muted)";
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
  return `${new Intl.NumberFormat("hu-HU").format(price || 0)} HUF`;
}

function firstImage(urls) {
  if (Array.isArray(urls) && urls.length) {
    return urls[0];
  }
  return "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80";
}

function renderMyListings(listings) {
  myListings.innerHTML = "";

  if (!listings.length) {
    emptyListings.classList.remove("hidden");
    return;
  }

  emptyListings.classList.add("hidden");
  myListings.innerHTML = listings
    .map((listing) => {
      return `
        <article class="card">
          <img src="${escapeHtml(firstImage(listing.imageUrls))}" alt="${escapeHtml(listing.title)}" loading="lazy" />
          <div class="card-body">
            <h3>${escapeHtml(listing.title)}</h3>
            <p class="price">${formatPrice(listing.price)}</p>
            <p class="meta">Status: ${escapeHtml(listing.status || "active")}</p>
            <p class="meta">Views: ${escapeHtml(String(listing.viewsCount || 0))}</p>
            <div class="profile-card-actions">
              <a class="btn ghost" href="property.html?id=${encodeURIComponent(listing.id)}">Open</a>
              <a class="btn ghost" href="edit-property.html?id=${encodeURIComponent(listing.id)}">Edit</a>
              <button class="btn ghost" data-toggle-status-id="${escapeHtml(listing.id)}" data-next-status="${listing.status === "archived" ? "active" : "archived"}" type="button">${listing.status === "archived" ? "Activate" : "Archive"}</button>
              <button class="btn ghost danger-btn" data-delete-id="${escapeHtml(listing.id)}" type="button">Delete</button>
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

async function loadDashboard() {
  if (!currentUser) {
    return;
  }

  try {
    const [profile, listings] = await Promise.all([
      fetchUserProfile(currentUser.uid),
      fetchUserListings(currentUser.uid)
    ]);

    profileForm.elements.namedItem("displayName").value = profile?.displayName || currentUser.displayName || "";
    profileForm.elements.namedItem("phone").value = profile?.phone || "";
    profileForm.elements.namedItem("bio").value = profile?.bio || "";

    renderMyListings(listings);
  } catch (error) {
    setMessage(error.message || "Could not load profile dashboard.", true);
    renderMyListings([]);
  }
}

onAuthChanged(async (user) => {
  if (!user) {
    window.location.href = "auth.html";
    return;
  }

  currentUser = user;
  userBadge.textContent = user.displayName || user.email || "User";
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

initUnreadBadge();
