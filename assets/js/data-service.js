import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  serverTimestamp
  ,updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, firebaseReady } from "./firebase.js";
import { sampleListings } from "./sample-data.js";

const LISTINGS_COLLECTION = "listings";
const USERS_COLLECTION = "users";
const CONVERSATIONS_COLLECTION = "conversations";
const PROFILE_CACHE_TTL_MS = 60 * 1000;
const LISTINGS_CACHE_TTL_MS = 45 * 1000;
const profileCache = new Map();
let listingsCache = { value: null, fetchedAt: 0 };

function isFresh(timestamp, ttl) {
  return Number(timestamp || 0) + ttl > Date.now();
}

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
    bathrooms: data.bathrooms == null ? null : Number(data.bathrooms),
    floor: data.floor == null ? null : Number(data.floor),
    yearBuilt: data.yearBuilt == null ? null : Number(data.yearBuilt),
    condition: data.condition || "",
    heating: data.heating || "",
    energyRating: data.energyRating || "",
    furnished: typeof data.furnished === "boolean" ? data.furnished : null,
    parking: typeof data.parking === "boolean" ? data.parking : null,
    balcony: typeof data.balcony === "boolean" ? data.balcony : null,
    petsAllowed: typeof data.petsAllowed === "boolean" ? data.petsAllowed : null,
    lat: Number(data.lat || 0),
    lon: Number(data.lon || 0),
    contactName: data.contactName || "",
    contactPhone: data.contactPhone || "",
    imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : [],
    status: data.status || "active",
    viewsCount: Number(data.viewsCount || 0),
    userId: data.userId || "",
    createdAt: data.createdAt || null
  };
}

export async function fetchListings() {
  const curatedListings = sampleListings.filter((listing) => !listing.status || listing.status === "active");

  if (listingsCache.value && isFresh(listingsCache.fetchedAt, LISTINGS_CACHE_TTL_MS)) {
    return listingsCache.value;
  }

  if (!firebaseReady || !db) {
    listingsCache = { value: curatedListings, fetchedAt: Date.now() };
    return curatedListings;
  }

  try {
    const listingsQuery = query(collection(db, LISTINGS_COLLECTION), orderBy("createdAt", "desc"), limit(120));
    const snapshot = await getDocs(listingsQuery);
    const liveListings = snapshot.docs.map((entry) => normalizeListing(entry.id, entry.data()));
    const mergedById = new Map();

    curatedListings.forEach((listing) => {
      mergedById.set(listing.id, listing);
    });

    liveListings.forEach((listing) => {
      mergedById.set(listing.id, listing);
    });

    const mergedListings = Array.from(mergedById.values())
      .filter((listing) => listing.status === "active")
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    listingsCache = { value: mergedListings, fetchedAt: Date.now() };
    return mergedListings;
  } catch (error) {
    listingsCache = { value: curatedListings, fetchedAt: Date.now() };
    return curatedListings;
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
    return sampleListings.find((listing) => listing.id === id) || null;
  }

  return normalizeListing(listingDoc.id, listingDoc.data());
}

export async function createListing(payload, imageUrls, user) {
  if (!firebaseReady || !db) {
    throw new Error("Firebase is not configured. Add your project keys in assets/js/firebase-config.js.");
  }

  const canPublish = await isUserAdmin(user?.uid);
  if (!canPublish) {
    throw new Error("Only admin accounts can publish properties.");
  }

  const listing = {
    ...payload,
    status: payload.status || "active",
    userId: user.uid,
    userEmail: user.email,
    imageUrls,
    viewsCount: 0,
    createdAt: serverTimestamp()
  };

  try {
    const createdRef = await addDoc(collection(db, LISTINGS_COLLECTION), listing);
    return createdRef.id;
  } catch (error) {
    throw new Error(`Could not save listing: ${error.message}`);
  }
}

export async function fetchUserListings(userId) {
  if (!firebaseReady || !db || !userId) {
    return [];
  }

  try {
    const indexedQuery = query(
      collection(db, LISTINGS_COLLECTION),
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
      limit(100)
    );

    const indexedSnapshot = await getDocs(indexedQuery);
    return indexedSnapshot.docs.map((entry) => normalizeListing(entry.id, entry.data()));
  } catch (error) {
    // Fallback avoids composite-index dependency; we sort on client.
    const fallbackQuery = query(
      collection(db, LISTINGS_COLLECTION),
      where("userId", "==", userId),
      limit(200)
    );

    const fallbackSnapshot = await getDocs(fallbackQuery);
    const listings = fallbackSnapshot.docs.map((entry) => normalizeListing(entry.id, entry.data()));
    listings.sort((a, b) => {
      const left = a.createdAt?.seconds || 0;
      const right = b.createdAt?.seconds || 0;
      return right - left;
    });
    return listings;
  }
}

