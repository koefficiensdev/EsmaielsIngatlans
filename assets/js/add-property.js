import { createListing } from "./data-service.js";
import { firebaseReady, logoutUser, onAuthChanged } from "./firebase.js";

const form = document.getElementById("addPropertyForm");
const formMessage = document.getElementById("formMessage");
const userBadge = document.getElementById("userBadge");
const logoutBtn = document.getElementById("logoutBtn");

let currentUser = null;

function setMessage(text, isError = false) {
  formMessage.textContent = text;
  formMessage.style.color = isError ? "var(--danger)" : "var(--muted)";
}

onAuthChanged((user) => {
  currentUser = user;

  if (!user) {
    window.alert("Please log in first from main.html.");
    window.location.href = "main.html";
    return;
  }

  userBadge.textContent = user.displayName || user.email;
});

logoutBtn.addEventListener("click", async () => {
  await logoutUser();
  window.location.href = "main.html";
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

  if (!payload.title || !payload.description || !payload.city || !payload.address) {
    setMessage("Please fill in all required fields.", true);
    return;
  }

  if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lon)) {
    setMessage("Latitude and longitude must be valid numbers.", true);
    return;
  }

  try {
    setMessage("Publishing listing...");
    const listingId = await createListing(payload, imageFiles, currentUser);
    setMessage("Listing published. Redirecting...");
    form.reset();
    window.location.href = `property.html?id=${encodeURIComponent(listingId)}`;
  } catch (error) {
    setMessage(error.message || "Failed to publish listing.", true);
  }
});
