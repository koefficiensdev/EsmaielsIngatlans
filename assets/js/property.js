import { fetchListingById } from "./data-service.js";

const root = document.getElementById("propertyRoot");
const params = new URLSearchParams(window.location.search);
const listingId = params.get("id");

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

async function fetchNearbyStops(lat, lon) {
  const query = `
    [out:json][timeout:25];
    (
      node["highway"="bus_stop"](around:900,${lat},${lon});
      node["public_transport"="platform"](around:900,${lat},${lon});
      node["railway"="tram_stop"](around:900,${lat},${lon});
      node["railway"="station"](around:1400,${lat},${lon});
    );
    out body;
  `;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: query
  });

  if (!response.ok) {
    throw new Error("Could not load nearby transport stops.");
  }

  const data = await response.json();
  if (!data.elements) {
    return [];
  }

  return data.elements
    .filter((element) => Number.isFinite(element.lat) && Number.isFinite(element.lon))
    .map((element) => {
      const distance = haversineDistanceMeters(lat, lon, element.lat, element.lon);
      const stopName = element.tags?.name || element.tags?.public_transport || "Unnamed stop";
      return {
        name: stopName,
        lat: element.lat,
        lon: element.lon,
        distance: Math.round(distance)
      };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 12);
}

function renderListing(listing) {
  const imageUrls = firstImage(listing);
  root.innerHTML = `
    <section class="section-title-row">
      <h1>${escapeHtml(listing.title)}</h1>
      <p class="price">${formatPrice(listing.price)}</p>
    </section>

    <section class="gallery">
      ${imageUrls.map((url) => `<img src="${escapeHtml(url)}" alt="${escapeHtml(listing.title)}" loading="lazy" />`).join("")}
    </section>

    <section class="details-grid">
      <article class="panel">
        <h2>Overview</h2>
        <p>${escapeHtml(listing.description)}</p>
        <p class="meta">${escapeHtml(listing.type)} • ${escapeHtml(listing.mode)}</p>
        <p class="meta">${escapeHtml(listing.sizeM2.toString())} m2 • ${escapeHtml(listing.rooms.toString())} rooms</p>
        <p class="meta">${escapeHtml(listing.city)} ${escapeHtml(listing.district || "")}</p>
        <p class="meta">${escapeHtml(listing.address)}</p>
      </article>

      <aside class="panel">
        <h2>Contact</h2>
        <p>${escapeHtml(listing.contactName || "N/A")}</p>
        <p>${escapeHtml(listing.contactPhone || "N/A")}</p>
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
  `;
}

function initMap(lat, lon) {
  if (!window.L) {
    return null;
  }

  const map = L.map("map").setView([lat, lon], 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  L.marker([lat, lon]).addTo(map).bindPopup("Property location").openPopup();
  return map;
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
    .map((stop) => `<li>${escapeHtml(stop.name)} (${escapeHtml(stop.distance.toString())} m)</li>`)
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

  renderListing(listing);
  const map = initMap(listing.lat, listing.lon);

  try {
    const stops = await fetchNearbyStops(listing.lat, listing.lon);
    renderStops(stops);

    if (map) {
      stops.slice(0, 6).forEach((stop) => {
        L.circleMarker([stop.lat, stop.lon], {
          radius: 5,
          color: "#0f766e",
          fillOpacity: 0.65
        })
          .addTo(map)
          .bindPopup(`${escapeHtml(stop.name)} (${escapeHtml(stop.distance.toString())} m)`);
      });
    }
  } catch (error) {
    renderStops([]);
    const stopsRoot = document.getElementById("nearbyStops");
    if (stopsRoot) {
      stopsRoot.innerHTML = `<li>${escapeHtml(error.message)}</li>`;
    }
  }
}

bootstrap();
