import { markConversationRead, subscribeToConversations } from "./data-service.js";
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

function toSeconds(value) {
  if (typeof value === "number") {
    return value;
  }

  if (value && typeof value.seconds === "number") {
    return value.seconds;
  }

  return 0;
}

export function initUnreadBadge(selector = "#unreadBadge") {
  const badge = document.querySelector(selector);
  if (!badge) {
    return;
  }

  let disposeConversations = () => {};
  let hasSeededSeenMap = false;

  onAuthChanged((user) => {
    disposeConversations();
    badge.classList.add("hidden");
    hasSeededSeenMap = false;

    if (!user) {
      return;
    }

    disposeConversations = subscribeToConversations(
      user.uid,
      (conversations) => {
        const seenMap = readMap(user.uid);
        let mapChanged = false;

        // On first conversation snapshot after login, treat existing threads as seen.
        if (!hasSeededSeenMap) {
          conversations.forEach((conversation) => {
            const conversationId = conversation.id;
            if (!conversationId || seenMap[conversationId]) {
              return;
            }

            const updatedAt = Number(conversation.updatedAt?.seconds || 0);
            if (updatedAt > 0) {
              seenMap[conversationId] = updatedAt;
              mapChanged = true;
            }

            const remoteReadAt = toSeconds(conversation.readBy?.[user.uid]);
            if (remoteReadAt <= 0 && conversation.lastMessageSenderId) {
              markConversationRead(conversationId, user.uid).catch(() => {});
            }
          });

          hasSeededSeenMap = true;
        }

        if (mapChanged) {
          writeMap(user.uid, seenMap);
        }

        const unreadCount = conversations.filter((conversation) => {
          const updatedAt = conversation.updatedAt?.seconds || 0;
          const localSeenAt = Number(seenMap[conversation.id] || 0);
          const remoteSeenAt = toSeconds(conversation.readBy?.[user.uid]);
          const seenAt = Math.max(localSeenAt, remoteSeenAt);
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
