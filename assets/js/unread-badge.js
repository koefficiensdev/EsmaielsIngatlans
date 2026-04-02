import { subscribeToConversations } from "./data-service.js";
import { onAuthChanged } from "./firebase.js";

function storageKey(userId) {
  return `read-conversations-${userId}`;
}

function readMap(userId) {
  try {
    return JSON.parse(window.localStorage.getItem(storageKey(userId)) || "{}");
  } catch (error) {
    return {};
  }
}

function writeMap(userId, mapValue) {
  window.localStorage.setItem(storageKey(userId), JSON.stringify(mapValue));
}

export function markConversationSeen(userId, conversationId, timestampSeconds) {
  if (!userId || !conversationId) {
    return;
  }

  const seenMap = readMap(userId);
  seenMap[conversationId] = timestampSeconds || Math.floor(Date.now() / 1000);
  writeMap(userId, seenMap);
}

export function initUnreadBadge(selector = "#unreadBadge") {
  const badge = document.querySelector(selector);
  if (!badge) {
    return;
  }

  let disposeConversations = () => {};

  onAuthChanged((user) => {
    disposeConversations();
    badge.classList.add("hidden");

    if (!user) {
      return;
    }

    disposeConversations = subscribeToConversations(
      user.uid,
      (conversations) => {
        const seenMap = readMap(user.uid);
        const unreadCount = conversations.filter((conversation) => {
          const updatedAt = conversation.updatedAt?.seconds || 0;
          const seenAt = Number(seenMap[conversation.id] || 0);
          const senderId = conversation.lastMessageSenderId || "";

          return senderId && senderId !== user.uid && updatedAt > seenAt;
        }).length;

        if (!unreadCount) {
          badge.classList.add("hidden");
          return;
        }

        badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
        badge.classList.remove("hidden");
      },
      () => {
        badge.classList.add("hidden");
      }
    );
  });
}
