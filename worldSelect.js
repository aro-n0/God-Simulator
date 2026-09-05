// worldSelect.js
// 起動時のワールド選択/作成画面と、マルチプレイのルーム接続履歴タブを制御する。

window.roomManager = new RoomManager();

function hideWorldSelect() {
  const el = document.getElementById('world-select-screen');
  if (el) el.style.display = 'none';
}

function showWorldSelect() {
  const el = document.getElementById('world-select-screen');
  if (el) el.style.display = 'flex';
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : s;
  return d.innerHTML;
}

function renderWorldList() {
  const listEl = document.getElementById('ws-world-list');
  const worlds = loadWorlds();
  listEl.innerHTML = '';
  if (worlds.length === 0) {
    listEl.innerHTML = '<p class="ws-empty">まだワールドがありません</p>';
  }
  worlds.forEach((w) => {
    const row = document.createElement('div');
    row.className = 'ws-item';
    const dt = new Date(w.updatedAt).toLocaleString('ja-JP');
    row.innerHTML =
      '<div class="ws-item-info">' +
      `<div class="ws-item-name">${escapeHtml(w.name)}</div>` +
      `<div class="ws-item-meta">住民 ${w.characters.length}人 ・ 更新 ${dt}</div>` +
      '</div>' +
      '<div class="ws-item-actions">' +
      `<button class="ws-play-btn" data-id="${w.id}">プレイ</button>` +
      `<button class="ws-delete-btn" data-id="${w.id}">削除</button>` +
      '</div>';
    listEl.appendChild(row);
  });

  listEl.querySelectorAll('.ws-play-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const world = getWorld(btn.dataset.id);
      if (world) {
        hideWorldSelect();
        game = new Game({ seed: world.seed, characters: world.characters, worldId: world.id });
      }
    });
  });
  listEl.querySelectorAll('.ws-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (confirm('このワールドを削除しますか？')) {
        deleteWorld(btn.dataset.id);
        renderWorldList();
      }
    });
  });

  const createBtn = document.getElementById('ws-btn-create-world');
  createBtn.disabled = worlds.length >= MAX_WORLDS;
  createBtn.textContent = worlds.length >= MAX_WORLDS ? 'ワールド上限(5)に達しています' : 'ワールドを作成';
}

function renderRoomList() {
  const listEl = document.getElementById('ws-room-list');
  const rooms = loadRoomHistory();
  listEl.innerHTML = '';
  if (rooms.length === 0) {
    listEl.innerHTML = '<p class="ws-empty">接続履歴はありません</p>';
  }
  rooms.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'ws-item';
    const dt = new Date(r.lastJoined).toLocaleString('ja-JP');
    row.innerHTML =
      '<div class="ws-item-info">' +
      `<div class="ws-item-name">${escapeHtml(r.name)} <span class="ws-room-key">#${r.key}</span></div>` +
      `<div class="ws-item-meta">${r.role === 'host' ? '作成者' : '参加者'} ・ 最終接続 ${dt}</div>` +
      '</div>' +
      '<div class="ws-item-actions">' +
      `<button class="ws-reconnect-btn" data-key="${r.key}" data-name="${escapeHtml(r.name)}">再接続</button>` +
      `<button class="ws-delete-room-btn" data-key="${r.key}">削除</button>` +
      '</div>';
    listEl.appendChild(row);
  });

  listEl.querySelectorAll('.ws-reconnect-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      hideWorldSelect();
      window.roomManager.joinRoom(btn.dataset.key, btn.dataset.name);
    });
  });
  listEl.querySelectorAll('.ws-delete-room-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      deleteRoomHistory(btn.dataset.key);
      renderRoomList();
    });
  });
}

// ゲスト側: ホストからinitデータを受信した時点でゲームを構築する（room.jsから呼ばれる）
window.onMultiplayerInit = function (seed, characters) {
  hideWorldSelect();
  game = new Game({ remoteInit: { seed, characters } });
};

window.addEventListener('DOMContentLoaded', () => {
  renderWorldList();
  renderRoomList();

  document.querySelectorAll('.ws-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ws-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.ws-tab-content').forEach((c) => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('ws-tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  document.getElementById('ws-btn-create-world').addEventListener('click', () => {
    const nameInput = document.getElementById('ws-new-world-name');
    const world = createWorld(nameInput.value.trim());
    if (!world) {
      alert('ワールドは最大5個までです');
      return;
    }
    nameInput.value = '';
    renderWorldList();
  });

  document.getElementById('ws-btn-create-room').addEventListener('click', () => {
    hideWorldSelect();
    game = new Game({}); // 新規ランダムワールドでホスト開始（シングルプレイ保存の対象外）
    window.roomManager.createRoom('ルーム' + Date.now().toString().slice(-4));
  });

  document.getElementById('ws-btn-join-room').addEventListener('click', () => {
    const key = document.getElementById('ws-input-room-key').value.trim();
    if (!key) return;
    hideWorldSelect();
    window.roomManager.joinRoom(key, 'ルーム' + key);
  });
});
