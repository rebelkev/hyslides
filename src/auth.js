const SUPABASE_URL = "https://bfyamyqgxrjuapvrsxcg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_paIqZAOodaEzuAw4GKtNig_inpDEafR";
const SESSION_KEY = "hyslides.auth.session";

let currentSession = readSession();
let authEnabled;

export async function accountAuthEnabled() {
  if (typeof authEnabled === "boolean") return authEnabled;
  try {
    const response = await fetch("/api/auth/config", { headers: { Accept: "application/json" } });
    authEnabled = response.ok && Boolean((await response.json()).enabled);
  } catch {
    authEnabled = false;
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
  const redirectTo = `${location.origin}${location.pathname}`;
  const url = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
  url.searchParams.set("provider", "google");
  url.searchParams.set("redirect_to", redirectTo);
  location.assign(url);
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
  if (currentSession?.access_token) {
    await supabaseFetch("/auth/v1/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${currentSession.access_token}` },
    }).catch(() => null);
  }
  clearSession();
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
