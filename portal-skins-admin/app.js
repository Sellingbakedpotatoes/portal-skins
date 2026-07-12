const CONFIG_KEY = "cpgs-portal-skins-admin-config";
const TOKEN_KEY = "cpgs-portal-skins-admin-token";

const state = {
  skins: [],
  entitlementsDoc: null,
  entitlementsSha: "",
  selectedUuid: "",
  selectedIds: new Set(),
  loaded: false,
  dirty: false,
};

const els = {
  statusPill: document.querySelector("#statusPill"),
  tokenInput: document.querySelector("#tokenInput"),
  ownerInput: document.querySelector("#ownerInput"),
  repoInput: document.querySelector("#repoInput"),
  branchInput: document.querySelector("#branchInput"),
  skinsPathInput: document.querySelector("#skinsPathInput"),
  entitlementsPathInput: document.querySelector("#entitlementsPathInput"),
  rememberTokenInput: document.querySelector("#rememberTokenInput"),
  loadButton: document.querySelector("#loadButton"),
  clearTokenButton: document.querySelector("#clearTokenButton"),
  playerSearchInput: document.querySelector("#playerSearchInput"),
  uuidInput: document.querySelector("#uuidInput"),
  openPlayerButton: document.querySelector("#openPlayerButton"),
  playerList: document.querySelector("#playerList"),
  playerCountText: document.querySelector("#playerCountText"),
  editorTitle: document.querySelector("#editor-title"),
  editorSubtitle: document.querySelector("#editorSubtitle"),
  skinSearchInput: document.querySelector("#skinSearchInput"),
  skinList: document.querySelector("#skinList"),
  selectAllButton: document.querySelector("#selectAllButton"),
  clearAllButton: document.querySelector("#clearAllButton"),
  saveButton: document.querySelector("#saveButton"),
  removePlayerButton: document.querySelector("#removePlayerButton"),
  selectedCountText: document.querySelector("#selectedCountText"),
  dirtyText: document.querySelector("#dirtyText"),
  logOutput: document.querySelector("#logOutput"),
};

init();

function init() {
  restoreConfig();
  bindEvents();
  renderAll();
}

function bindEvents() {
  els.loadButton.addEventListener("click", loadFromGitHub);
  els.clearTokenButton.addEventListener("click", clearToken);
  els.openPlayerButton.addEventListener("click", openUuidFromInput);
  els.playerSearchInput.addEventListener("input", renderPlayers);
  els.skinSearchInput.addEventListener("input", renderSkins);
  els.selectAllButton.addEventListener("click", selectAllSkins);
  els.clearAllButton.addEventListener("click", clearAllSkins);
  els.saveButton.addEventListener("click", saveChanges);
  els.removePlayerButton.addEventListener("click", removeSelectedPlayer);

  for (const input of [
    els.ownerInput,
    els.repoInput,
    els.branchInput,
    els.skinsPathInput,
    els.entitlementsPathInput,
  ]) {
    input.addEventListener("change", saveConfig);
  }

  els.rememberTokenInput.addEventListener("change", persistToken);
  els.tokenInput.addEventListener("change", persistToken);
}

function restoreConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
    if (saved.owner) els.ownerInput.value = saved.owner;
    if (saved.repo) els.repoInput.value = saved.repo;
    if (saved.branch) els.branchInput.value = saved.branch;
    if (saved.skinsPath) els.skinsPathInput.value = saved.skinsPath;
    if (saved.entitlementsPath) els.entitlementsPathInput.value = saved.entitlementsPath;
  } catch (error) {
    log("Could not restore saved config. Using defaults.");
  }

  const rememberedToken = localStorage.getItem(TOKEN_KEY);
  if (rememberedToken) {
    els.tokenInput.value = rememberedToken;
    els.rememberTokenInput.checked = true;
  } else {
    els.tokenInput.value = sessionStorage.getItem(TOKEN_KEY) || "";
  }
}

function saveConfig() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config()));
}

function persistToken() {
  const token = els.tokenInput.value.trim();
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  if (!token) return;
  if (els.rememberTokenInput.checked) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
  }
}

function clearToken() {
  els.tokenInput.value = "";
  els.rememberTokenInput.checked = false;
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  log("Token forgotten on this device.");
}

function config() {
  return {
    owner: els.ownerInput.value.trim(),
    repo: els.repoInput.value.trim(),
    branch: els.branchInput.value.trim() || "main",
    skinsPath: cleanPath(els.skinsPathInput.value),
    entitlementsPath: cleanPath(els.entitlementsPathInput.value),
  };
}

