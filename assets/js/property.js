import { createOrGetConversation, fetchListingById, incrementListingView } from "./data-service.js";
import { logoutUser, onAuthChanged } from "./firebase.js";
import { initUnreadBadge } from "./unread-badge.js";

const root = document.getElementById("propertyRoot");
const params = new URLSearchParams(window.location.search);
const listingId = params.get("id");
const authLink = document.getElementById("authLink");
const logoutBtn = document.getElementById("logoutBtn");
const userBadge = document.getElementById("userBadge");
const addPropertyLink = document.getElementById("addPropertyLink");
const profileLink = document.getElementById("profileLink");
const chatLink = document.getElementById("chatLink");
let currentUser = null;
let galleryImages = [];
let activeImageIndex = 0;

function renderAuth(user) {
  const isLoggedIn = Boolean(user);
  authLink?.classList.toggle("hidden", isLoggedIn);
  logoutBtn?.classList.toggle("hidden", !isLoggedIn);
  userBadge?.classList.toggle("hidden", !isLoggedIn);
  addPropertyLink?.classList.toggle("hidden", !isLoggedIn);
  profileLink?.classList.toggle("hidden", !isLoggedIn);
  chatLink?.classList.toggle("hidden", !isLoggedIn);

  if (userBadge) {
    userBadge.textContent = isLoggedIn ? user.displayName || user.email || "User" : "";
  }
}

function formatPrice(price) {
  const formatted = new Intl.NumberFormat("hu-HU").format(price || 0);
  return `${formatted} HUF`;
}

function firstImage(listing) {
  if (Array.isArray(listing.imageUrls) && listing.imageUrls.length) {
    return listing.imageUrls;
  }
  return ["https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80"];
}

function boolLabel(value) {
  if (value === true) {
    return "Yes";
  }
  if (value === false) {
    return "No";
  }
  return "Not specified";
}

function textOrFallback(value) {
  const text = String(value || "").trim();
  return text || "Not specified";
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "");
}

