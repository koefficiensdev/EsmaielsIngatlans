import { createListing, isUserAdmin } from "./data-service.js";
import { auth, firebaseReady, logoutUser, onAuthChanged } from "./firebase.js";

const form = document.getElementById("addPropertyForm");
const formMessage = document.getElementById("formMessage");
const userBadge = document.getElementById("userBadge");
const logoutBtn = document.getElementById("logoutBtn");
const geocodeBtn = document.getElementById("geocodeBtn");
const geocodeMessage = document.getElementById("geocodeMessage");
const latInput = form.elements.namedItem("lat");
const lonInput = form.elements.namedItem("lon");
const cityInput = form.elements.namedItem("city");
const districtInput = form.elements.namedItem("district");
const addressInput = form.elements.namedItem("address");

let currentUser = null;
let isGeocoded = false;
let canPublishListings = false;

function parseOptionalNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTriState(value) {
  if (value === "yes") {
    return true;
  }
  if (value === "no") {
    return false;
  }
  return null;
}

async function uploadImagesToServer(files, userId) {
  if (!files.length) {
    return [];
  }

  const idToken = await auth?.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error("You must be logged in to upload images.");
  }

  const uploadFormData = new FormData();
  uploadFormData.append("userId", userId);

  files.forEach((file) => {
    uploadFormData.append("images[]", file);
  });

  const response = await fetch("upload.php", {
    method: "POST",
    body: uploadFormData,
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  });

  let responseData = null;
  try {
    responseData = await response.json();
  } catch (error) {
    throw new Error("Upload endpoint did not return valid JSON. Run the site through a PHP server instead of Live Server.");
  }

  if (!response.ok || !responseData.success) {
    throw new Error(responseData?.message || "Image upload failed on the server.");
  }

  return Array.isArray(responseData.imageUrls) ? responseData.imageUrls : [];
}

function setMessage(text, isError = false) {
  formMessage.textContent = text;
  formMessage.style.color = isError ? "var(--danger)" : "var(--accent)";
}

function setGeocodeMessage(text, isError = false) {
  geocodeMessage.textContent = text;
  geocodeMessage.style.color = isError ? "var(--danger)" : "var(--accent)";
}

async function geocodeAddress() {
  const city = cityInput?.value?.trim();
  const district = districtInput?.value?.trim();
  const address = addressInput?.value?.trim();

  if (!city || !address) {
    setGeocodeMessage("Please enter City and Address first.", true);
    return;
  }

  const searchQuery = `${address}, ${district ? district + ", " : ""}${city}, Ethiopia`;

  try {
    setGeocodeMessage("Looking up coordinates...");
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`,
      {
        headers: { "Accept-Language": "en" }
      }
    );

    if (!response.ok) {
      throw new Error("Geocoding service error");
    }

    const results = await response.json();

    if (!results.length) {
      setGeocodeMessage(`No location found for "${searchQuery}". Try a different address.`, true);
      isGeocoded = false;
      return;
    }

    const result = results[0];
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);

    latInput.value = lat;
    lonInput.value = lon;
    isGeocoded = true;

    setGeocodeMessage(`✓ Found: ${result.display_name}`);
  } catch (error) {
    setGeocodeMessage(`Error: ${error.message}`, true);
    isGeocoded = false;
  }
}

onAuthChanged(async (user) => {
  currentUser = user;

  if (!user) {
    window.alert("Please log in first.");
    window.location.href = "auth.html";
    return;
  }

  canPublishListings = await isUserAdmin(user.uid);
  if (!canPublishListings) {
    setMessage("Only admin accounts can publish properties.", true);
    form.querySelectorAll("input, select, textarea, button").forEach((element) => {
      if (element.id !== "logoutBtn") {
        element.disabled = true;
      }
    });
    return;
  }

  userBadge.textContent = user.displayName || user.email;
});

geocodeBtn.addEventListener("click", (event) => {
  event.preventDefault();
  geocodeAddress();
});

logoutBtn.addEventListener("click", async () => {
  await logoutUser();
  window.location.href = "auth.html";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!firebaseReady) {
    setMessage("Firebase is not configured. Please add keys in assets/js/firebase-config.js.", true);
    return;
  }

  if (!currentUser) {
    setMessage("You must be logged in to create a listing.", true);
    return;
  }

  if (!canPublishListings) {
    setMessage("Only admin accounts can publish properties.", true);
    return;
  }

  const formData = new FormData(form);
  const payload = {
    title: formData.get("title")?.toString().trim(),
    description: formData.get("description")?.toString().trim(),
    type: formData.get("type")?.toString(),
    mode: formData.get("mode")?.toString(),
    price: Number(formData.get("price") || 0),
    city: formData.get("city")?.toString().trim(),
    district: formData.get("district")?.toString().trim(),
    address: formData.get("address")?.toString().trim(),
    sizeM2: Number(formData.get("sizeM2") || 0),
    rooms: Number(formData.get("rooms") || 0),
    bathrooms: parseOptionalNumber(formData.get("bathrooms")),
    floor: parseOptionalNumber(formData.get("floor")),
    yearBuilt: parseOptionalNumber(formData.get("yearBuilt")),
    condition: formData.get("condition")?.toString() || "",
    heating: formData.get("heating")?.toString() || "",
    energyRating: formData.get("energyRating")?.toString() || "",
    furnished: parseTriState(formData.get("furnished")?.toString()),
    parking: parseTriState(formData.get("parking")?.toString()),
    balcony: parseTriState(formData.get("balcony")?.toString()),
    petsAllowed: parseTriState(formData.get("petsAllowed")?.toString()),
    lat: Number(formData.get("lat") || 0),
    lon: Number(formData.get("lon") || 0),
    contactName: formData.get("contactName")?.toString().trim(),
    contactPhone: formData.get("contactPhone")?.toString().trim()
  };

  const imageInput = form.elements.namedItem("images");
  const imageFiles = imageInput?.files ? Array.from(imageInput.files) : [];

  if (!payload.title || !payload.description || !payload.city || !payload.address) {
    setMessage("Please fill in all required fields.", true);
    return;
  }

  if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lon) || payload.lat === 0 || payload.lon === 0) {
    setMessage("❌ Please click 'Find Coordinates' to locate your address on the map.", true);
    geocodeMessage.textContent = "⚠️ Coordinates required to publish";
    return;
  }

  try {
    setMessage("Publishing listing...");

    let imageUrls = [];
    if (imageFiles.length > 0) {
      setMessage("Uploading images to server...");
      imageUrls = await uploadImagesToServer(imageFiles, currentUser.uid);
    }

    setMessage("Saving listing...");
    const listingId = await createListing(payload, imageUrls, currentUser);
    
    setMessage("✓ Listing published! Redirecting...");
    form.reset();
    isGeocoded = false;
    setTimeout(() => {
      window.location.href = `property.html?id=${encodeURIComponent(listingId)}`;
    }, 500);
  } catch (error) {
    setMessage(`❌ ${error.message || "Failed to publish listing. Check browser console for details."}`, true);
  }
});
