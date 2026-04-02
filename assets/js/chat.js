import { sendMessage, subscribeToConversations, subscribeToMessages } from "./data-service.js";
import { logoutUser, onAuthChanged } from "./firebase.js";
import { initUnreadBadge, markConversationSeen } from "./unread-badge.js";

const conversationList = document.getElementById("conversationList");
const messagesRoot = document.getElementById("messagesRoot");
const chatHeader = document.getElementById("chatHeader");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const userBadge = document.getElementById("userBadge");
const logoutBtn = document.getElementById("logoutBtn");
const chatSearch = document.getElementById("chatSearch");
const chatListingFilter = document.getElementById("chatListingFilter");

let currentUser = null;
let currentConversationId = null;
let disposeMessages = () => {};
let allConversations = [];

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getCounterpartyName(conversation) {
  if (!currentUser) {
    return "User";
  }

  if (currentUser.uid === conversation.ownerId) {
    return conversation.requesterName || "Interested user";
  }

  return conversation.ownerName || "Publisher";
}

function renderConversations(conversations) {
  if (!conversations.length) {
    conversationList.innerHTML = '<p class="empty-state">No conversations yet.</p>';
    return;
  }

  conversationList.innerHTML = conversations
    .map((conversation) => {
      const activeClass = conversation.id === currentConversationId ? "is-active" : "";
      const counterparty = getCounterpartyName(conversation);
      return `
        <button class="chat-item ${activeClass}" data-conversation-id="${escapeHtml(conversation.id)}" type="button">
          <strong>${escapeHtml(conversation.listingTitle || "Listing")}</strong>
          <span>With: ${escapeHtml(counterparty)}</span>
          <span>${escapeHtml(conversation.lastMessage || "No messages yet")}</span>
        </button>
      `;
    })
    .join("");

  conversationList.querySelectorAll("[data-conversation-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const conversationId = button.getAttribute("data-conversation-id");
      if (!conversationId) {
        return;
      }
      openConversation(conversationId);
    });
  });
}

function populateListingFilter(conversations) {
  const previousValue = chatListingFilter.value;
  const uniqueTitles = Array.from(new Set(conversations.map((item) => item.listingTitle || "Listing"))).sort((a, b) => a.localeCompare(b));

  const options = ['<option value="all">All Listings</option>'];
  uniqueTitles.forEach((title) => {
    const safeTitle = escapeHtml(title);
    options.push(`<option value="${safeTitle}">${safeTitle}</option>`);
  });

  chatListingFilter.innerHTML = options.join("");
  if (previousValue && Array.from(chatListingFilter.options).some((option) => option.value === previousValue)) {
    chatListingFilter.value = previousValue;
  }
}

function applyConversationFilters() {
  const search = chatSearch.value.trim().toLowerCase();
  const listingFilter = chatListingFilter.value;

  const filtered = allConversations.filter((conversation) => {
    const listingTitle = String(conversation.listingTitle || "Listing");
    const counterparty = String(getCounterpartyName(conversation) || "");
    const lastMessage = String(conversation.lastMessage || "");
    const matchesListing = listingFilter === "all" || listingTitle === listingFilter;
    const matchesSearch = !search || `${listingTitle} ${counterparty} ${lastMessage}`.toLowerCase().includes(search);
    return matchesListing && matchesSearch;
  });

  renderConversations(filtered);
}

function renderMessages(messages) {
  if (!messages.length) {
    messagesRoot.innerHTML = '<p class="empty-state">No messages yet.</p>';
    return;
  }

  messagesRoot.innerHTML = messages
    .map((message) => {
      const ownClass = message.senderId === currentUser.uid ? "mine" : "theirs";
      return `
        <div class="msg ${ownClass}">
          <p>${escapeHtml(message.text || "")}</p>
          <span>${escapeHtml(message.senderName || "User")}</span>
        </div>
      `;
    })
    .join("");

  messagesRoot.scrollTop = messagesRoot.scrollHeight;
}

function openConversation(conversationId) {
  if (!currentUser) {
    return;
  }

  currentConversationId = conversationId;
  messageForm.classList.remove("hidden");
  chatHeader.textContent = "Conversation";
  markConversationSeen(currentUser.uid, conversationId);

  disposeMessages();
  disposeMessages = subscribeToMessages(
    conversationId,
    (messages) => {
      renderMessages(messages);
      const activeConversation = allConversations.find((item) => item.id === conversationId);
      if (activeConversation?.updatedAt?.seconds) {
        markConversationSeen(currentUser.uid, conversationId, activeConversation.updatedAt.seconds);
      }
    },
    (error) => {
      messagesRoot.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
    }
  );
}

onAuthChanged((user) => {
  if (!user) {
    window.location.href = "auth.html";
    return;
  }

  currentUser = user;
  userBadge.textContent = user.displayName || user.email || "User";

  const params = new URLSearchParams(window.location.search);
  const openId = params.get("open");

  subscribeToConversations(
    user.uid,
    (conversations) => {
      allConversations = conversations;
      populateListingFilter(conversations);
      applyConversationFilters();

      if (openId && conversations.some((item) => item.id === openId)) {
        openConversation(openId);
      } else if (!currentConversationId && conversations.length > 0) {
        openConversation(conversations[0].id);
      }
    },
    (error) => {
      conversationList.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
    }
  );
});

chatSearch.addEventListener("input", applyConversationFilters);
chatListingFilter.addEventListener("change", applyConversationFilters);

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser || !currentConversationId) {
    return;
  }

  const text = messageInput.value.trim();
  if (!text) {
    return;
  }

  await sendMessage(currentConversationId, currentUser, text);
  messageInput.value = "";
});

logoutBtn.addEventListener("click", async () => {
  await logoutUser();
  window.location.href = "auth.html";
});

initUnreadBadge();