export async function fetchAdminListings() {
  const curatedListings = sampleListings.map((listing) => ({ ...listing }));

  if (!firebaseReady || !db) {
    return curatedListings;
  }

  const listingsQuery = query(
    collection(db, LISTINGS_COLLECTION),
    orderBy("createdAt", "desc"),
    limit(400)
  );

  const snapshot = await getDocs(listingsQuery);
  const liveListings = snapshot.docs.map((entry) => normalizeListing(entry.id, entry.data()));

  const mergedById = new Map();
  [...curatedListings, ...liveListings].forEach((listing) => {
    mergedById.set(listing.id, listing);
  });

  return Array.from(mergedById.values()).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

export async function updateListing(listingId, payload, user) {
  if (!firebaseReady || !db || !listingId) {
    throw new Error("Firebase is not configured.");
  }

  const isAdmin = await isUserAdmin(user.uid);
  const listingRef = doc(db, LISTINGS_COLLECTION, listingId);
  const listingDoc = await getDoc(listingRef);
  if (!listingDoc.exists()) {
    const sampleListing = sampleListings.find((listing) => listing.id === listingId);
    if (!sampleListing) {
      throw new Error("Listing not found.");
    }

    if (!isAdmin) {
      throw new Error("Only admin accounts can edit sample listings.");
    }

    const promotedListing = {
      ...sampleListing,
      ...payload,
      userId: user.uid,
      userEmail: user.email || sampleListing.userEmail || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(listingRef, promotedListing, { merge: true });
    return;
  }

  if (!isAdmin && listingDoc.data().userId !== user.uid) {
    throw new Error("You can only edit your own listings.");
  }

  await updateDoc(listingRef, {
    ...payload,
    updatedAt: serverTimestamp()
  });
}

export async function deleteListing(listingId, user) {
  if (!firebaseReady || !db || !listingId) {
    throw new Error("Firebase is not configured.");
  }

  const listingRef = doc(db, LISTINGS_COLLECTION, listingId);
  const listingDoc = await getDoc(listingRef);
  if (!listingDoc.exists()) {
    throw new Error("Listing not found.");
  }

  const isAdmin = await isUserAdmin(user.uid);
  if (!isAdmin && listingDoc.data().userId !== user.uid) {
    throw new Error("You can only delete your own listings.");
  }

  await deleteDoc(listingRef);
}

export async function incrementListingView(listingId) {
  if (!firebaseReady || !db || !listingId) {
    return;
  }

  const viewStorageKey = `listing-viewed-${listingId}`;
  if (window.localStorage.getItem(viewStorageKey)) {
    return;
  }

  await updateDoc(doc(db, LISTINGS_COLLECTION, listingId), {
    viewsCount: increment(1)
  });

  window.localStorage.setItem(viewStorageKey, "1");
}

export async function upsertUserProfile(userId, profileData) {
  if (!firebaseReady || !db || !userId) {
    throw new Error("Firebase is not configured.");
  }

  await setDoc(
    doc(db, USERS_COLLECTION, userId),
    {
      ...profileData,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  const previous = profileCache.get(userId)?.value || {};
  profileCache.set(userId, {
    value: { ...previous, ...profileData },
    fetchedAt: Date.now()
  });
}

export async function fetchUserProfile(userId) {
  if (!firebaseReady || !db || !userId) {
    return null;
  }

  const cached = profileCache.get(userId);
  if (cached && isFresh(cached.fetchedAt, PROFILE_CACHE_TTL_MS)) {
    return cached.value;
  }

  const profileRef = doc(db, USERS_COLLECTION, userId);
  const profileDoc = await getDoc(profileRef);
  if (!profileDoc.exists()) {
    profileCache.set(userId, { value: null, fetchedAt: Date.now() });
    return null;
  }

  const profileData = profileDoc.data();
  profileCache.set(userId, { value: profileData, fetchedAt: Date.now() });
  return profileData;
}

export async function fetchFavoriteListingIds(userId) {
  const profile = await fetchUserProfile(userId);
  if (!profile || !Array.isArray(profile.favoriteListingIds)) {
    return [];
  }

  return profile.favoriteListingIds.filter((value) => typeof value === "string" && value.trim().length > 0);
}

export async function toggleFavoriteListing(user, listingId) {
  if (!firebaseReady || !db) {
    throw new Error("Firebase is not configured.");
  }

  if (!user?.uid || !listingId) {
    throw new Error("You must be logged in to follow listings.");
  }

  const currentIds = await fetchFavoriteListingIds(user.uid);
  const alreadyFavorite = currentIds.includes(listingId);
  const nextIds = alreadyFavorite
    ? currentIds.filter((id) => id !== listingId)
    : [...currentIds, listingId];

  await setDoc(
    doc(db, USERS_COLLECTION, user.uid),
    {
      favoriteListingIds: nextIds,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  return { isFavorite: !alreadyFavorite, favoriteListingIds: nextIds };
}

export async function fetchListingsByIds(ids) {
  if (!Array.isArray(ids) || !ids.length) {
    return [];
  }

  const listings = await Promise.all(ids.map((id) => fetchListingById(id)));
  return listings.filter((listing) => Boolean(listing) && listing.status !== "archived");
}

export async function fetchFavoriteCountsByListingIds(listingIds) {
  const counts = {};
  if (!Array.isArray(listingIds) || !listingIds.length) {
    return counts;
  }

  const listingSet = new Set(listingIds);
  listingIds.forEach((id) => {
    counts[id] = 0;
  });

  if (!firebaseReady || !db) {
    return counts;
  }

  const usersSnapshot = await getDocs(query(collection(db, USERS_COLLECTION), limit(600)));
  usersSnapshot.docs.forEach((entry) => {
    const favoriteIds = entry.data()?.favoriteListingIds;
    if (!Array.isArray(favoriteIds)) {
      return;
    }

    favoriteIds.forEach((listingId) => {
      if (!listingSet.has(listingId)) {
        return;
      }

      counts[listingId] = Number(counts[listingId] || 0) + 1;
    });
  });

  return counts;
}

export async function fetchInquiryCountsByListingIds(ownerId, listingIds) {
  const counts = {};
  if (!Array.isArray(listingIds) || !listingIds.length) {
    return counts;
  }

  const listingSet = new Set(listingIds);
  listingIds.forEach((id) => {
    counts[id] = 0;
  });

  if (!firebaseReady || !db) {
    return counts;
  }

  const conversationsQuery = ownerId
    ? query(
      collection(db, CONVERSATIONS_COLLECTION),
      where("ownerId", "==", ownerId),
      limit(500)
    )
    : query(
      collection(db, CONVERSATIONS_COLLECTION),
      limit(1000)
    );

  const conversationsSnapshot = await getDocs(conversationsQuery);

  conversationsSnapshot.docs.forEach((entry) => {
    const listingId = entry.data()?.listingId;
    if (!listingSet.has(listingId)) {
      return;
    }

    counts[listingId] = Number(counts[listingId] || 0) + 1;
  });

  return counts;
}

export async function isUserAdmin(userId) {
  if (!firebaseReady || !db || !userId) {
    return false;
  }

  const profile = await fetchUserProfile(userId);
  return profile?.isAdmin === true;
}

function conversationIdFor(listingId, uidA, uidB) {
  const pair = [uidA, uidB].sort().join("__");
  return `${listingId}__${pair}`;
}

export async function createOrGetConversation({ listingId, listingTitle, ownerId, ownerName, requester }) {
  if (!firebaseReady || !db) {
    throw new Error("Firebase is not configured.");
  }

  const conversationId = conversationIdFor(listingId, ownerId, requester.uid);
  const conversationRef = doc(db, CONVERSATIONS_COLLECTION, conversationId);
  const conversationDoc = await getDoc(conversationRef);

  if (!conversationDoc.exists()) {
    await setDoc(conversationRef, {
      listingId,
      listingTitle: listingTitle || "Listing",
      ownerId,
      ownerName: ownerName || "Publisher",
      requesterId: requester.uid,
      requesterName: requester.displayName || requester.email || "User",
      participants: [ownerId, requester.uid],
      lastMessage: "",
      lastMessageSenderId: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  return conversationId;
}

export async function markConversationRead(conversationId, userId) {
  if (!firebaseReady || !db || !conversationId || !userId) {
    return;
  }

  await updateDoc(doc(db, CONVERSATIONS_COLLECTION, conversationId), {
    [`readBy.${userId}`]: serverTimestamp()
  });
}

export function subscribeToConversations(userId, onChange, onError) {
  if (!firebaseReady || !db || !userId) {
    onChange([]);
    return () => {};
  }

  const conversationsQuery = query(
    collection(db, CONVERSATIONS_COLLECTION),
    where("participants", "array-contains", userId),
    limit(80)
  );

  return onSnapshot(
    conversationsQuery,
    (snapshot) => {
      const conversations = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      conversations.sort((a, b) => {
        const left = a.updatedAt?.seconds || 0;
        const right = b.updatedAt?.seconds || 0;
        return right - left;
      });
      onChange(conversations);
    },
    (error) => {
      if (onError) {
        onError(error);
      }
    }
  );
}

export function subscribeToMessages(conversationId, onChange, onError) {
  if (!firebaseReady || !db || !conversationId) {
    onChange([]);
    return () => {};
  }

  const messagesQuery = query(
    collection(db, CONVERSATIONS_COLLECTION, conversationId, "messages"),
    orderBy("createdAt", "asc"),
    limit(400)
  );

  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      onChange(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
    },
    (error) => {
      if (onError) {
        onError(error);
      }
    }
  );
}

export async function sendMessage(conversationId, sender, messageText) {
  if (!firebaseReady || !db || !conversationId) {
    throw new Error("Firebase is not configured.");
  }

  const text = messageText.trim();
  if (!text) {
    return;
  }

  const messageRef = collection(db, CONVERSATIONS_COLLECTION, conversationId, "messages");
  await addDoc(messageRef, {
    senderId: sender.uid,
    senderName: sender.displayName || sender.email || "User",
    text,
    createdAt: serverTimestamp()
  });

  await updateDoc(doc(db, CONVERSATIONS_COLLECTION, conversationId), {
    lastMessage: text,
    lastMessageSenderId: sender.uid,
    updatedAt: serverTimestamp()
  });
}
