import { firebaseReady, loginUser, onAuthChanged, registerUser } from "./firebase.js";
import { fetchUserProfile, upsertUserProfile } from "./data-service.js";

const showLoginTab = document.getElementById("showLoginTab");
const showRegisterTab = document.getElementById("showRegisterTab");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const authMessage = document.getElementById("authMessage");
let authFlowInProgress = false;

function setAuthMessage(text, isError = false) {
  authMessage.textContent = text;
  authMessage.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function getReadableAuthError(error) {
  const code = error?.code || "";

  if (code === "auth/configuration-not-found") {
    return "Firebase Authentication is not configured for this project yet. In Firebase Console, enable Authentication and turn on Email/Password sign-in.";
  }

  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Invalid email or password.";
  }

  if (code === "auth/email-already-in-use") {
    return "This email is already registered. Try logging in instead.";
  }

  if (code === "auth/invalid-email") {
    return "The email format is invalid.";
  }

  if (code === "auth/weak-password") {
    return "Password is too weak. Use at least 6 characters.";
  }

  return error?.message || "Authentication failed.";
}

function toggleAuthForms(showRegister) {
  registerForm.classList.toggle("hidden", !showRegister);
  loginForm.classList.toggle("hidden", showRegister);
  showLoginTab.classList.toggle("is-active", !showRegister);
  showRegisterTab.classList.toggle("is-active", showRegister);
  setAuthMessage("");
}

async function ensureUserProfileDocument(user) {
  if (!user?.uid) {
    return;
  }

  const existingProfile = await fetchUserProfile(user.uid);
  if (existingProfile) {
    return;
  }

  await upsertUserProfile(user.uid, {
    displayName: user.displayName || "",
    email: user.email || "",
    isAdmin: false
  });
}

if (!firebaseReady) {
  setAuthMessage("Firebase keys are missing. Configure assets/js/firebase-config.js first.", true);
}

onAuthChanged(async (user) => {
  if (user && !authFlowInProgress) {
    try {
      await ensureUserProfileDocument(user);
    } catch (error) {
      setAuthMessage(error?.message || "Could not initialize your profile document.", true);
      return;
    }

    setAuthMessage("You are already logged in. Redirecting to listings...");
    setTimeout(() => {
      window.location.href = "index.html";
    }, 700);
  }
});

showLoginTab.addEventListener("click", () => toggleAuthForms(false));
showRegisterTab.addEventListener("click", () => toggleAuthForms(true));

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authFlowInProgress = true;
  const formData = new FormData(loginForm);
  const email = formData.get("email");
  const password = formData.get("password");

  try {
    await loginUser(email, password);
    setAuthMessage("Logged in successfully. Redirecting...");
    loginForm.reset();
    setTimeout(() => {
      window.location.href = "index.html";
    }, 500);
  } catch (error) {
    authFlowInProgress = false;
    setAuthMessage(getReadableAuthError(error), true);
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authFlowInProgress = true;
  const formData = new FormData(registerForm);
  const displayName = formData.get("displayName");
  const email = formData.get("email");
  const password = formData.get("password");

  try {
    const user = await registerUser(displayName, email, password);
    await upsertUserProfile(user.uid, {
      displayName: displayName?.toString().trim() || "",
      isAdmin: false
    });
    setAuthMessage("Account created. Redirecting...");
    registerForm.reset();
    setTimeout(() => {
      window.location.href = "index.html";
    }, 500);
  } catch (error) {
    authFlowInProgress = false;
    setAuthMessage(getReadableAuthError(error), true);
  }
});
