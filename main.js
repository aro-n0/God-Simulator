// main.js
// Canvasセットアップ、ゲームループ、マップ/キャラ描画、キャラクリエイトUI・ライブラリ・
// キャラ詳細モーダルの結線。

let game;

class Game {
  // config:
  //   { seed, characters(フル復元用配列), worldId }  … シングルプレイ(セーブ有)
  //   { remoteInit: { seed, characters(paramsのみ) } } … マルチプレイ ゲスト(観測専用)
  //   {} … マルチプレイ ホスト開始（新規ランダムワールド、セーブなし）
  constructor(config) {
    config = config || {};
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this._resizeCanvas();
    window.addEventListener('resize', () => this._resizeCanvas());

    this.worldId = config.worldId || null;
    this.isObserverMode = false; // trueならゲストとして参加中（自前シミュレーションはしない）
    this.camera = new Camera(this.canvas);
    this.camera.onTap = (x, y) => this._handleTap(x, y);
    this.canvas.addEventListener('click', (e) => {
      if (this.camera._moved) return;
      this._handleTap(e.clientX, e.clientY);
    });

    // 簡易天候システム（雨判定のみ。キャラの苦手変化トリガーに使用）
    this.isRaining = false;
    this._weatherTimer = 15 + Math.random() * 20;

    this._modalChar = null;
    this._modalRefreshCounter = 0;
    this._bindModal();

    if (config.remoteInit) {
      this.seed = config.remoteInit.seed;
      this.map = new GameMap(this.seed);
      this.characters = config.remoteInit.characters.map((p) => {
        const c = new Character(p, this.map, 50, 50);
        c.isRemoteMirror = true;
        return c;
      });
      this.isObserverMode = true;
      const panel = document.getElementById('creator-panel');
      if (panel) panel.classList.add('disabled');
    } else {
      this.seed = config.seed != null ? config.seed : Math.floor(Math.random() * 1000000);
      this.map = new GameMap(this.seed);
      this.characters = [];
      if (config.characters && config.characters.length) {
        for (const saved of config.characters) {
          this.characters.push(new Character(saved.params, this.map, saved.x, saved.y, saved));
        }
      }
    }

    // ワールド選択画面で生成済みのグローバルRoomManagerに自身を紐付ける
    this.room = window.roomManager || null;
    if (this.room) this.room.attachGame(this);

    this._bindCharacterCreator();
    this._lastTime = performance.now();
    requestAnimationFrame((t) => this._loop(t));

    if (this.worldId) this._startAutosave();
  }

  _startAutosave() {
    this._autosaveTimer = setInterval(() => this._saveWorld(), 5000);
    window.addEventListener('beforeunload', () => this._saveWorld());
  }

  _saveWorld() {
    if (!this.worldId || this.isObserverMode) return;
    updateWorldData(this.worldId, {
      seed: this.seed,
      characters: this.characters.map((c) => c.fullSerialize()),
    });
  }

  _resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  // ============ キャラクリエイトUI ============
  _bindCharacterCreator() {
    const nameInput = document.getElementById('input-char-name');
    const promptInput = document.getElementById('input-char-prompt');
    const previewCanvas = document.getElementById('preview-canvas');
    const previewCtx = previewCanvas.getContext('2d');
    previewCtx.imageSmoothingEnabled = false;

    const skinSwatchContainer = document.getElementById('skin-swatches');
    const hairSwatchContainer = document.getElementById('hair-swatches');
    const clothesColorInput = document.getElementById('override-clothes-color');
    const hatCheckbox = document.getElementById('override-hat');

    let appearance = randomizeAppearance();

    const renderSwatches = (container, colors, currentColor, onPick) => {
      container.innerHTML = '';
      colors.forEach((color) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'swatch' + (color === currentColor ? ' active' : '');
        btn.style.background = color;
        btn.addEventListener('click', () => onPick(color));
        container.appendChild(btn);
      });
    };

    const refreshPreview = () => {
      clothesColorInput.value = appearance.clothesColor;
      hatCheckbox.checked = appearance.hasHat;
      renderSwatches(skinSwatchContainer, NATURAL_SKIN_TONES, appearance.skinTone, (c) => {
        appearance.skinTone = c;
        refreshPreview();
      });
      renderSwatches(hairSwatchContainer, NATURAL_HAIR_COLORS, appearance.hairColor, (c) => {
        appearance.hairColor = c;
        refreshPreview();
      });

      const sprite = buildSpriteCanvas(appearance);
      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      previewCtx.drawImage(sprite, 0, 0, previewCanvas.width, previewCanvas.height);
    };

