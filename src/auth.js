const SUPABASE_URL = "https://bfyamyqgxrjuapvrsxcg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_paIqZAOodaEzuAw4GKtNig_inpDEafR";
const SESSION_KEY = "hyslides.auth.session";
export const CURRENT_TERMS_VERSION = "2026-07-31";
const PENDING_TERMS_KEY = "hyslides.auth.pendingTerms";

let currentSession = readSession();
let authEnabled;

export async function accountAuthEnabled() {
  if (typeof authEnabled === "boolean") return authEnabled;
  try {
    const response = await fetch("/api/auth/config", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Authentication configuration is unavailable.");
    authEnabled = (await response.json()).enabled !== false;
  } catch {
    // Fail closed: a configuration or network problem must never expose the editor.
    authEnabled = true;
  }
  return authEnabled;
}

export function authSession() {
  return currentSession;
}

export function isAuthenticated() {
  return Boolean(currentSession?.access_token && currentSession?.user?.id);
}

export function authUser() {
  return currentSession?.user || null;
}

export async function restoreAuthSession() {
  const callback = sessionFromCallback();
  if (callback) {
    setSession(callback);
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  }
  if (!currentSession?.access_token) return null;
  if (Number(currentSession.expires_at || 0) * 1000 < Date.now() + 60_000) {
    await refreshAuthSession();
  }
  try {
    const response = await supabaseFetch("/auth/v1/user", {
      headers: { Authorization: `Bearer ${currentSession.access_token}` },
    });
    if (!response.ok) throw new Error("Session expired.");
    currentSession.user = await response.json();
    writeSession();
    return currentSession;
  } catch {
    clearSession();
    return null;
  }
}

export function signInWithGoogle() {
  const redirectTo = `${location.origin}/signin`;
  const url = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
  url.searchParams.set("provider", "google");
  url.searchParams.set("redirect_to", redirectTo);
  location.assign(url);
}

export function rememberTermsConsent() {
  sessionStorage.setItem(PENDING_TERMS_KEY, CURRENT_TERMS_VERSION);
}

export async function termsAcceptanceStatus() {
  const response = await authorizedFetch("/api/account/terms", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(await apiError(response, "Unable to verify Terms acceptance."));
  return response.json();
}

export async function acceptCurrentTerms(source = "existing-account") {
  const response = await authorizedFetch("/api/account/terms", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ version: CURRENT_TERMS_VERSION, source }),
  });
  if (!response.ok) throw new Error(await apiError(response, "Unable to record Terms acceptance."));
  sessionStorage.removeItem(PENDING_TERMS_KEY);
  return response.json();
}

export async function completePendingTermsAcceptance() {
  if (sessionStorage.getItem(PENDING_TERMS_KEY) !== CURRENT_TERMS_VERSION) return null;
  return acceptCurrentTerms("signup");
}

export async function requestEmailCode(email, profile = {}) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const response = await supabaseFetch("/auth/v1/otp", {
    method: "POST",
    body: JSON.stringify({
      email: cleanEmail,
      create_user: true,
      data: {
        first_name: String(profile.firstName || "").trim().slice(0, 80),
        last_name: String(profile.lastName || "").trim().slice(0, 80),
      },
    }),
  });
  if (!response.ok) throw new Error(await authError(response));
  return cleanEmail;
}

export async function verifyEmailCode(email, token) {
  const response = await supabaseFetch("/auth/v1/verify", {
    method: "POST",
    body: JSON.stringify({
      email: String(email || "").trim().toLowerCase(),
      token: String(token || "").replace(/\D/g, ""),
      type: "email",
    }),
  });
  if (!response.ok) throw new Error(await authError(response));
  setSession(await response.json());
  return currentSession;
}

export async function signOut() {
  const accessToken = currentSession?.access_token;
  clearSession();
  if (!accessToken) return;
  void supabaseFetch("/auth/v1/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    keepalive: true,
  }).catch(() => null);
}

export async function authorizedFetch(path, options = {}) {
  if (!currentSession?.access_token) throw new Error("Sign in required.");
  if (Number(currentSession.expires_at || 0) * 1000 < Date.now() + 60_000) {
    await refreshAuthSession();
  }
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${currentSession.access_token}`);
  return fetch(path, { ...options, headers });
}

async function refreshAuthSession() {
  if (!currentSession?.refresh_token) throw new Error("Sign in required.");
  const response = await supabaseFetch("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: currentSession.refresh_token }),
  });
  if (!response.ok) {
    clearSession();
    throw new Error("Your session expired. Please sign in again.");
  }
  setSession(await response.json());
}

function sessionFromCallback() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (!params.get("access_token")) return null;
  return {
    access_token: params.get("access_token"),
    refresh_token: params.get("refresh_token"),
    expires_at: Math.floor(Date.now() / 1000) + Number(params.get("expires_in") || 3600),
    token_type: params.get("token_type") || "bearer",
  };
}

function setSession(session) {
  currentSession = {
    ...session,
    expires_at: session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600),
  };
  writeSession();
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function writeSession() {
  localStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));
}

function clearSession() {
  currentSession = null;
  localStorage.removeItem(SESSION_KEY);
}

function supabaseFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);
  if (options.body) headers.set("Content-Type", "application/json");
  return fetch(`${SUPABASE_URL}${path}`, { ...options, headers });
}

async function authError(response) {
  const payload = await response.json().catch(() => ({}));
  return payload.msg || payload.message || payload.error_description || "Authentication failed.";
}

async function apiError(response, fallback) {
  const payload = await response.json().catch(() => ({}));
  return payload.error || payload.message || fallback;
}