async function loadFromGitHub() {
  saveConfig();
  persistToken();
  setBusy(true);
  setStatus("Loading", "");
  try {
    const cfg = config();
    assertConfig(cfg);
    const [skinsFile, entitlementsFile] = await Promise.all([
      getContent(cfg.skinsPath),
      getContent(cfg.entitlementsPath),
    ]);

    const skinsDoc = JSON.parse(skinsFile.text);
    const entitlementsDoc = JSON.parse(entitlementsFile.text || "{}");

    state.skins = extractSkins(skinsDoc);
    state.entitlementsDoc = normalizeEntitlementsDocument(entitlementsDoc);
    state.entitlementsSha = entitlementsFile.sha;
    state.selectedUuid = "";
    state.selectedIds = new Set();
    state.loaded = true;
    state.dirty = false;

    setStatus("Loaded", "good");
    log(`Loaded ${state.skins.length} portal skins and ${players().length} player entries.`);
    renderAll();
  } catch (error) {
    setStatus("Load failed", "bad");
    logError(error);
  } finally {
    setBusy(false);
  }
}

async function saveChanges() {
  if (!state.loaded || !state.selectedUuid) return;
  setBusy(true);
  try {
    const container = grantContainer();
    container[state.selectedUuid] = selectedIdsInDisplayOrder();
    sortGrantContainer(container);

    const cfg = config();
    const content = JSON.stringify(state.entitlementsDoc, null, 2) + "\n";
    const result = await putContent(cfg.entitlementsPath, content, state.entitlementsSha, `Update portal skins for ${state.selectedUuid}`);
    state.entitlementsSha = result.content && result.content.sha ? result.content.sha : state.entitlementsSha;
    state.dirty = false;

    setStatus("Saved", "good");
    log(`Saved ${state.selectedIds.size} portal skin grants for ${state.selectedUuid}.`);
    renderAll();
  } catch (error) {
    setStatus("Save failed", "bad");
    logError(error);
  } finally {
    setBusy(false);
  }
}

async function removeSelectedPlayer() {
  if (!state.loaded || !state.selectedUuid) return;
  const uuid = state.selectedUuid;
  const ok = window.confirm(`Remove ${uuid} from portal_entitlements.json?`);
  if (!ok) return;

  setBusy(true);
  try {
    const container = grantContainer();
    delete container[uuid];
    sortGrantContainer(container);

    const cfg = config();
    const content = JSON.stringify(state.entitlementsDoc, null, 2) + "\n";
    const result = await putContent(cfg.entitlementsPath, content, state.entitlementsSha, `Remove portal skin grants for ${uuid}`);
    state.entitlementsSha = result.content && result.content.sha ? result.content.sha : state.entitlementsSha;
    state.selectedUuid = "";
    state.selectedIds = new Set();
    state.dirty = false;

    setStatus("Saved", "good");
    log(`Removed ${uuid}.`);
    renderAll();
  } catch (error) {
    setStatus("Save failed", "bad");
    logError(error);
  } finally {
    setBusy(false);
  }
}

function openUuidFromInput() {
  if (!state.loaded) {
    log("Load the repo JSON first.");
    return;
  }
  const uuid = normalizeUuid(els.uuidInput.value);
  if (!uuid) {
    log("That UUID does not look valid.");
    return;
  }
  openPlayer(uuid);
}

function openPlayer(uuid) {
  const container = grantContainer();
  if (!Array.isArray(container[uuid])) {
    container[uuid] = [];
    state.dirty = true;
  }
  state.selectedUuid = uuid;
  state.selectedIds = new Set(container[uuid].filter((id) => typeof id === "string"));
  els.uuidInput.value = uuid;
  renderAll();
}

function selectAllSkins() {
  state.selectedIds = new Set(state.skins.map((skin) => skin.id));
  markDirty();
}

function clearAllSkins() {
  state.selectedIds = new Set();
  markDirty();
}

function toggleSkin(id, checked) {
  if (checked) {
    state.selectedIds.add(id);
  } else {
    state.selectedIds.delete(id);
  }
  markDirty();
}

function markDirty() {
  state.dirty = true;
  renderAll();
}

function renderAll() {
  renderPlayers();
  renderEditor();
}

function renderPlayers() {
  const list = players();
  const query = els.playerSearchInput.value.trim().toLowerCase();
  const filtered = query ? list.filter((player) => player.uuid.includes(query)) : list;

  els.playerCountText.textContent = state.loaded
    ? `${list.length} player entries`
    : "Load the repo to begin.";

  els.playerList.innerHTML = "";
  if (!state.loaded) {
    els.playerList.innerHTML = `<div class="empty-state">Nothing loaded yet.</div>`;
    return;
  }
  if (filtered.length === 0) {
    els.playerList.innerHTML = `<div class="empty-state">No matching players.</div>`;
    return;
  }

  for (const player of filtered) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `player-row${player.uuid === state.selectedUuid ? " active" : ""}`;
    button.innerHTML = `<code></code><span></span>`;
    button.querySelector("code").textContent = player.uuid;
    button.querySelector("span").textContent = `${player.count} skin${player.count === 1 ? "" : "s"}`;
    button.addEventListener("click", () => openPlayer(player.uuid));
    els.playerList.appendChild(button);
  }
}