    clothesColorInput.addEventListener('input', () => {
      appearance.clothesColor = clothesColorInput.value;
      refreshPreview();
    });
    hatCheckbox.addEventListener('change', () => {
      appearance.hasHat = hatCheckbox.checked;
      refreshPreview();
    });
    document.getElementById('btn-randomize').addEventListener('click', () => {
      appearance = randomizeAppearance();
      refreshPreview();
    });

    refreshPreview();

    const buildFullParams = () => {
      const stats = deriveStatsFromPrompt(nameInput.value, promptInput.value);
      return Object.assign({}, stats, appearance);
    };

    document.getElementById('btn-spawn').addEventListener('click', () => {
      if (this.isObserverMode) {
        alert('観測モード（ゲスト参加中）はキャラクターを作成できません');
        return;
      }
      this.spawnCharacter(buildFullParams());
      nameInput.value = '';
      promptInput.value = '';
    });

    document.getElementById('btn-save-library').addEventListener('click', () => {
      saveToLibrary(buildFullParams());
      this._renderLibrary();
    });

    this._renderLibrary();
  }

  _renderLibrary() {
    const listEl = document.getElementById('library-list');
    if (!listEl) return;
    const lib = loadLibrary();
    listEl.innerHTML = '';
    if (lib.length === 0) {
      listEl.innerHTML = '<p class="ws-empty">ライブラリは空です</p>';
      return;
    }
    lib.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'lib-item';
      row.innerHTML =
        `<span class="lib-item-name">${entry.name}</span>` +
        `<button class="lib-spawn-btn" data-id="${entry.libId}">配置</button>` +
        `<button class="lib-delete-btn" data-id="${entry.libId}">削除</button>`;
      listEl.appendChild(row);
    });
    listEl.querySelectorAll('.lib-spawn-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.isObserverMode) {
          alert('観測モードでは配置できません');
          return;
        }
        const entry = loadLibrary().find((e) => e.libId === btn.dataset.id);
        if (entry) this.spawnCharacter(Object.assign({}, entry));
      });
    });
    listEl.querySelectorAll('.lib-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        deleteFromLibrary(btn.dataset.id);
        this._renderLibrary();
      });
    });
  }

  spawnCharacter(params) {
    let x, y, tries = 0;
    do {
      x = 5 + Math.random() * (this.map.width - 10);
      y = 5 + Math.random() * (this.map.height - 10);
      tries++;
    } while (!this.map.isWalkable(x, y) && tries < 200);
    const c = new Character(Object.assign({}, params), this.map, x, y);
    this.characters.push(c);
    this._saveWorld();
  }

  applyRemoteSnapshot(chars) {
    chars.forEach((data, i) => {
      const c = this.characters[i];
      if (!c) return;
      c.x = data.x;
      c.y = data.y;
      c.state = data.state;
      c.emote = data.emote;
      c.facing = data.facing;
      c.emoteTimer = data.emote ? 3 : 0;
    });
  }

  // ============ キャラ詳細モーダル ============
  _bindModal() {
    const modal = document.getElementById('char-modal');
    if (!modal) return;
    document.getElementById('char-modal-close').addEventListener('click', () => this._closeModal());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this._closeModal();
    });
  }

  _closeModal() {
    const modal = document.getElementById('char-modal');
    if (modal) modal.classList.remove('open');
    this._modalChar = null;
  }

  _handleTap(screenX, screenY) {
    const world = this.camera.screenToWorld(screenX, screenY);
    const tileX = world.x / TILE_SIZE;
    const tileY = world.y / TILE_SIZE;
    let closest = null;
    let closestDist = Infinity;
    for (const c of this.characters) {
      const d = Math.hypot(c.x - tileX, c.y - tileY);
      if (d < 0.9 && d < closestDist) {
        closest = c;
        closestDist = d;
      }
    }
    if (closest) this._openCharacterModal(closest);
  }

  _openCharacterModal(c) {
    this._modalChar = c;
    this._refreshModal();
    document.getElementById('char-modal').classList.add('open');
  }

  _refreshModal() {
    const c = this._modalChar;
    if (!c) return;
    const spriteCanvas = document.getElementById('char-modal-sprite');
    const ctx = spriteCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);
    ctx.drawImage(c.sprite, 0, 0, spriteCanvas.width, spriteCanvas.height);

    document.getElementById('char-modal-name').textContent = c.params.name;
    document.getElementById('char-modal-affiliation').textContent = c.affiliation || '無所属';
    document.getElementById('char-modal-mood').textContent = c.getMoodText();
    document.getElementById('char-modal-job').textContent = c.params.job || 'なし';
    document.getElementById('char-modal-stats').textContent =
      `速度:${c.params.speed.toFixed(2)}  スタミナ:${Math.round(c.stamina)}  採取効率:${c.params.gatherEffMul.toFixed(2)}`;

    const likesEl = document.getElementById('char-modal-likes');
    likesEl.innerHTML = '';
    (c.params.likes || []).forEach((l) => {
      const tag = document.createElement('span');
      tag.className = 'tag tag-like';
      tag.textContent = `[好き: ${l}]`;
      likesEl.appendChild(tag);
    });

    const dislikesEl = document.getElementById('char-modal-dislikes');
    dislikesEl.innerHTML = '';
    (c.params.dislikes || []).forEach((d) => {
      const tag = document.createElement('span');
      tag.className = 'tag tag-dislike';
      tag.textContent = `[苦手: ${d}]`;
      dislikesEl.appendChild(tag);
    });
  }

  // ============ メインループ ============
  _loop(now) {
    const dt = Math.min(0.1, (now - this._lastTime) / 1000);
    this._lastTime = now;

    this._weatherTimer -= dt;
    if (this._weatherTimer <= 0) {
      this.isRaining = !this.isRaining;
      this._weatherTimer = this.isRaining ? 10 + Math.random() * 15 : 20 + Math.random() * 30;
    }

    if (!this.isObserverMode) {
      for (const c of this.characters) c.update(dt, this.isRaining);
    }

    if (this._modalChar) {
      this._modalRefreshCounter++;
      if (this._modalRefreshCounter % 15 === 0) this._refreshModal();
    }

    this._render();
    requestAnimationFrame((t) => this._loop(t));
  }

  _render() {
    const ctx = this.ctx;
    ctx.fillStyle = this.isRaining ? '#0a1420' : '#0a1a2a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const ts = TILE_SIZE * this.camera.zoom;
    const topLeft = this.camera.screenToWorld(0, 0);
    const bottomRight = this.camera.screenToWorld(this.canvas.width, this.canvas.height);
    const x0 = Math.max(0, Math.floor(topLeft.x / TILE_SIZE) - 1);
    const y0 = Math.max(0, Math.floor(topLeft.y / TILE_SIZE) - 1);
    const x1 = Math.min(this.map.width, Math.ceil(bottomRight.x / TILE_SIZE) + 1);
    const y1 = Math.min(this.map.height, Math.ceil(bottomRight.y / TILE_SIZE) + 1);

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const tile = this.map.getTile(x, y);
        if (!tile) continue;
        const screen = this.camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
        ctx.fillStyle = this._tileColor(tile);
        ctx.fillRect(Math.round(screen.x), Math.round(screen.y), Math.ceil(ts) + 1, Math.ceil(ts) + 1);
      }
    }

    for (const r of this.map.resources) {
      if (r.amount <= 0) continue;
      if (r.x < x0 || r.x > x1 || r.y < y0 || r.y > y1) continue;
      const screen = this.camera.worldToScreen(r.x * TILE_SIZE + TILE_SIZE / 2, r.y * TILE_SIZE + TILE_SIZE / 2);
      ctx.fillStyle = r.type === 'tree' ? '#1c4a20' : '#9a9a9a';
      const rad = Math.max(2, ts * 0.28);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const c of this.characters) {
      const screen = this.camera.worldToScreen(c.x * TILE_SIZE, c.y * TILE_SIZE);
      const size = ts;
      ctx.save();
      if (c.facing < 0) {
        ctx.translate(screen.x, screen.y);
        ctx.scale(-1, 1);
        ctx.drawImage(c.sprite, -size / 2, -size / 2, size, size);
      } else {
        ctx.drawImage(c.sprite, screen.x - size / 2, screen.y - size / 2, size, size);
      }
      ctx.restore();

      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = `${Math.max(9, ts * 0.35)}px 'DotGothic16', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(c.params.name, screen.x, screen.y - size / 2 - 4);

      if (c.emote && c.emoteTimer > 0) {
        const bw = ctx.measureText(c.emote).width + 12;
        const bx = screen.x - bw / 2;
        const by = screen.y - size / 2 - 24;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, bw, 18, 6);
        else ctx.rect(bx, by, bw, 18);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(c.emote, screen.x, by + 13);
      }
    }

    if (this.isRaining) this._drawRainOverlay();
  }

  _drawRainOverlay() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(80,110,160,0.08)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _tileColor(tile) {
    switch (tile.type) {
      case TILE_TYPES.SEA:
        return tile.n < 0.15 ? TILE_COLORS.seaDeep : TILE_COLORS.sea;
      case TILE_TYPES.PLAINS:
        return TILE_COLORS.plains;
      case TILE_TYPES.FOREST:
        return TILE_COLORS.forest;
      case TILE_TYPES.MOUNTAIN:
        return tile.n > 0.88 ? TILE_COLORS.mountainDark : TILE_COLORS.mountain;
      default:
        return '#000000';
    }
  }
}
