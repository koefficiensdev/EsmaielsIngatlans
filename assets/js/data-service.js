import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getDownloadURL, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { db, firebaseReady, storage } from "./firebase.js";
import { sampleListings } from "./sample-data.js";

const LISTINGS_COLLECTION = "listings";

function normalizeListing(id, data) {
  return {
    id,
    title: data.title || "Untitled listing",
    description: data.description || "",
    type: data.type || "apartment",
    mode: data.mode || "rent",
    price: Number(data.price || 0),
    city: data.city || "",
    district: data.district || "",
    address: data.address || "",
    sizeM2: Number(data.sizeM2 || 0),
    rooms: Number(data.rooms || 0),
    lat: Number(data.lat || 0),
    lon: Number(data.lon || 0),
    contactName: data.contactName || "",
    contactPhone: data.contactPhone || "",
    imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : [],
    createdAt: data.createdAt || null
  };
}

async function uploadImages(files, userId) {
  if (!firebaseReady || !storage || !files.length) {
    return [];
  }

  const uploadPromises = files.map(async (file, index) => {
    const safeFileName = file.name.replace(/\s+/g, "-").toLowerCase();
    const fileRef = ref(storage, `listings/${userId}/${Date.now()}-${index}-${safeFileName}`);
    await uploadBytes(fileRef, file);
    return getDownloadURL(fileRef);
  });

  return Promise.all(uploadPromises);
}

export async function fetchListings() {
  if (!firebaseReady || !db) {
    return sampleListings;
  }

  try {
    const listingsQuery = query(collection(db, LISTINGS_COLLECTION), orderBy("createdAt", "desc"), limit(120));
    const snapshot = await getDocs(listingsQuery);
    return snapshot.docs.map((entry) => normalizeListing(entry.id, entry.data()));
  } catch (error) {
    console.error("Failed to fetch Firestore listings, using demo data.", error);
    return sampleListings;
  }
}

export async function fetchListingById(id) {
  if (!id) {
    return null;
  }

  if (!firebaseReady || !db) {
    return sampleListings.find((listing) => listing.id === id) || null;
  }

  const docRef = doc(db, LISTINGS_COLLECTION, id);
  const listingDoc = await getDoc(docRef);
  if (!listingDoc.exists()) {
    return null;
  }

  return normalizeListing(listingDoc.id, listingDoc.data());
}

export async function createListing(payload, imageFiles, user) {
  if (!firebaseReady || !db) {
    throw new Error("Firebase is not configured. Add your project keys in assets/js/firebase-config.js.");
  }

  const imageUrls = await uploadImages(imageFiles, user.uid);
  const listing = {
    ...payload,
    userId: user.uid,
    userEmail: user.email,
    imageUrls,
    createdAt: serverTimestamp()
  };

  const createdRef = await addDoc(collection(db, LISTINGS_COLLECTION), listing);
  return createdRef.id;
}