function renderEditor() {
  const hasPlayer = Boolean(state.loaded && state.selectedUuid);
  els.editorTitle.textContent = hasPlayer ? state.selectedUuid : "No Player Selected";
  els.editorSubtitle.textContent = hasPlayer
    ? "Check or uncheck portal skins for this UUID."
    : "Choose a UUID or add a new one.";
  els.skinSearchInput.disabled = !hasPlayer;
  els.selectAllButton.disabled = !hasPlayer;
  els.clearAllButton.disabled = !hasPlayer;
  els.removePlayerButton.disabled = !hasPlayer;
  els.saveButton.disabled = !hasPlayer || !state.dirty;

  const selectedCount = state.selectedIds.size;
  els.selectedCountText.textContent = `${selectedCount} selected`;
  els.dirtyText.textContent = state.dirty ? "Unsaved changes" : "No unsaved changes";

  renderSkins();
}

function renderSkins() {
  els.skinList.innerHTML = "";
  if (!state.loaded) {
    els.skinList.innerHTML = `<div class="empty-state">Load portal_skins.json first.</div>`;
    return;
  }
  if (!state.selectedUuid) {
    els.skinList.innerHTML = `<div class="empty-state">Select a player to edit grants.</div>`;
    return;
  }

  const knownIds = new Set(state.skins.map((skin) => skin.id));
  const unknownSelected = Array.from(state.selectedIds)
    .filter((id) => !knownIds.has(id))
    .map((id) => ({ id, name: id, mode: "unknown", colors: [] }));
  const options = state.skins.concat(unknownSelected);
  const query = els.skinSearchInput.value.trim().toLowerCase();
  const filtered = query
    ? options.filter((skin) => `${skin.name} ${skin.id}`.toLowerCase().includes(query))
    : options;

  if (filtered.length === 0) {
    els.skinList.innerHTML = `<div class="empty-state">No matching skins.</div>`;
    return;
  }

  for (const skin of filtered) {
    els.skinList.appendChild(skinCard(skin));
  }
}

function skinCard(skin) {
  const label = document.createElement("label");
  label.className = "skin-card";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = state.selectedIds.has(skin.id);
  input.addEventListener("change", () => toggleSkin(skin.id, input.checked));

  const body = document.createElement("div");
  const title = document.createElement("div");
  title.className = "skin-title";
  title.textContent = skin.name || skin.id;
  if (skin.mode === "rainbow" || skin.mode === "unknown") {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = skin.mode;
    title.appendChild(badge);
  }

  const id = document.createElement("div");
  id.className = "skin-id";
  id.textContent = skin.id;

  body.append(title, id);

  if (skin.colors && skin.colors.length) {
    const swatches = document.createElement("div");
    swatches.className = "swatches";
    for (const color of skin.colors) {
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.title = color;
      swatch.style.background = color;
      swatches.appendChild(swatch);
    }
    body.appendChild(swatches);
  }

  label.append(input, body);
  return label;
}

function players() {
  if (!state.loaded) return [];
  const container = grantContainer();
  return Object.entries(container)
    .filter(([key, value]) => normalizeUuid(key) && Array.isArray(value))
    .map(([uuid, ids]) => ({ uuid: normalizeUuid(uuid), count: ids.length }))
    .sort((a, b) => a.uuid.localeCompare(b.uuid));
}

function selectedIdsInDisplayOrder() {
  const ordered = [];
  for (const skin of state.skins) {
    if (state.selectedIds.has(skin.id)) ordered.push(skin.id);
  }
  const knownIds = new Set(state.skins.map((skin) => skin.id));
  for (const id of Array.from(state.selectedIds).sort()) {
    if (!knownIds.has(id)) ordered.push(id);
  }
  return ordered;
}

