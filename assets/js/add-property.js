import { createListing } from "./data-service.js";
import { firebaseReady, logoutUser, onAuthChanged } from "./firebase.js";

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

console.log("Add Property page loaded. Firebase ready:", firebaseReady);

async function uploadImagesToServer(files, userId) {
  if (!files.length) {
    return [];
  }

  const uploadFormData = new FormData();
  uploadFormData.append("userId", userId);

  files.forEach((file) => {
    uploadFormData.append("images[]", file);
  });

  const response = await fetch("upload.php", {
    method: "POST",
    body: uploadFormData
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

  const searchQuery = `${address}, ${district ? district + ", " : ""}${city}, Hungary`;

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

onAuthChanged((user) => {
  currentUser = user;

  if (!user) {
    window.alert("Please log in first.");
    window.location.href = "auth.html";
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

  console.log("=== Form Submit Attempt ===");

  if (!firebaseReady) {
    console.error("Firebase not ready");
    setMessage("Firebase is not configured. Please add keys in assets/js/firebase-config.js.", true);
    return;
  }

  if (!currentUser) {
    console.error("Not logged in");
    setMessage("You must be logged in to create a listing.", true);
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
    lat: Number(formData.get("lat") || 0),
    lon: Number(formData.get("lon") || 0),
    contactName: formData.get("contactName")?.toString().trim(),
    contactPhone: formData.get("contactPhone")?.toString().trim()
  };

  const imageInput = form.elements.namedItem("images");
  const imageFiles = imageInput?.files ? Array.from(imageInput.files) : [];

  console.log("Form payload:", payload);

  if (!payload.title || !payload.description || !payload.city || !payload.address) {
    console.error("Missing required fields", { title: payload.title, description: payload.description, city: payload.city, address: payload.address });
    setMessage("Please fill in all required fields.", true);
    return;
  }

  if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lon) || payload.lat === 0 || payload.lon === 0) {
    console.error("Invalid coordinates", { lat: payload.lat, lon: payload.lon });
    setMessage("❌ Please click 'Find Coordinates' to locate your address on the map.", true);
    geocodeMessage.textContent = "⚠️ Coordinates required to publish";
    return;
  }

  try {
    setMessage("Publishing listing...");
    console.log("Creating listing with payload:", payload);
    console.log("User:", currentUser.uid, currentUser.email);
    console.log("Firebase ready:", firebaseReady);
    console.log("Image files:", imageFiles.length);

    let imageUrls = [];
    if (imageFiles.length > 0) {
      setMessage("Uploading images to server...");
      imageUrls = await uploadImagesToServer(imageFiles, currentUser.uid);
      console.log("Server image upload complete:", imageUrls);
    }

    setMessage("Saving listing...");
    const listingId = await createListing(payload, imageUrls, currentUser);
    
    console.log("Listing created successfully:", listingId);
    setMessage("✓ Listing published! Redirecting...");
    form.reset();
    isGeocoded = false;
    setTimeout(() => {
      window.location.href = `property.html?id=${encodeURIComponent(listingId)}`;
    }, 500);
  } catch (error) {
    console.error("Error publishing listing:", error);
    setMessage(`❌ ${error.message || "Failed to publish listing. Check browser console for details."}`, true);
  }
});
