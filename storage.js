// storage.js
// シングルプレイ用ワールド(最大5件)とマルチプレイのルーム接続履歴をlocalStorageに永続化する。

const STORAGE_KEYS = { WORLDS: 'aicivgame_worlds', ROOMS: 'aicivgame_rooms' };
const MAX_WORLDS = 5;

function loadWorlds() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.WORLDS)) || [];
  } catch (e) {
    return [];
  }
}

function saveWorlds(worlds) {
  localStorage.setItem(STORAGE_KEYS.WORLDS, JSON.stringify(worlds));
}

function createWorld(name) {
  const worlds = loadWorlds();
  if (worlds.length >= MAX_WORLDS) return null;
  const world = {
    id: 'w_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    name: name || `ワールド${worlds.length + 1}`,
    seed: Math.floor(Math.random() * 1000000),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    characters: [],
  };
  worlds.push(world);
  saveWorlds(worlds);
  return world;
}

function deleteWorld(id) {
  saveWorlds(loadWorlds().filter((w) => w.id !== id));
}

function getWorld(id) {
  return loadWorlds().find((w) => w.id === id) || null;
}

function updateWorldData(id, data) {
  const worlds = loadWorlds();
  const idx = worlds.findIndex((w) => w.id === id);
  if (idx === -1) return;
  worlds[idx] = Object.assign(worlds[idx], data, { updatedAt: Date.now() });
  saveWorlds(worlds);
}

function loadRoomHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.ROOMS)) || [];
  } catch (e) {
    return [];
  }
}

function saveRoomHistory(rooms) {
  localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
}

function recordRoom(key, name, role) {
  const rooms = loadRoomHistory();
  const idx = rooms.findIndex((r) => r.key === key);
  const entry = { key, name: name || `ルーム${key}`, role, lastJoined: Date.now() };
  if (idx === -1) rooms.unshift(entry);
  else rooms[idx] = Object.assign(rooms[idx], entry);
  saveRoomHistory(rooms.slice(0, 10));
}

function deleteRoomHistory(key) {
  saveRoomHistory(loadRoomHistory().filter((r) => r.key !== key));
}