function extractSkins(doc) {
  let entries = [];
  if (Array.isArray(doc)) {
    entries = doc;
  } else if (doc && Array.isArray(doc.skins)) {
    entries = doc.skins;
  } else if (doc && typeof doc === "object") {
    entries = Object.entries(doc)
      .filter(([, value]) => value && typeof value === "object")
      .map(([key, value]) => ({ id: key, ...value }));
  }

  return entries
    .map((skin) => ({
      id: String(skin.id || skin.skinId || "").trim(),
      name: String(skin.name || skin.displayName || skin.id || skin.skinId || "Unnamed").trim(),
      mode: String(skin.mode || "").trim().toLowerCase(),
      colors: Array.isArray(skin.colors)
        ? skin.colors.filter((value) => typeof value === "string")
        : legacyColors(skin),
    }))
    .filter((skin) => skin.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function legacyColors(skin) {
  const colors = [];
  if (typeof skin.startColor === "string") colors.push(skin.startColor);
  if (typeof skin.endColor === "string") colors.push(skin.endColor);
  return colors;
}

function normalizeEntitlementsDocument(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return {};
  }
  const container = findGrantContainer(doc);
  for (const [key, value] of Object.entries(container)) {
    const normalized = normalizeUuid(key);
    if (normalized && normalized !== key) {
      delete container[key];
      container[normalized] = Array.isArray(value) ? value : [];
    }
  }
  sortGrantContainer(container);
  return doc;
}

function grantContainer() {
  return findGrantContainer(state.entitlementsDoc || {});
}

function findGrantContainer(doc) {
  for (const key of ["entitlements", "grants", "players"]) {
    if (doc[key] && typeof doc[key] === "object" && !Array.isArray(doc[key])) {
      return doc[key];
    }
  }
  return doc;
}

function sortGrantContainer(container) {
  const nonGrantEntries = [];
  const grantEntries = [];
  for (const [key, value] of Object.entries(container)) {
    const normalized = normalizeUuid(key);
    if (normalized && Array.isArray(value)) {
      grantEntries.push([normalized, cleanSkinIds(value)]);
    } else {
      nonGrantEntries.push([key, value]);
    }
  }

  for (const key of Object.keys(container)) {
    delete container[key];
  }
  for (const [key, value] of nonGrantEntries) {
    container[key] = value;
  }
  for (const [key, value] of grantEntries.sort((a, b) => a[0].localeCompare(b[0]))) {
    container[key] = value;
  }
}

function cleanSkinIds(value) {
  const seen = new Set();
  const ids = [];
  for (const id of value) {
    if (typeof id !== "string") continue;
    const clean = id.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    ids.push(clean);
  }
  return ids;
}

async function getContent(path) {
  const cfg = config();
  const response = await fetch(apiUrl(path, false), {
    headers: githubHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Could not load ${path}: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return {
    sha: data.sha,
    text: decodeBase64(data.content || ""),
  };
}

async function putContent(path, text, sha, message) {
  const body = {
    message,
    content: encodeBase64(text),
    sha,
    branch: config().branch,
  };
  const response = await fetch(apiUrl(path), {
    method: "PUT",
    headers: githubHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await safeResponseText(response);
    throw new Error(`Could not save ${path}: ${response.status} ${response.statusText}\n${detail}`);
  }
  return response.json();
}

function apiUrl(path, includeRef = true) {
  const cfg = config();
  const clean = cleanPath(path).split("/").map(encodeURIComponent).join("/");
  const base = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${clean}`;
  return includeRef ? `${base}?ref=${encodeURIComponent(cfg.branch)}` : base;
}

function githubHeaders(extra = {}) {
  const token = els.tokenInput.value.trim();
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function decodeBase64(content) {
  const binary = atob(content.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function safeResponseText(response) {
  try {
    return await response.text();
  } catch (error) {
    return "";
  }
}

function normalizeUuid(value) {
  const raw = String(value || "").trim().toLowerCase();
  const compact = raw.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/.test(compact)) {
    return "";
  }
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function cleanPath(value) {
  return String(value || "").trim().replace(/^\/+/, "");
}

function assertConfig(cfg) {
  for (const key of ["owner", "repo", "branch", "skinsPath", "entitlementsPath"]) {
    if (!cfg[key]) {
      throw new Error(`Missing ${key}.`);
    }
  }
}

function setBusy(busy) {
  for (const button of document.querySelectorAll("button")) {
    button.disabled = busy || shouldDisableButton(button);
  }
  for (const input of document.querySelectorAll("input")) {
    input.disabled = busy && input.id !== "tokenInput";
  }
}

function shouldDisableButton(button) {
  if (button === els.saveButton) return !state.loaded || !state.selectedUuid || !state.dirty;
  if (button === els.selectAllButton || button === els.clearAllButton || button === els.removePlayerButton) {
    return !state.loaded || !state.selectedUuid;
  }
  return false;
}

function setStatus(text, kind) {
  els.statusPill.textContent = text;
  els.statusPill.className = `status ${kind || ""}`.trim();
}

function log(message) {
  const time = new Date().toLocaleTimeString();
  els.logOutput.textContent = `[${time}] ${message}\n` + els.logOutput.textContent;
}

function logError(error) {
  console.error(error);
  log(error && error.message ? error.message : String(error));
}
