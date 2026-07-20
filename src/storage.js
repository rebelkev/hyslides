const DB_NAME = "hyslides";
const DB_VERSION = 1;
const DECK_STORE = "decks";
const META_STORE = "meta";
const CURRENT_KEY = "currentDeckId";

export async function saveDeck(deck) {
  const db = await openDb();
  const deckToSave = {
    ...deck,
    updatedAt: new Date().toISOString(),
  };
  await put(db, DECK_STORE, deckToSave);
  await put(db, META_STORE, { key: CURRENT_KEY, value: deckToSave.id });
  return deckToSave;
}

export async function loadDecks() {
  const db = await openDb();
  return getAll(db, DECK_STORE);
}

export async function loadCurrentDeck() {
  const db = await openDb();
  const meta = await get(db, META_STORE, CURRENT_KEY);
  if (meta?.value) {
    const deck = await get(db, DECK_STORE, meta.value);
    if (deck) {
      return deck;
    }
  }
  const decks = await getAll(db, DECK_STORE);
  return decks.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] || null;
}

export async function deleteDeck(deckId) {
  const db = await openDb();
  await remove(db, DECK_STORE, deckId);
}

export function exportDeckJson(deck) {
  const blob = new Blob([JSON.stringify(deck, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, `${slug(deck.title)}.hyslides.json`);
}

export async function importDeckJson(file) {
  return JSON.parse(await file.text());
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function slug(value) {
  return String(value || "deck")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72) || "deck";
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DECK_STORE)) {
        const deckStore = db.createObjectStore(DECK_STORE, { keyPath: "id" });
        deckStore.createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(db, storeName, mode = "readonly") {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function put(db, storeName, value) {
  return requestToPromise(tx(db, storeName, "readwrite").put(value));
}

function get(db, storeName, key) {
  return requestToPromise(tx(db, storeName).get(key));
}

function getAll(db, storeName) {
  return requestToPromise(tx(db, storeName).getAll());
}

function remove(db, storeName, key) {
  return requestToPromise(tx(db, storeName, "readwrite").delete(key));
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