function renderExtraInfo(listing) {
  return `
    <li><strong>Bathrooms:</strong> ${escapeHtml(listing.bathrooms == null ? "Not specified" : String(listing.bathrooms))}</li>
    <li><strong>Floor:</strong> ${escapeHtml(listing.floor == null ? "Not specified" : String(listing.floor))}</li>
    <li><strong>Year Built:</strong> ${escapeHtml(listing.yearBuilt == null ? "Not specified" : String(listing.yearBuilt))}</li>
    <li><strong>Condition:</strong> ${escapeHtml(textOrFallback(listing.condition))}</li>
    <li><strong>Heating:</strong> ${escapeHtml(textOrFallback(listing.heating))}</li>
    <li><strong>Energy Rating:</strong> ${escapeHtml(textOrFallback(listing.energyRating))}</li>
    <li><strong>Furnished:</strong> ${escapeHtml(boolLabel(listing.furnished))}</li>
    <li><strong>Parking:</strong> ${escapeHtml(boolLabel(listing.parking))}</li>
    <li><strong>Balcony:</strong> ${escapeHtml(boolLabel(listing.balcony))}</li>
    <li><strong>Pets Allowed:</strong> ${escapeHtml(boolLabel(listing.petsAllowed))}</li>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadius = 6371000;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function stopsCacheKey(lat, lon) {
  return `nearby-stops:${lat.toFixed(4)}:${lon.toFixed(4)}`;
}

function readCachedStops(lat, lon) {
  const key = stopsCacheKey(lat, lon);
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    const payload = JSON.parse(raw);
    const maxAgeMs = 10 * 60 * 1000;
    if (!payload?.savedAt || Date.now() - payload.savedAt > maxAgeMs || !Array.isArray(payload.stops)) {
      return null;
    }
    return payload.stops;
  } catch (error) {
    return null;
  }
}

function writeCachedStops(lat, lon, stops) {
  const key = stopsCacheKey(lat, lon);
  window.localStorage.setItem(
    key,
    JSON.stringify({
      savedAt: Date.now(),
      stops
    })
  );
}

async function fetchOverpassWithFallback(overpassQuery) {
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter"
  ];

  let lastError = null;

  for (const endpoint of endpoints) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          body: overpassQuery,
          headers: {
            "Content-Type": "text/plain"
          }
        });

        if (!response.ok) {
          throw new Error(`Overpass error ${response.status}`);
        }

        const data = await response.json();
        if (!data?.elements) {
          throw new Error("Overpass returned invalid response.");
        }

        return data;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  }

  throw lastError || new Error("Could not load nearby transport stops.");
}

async function fetchNearbyStops(lat, lon) {
  const cached = readCachedStops(lat, lon);
  if (cached) {
    return cached;
  }

  const query = `
    [out:json][timeout:30];
    (
      node["highway"="bus_stop"](around:950,${lat},${lon});
      node["public_transport"="platform"](around:950,${lat},${lon});
      node["railway"="tram_stop"](around:950,${lat},${lon});
      node["railway"="station"](around:1400,${lat},${lon});
    )->.stops;
    .stops out body;
    rel(bn.stops)["type"="route"]["route"~"bus|tram|trolleybus"];
    out body;
  `;

  const data = await fetchOverpassWithFallback(query);

  const stops = data.elements.filter((element) => element.type === "node" && Number.isFinite(element.lat) && Number.isFinite(element.lon));
  const routes = data.elements.filter((element) => element.type === "relation");

  const linesByStop = new Map();
  routes.forEach((route) => {
    const lineLabel = route.tags?.ref || route.tags?.name || route.tags?.route || "line";
    const members = Array.isArray(route.members) ? route.members : [];

    members.forEach((member) => {
      if (member.type !== "node" || typeof member.ref !== "number") {
        return;
      }

      const current = linesByStop.get(member.ref) || new Set();
      current.add(lineLabel);
      linesByStop.set(member.ref, current);
    });
  });

  const mappedStops = stops
    .map((element) => {
      const distance = haversineDistanceMeters(lat, lon, element.lat, element.lon);
      const stopName = element.tags?.name || element.tags?.public_transport || "Unnamed stop";
      const lineSet = linesByStop.get(element.id) || new Set();
      return {
        id: element.id,
        name: stopName,
        lat: element.lat,
        lon: element.lon,
        lines: Array.from(lineSet).sort((a, b) => a.localeCompare(b)),
        distance: Math.round(distance)
      };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 12);

  writeCachedStops(lat, lon, mappedStops);
  return mappedStops;
}

function renderListing(listing) {
  const imageUrls = firstImage(listing);
  galleryImages = imageUrls;
  activeImageIndex = 0;

  const thumbButtons = imageUrls
    .map((url, index) => {
      return `
        <button class="thumb-btn ${index === 0 ? "is-active" : ""}" data-photo-index="${index}" type="button" aria-label="Open photo ${index + 1}">
          <img src="${escapeAttr(url)}" alt="${escapeAttr(listing.title)} photo ${index + 1}" loading="lazy" />
        </button>
      `;
    })
    .join("");

  root.innerHTML = `
    <section class="section-title-row">
      <h1>${escapeHtml(listing.title)}</h1>
      <p class="price">${formatPrice(listing.price)}</p>
    </section>

    <section class="property-media panel">
      <button id="mainPhotoBtn" class="main-photo-btn" type="button" aria-label="Open large photo">
        <img id="mainGalleryImage" src="${escapeAttr(imageUrls[0])}" alt="${escapeAttr(listing.title)}" loading="eager" />
      </button>
      <div class="media-thumbs" id="mediaThumbs">
        ${thumbButtons}
      </div>
      <p class="meta" id="galleryCounter">1 / ${imageUrls.length}</p>
    </section>

    <section class="details-grid">
      <article class="panel">
        <h2>Overview</h2>
        <p>${escapeHtml(listing.description)}</p>
        <p class="meta">${escapeHtml(listing.type)} • ${escapeHtml(listing.mode)}</p>
        <p class="meta">${escapeHtml(listing.sizeM2.toString())} m2 • ${escapeHtml(listing.rooms.toString())} rooms</p>
        <p class="meta">${escapeHtml(listing.city)} ${escapeHtml(listing.district || "")}</p>
        <p class="meta">${escapeHtml(listing.address)}</p>
        <h3 style="margin-top: 0.8rem;">Extra Details</h3>
        <ul class="feature-list">
          ${renderExtraInfo(listing)}
        </ul>
      </article>

      <aside class="panel">
        <h2>Contact</h2>
        <p>${escapeHtml(listing.contactName || "N/A")}</p>
        <p>${escapeHtml(listing.contactPhone || "N/A")}</p>
        <p class="meta">Views: ${escapeHtml(String(listing.viewsCount || 0))}</p>
        <div id="interactionBox" class="interaction-box"></div>
      </aside>
    </section>

    <section class="panel">
      <h2>Location and Nearby Stops</h2>
      <div id="map"></div>
      <h3>Closest Public Transport</h3>
      <ul id="nearbyStops">
        <li>Loading nearby transport stops...</li>
      </ul>
    </section>

    <div id="photoLightbox" class="photo-lightbox hidden" role="dialog" aria-modal="true" aria-label="Photo viewer">
      <button id="closeLightbox" class="lightbox-close" type="button" aria-label="Close">x</button>
      <button id="prevLightbox" class="lightbox-nav prev" type="button" aria-label="Previous photo">‹</button>
      <img id="lightboxImage" src="${escapeAttr(imageUrls[0])}" alt="${escapeAttr(listing.title)} large photo" />
      <button id="nextLightbox" class="lightbox-nav next" type="button" aria-label="Next photo">›</button>
      <p id="lightboxCounter" class="lightbox-counter">1 / ${imageUrls.length}</p>
    </div>
  `;
}

function updateGalleryImage(index) {
  if (!galleryImages.length) {
    return;
  }

  const boundedIndex = (index + galleryImages.length) % galleryImages.length;
  activeImageIndex = boundedIndex;

  const mainImage = document.getElementById("mainGalleryImage");
  const lightboxImage = document.getElementById("lightboxImage");
  const galleryCounter = document.getElementById("galleryCounter");
  const lightboxCounter = document.getElementById("lightboxCounter");

  if (mainImage) {
    mainImage.src = galleryImages[boundedIndex];
  }
  if (lightboxImage) {
    lightboxImage.src = galleryImages[boundedIndex];
  }
  if (galleryCounter) {
    galleryCounter.textContent = `${boundedIndex + 1} / ${galleryImages.length}`;
  }
  if (lightboxCounter) {
    lightboxCounter.textContent = `${boundedIndex + 1} / ${galleryImages.length}`;
  }

  document.querySelectorAll("[data-photo-index]").forEach((button) => {
    const buttonIndex = Number(button.getAttribute("data-photo-index"));
    button.classList.toggle("is-active", buttonIndex === boundedIndex);
  });
}

function setupGalleryInteractions() {
  const mainPhotoBtn = document.getElementById("mainPhotoBtn");
  const lightbox = document.getElementById("photoLightbox");
  const closeLightboxBtn = document.getElementById("closeLightbox");
  const prevLightboxBtn = document.getElementById("prevLightbox");
  const nextLightboxBtn = document.getElementById("nextLightbox");

  const openLightbox = () => {
    lightbox?.classList.remove("hidden");
  };

  const closeLightbox = () => {
    lightbox?.classList.add("hidden");
  };

  mainPhotoBtn?.addEventListener("click", openLightbox);
  closeLightboxBtn?.addEventListener("click", closeLightbox);

  lightbox?.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      closeLightbox();
    }
  });

  prevLightboxBtn?.addEventListener("click", () => {
    updateGalleryImage(activeImageIndex - 1);
  });

  nextLightboxBtn?.addEventListener("click", () => {
    updateGalleryImage(activeImageIndex + 1);
  });

  document.querySelectorAll("[data-photo-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.getAttribute("data-photo-index") || 0);
      updateGalleryImage(index);
      openLightbox();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (!lightbox || lightbox.classList.contains("hidden")) {
      return;
    }

    if (event.key === "Escape") {
      closeLightbox();
      return;
    }

    if (event.key === "ArrowLeft") {
      updateGalleryImage(activeImageIndex - 1);
    }

    if (event.key === "ArrowRight") {
      updateGalleryImage(activeImageIndex + 1);
    }
  });
}

function renderInteraction(listing) {
  const box = document.getElementById("interactionBox");
  if (!box) {
    return;
  }

  if (!currentUser) {
    box.innerHTML = '<a class="btn ghost" href="auth.html">Login to message publisher</a>';
    return;
  }

  if (currentUser.uid === listing.userId) {
    box.innerHTML = `
      <p class="meta">This is your listing.</p>
      <a class="btn ghost" href="edit-property.html?id=${encodeURIComponent(listing.id)}">Edit Listing</a>
      <a class="btn ghost" href="profile.html">View My Statistics</a>
    `;
    return;
  }

  if (!listing.userId) {
    box.innerHTML = '<p class="meta">Messaging is not available for this listing.</p>';
    return;
  }

  box.innerHTML = `
    <p class="meta">Interested in this property? Send a message to the publisher.</p>
    <button id="startChatBtn" class="btn primary" type="button">Message Publisher</button>
  `;

  const startChatBtn = document.getElementById("startChatBtn");
  if (!startChatBtn) {
    return;
  }

  startChatBtn.addEventListener("click", async () => {
    try {
      const conversationId = await createOrGetConversation({
        listingId: listing.id,
        listingTitle: listing.title,
        ownerId: listing.userId,
        ownerName: listing.contactName,
        requester: currentUser
      });

      window.location.href = `chat.html?open=${encodeURIComponent(conversationId)}`;
    } catch (error) {
      box.innerHTML += `<p class="auth-message">${escapeHtml(error.message || "Could not start chat")}</p>`;
    }
  });
}

function initMap(lat, lon) {
  const mapRoot = document.getElementById("map");
  if (!mapRoot) {
    return;
  }

  const embedSrc = `https://maps.google.com/maps?q=${encodeURIComponent(`${lat},${lon}`)}&z=15&output=embed`;
  mapRoot.innerHTML = `<iframe title="Property location map" src="${embedSrc}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
}

function renderStops(stops) {
  const stopsRoot = document.getElementById("nearbyStops");
  if (!stopsRoot) {
    return;
  }

  if (!stops.length) {
    stopsRoot.innerHTML = "<li>No nearby transport stops were found.</li>";
    return;
  }

  stopsRoot.innerHTML = stops
    .map((stop) => {
      const linesText = stop.lines.length ? stop.lines.join(", ") : "line info unavailable";
      return `<li>${escapeHtml(stop.name)} (${escapeHtml(stop.distance.toString())} m) - Lines: ${escapeHtml(linesText)}</li>`;
    })
    .join("");
}

async function bootstrap() {
  if (!listingId) {
    root.innerHTML = "<p>Missing listing id. Open a listing from the main page.</p>";
    return;
  }

  const listing = await fetchListingById(listingId);

  if (!listing) {
    root.innerHTML = "<p>Listing not found.</p>";
    return;
  }

  let viewTracked = false;
  onAuthChanged((user) => {
    currentUser = user;
    renderAuth(user);
    renderInteraction(listing);

    if (!viewTracked && (!user || user.uid !== listing.userId)) {
      viewTracked = true;
      incrementListingView(listing.id).catch(() => {});
    }
  });

  renderListing(listing);
  renderInteraction(listing);
  setupGalleryInteractions();
  initMap(listing.lat, listing.lon);

  try {
    const stops = await fetchNearbyStops(listing.lat, listing.lon);
    renderStops(stops);

  } catch (error) {
    renderStops([]);
    const stopsRoot = document.getElementById("nearbyStops");
    if (stopsRoot) {
      stopsRoot.innerHTML = `<li>${escapeHtml(error.message)}</li>`;
    }
  }
}

logoutBtn?.addEventListener("click", async () => {
  if (!currentUser) {
    return;
  }
  await logoutUser();
});

bootstrap();
initUnreadBadge();
