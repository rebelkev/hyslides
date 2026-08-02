import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const authSource = await readFile(new URL("../src/auth.js", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const storageSource = await readFile(new URL("../src/storage.js", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
const viteSource = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const legalMigration = await readFile(
  new URL("../supabase/migrations/202608020001_versioned_legal_acceptance.sql", import.meta.url),
  "utf8"
);

test("accounts support Google OAuth and passwordless email codes", () => {
  assert.match(authSource, /\/api\/auth\/config/);
  assert.match(authSource, /authEnabled = true/);
  assert.match(authSource, /provider", "google"/);
  assert.match(authSource, /\/auth\/v1\/otp/);
  assert.match(authSource, /\/auth\/v1\/verify/);
  assert.doesNotMatch(authSource, /password\s*:/);
});

test("signed-in users have a top-right account menu and sign-out action", () => {
  assert.match(indexSource, /id="accountMenuWrap"/);
  assert.match(indexSource, /id="accountMenu"/);
  assert.match(indexSource, /id="signOutBtn"/);
  assert.match(indexSource, /class="account-menu-email"/);
});

test("Terms acceptance is a versioned post-login gate rather than a repeated sign-in checkbox", () => {
  assert.doesNotMatch(indexSource, /id="authTermsConsent"/);
  assert.match(indexSource, /id="termsAcceptanceOverlay"/);
  assert.match(indexSource, /id="acceptCurrentTermsBtn"/);
  assert.match(indexSource, /id="declineCurrentTermsBtn"/);
  assert.match(appSource, /currentTermsVersion = terms\.currentVersion/);
  assert.match(appSource, /acceptCurrentTerms\(currentTermsVersion, "existing-account"\)/);
  assert.doesNotMatch(authSource, /PENDING_TERMS_KEY|rememberTermsConsent|completePendingTermsAcceptance/);
});

test("Terms acceptance keeps the consent switch compact without covering its label", () => {
  assert.match(
    stylesSource,
    /\.auth-card \.auth-legal-consent input\[type="checkbox"\]\s*\{[\s\S]*?flex:\s*0 0 36px;[\s\S]*?height:\s*20px;[\s\S]*?width:\s*36px;/
  );
  assert.doesNotMatch(stylesSource, /\.auth-card \.auth-legal-consent input\s*\{[^}]*width:\s*18px/);
});

test("Terms acceptance is append-only in Supabase and enforced before account data", () => {
  assert.match(legalMigration, /create table if not exists public\.legal_documents/);
  assert.match(legalMigration, /create table if not exists public\.legal_acceptances/);
  assert.match(legalMigration, /unique \(user_id, document_id\)/);
  assert.match(legalMigration, /enable row level security/);
  assert.match(legalMigration, /auth\.uid\(\) = user_id/);
  assert.match(legalMigration, /revoke update, delete/);
  assert.match(workerSource, /\/rest\/v1\/legal_documents/);
  assert.match(workerSource, /\/rest\/v1\/legal_acceptances/);
  assert.match(workerSource, /TERMS_ACCEPTANCE_REQUIRED/);
  assert.match(workerSource, /TERMS_ACCEPTANCE_REQUIRED[\s\S]*url\.pathname === "\/api\/account"/);
});

test("sign-out clears the local session before remote logout and returns to sign-in", async () => {
  const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const signOutSource = authSource.match(/export async function signOut\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(signOutSource.indexOf("clearSession()") < signOutSource.indexOf("supabaseFetch"));
  assert.match(signOutSource, /keepalive:\s*true/);
  assert.match(appSource, /location\.replace\("\/signin"\)/);
});

test("deck APIs verify bearer identity and enforce ownership", () => {
  assert.match(workerSource, /AUTH_ENABLED/);
  assert.match(workerSource, /function accountsEnabled/);
  assert.match(workerSource, /env\.AUTH_ENABLED \|\| "true"/);
  assert.match(workerSource, /Accounts are not enabled yet/);
  assert.match(workerSource, /\/auth\/v1\/user/);
  assert.match(workerSource, /Authorization/);
  assert.match(workerSource, /WHERE id = \? AND owner_id = \?/);
  assert.match(workerSource, /hyslides_user_profiles/);
  assert.match(workerSource, /hyslides_decks/);
});

test("deck-specific editor routes safely bootstrap through the public editor shell", () => {
  assert.match(workerSource, /\/\^\\\/decks\\\/\[\^\/\]\+\\\/edit\$\//);
  assert.match(workerSource, /return serveAsset\("\/index\.html"\)/);
  assert.match(storageSource, /history\.replaceState\(null, "", `\/decks\//);
});

test("clean public routes replace the legacy product path", () => {
  assert.match(workerSource, /url\.pathname === "\/signin"/);
  assert.match(workerSource, /url\.pathname === "\/terms"/);
  assert.match(workerSource, /Response\.redirect\(new URL\("\/signin", url\), 308\)/);
  assert.doesNotMatch(indexSource, /\/hyslides\//);
});

test("clean routes can fetch the compiled application shell in production", () => {
  assert.match(viteSource, /assets:\s*\{\s*binding:\s*"ASSETS"/);
  assert.match(workerSource, /env\.ASSETS\.fetch/);
});

test("Cloudflare serves clean app routes as an SPA and reserves APIs and legacy redirects for the Worker", async () => {
  assert.match(viteSource, /not_found_handling:\s*"single-page-application"/);
  assert.match(viteSource, /run_worker_first:\s*\[[\s\S]*"\/api\/\*"[\s\S]*"\/hyslides\/\*"/);

  const buildPlugin = await readFile(new URL("../build/sites-vite-plugin.ts", import.meta.url), "utf8");
  assert.doesNotMatch(buildPlugin, /\.\.\.legacyOutputDirectories/);
});

test("signed-in decks receive account-specific routes and browser migration", () => {
  assert.match(storageSource, /cloudMigration:/);
  assert.match(storageSource, /\/api\/decks/);
  assert.match(storageSource, /\/decks\/\$\{encodeURIComponent\(deckId\)\}\/edit/);
  assert.match(storageSource, /cloud migration failed/);
  assert.match(indexSource, /href="\/styles\.css"/);
  assert.match(indexSource, /src="\/src\/app\.js"/);
});
