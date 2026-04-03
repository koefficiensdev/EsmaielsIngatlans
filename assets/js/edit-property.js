import { fetchListingById, isUserAdmin, updateListing } from "./data-service.js";
import { auth, onAuthChanged } from "./firebase.js";

const form = document.getElementById("editPropertyForm");
const editMessage = document.getElementById("editMessage");
const params = new URLSearchParams(window.location.search);
const listingId = params.get("id");

let currentUser = null;
let currentListing = null;

function parseOptionalNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCoordinate(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) {
    return NaN;
  }
  return Number(normalized);
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

function toTriStateValue(value) {
  if (value === true) {
    return "yes";
  }
  if (value === false) {
    return "no";
  }
  return "any";
}

function setMessage(text, isError = false) {
  editMessage.textContent = text;
  editMessage.style.color = isError ? "var(--danger)" : "var(--muted)";
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

  const responseData = await response.json();
  if (!response.ok || !responseData.success) {
    throw new Error(responseData?.message || "Could not upload images.");
  }

  return Array.isArray(responseData.imageUrls) ? responseData.imageUrls : [];
}

function fillForm(listing) {
  form.elements.namedItem("title").value = listing.title || "";
  form.elements.namedItem("description").value = listing.description || "";
  form.elements.namedItem("type").value = listing.type || "apartment";
  form.elements.namedItem("mode").value = listing.mode || "rent";
  form.elements.namedItem("status").value = listing.status || "active";
  form.elements.namedItem("price").value = listing.price || 0;
  form.elements.namedItem("city").value = listing.city || "";
  form.elements.namedItem("district").value = listing.district || "";
  form.elements.namedItem("address").value = listing.address || "";
  form.elements.namedItem("sizeM2").value = listing.sizeM2 || 0;
  form.elements.namedItem("rooms").value = listing.rooms || 0;
  form.elements.namedItem("bathrooms").value = listing.bathrooms ?? "";
  form.elements.namedItem("floor").value = listing.floor ?? "";
  form.elements.namedItem("yearBuilt").value = listing.yearBuilt ?? "";
  form.elements.namedItem("condition").value = listing.condition || "";
  form.elements.namedItem("heating").value = listing.heating || "";
  form.elements.namedItem("energyRating").value = listing.energyRating || "";
  form.elements.namedItem("furnished").value = toTriStateValue(listing.furnished);
  form.elements.namedItem("parking").value = toTriStateValue(listing.parking);
  form.elements.namedItem("balcony").value = toTriStateValue(listing.balcony);
  form.elements.namedItem("petsAllowed").value = toTriStateValue(listing.petsAllowed);
  form.elements.namedItem("lat").value = listing.lat || 0;
  form.elements.namedItem("lon").value = listing.lon || 0;
  form.elements.namedItem("contactName").value = listing.contactName || "";
  form.elements.namedItem("contactPhone").value = listing.contactPhone || "";
}

onAuthChanged(async (user) => {
  if (!user) {
    window.location.href = "auth.html";
    return;
  }

  if (!listingId) {
    setMessage("Missing listing id.", true);
    return;
  }

  currentUser = user;
  const listing = await fetchListingById(listingId);
  if (!listing) {
    setMessage("Listing not found.", true);
    return;
  }

  const adminUser = await isUserAdmin(user.uid);
  if (!adminUser && listing.userId !== user.uid) {
    setMessage("You can only edit your own listing.", true);
    return;
  }

  currentListing = listing;
  fillForm(listing);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser || !currentListing || !listingId) {
    return;
  }

  const formData = new FormData(form);
  const payload = {
    title: formData.get("title")?.toString().trim(),
    description: formData.get("description")?.toString().trim(),
    type: formData.get("type")?.toString(),
    mode: formData.get("mode")?.toString(),
    status: formData.get("status")?.toString() || "active",
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
    lat: parseCoordinate(formData.get("lat")),
    lon: parseCoordinate(formData.get("lon")),
    contactName: formData.get("contactName")?.toString().trim(),
    contactPhone: formData.get("contactPhone")?.toString().trim()
  };

  if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lon)) {
    setMessage("Please enter valid latitude/longitude values (comma or dot both work).", true);
    return;
  }

  const imageInput = form.elements.namedItem("images");
  const imageFiles = imageInput?.files ? Array.from(imageInput.files) : [];

  try {
    setMessage("Saving changes...");

    let imageUrls = Array.isArray(currentListing.imageUrls) ? [...currentListing.imageUrls] : [];
    if (imageFiles.length > 0) {
      const newlyUploaded = await uploadImagesToServer(imageFiles, currentUser.uid);
      imageUrls = imageUrls.concat(newlyUploaded);
    }

    await updateListing(
      listingId,
      {
        ...payload,
        imageUrls
      },
      currentUser
    );

    setMessage("Listing updated. Redirecting...");
    setTimeout(() => {
      window.location.href = `property.html?id=${encodeURIComponent(listingId)}`;
    }, 500);
  } catch (error) {
    setMessage(error.message || "Could not update listing.", true);
  }
});
