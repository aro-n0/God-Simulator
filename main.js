// main.js
// Canvasセットアップ、ゲームループ、マップ/キャラ描画、キャラクリエイトUIの結線。

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

  _bindCharacterCreator() {
    const nameInput = document.getElementById('input-char-name');
    const promptInput = document.getElementById('input-char-prompt');
    const previewCanvas = document.getElementById('preview-canvas');
    const previewCtx = previewCanvas.getContext('2d');
    previewCtx.imageSmoothingEnabled = false;

    const hairColorInput = document.getElementById('override-hair-color');
    const clothesColorInput = document.getElementById('override-clothes-color');
    const hatCheckbox = document.getElementById('override-hat');

    let currentParams = null;
    let manualOverride = { hair: false, clothes: false };

    hairColorInput.addEventListener('mousedown', () => (manualOverride.hair = true));
    clothesColorInput.addEventListener('mousedown', () => (manualOverride.clothes = true));

    const refreshPreview = (fromTextInput) => {
      const name = nameInput.value || '名無し';
      const prompt = promptInput.value || '';
      const parsed = parsePromptToParams(name, prompt);

      if (fromTextInput) {
        // テキストが変わったら手動上書きはリセットして再解析結果を反映
        manualOverride = { hair: false, clothes: false };
      }

      currentParams = parsed;
      if (manualOverride.hair) currentParams.hairColor = hairColorInput.value;
      if (manualOverride.clothes) currentParams.clothesColor = clothesColorInput.value;
      if (hatCheckbox.dataset.touched === '1') currentParams.hasHat = hatCheckbox.checked;

      hairColorInput.value = currentParams.hairColor;
      clothesColorInput.value = currentParams.clothesColor;
      hatCheckbox.checked = currentParams.hasHat;

      const sprite = buildSpriteCanvas(currentParams);
      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      previewCtx.drawImage(sprite, 0, 0, previewCanvas.width, previewCanvas.height);

      document.getElementById('stat-preview').textContent =
        `速度:${currentParams.speed.toFixed(2)}  採取効率:${currentParams.gatherEffMul.toFixed(2)}  職業:${currentParams.job || 'なし'}`;
    };

    nameInput.addEventListener('input', () => refreshPreview(true));
    promptInput.addEventListener('input', () => refreshPreview(true));
    hairColorInput.addEventListener('input', () => refreshPreview(false));
    clothesColorInput.addEventListener('input', () => refreshPreview(false));
    hatCheckbox.addEventListener('change', () => {
      hatCheckbox.dataset.touched = '1';
      refreshPreview(false);
    });

    refreshPreview(true);

    document.getElementById('btn-spawn').addEventListener('click', () => {
      if (this.isObserverMode) {
        alert('観測モード（ゲスト参加中）はキャラクターを作成できません');
        return;
      }
      refreshPreview(false);
      this.spawnCharacter(currentParams);
      nameInput.value = '';
      promptInput.value = '';
      hatCheckbox.dataset.touched = '';
      manualOverride = { hair: false, clothes: false };
      refreshPreview(true);
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

  _loop(now) {
    const dt = Math.min(0.1, (now - this._lastTime) / 1000);
    this._lastTime = now;
    if (!this.isObserverMode) {
      for (const c of this.characters) c.update(dt);
    }
    this._render();
    requestAnimationFrame((t) => this._loop(t));
  }

  _render() {
    const ctx = this.ctx;
    ctx.fillStyle = '#0a1a2a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const ts = TILE_SIZE * this.camera.zoom;
    const topLeft = this.camera.screenToWorld(0, 0);
    const bottomRight = this.camera.screenToWorld(this.canvas.width, this.canvas.height);
    const x0 = Math.max(0, Math.floor(topLeft.x / TILE_SIZE) - 1);
    const y0 = Math.max(0, Math.floor(topLeft.y / TILE_SIZE) - 1);
    const x1 = Math.min(this.map.width, Math.ceil(bottomRight.x / TILE_SIZE) + 1);
    const y1 = Math.min(this.map.height, Math.ceil(bottomRight.y / TILE_SIZE) + 1);

    // タイル描画（可視範囲のみ）
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const tile = this.map.getTile(x, y);
        if (!tile) continue;
        const screen = this.camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
        ctx.fillStyle = this._tileColor(tile);
        ctx.fillRect(Math.round(screen.x), Math.round(screen.y), Math.ceil(ts) + 1, Math.ceil(ts) + 1);
      }
    }

    // 資源描画
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

    // キャラクター描画
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
      ctx.font = `${Math.max(9, ts * 0.35)}px sans-serif`;
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
