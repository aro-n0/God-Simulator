// main.js
// Canvasセットアップ、ゲームループ、天候/昼夜/寿命システム、婚姻・出産、
// 住民作成モーダル・キャラ一覧・世界のルールパネル・キャラ詳細モーダルの結線。

let game;

const WEATHER_EFFECTS = {
  clear: { moveSpeedMul: 1, fatigueMul: 1, cropGrowthMul: 1, treeRegenMul: 0, label: '☀ 晴れ' },
  cloudy: { moveSpeedMul: 1, fatigueMul: 1, cropGrowthMul: 1.1, treeRegenMul: 0.1, label: '☁ 曇り' },
  rain: { moveSpeedMul: 0.85, fatigueMul: 1.2, cropGrowthMul: 1.5, treeRegenMul: 0.3, label: '🌧 雨' },
  blessed_rain: { moveSpeedMul: 0.9, fatigueMul: 1.1, cropGrowthMul: 2.2, treeRegenMul: 0.8, label: '🌦 恵みの雨' },
  wind: { moveSpeedMul: 0.8, fatigueMul: 1.15, cropGrowthMul: 1, treeRegenMul: 0, label: '🌬 強風' },
  storm: { moveSpeedMul: 0.7, fatigueMul: 1.3, cropGrowthMul: 1.3, treeRegenMul: 0.4, label: '⛈ 雷雨' },
};
// 基本は晴れ/曇り。雨・雷雨・強風は滅多に発生しないレア天候とする
const WEATHER_ORDER = ['clear', 'cloudy', 'rain', 'blessed_rain', 'wind', 'storm'];
const WEATHER_WEIGHTS = [0.62, 0.28, 0.04, 0.02, 0.03, 0.01];
const RAIN_WEATHERS = ['rain', 'blessed_rain', 'storm'];

const DAY_LENGTH_SEC = 24 * 60; // 1日=24分(現実時間, x1速度時)
const NIGHT_START_SEC = 16 * 60; // 昼16分/夜8分
// ADULT_AGE は character.js で定義済みのものをそのまま利用する(重複宣言を避ける)
const MAX_POPULATION = 90;
const VILLAGE_NAME_POOL = [
  'あさひ村', 'みどり村', 'かぜの村', 'いずみ村', 'たいよう村', 'つき村', 'ひかり村', 'くろがね村',
  'みずほ村', 'あおば村', 'さくら村', 'ゆき村', 'ほし村', 'もり村', 'かわ村', 'やま村', 'うみ村',
  'ふじ村', 'こだま村', 'せせらぎ村', 'たそがれ村', 'あかね村', 'しらゆき村', 'こはく村',
];

function breedChild(parentA, parentB) {
  const rand = Math.random;
  const appearance = {
    skinTone: rand() < 0.5 ? parentA.params.skinTone : parentB.params.skinTone,
    hairColor: rand() < 0.5 ? parentA.params.hairColor : parentB.params.hairColor,
    clothesColor: rand() < 0.5 ? parentA.params.clothesColor : parentB.params.clothesColor,
    hairStyle: rand() < 0.5 ? parentA.params.hairStyle : parentB.params.hairStyle,
    hasHat: false,
    hatColor: parentA.params.hatColor || '#2b2b2b',
  };
  const blend = (a, b) => Math.max(1, Math.min(10, Math.round((a + b) / 2 + (Math.random() * 4 - 2))));
  const stats = {
    str: blend(parentA.params.str || 5, parentB.params.str || 5),
    agi: blend(parentA.params.agi || 5, parentB.params.agi || 5),
    int: blend(parentA.params.int || 5, parentB.params.int || 5),
    cha: blend(parentA.params.cha || 5, parentB.params.cha || 5),
  };
  return Object.assign(
    {
      name: generateRandomName(), prompt: '', job: null, personalityLabel: null, gatherBonus: {},
      canFish: false, huntBonus: 1, farmBonus: 1, speed: 0.9, restThreshold: 20,
      gatherEffMul: 1, gatherPersist: 1, socialMul: 1, likes: [], dislikes: [],
    },
    stats,
    appearance
  );
}

class Game {
  constructor(config) {
    config = config || {};
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this._resizeCanvas();
    window.addEventListener('resize', () => this._resizeCanvas());

    this.worldId = config.worldId || null;
    this.isObserverMode = false;
    this.camera = new Camera(this.canvas);
    this.camera.onTap = (x, y) => this._handleTap(x, y);
    this.canvas.addEventListener('click', (e) => {
      if (this.camera._moved) return;
      this._handleTap(e.clientX, e.clientY);
    });

    // 天候
    this.weather = 'clear';
    this._weatherTimer = 20 + Math.random() * 20;

    // 時間(速度倍率で進行が変わる)
    this.speedMultiplier = 1;
    this.dayClock = 6 * 60; // 朝から開始
    this.currentDay = 1;
    this.isNight = false;

    // 社会システムの間引きタイマー
    this._socialTimer = 3;
    this._villageTimer = 15;
    this._codexTimer = 5;

    // 能力・資格図鑑(発見・アンロック方式)
    this.unlockedCodex = new Set(config.unlockedCodex || []);
    this.discoveredAnimalTypes = new Set(config.discoveredAnimalTypes || []);

    // アイコンキャッシュ(木/巨木/岩/鉱石/作物/動物)
    this._buildIconCache();

    this._modalChar = null;
    this._modalRefreshCounter = 0;
    this._bindModals();

    if (config.remoteInit) {
      this.seed = config.remoteInit.seed;
      this.map = new GameMap(this.seed);
      this.characters = config.remoteInit.characters.map((p) => {
        const c = new Character(p, this.map, this.map.width / 2, this.map.height / 2);
        c.isRemoteMirror = true;
        return c;
      });
      this.isObserverMode = true;
      document.getElementById('btn-open-creator').disabled = true;
    } else {
      this.seed = config.seed != null ? config.seed : Math.floor(Math.random() * 1000000);
      this.map = new GameMap(this.seed);
      this.characters = [];
      if (config.characters && config.characters.length) {
        for (const saved of config.characters) {
          this.characters.push(new Character(saved.params, this.map, saved.x, saved.y, saved));
        }
      }
      if (config.buildings) this.map.buildings = config.buildings;
      if (config.groundItems) this.map.groundItems = config.groundItems;
      if (config.villages) this.map.villages = config.villages;
      if (config.dynamicItemRegistry) Object.assign(DYNAMIC_ITEM_REGISTRY, config.dynamicItemRegistry);
    }

    this.room = window.roomManager || null;
    if (this.room) this.room.attachGame(this);

    // マップ中心にカメラを合わせる(マップサイズが可変のためここで確定させる)
    this.camera.x = (this.map.width / 2) * TILE_SIZE;
    this.camera.y = (this.map.height / 2) * TILE_SIZE;

    this._bindCreatorModal();
    this._bindSpeedControls();
    this._lastTime = performance.now();
    requestAnimationFrame((t) => this._loop(t));

    if (this.worldId) this._startAutosave();
  }

  _buildIconCache() {
    this.icons = {
      tree: buildTreeIcon(),
      big_tree: buildBigTreeIcon(),
      stone: buildRockIcon(),
      ore: buildOreIcon(),
      giant_tree: buildGiantTreeIcon(),
      scorched_giant_tree: buildScorchedGiantTreeIcon(),
      giant_hole: buildGiantHoleIcon(),
      fire: buildFireIcon(),
    };
    this.cropIcons = {};
    ['wheat', 'apple', 'vegetable'].forEach((type) => {
      this.cropIcons[type] = [0, 1, 2, 3].map((stage) => buildCropIcon(type, stage));
    });
    this.animalIcons = {};
    ['chicken', 'cow', 'pig', 'tiger', 'sheep'].forEach((type) => {
      this.animalIcons[type] = buildAnimalIcon(type);
    });
    this.buildingIconCache = {};
    this.itemIconCache = {};
    this.icons.campfire = buildCampfireIcon();
    this.icons.campfire_extinguished = buildCampfireExtinguishedIcon();
  }

  _getBuildingIcon(building) {
    if (building.category === 'campfire') {
      return building.lit ? this.icons.campfire : this.icons.campfire_extinguished;
    }
    if (building.category === 'chest') {
      if (!this.icons.chest) this.icons.chest = buildChestIcon();
      return this.icons.chest;
    }
    const key = building.type;
    if (!this.buildingIconCache[key]) {
      if (building.category === 'large_house') this.buildingIconCache[key] = buildLargeHouseIcon(building.theme);
      else this.buildingIconCache[key] = buildHouseIcon(building.theme);
    }
    return this.buildingIconCache[key];
  }

  _getItemIcon(itemId) {
    if (!this.itemIconCache[itemId]) this.itemIconCache[itemId] = buildItemIcon(itemId);
    return this.itemIconCache[itemId];
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
      unlockedCodex: Array.from(this.unlockedCodex),
      discoveredAnimalTypes: Array.from(this.discoveredAnimalTypes),
      buildings: this.map.buildings,
      groundItems: this.map.groundItems,
      villages: this.map.villages,
      dynamicItemRegistry: DYNAMIC_ITEM_REGISTRY,
    });
  }

  _resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  _bindSpeedControls() {
    const setSpeed = (mul, btnId) => {
      this.speedMultiplier = mul;
      document.querySelectorAll('.speed-btn').forEach((b) => b.classList.remove('active'));
      document.getElementById(btnId).classList.add('active');
    };
    document.getElementById('btn-speed-0').addEventListener('click', () => setSpeed(0, 'btn-speed-0'));
    document.getElementById('btn-speed-1').addEventListener('click', () => setSpeed(1, 'btn-speed-1'));
    document.getElementById('btn-speed-2').addEventListener('click', () => setSpeed(2, 'btn-speed-2'));
    document.getElementById('btn-speed-5').addEventListener('click', () => setSpeed(5, 'btn-speed-5'));
  }

  // ============ 住民作成モーダル ============
  _bindCreatorModal() {
    const modal = document.getElementById('creator-modal');
    document.getElementById('btn-open-creator').addEventListener('click', () => {
      if (this.isObserverMode) { alert('観測モード（ゲスト参加中）はキャラクターを作成できません'); return; }
      modal.classList.add('open');
    });
    document.getElementById('creator-modal-close').addEventListener('click', () => modal.classList.remove('open'));

    const nameInput = document.getElementById('input-char-name');
    const promptInput = document.getElementById('input-char-prompt');
    const previewCanvas = document.getElementById('preview-canvas');
    const previewCtx = previewCanvas.getContext('2d');
    previewCtx.imageSmoothingEnabled = false;

    const skinSwatchContainer = document.getElementById('skin-swatches');
    const hairSwatchContainer = document.getElementById('hair-swatches');
    const clothesColorInput = document.getElementById('override-clothes-color');
    const hatCheckbox = document.getElementById('override-hat');
    const hatColorInput = document.getElementById('override-hat-color');

    let creatorState = Object.assign({}, randomizeAppearance(), rollBaseStats());

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
      clothesColorInput.value = creatorState.clothesColor;
      hatCheckbox.checked = creatorState.hasHat;
      hatColorInput.value = creatorState.hatColor;
      renderSwatches(skinSwatchContainer, NATURAL_SKIN_TONES, creatorState.skinTone, (c) => { creatorState.skinTone = c; refreshPreview(); });
      renderSwatches(hairSwatchContainer, NATURAL_HAIR_COLORS, creatorState.hairColor, (c) => { creatorState.hairColor = c; refreshPreview(); });

      const sprite = buildSpriteCanvas(creatorState);
      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      previewCtx.drawImage(sprite, 0, 0, previewCanvas.width, previewCanvas.height);

      ['str', 'agi', 'int', 'cha'].forEach((k) => {
        document.getElementById('bar-' + k).style.width = (creatorState[k] / 10) * 100 + '%';
        document.getElementById('val-' + k).textContent = creatorState[k];
      });
    };

    clothesColorInput.addEventListener('input', () => { creatorState.clothesColor = clothesColorInput.value; refreshPreview(); });
    hatCheckbox.addEventListener('change', () => { creatorState.hasHat = hatCheckbox.checked; refreshPreview(); });
    hatColorInput.addEventListener('input', () => { creatorState.hatColor = hatColorInput.value; refreshPreview(); });
    document.getElementById('btn-randomize').addEventListener('click', () => {
      const excludeNames = new Set(this.characters.map((c) => c.params.name).concat(loadLibrary().map((e) => e.name)));
      const excludeSignatures = new Set(
        this.characters.map((c) => appearanceSignature(c.params)).concat(loadLibrary().map((e) => appearanceSignature(e)))
      );
      const result = randomizeFullCharacter(excludeNames, excludeSignatures);
      creatorState = Object.assign({}, result.appearance, result.stats);
      nameInput.value = result.name;
      promptInput.value = result.prompt;
      refreshPreview();
    });
    refreshPreview();

    const buildFullParams = () => {
      const stats = deriveStatsFromPrompt(nameInput.value, promptInput.value);
      return Object.assign({}, stats, creatorState);
    };

    document.getElementById('btn-spawn').addEventListener('click', () => {
      if (this.isObserverMode) { alert('観測モードでは配置できません'); return; }
      this.spawnCharacter(buildFullParams());
      nameInput.value = '';
      promptInput.value = '';
      modal.classList.remove('open');
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
    if (lib.length === 0) { listEl.innerHTML = '<p class="ws-empty">ライブラリは空です</p>'; return; }
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
        if (this.isObserverMode) { alert('観測モードでは配置できません'); return; }
        const entry = loadLibrary().find((e) => e.libId === btn.dataset.id);
        if (entry) this.spawnCharacter(Object.assign({}, entry));
      });
    });
    listEl.querySelectorAll('.lib-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => { deleteFromLibrary(btn.dataset.id); this._renderLibrary(); });
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
    return c;
  }

  applyRemoteSnapshot(chars) {
    chars.forEach((data, i) => {
      const c = this.characters[i];
      if (!c) return;
      c.x = data.x; c.y = data.y; c.state = data.state; c.emote = data.emote; c.facing = data.facing;
      c.emoteTimer = data.emote ? 3 : 0;
    });
  }

  // ============ モーダル群 ============
  _bindModals() {
    document.getElementById('char-modal-close').addEventListener('click', () => this._closeModal('char-modal'));
    document.getElementById('roster-modal-close').addEventListener('click', () => this._closeModal('roster-modal'));
    document.getElementById('animal-modal-close').addEventListener('click', () => this._closeModal('animal-modal'));
    document.getElementById('codex-modal-close').addEventListener('click', () => this._closeModal('codex-modal'));
    document.getElementById('building-modal-close').addEventListener('click', () => this._closeModal('building-modal'));
    document.getElementById('chest-modal-close').addEventListener('click', () => this._closeModal('chest-modal'));
    ['char-modal', 'roster-modal', 'creator-modal', 'animal-modal', 'codex-modal', 'building-modal', 'chest-modal'].forEach((id) => {
      const modal = document.getElementById(id);
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
    });

    document.getElementById('btn-open-roster').addEventListener('click', () => {
      this._renderRoster();
      document.getElementById('roster-modal').classList.add('open');
    });
    document.getElementById('btn-open-codex').addEventListener('click', () => {
      this._renderCodex();
      document.getElementById('codex-modal').classList.add('open');
    });
  }

  // 建物タップ時の情報表示(名前/滞在人数/所有者/建設者と経過日数)。焚き火等の設備は滞在人数を非表示にする
  _openBuildingModal(building) {
    document.getElementById('building-modal-name').textContent = building.label || '建築物';
    const occupants = this.characters.filter((c) => Math.hypot(c.x - building.x, c.y - building.y) < 2).length;
    const occRow = document.getElementById('building-modal-occupants-row');
    if (building.category === 'house' || building.category === 'large_house') {
      occRow.style.display = '';
      document.getElementById('building-modal-occupants').textContent = `${occupants}人`;
    } else {
      occRow.style.display = 'none';
    }
    document.getElementById('building-modal-owner').textContent = building.ownerName || '不明';
    const daysAgo = Math.max(0, Math.floor(this.currentDay - (building.constructedAtDay || 0)));
    document.getElementById('building-modal-built').textContent = `${building.ownerName || '誰か'}が${daysAgo}日前に建設`;
    document.getElementById('building-modal').classList.add('open');
  }

  // チェスト(60スロット): 内容表示。スロットをクリックすると中身を捨てられる
  _openChestModal(building) {
    this._modalChest = building;
    this._renderChest();
    document.getElementById('chest-modal').classList.add('open');
  }

  _renderChest() {
    const chest = this._modalChest;
    if (!chest) return;
    const grid = document.getElementById('chest-grid');
    grid.innerHTML = '';
    chest.chestSlots.forEach((slot, i) => {
      const cell = document.createElement('div');
      cell.className = 'chest-slot' + (slot ? '' : ' empty');
      if (slot) {
        const icon = this._getItemIcon(slot.item);
        const img = document.createElement('canvas');
        img.width = 16; img.height = 16;
        img.className = 'chest-slot-icon';
        img.getContext('2d').drawImage(icon, 0, 0, 16, 16);
        cell.appendChild(img);
        const countEl = document.createElement('span');
        countEl.className = 'chest-slot-count';
        countEl.textContent = slot.count;
        cell.appendChild(countEl);
        cell.title = `${slot.item} x${slot.count}(クリックで捨てる)`;
        cell.addEventListener('click', () => {
          chest.chestSlots[i] = null;
          this._renderChest();
        });
      }
      grid.appendChild(cell);
    });
  }

  _closeModal(id) {
    document.getElementById(id).classList.remove('open');
    if (id === 'char-modal') this._modalChar = null;
    if (id === 'animal-modal') this._modalAnimal = null;
    if (id === 'chest-modal') this._modalChest = null;
  }

  _updateCodexUnlocks() {
    for (const c of this.characters) {
      (c.qualifications || []).forEach((q) => this.unlockedCodex.add(q));
      c.getAbilityTags().forEach((a) => this.unlockedCodex.add(a));
    }
    for (const type of this.discoveredAnimalTypes) {
      getAnimalTraits(type).forEach((t) => this.unlockedCodex.add(t));
    }
  }

  _renderCodex() {
    const listEl = document.getElementById('codex-list');
    listEl.innerHTML = '';
    ['資格', '能力', '動物特性'].forEach((cat) => {
      const section = document.createElement('div');
      section.className = 'codex-section';
      section.innerHTML = `<h3>${cat}</h3>`;
      CODEX_ENTRIES.filter((e) => e.category === cat).forEach((e) => {
        const unlocked = this.unlockedCodex.has(e.id);
        const row = document.createElement('div');
        row.className = 'codex-item' + (unlocked ? '' : ' locked');
        row.innerHTML = unlocked
          ? `<span class="codex-label">[${e.category}: ${e.id}]</span><span class="codex-desc">${e.description}</span>`
          : `<span class="codex-label">[${e.category}: ???]</span><span class="codex-desc">未発見</span>`;
        section.appendChild(row);
      });
      listEl.appendChild(section);
    });
  }

  _renderRoster() {
    const listEl = document.getElementById('roster-list');
    listEl.innerHTML = '';
    if (this.characters.length === 0) { listEl.innerHTML = '<p class="ws-empty">まだ誰もいません</p>'; return; }
    this.characters.forEach((c) => {
      const row = document.createElement('div');
      row.className = 'lib-item';
      row.innerHTML =
        `<span class="lib-item-name">${c.params.name}（${c.affiliation}）</span>` +
        `<span class="roster-mood">${c.getMoodText()}</span>` +
        `<button class="lib-spawn-btn roster-detail-btn" data-id="${c.id}">詳細</button>`;
      listEl.appendChild(row);
    });
    listEl.querySelectorAll('.roster-detail-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const c = this.characters.find((ch) => ch.id === btn.dataset.id);
        if (c) { this._closeModal('roster-modal'); this._openCharacterModal(c); }
      });
    });
  }

  _handleTap(screenX, screenY) {
    const world = this.camera.screenToWorld(screenX, screenY);
    const tileX = world.x / TILE_SIZE;
    const tileY = world.y / TILE_SIZE;

    let closestChar = null, closestCharDist = Infinity;
    for (const c of this.characters) {
      const d = Math.hypot(c.x - tileX, c.y - tileY);
      if (d < 0.7 && d < closestCharDist) { closestChar = c; closestCharDist = d; }
    }
    let closestAnimal = null, closestAnimalDist = Infinity;
    for (const a of this.map.animals) {
      if (a.amount <= 0) continue;
      const d = Math.hypot(a.x - tileX, a.y - tileY);
      if (d < 0.7 && d < closestAnimalDist) { closestAnimal = a; closestAnimalDist = d; }
    }
    let closestBuilding = null, closestBuildingDist = Infinity;
    for (const b of this.map.buildings) {
      const d = Math.hypot(b.x - tileX, b.y - tileY);
      const radius = b.category === 'large_house' ? 3 : 1.3;
      if (d < radius && d < closestBuildingDist) { closestBuilding = b; closestBuildingDist = d; }
    }

    const candidates = [
      { obj: closestChar, dist: closestCharDist, open: () => this._openCharacterModal(closestChar) },
      { obj: closestAnimal, dist: closestAnimalDist, open: () => this._openAnimalModal(closestAnimal) },
      { obj: closestBuilding, dist: closestBuildingDist, open: () => this._openBuildingTap(closestBuilding) },
    ].filter((c) => c.obj);
    if (candidates.length === 0) return;
    candidates.sort((a, b) => a.dist - b.dist);
    candidates[0].open();
  }

  _openBuildingTap(building) {
    if (building.category === 'chest') this._openChestModal(building);
    else this._openBuildingModal(building);
  }

  _retriggerBubble(el) {
    el.classList.remove('bubble-pop');
    void el.offsetWidth; // reflow でアニメーションを再生させる
    el.classList.add('bubble-pop');
  }

  _openAnimalModal(a) {
    this._modalAnimal = a;
    this.discoveredAnimalTypes.add(a.type);
    this._refreshAnimalModal();
    document.getElementById('animal-modal').classList.add('open');
  }

  _refreshAnimalModal() {
    const a = this._modalAnimal;
    if (!a) return;
    const spriteCanvas = document.getElementById('animal-modal-sprite');
    const ctx = spriteCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);
    ctx.drawImage(this.animalIcons[a.type], 0, 0, spriteCanvas.width, spriteCanvas.height);

    document.getElementById('animal-modal-name').textContent = getAnimalDisplayName(a.type);
    document.getElementById('animal-modal-status').textContent = `元気度 ${a.amount}/${a.maxAmount}`;
    const combatRow = document.getElementById('animal-modal-combat-row');
    if (a.dangerous) {
      combatRow.style.display = '';
      document.getElementById('animal-modal-combat').textContent = `${a.atk} / ${a.def} / ${a.atkSpeed.toFixed(1)}`;
    } else {
      combatRow.style.display = 'none';
    }

    const bubble = document.getElementById('animal-modal-mood-bubble');
    const newMood = getAnimalMood(a);
    if (bubble.textContent !== newMood) { bubble.textContent = newMood; this._retriggerBubble(bubble); }

    const traitsEl = document.getElementById('animal-modal-traits');
    traitsEl.innerHTML = '';
    getAnimalTraits(a.type).forEach((t) => {
      const tag = document.createElement('span');
      tag.className = 'tag tag-ability';
      tag.textContent = `[${t}]`;
      traitsEl.appendChild(tag);
    });
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
    document.getElementById('char-modal-affiliation').textContent =
      (c.affiliation || '無所属') + (c.cultName ? ` / ${c.cultName}` : '');
    document.getElementById('char-modal-job').textContent = c.params.job || 'なし';
    document.getElementById('char-modal-title').textContent = c.dynamicJob || '未確立';
    const bubble = document.getElementById('char-modal-mood-bubble');
    const newMood = c.getMoodText();
    if (bubble.textContent !== newMood) { bubble.textContent = newMood; this._retriggerBubble(bubble); }
    document.getElementById('char-modal-basestats').textContent =
      `${c.params.str || '-'} / ${c.params.agi || '-'} / ${c.params.int || '-'} / ${c.params.cha || '-'}`;
    document.getElementById('char-modal-combat').textContent =
      `${c.getEffectiveAtk()}(基礎${c.baseAtk}+装備${c._equipAtkBonus}) / ${c.getEffectiveDef()}(基礎${c.baseDef}+装備${c._equipDefBonus}) / ${c.atkSpeed.toFixed(1)}`;
    document.getElementById('char-modal-vitals').textContent =
      `${Math.round(c.hp)} / ${Math.round(c.hunger)} / ${Math.round(100 - c.stamina)}`;
    document.getElementById('char-modal-age').textContent =
      `${Math.floor(c.ageYears)}歳(寿命${Math.floor(c.lifespanYears)}) / Lv${c.languageLevel}`;

    const fill = (id, arr, cls, prefix) => {
      const el = document.getElementById(id);
      el.innerHTML = '';
      (arr || []).forEach((v) => {
        const tag = document.createElement('span');
        tag.className = 'tag ' + cls;
        tag.textContent = prefix ? `[${prefix}: ${v}]` : `[${v}]`;
        el.appendChild(tag);
      });
    };
    fill('char-modal-innate-tags', c.params.personalityTags, 'tag-innate', null);
    fill('char-modal-acquired-tags', c.acquiredPersonality, 'tag-acquired', null);
    fill('char-modal-ability-tags', c.getAbilityTags(), 'tag-ability', '能力');
    fill('char-modal-qualifications', c.qualifications, 'tag-qualification', '資格');
    fill('char-modal-title-tags', c.titleTags, 'tag-title', '肩書き');
    fill('char-modal-likes', c.params.likes, 'tag-like', '好き');
    fill('char-modal-dislikes', c.params.dislikes, 'tag-dislike', '苦手');
    const invEntries = c.inventorySlots.filter((s) => s && s.count > 0).map((s) => `${s.item}x${s.count}`);
    fill('char-modal-inventory', invEntries, 'tag-inventory', null);

    this._renderRelationships(c);
  }

  // 人間関係: 特別な関係(村長/教祖/伴侶/敵)と好感度の上位・下位を優先表示し、残りは折りたたむ
  _renderRelationships(c) {
    const SPECIAL_TYPES = ['村長', '教祖', '伴侶', '敵'];
    const entries = Object.keys(c.relationships).map((id) => {
      const target = this.characters.find((ch) => ch.id === id);
      const r = c.relationships[id];
      return { id, name: target ? target.params.name : '???', relationType: r.relationType, favorability: r.favorability };
    });

    const special = entries.filter((e) => SPECIAL_TYPES.includes(e.relationType));
    const rest = entries.filter((e) => !SPECIAL_TYPES.includes(e.relationType)).sort((a, b) => b.favorability - a.favorability);
    const topN = rest.slice(0, 3);
    const bottomN = rest.slice(-2).filter((e) => !topN.includes(e));
    const primaryIds = new Set([...special, ...topN, ...bottomN].map((e) => e.id));
    const primary = entries.filter((e) => primaryIds.has(e.id)).slice(0, 5);
    const extra = entries.filter((e) => !primaryIds.has(e.id));

    const label = (e) => `${e.name}(${e.relationType || '知人'}:${e.favorability})`;
    const fillRow = (id, arr) => {
      const el = document.getElementById(id);
      el.innerHTML = '';
      arr.forEach((e) => {
        const tag = document.createElement('span');
        tag.className = 'tag tag-relationship';
        tag.textContent = `[${label(e)}]`;
        el.appendChild(tag);
      });
    };
    fillRow('char-modal-relationships', primary);

    const moreBtn = document.getElementById('char-modal-relationships-more');
    const extraEl = document.getElementById('char-modal-relationships-extra');
    if (extra.length > 0) {
      moreBtn.style.display = '';
      moreBtn.textContent = `その他の関係を見る (+${extra.length}名)`;
      moreBtn.onclick = () => {
        const showing = extraEl.style.display !== 'none';
        extraEl.style.display = showing ? 'none' : '';
        moreBtn.textContent = showing ? `その他の関係を見る (+${extra.length}名)` : '閉じる';
      };
      fillRow('char-modal-relationships-extra', extra);
    } else {
      moreBtn.style.display = 'none';
      extraEl.style.display = 'none';
    }
  }

  // 虎: 空腹ゲージが30以下になると、虎以外の全ての動物(人間含む)を無差別に襲撃・捕食する
  _updateTigerPredation(dt) {
    for (const tiger of this.map.animals) {
      if (tiger.type !== 'tiger' || tiger.amount <= 0) continue;
      if (tiger.hunger > 30) { tiger.huntTarget = null; continue; }

      let target = tiger.huntTarget;
      const targetGone = !target || target.isDead || (target.amount !== undefined && target.amount <= 0);
      if (targetGone || this._preyDist(tiger, target) > 20) {
        target = this._findNearestPrey(tiger);
        tiger.huntTarget = target;
      }
      if (!target) continue;

      const dist = this._preyDist(tiger, target);
      if (dist > 0.9) {
        const dx = target.x - tiger.x, dy = target.y - tiger.y;
        const step = Math.min(1.1 * dt, dist);
        const nx = tiger.x + (dx / dist) * step, ny = tiger.y + (dy / dist) * step;
        if (this.map.isWalkable(nx, ny) && !this.map.isWaterTile(nx, ny)) { tiger.x = nx; tiger.y = ny; }
      } else {
        tiger.attackTimer -= dt;
        if (tiger.attackTimer <= 0) {
          tiger.attackTimer = 1 / (tiger.atkSpeed || 1);
          const targetDef = typeof target.getEffectiveDef === 'function' ? target.getEffectiveDef() : (target.def || 0);
          const dmg = Math.max(0, tiger.atk - targetDef);
          if (typeof target.getEffectiveDef === 'function') {
            // 人間の獲物
            target.hp = Math.max(0, target.hp - dmg);
            if (typeof target.addMemory === 'function') target.addMemory('虎に襲われた', 8);
            if (target.hp <= 0) { tiger.hunger = Math.min(100, tiger.hunger + 70); tiger.huntTarget = null; }
          } else {
            // 動物の獲物
            target.amount = Math.max(0, target.amount - Math.max(1, dmg));
            if (target.amount <= 0) {
              tiger.hunger = Math.min(100, tiger.hunger + 70);
              target.respawnTimer = (ANIMAL_DEFS[target.type] || {}).respawnTime || 30;
              tiger.huntTarget = null;
            }
          }
        }
      }
    }
  }

  _findNearestPrey(tiger) {
    let best = null, bestDist = 20;
    for (const c of this.characters) {
      if (c.isDead || c.isRemoteMirror) continue;
      const d = Math.hypot(c.x - tiger.x, c.y - tiger.y);
      if (d < bestDist) { best = c; bestDist = d; }
    }
    for (const a of this.map.animals) {
      if (a === tiger || a.type === 'tiger' || a.amount <= 0) continue;
      const d = Math.hypot(a.x - tiger.x, a.y - tiger.y);
      if (d < bestDist) { best = a; bestDist = d; }
    }
    return best;
  }

  _preyDist(tiger, target) {
    return Math.hypot(target.x - tiger.x, target.y - tiger.y);
  }

  // ============ 社会システム(交流・結婚・出産・盗み・村形成) ============
  _updateSocialSystems() {
    const alive = this.characters;
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i];
      if (a.isRemoteMirror || a.isDead) continue;
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j];
        if (b.isRemoteMirror || b.isDead) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 2.5) continue;

        const busy = (c) => [STATES.EAT, STATES.SLEEP, STATES.PRAY, STATES.STEAL].includes(c.state);

        // 好感度上昇 + 交流演出
        const gain = 4 * ((a.params.socialMul || 1) + (b.params.socialMul || 1)) / 2;
        a.adjustFavorability(b.id, gain);
        b.adjustFavorability(a.id, gain);

        // 応急手当(空腹回復ではなくHP治療。医師資格があれば治療量が大きい)
        const tryHeal = (healer, patient) => {
          if (patient.hp < 70 && !busy(healer) && !busy(patient)) {
            const amount = healer.qualifications.includes('医師') ? 15 : 5;
            patient.hp = Math.min(100, patient.hp + amount);
            healer.actionCounts.healing += 1;
          }
        };
        tryHeal(a, b);
        tryHeal(b, a);

        if (!busy(a) && !busy(b) && Math.random() < 0.15) {
          a.state = STATES.SOCIAL; a.actionTimer = 2.5; a._setEmote(pickDialogue('greeting'));
          b.state = STATES.SOCIAL; b.actionTimer = 2.5; b._setEmote(pickDialogue('friendly'));
          a.actionCounts.socializing += 1; b.actionCounts.socializing += 1;
          if (a.getFavorability(b.id) >= 80) a._lastSocialBondBonus = true;
          if (b.getFavorability(a.id) >= 80) b._lastSocialBondBonus = true;
        }

        // 結婚判定
        if (
          !a.partnerId && !b.partnerId && a.gender !== b.gender &&
          a.ageYears >= ADULT_AGE && b.ageYears >= ADULT_AGE &&
          a.languageLevel >= 2 && b.languageLevel >= 2 &&
          a.getFavorability(b.id) >= 60 && b.getFavorability(a.id) >= 60 &&
          Math.random() < 0.05
        ) {
          a.partnerId = b.id; b.partnerId = a.id;
          a.setRelationType(b.id, '伴侶'); b.setRelationType(a.id, '伴侶');
          a.addMemory(`${b.params.name}と結婚した`, 9); b.addMemory(`${a.params.name}と結婚した`, 9);
          if (!a.titleTags.includes('既婚')) a.titleTags.push('既婚');
          if (!b.titleTags.includes('既婚')) b.titleTags.push('既婚');
          a.childCooldown = 10; b.childCooldown = 10;
        }

        // 出産判定
        if (
          a.partnerId === b.id && b.partnerId === a.id &&
          a.childCooldown <= 0 && b.childCooldown <= 0 &&
          this.characters.length < MAX_POPULATION &&
          Math.random() < 0.02
        ) {
          const childParams = breedChild(a, b);
          const child = this.spawnCharacter(childParams);
          child.x = a.x; child.y = a.y; child.ageYears = 0; child.lifespanYears = 40 + Math.random() * 80;
          child.affiliation = a.affiliation;
          a.childCooldown = 60; b.childCooldown = 60;
          a.addMemory('子を授かった', 8); b.addMemory('子を授かった', 8);
        }

        // 犯罪(窃盗)判定
        const tryTheft = (thief, victim) => {
          if (thief.hunger < 15 && !thief.hasFood() && thief.stamina < 35 && victim.hasFood() && thief.getFavorability(victim.id) < 20) {
            if (Math.random() < 0.15) {
              const key = victim.getBestFoodItem();
              if (key) {
                const moved = victim.removeFromInventory(key, 1);
                if (moved > 0) thief.addToInventory(key, 1);
                victim.adjustFavorability(thief.id, -30);
                victim.setRelationType(thief.id, '敵');
                victim.addMemory(`${thief.params.name}に食料を盗まれた`, 7);
                thief.addMemory(`${victim.params.name}から食料を盗んだ`, 6);
                thief.state = STATES.STEAL; thief.actionTimer = 1.5; thief._setEmote('盗んでしまった…');
                thief.actionCounts.stealing += 1;
                victim._setEmote(pickDialogue('steal_victim'));
                if (!thief.titleTags.includes('犯罪者')) thief.titleTags.push('犯罪者');
              }
            }
          }
        };
        tryTheft(a, b);
        tryTheft(b, a);

        // 物々交換(バーター): 好感度がある程度あれば余剰在庫を交換することがある
        if (!busy(a) && !busy(b) && a.getFavorability(b.id) > 10 && b.getFavorability(a.id) > 10 && Math.random() < 0.05) {
          attemptBarter(a, b);
        }

        // 教団への勧誘(教祖が近くの未入信者を勧誘する)
        if (a.titleTags.includes('教祖') && !b.titleTags.includes('教祖')) {
          if (Math.random() < 0.03) evaluateCultInvite(a, b);
        } else if (b.titleTags.includes('教祖') && !a.titleTags.includes('教祖')) {
          if (Math.random() < 0.03) evaluateCultInvite(b, a);
        }
      }
    }

    // 高CHA・高INTな人物がまれに教団を立ち上げる
    for (const c of alive) {
      if (!c.titleTags.includes('教祖') && !c.titleTags.includes('信者') && (c.params.cha || 0) >= 8 && (c.params.int || 0) >= 6) {
        if (Math.random() < 0.002) foundCult(c, `${c.params.name}教団`);
      }
    }
  }

  _updateVillages() {
    const alive = this.characters.filter((c) => !c.isRemoteMirror && !c.isDead);
    const visited = new Set();
    const usedNames = new Set(alive.map((m) => m.affiliation).filter((n) => n && n !== '無所属'));
    const pickVillageName = () => {
      const candidates = VILLAGE_NAME_POOL.filter((n) => !usedNames.has(n));
      const name = (candidates.length ? candidates : VILLAGE_NAME_POOL)[Math.floor(Math.random() * (candidates.length ? candidates.length : VILLAGE_NAME_POOL.length))];
      usedNames.add(name);
      return name;
    };

    for (const c of alive) {
      if (visited.has(c.id)) continue;
      const cluster = [c];
      visited.add(c.id);
      for (const other of alive) {
        if (visited.has(other.id)) continue;
        if (Math.hypot(other.x - c.x, other.y - c.y) < 7) { cluster.push(other); visited.add(other.id); }
      }
      if (cluster.length >= 3) {
        const avgLang = cluster.reduce((s, m) => s + m.languageLevel, 0) / cluster.length;
        if (avgLang >= 3) {
          const existing = cluster.find((m) => m.affiliation !== '無所属');
          const name = existing ? existing.affiliation : pickVillageName();
          cluster.forEach((m) => { m.affiliation = name; });
          assignOrUpdateMayor(cluster, alive, name, this.map);

          // 領土可視化用に村の中心・半径を更新(WorldBox風の透過カラーオーバーレイに使う)
          if (!this.map.villages) this.map.villages = {};
          if (!this.map.villages[name]) this.map.villages[name] = { color: this._randomVillageColor() };
          const cx = cluster.reduce((s, m) => s + m.x, 0) / cluster.length;
          const cy = cluster.reduce((s, m) => s + m.y, 0) / cluster.length;
          const radius = Math.max(6, ...cluster.map((m) => Math.hypot(m.x - cx, m.y - cy))) + 3;
          Object.assign(this.map.villages[name], { x: cx, y: cy, radius });
        }
      }
    }
  }

  _randomVillageColor() {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 65%, 55%)`;
  }

  // ============ メインループ ============
  _loop(now) {
    const realDt = Math.min(0.1, (now - this._lastTime) / 1000);
    this._lastTime = now;

    if (this.speedMultiplier === 0) {
      // 完全一時停止: シミュレーションは一切進めず描画のみ行う(カメラ操作は可能)
      this._updateClockUI(WEATHER_EFFECTS[this.weather]);
      this._render();
      requestAnimationFrame((t) => this._loop(t));
      return;
    }

    const dt = realDt * this.speedMultiplier;

    // 天候
    this._weatherTimer -= dt;
    if (this._weatherTimer <= 0) {
      this.weather = this._pickWeather();
      this._weatherTimer = this.weather === 'storm' ? 12 + Math.random() * 10 : 25 + Math.random() * 25;
      if (RAIN_WEATHERS.includes(this.weather)) {
        // 雨/雷雨が降ると焚き火は強制消火し、延焼中の超巨大樹の火も中断される
        this.map.buildings.forEach((b) => { if (b.category === 'campfire') b.lit = false; });
        this.map.giantTreeBurning.clear();
      }
    }
    const weatherEffect = WEATHER_EFFECTS[this.weather];

    // 昼夜
    this.dayClock += dt;
    if (this.dayClock >= DAY_LENGTH_SEC) { this.dayClock -= DAY_LENGTH_SEC; this.currentDay += 1; }
    this.isNight = this.dayClock >= NIGHT_START_SEC;
    this._updateClockUI(weatherEffect);

    const ageDeltaYears = (dt / DAY_LENGTH_SEC) * AGE_YEARS_PER_DAY;
    const ctx = {
      isNight: this.isNight, weather: this.weather, ageDeltaYears,
      moveSpeedMul: weatherEffect.moveSpeedMul, fatigueMul: weatherEffect.fatigueMul,
      currentDay: this.currentDay,
    };

    if (!this.isObserverMode) {
      for (const c of this.characters) c.update(dt, ctx);
      this.characters = this.characters.filter((c) => !c.isDead);

      this.map.updateCrops(dt, weatherEffect.cropGrowthMul);
      this.map.regenerateTrees(dt, weatherEffect.treeRegenMul);
      this.map.updateTreeRespawns(this.currentDay);
      updateAnimals(this.map, dt);
      this._updateTigerPredation(dt);
      this.map.updateFire(dt);

      this._socialTimer -= dt;
      if (this._socialTimer <= 0) { this._socialTimer = 3; this._updateSocialSystems(); }
      this._villageTimer -= dt;
      if (this._villageTimer <= 0) { this._villageTimer = 15; this._updateVillages(); }
      this._codexTimer -= dt;
      if (this._codexTimer <= 0) { this._codexTimer = 5; this._updateCodexUnlocks(); }
    }

    if (this._modalChar) {
      this._modalRefreshCounter++;
      if (this._modalRefreshCounter % 15 === 0) this._refreshModal();
    }
    if (this._modalAnimal) {
      if (this._modalRefreshCounter % 30 === 0) this._refreshAnimalModal();
    }
    if (this._modalChest) {
      if (this._modalRefreshCounter % 30 === 0) this._renderChest();
    }
    if (document.getElementById('roster-modal').classList.contains('open')) {
      this._modalRefreshCounter++;
      if (this._modalRefreshCounter % 30 === 0) this._renderRoster();
    }

    this._render();
    requestAnimationFrame((t) => this._loop(t));
  }

  _pickWeather() {
    const r = Math.random();
    let acc = 0;
    for (let i = 0; i < WEATHER_ORDER.length; i++) {
      acc += WEATHER_WEIGHTS[i];
      if (r < acc) return WEATHER_ORDER[i];
    }
    return 'clear';
  }

  _updateClockUI(weatherEffect) {
    const el = document.getElementById('world-clock');
    if (!el) return;
    if (this.speedMultiplier === 0) { el.textContent = '⏸ 時間停止中'; return; }
    const phase = this.isNight ? '🌙 夜' : '☀ 昼';
    el.textContent = `${weatherEffect.label} ${phase} / ${this.currentDay}日目`;
  }

  // ============ 描画 ============
  _render() {
    const ctx = this.ctx;
    ctx.fillStyle = this.isNight ? '#050d18' : this.weather === 'storm' ? '#0a1420' : '#0a1a2a';
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

    // 村の領土(WorldBox風の透過カラーオーバーレイ。20%透過で一目で領域が判別できるようにする)
    const villageNames = Object.keys(this.map.villages || {});
    if (villageNames.length > 0) {
      for (const name of villageNames) {
        const v = this.map.villages[name];
        if (v.x == null || v.radius == null) continue;
        if (v.x + v.radius < x0 || v.x - v.radius > x1 || v.y + v.radius < y0 || v.y - v.radius > y1) continue;
        ctx.fillStyle = v.color.replace('hsl', 'hsla').replace(')', ', 0.2)');
        for (let y = Math.max(y0, Math.floor(v.y - v.radius)); y < Math.min(y1, Math.ceil(v.y + v.radius)); y++) {
          for (let x = Math.max(x0, Math.floor(v.x - v.radius)); x < Math.min(x1, Math.ceil(v.x + v.radius)); x++) {
            if (Math.hypot(x - v.x, y - v.y) > v.radius) continue;
            const screen = this.camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
            ctx.fillRect(Math.round(screen.x), Math.round(screen.y), Math.ceil(ts) + 1, Math.ceil(ts) + 1);
          }
        }
      }
    }

    // 資源(木/巨木/岩/鉱石)を詳細アイコンで描画
    for (const r of this.map.resources) {
      if (r.amount <= 0) continue;
      if (r.x < x0 || r.x > x1 || r.y < y0 || r.y > y1) continue;
      if (r.type === 'fish') continue;
      const icon = this.icons[r.type];
      const screen = this.camera.worldToScreen(r.x * TILE_SIZE + TILE_SIZE / 2, r.y * TILE_SIZE + TILE_SIZE / 2);
      if (icon) {
        const iconSize = r.type === 'big_tree' ? ts * 1.4 : ts * 0.9;
        ctx.drawImage(icon, screen.x - iconSize / 2, screen.y - iconSize / 2, iconSize, iconSize);
      }
    }

    // 農作物
    for (const crop of this.map.crops) {
      if (crop.x < x0 || crop.x > x1 || crop.y < y0 || crop.y > y1) continue;
      const icon = this.cropIcons[crop.type][crop.stage];
      const screen = this.camera.worldToScreen(crop.x * TILE_SIZE + TILE_SIZE / 2, crop.y * TILE_SIZE + TILE_SIZE / 2);
      ctx.drawImage(icon, screen.x - ts * 0.4, screen.y - ts * 0.4, ts * 0.8, ts * 0.8);
    }

    // 動物(種別が一目でわかるドット絵アイコン)
    for (const a of this.map.animals) {
      if (a.amount <= 0) continue;
      if (a.x < x0 || a.x > x1 || a.y < y0 || a.y > y1) continue;
      const icon = this.animalIcons[a.type];
      if (!icon) continue;
      const screen = this.camera.worldToScreen(a.x * TILE_SIZE, a.y * TILE_SIZE);
      const iconSize = ts * 0.6;
      ctx.drawImage(icon, screen.x - iconSize / 2, screen.y - iconSize / 2, iconSize, iconSize);
    }

    // 建築物(キャラクターが建てた家・焚き火・大型建築)
    for (const b of this.map.buildings) {
      if (b.x < x0 - 4 || b.x > x1 + 4 || b.y < y0 - 4 || b.y > y1 + 4) continue;
      const icon = this._getBuildingIcon(b);
      const screen = this.camera.worldToScreen(b.x * TILE_SIZE, b.y * TILE_SIZE);
      const sizeMul = b.category === 'large_house' ? 4 : b.category === 'campfire' || b.category === 'chest' ? 1 : 2;
      const iconSize = ts * sizeMul;
      ctx.drawImage(icon, screen.x - iconSize / 2, screen.y - iconSize * 0.7, iconSize, iconSize);
    }

    // 地面に捨てられたアイテム(ポイ捨て。他の住民が拾える)
    for (const g of this.map.groundItems) {
      if (g.x < x0 || g.x > x1 || g.y < y0 || g.y > y1) continue;
      const icon = this._getItemIcon(g.item);
      const screen = this.camera.worldToScreen(g.x * TILE_SIZE + TILE_SIZE / 2, g.y * TILE_SIZE + TILE_SIZE / 2);
      const iconSize = ts * 0.5;
      ctx.drawImage(icon, screen.x - iconSize / 2, screen.y - iconSize / 2, iconSize, iconSize);
    }

    // 超巨大樹(燃焼中は延焼タイルを炎アイコンで強調表示。地形色自体は焼失に応じて変化する)
    if (this.map.giantTreeCenter) {
      const gt = this.map.giantTreeCenter;
      if (gt.x + 8 >= x0 && gt.x - 8 <= x1 && gt.y + 8 >= y0 && gt.y - 8 <= y1) {
        if (this.map.giantTreeBurning.size === 0 && !this.map.isGiantTreeFullyScorched()) {
          const screen = this.camera.worldToScreen(gt.x * TILE_SIZE + TILE_SIZE / 2, gt.y * TILE_SIZE + TILE_SIZE / 2);
          const size = ts * 10.5;
          ctx.drawImage(this.icons.giant_tree, screen.x - size / 2, screen.y - size / 2, size, size);
        } else {
          const screen = this.camera.worldToScreen(gt.x * TILE_SIZE + TILE_SIZE / 2, gt.y * TILE_SIZE + TILE_SIZE / 2);
          const size = ts * 10.5;
          ctx.drawImage(this.icons.scorched_giant_tree, screen.x - size / 2, screen.y - size / 2, size, size);
          for (const key of this.map.giantTreeBurning.keys()) {
            const [fx, fy] = key.split(',').map(Number);
            const fscreen = this.camera.worldToScreen(fx * TILE_SIZE + TILE_SIZE / 2, fy * TILE_SIZE + TILE_SIZE / 2);
            const fsize = ts * 0.9;
            ctx.drawImage(this.icons.fire, fscreen.x - fsize / 2, fscreen.y - fsize / 2, fsize, fsize);
          }
        }
      }
    }

    // 大穴(メイドインアビス風の重層的な超巨大縦穴・世界に1つの巨大鉱脈)
    if (this.map.giantHoleCenter) {
      const gh = this.map.giantHoleCenter;
      if (gh.x + 8 >= x0 && gh.x - 8 <= x1 && gh.y + 8 >= y0 && gh.y - 8 <= y1) {
        const screen = this.camera.worldToScreen(gh.x * TILE_SIZE + TILE_SIZE / 2, gh.y * TILE_SIZE + TILE_SIZE / 2);
        const size = ts * 1.6;
        ctx.drawImage(this.icons.giant_hole, screen.x - size / 2, screen.y - size / 2, size, size);
      }
    }

    // キャラクター(人間サイズを縮小して描画)
    const humanScale = 0.14;
    for (const c of this.characters) {
      const screen = this.camera.worldToScreen(c.x * TILE_SIZE, c.y * TILE_SIZE);
      const size = ts * humanScale * 3.4; // 見やすさを保ちつつ縮小
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
      ctx.font = `${Math.max(8, ts * 0.22)}px 'DotGothic16', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(c.params.name, screen.x, screen.y - size / 2 - 3);

      this._drawPixelBubble(ctx, screen.x, screen.y - size / 2 - 16, c.getMoodText());
    }

    if (this.weather !== 'clear') this._drawWeatherOverlay();
  }

  // ドット絵風の吹き出し(常時「現在の気持ち」を日本語で表示)
  _drawPixelBubble(ctx, cx, bottomY, text) {
    ctx.font = "10px 'DotGothic16', monospace";
    const padding = 5;
    const textWidth = ctx.measureText(text).width;
    const bw = Math.ceil(textWidth + padding * 2);
    const bh = 16;
    const bx = Math.round(cx - bw / 2);
    const by = Math.round(bottomY - bh);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    // 吹き出しの尻尾(小さな四角を2つ重ねてドット感を出す)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 3, by + bh - 1, 6, 4);
    ctx.fillStyle = '#000000';
    ctx.fillRect(cx - 4, by + bh - 1, 1, 5);
    ctx.fillRect(cx + 3, by + bh - 1, 1, 5);

    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.fillText(text, cx, by + bh - 5);
  }

  _drawWeatherOverlay() {
    const ctx = this.ctx;
    const colors = {
      rain: 'rgba(80,110,160,0.10)',
      blessed_rain: 'rgba(210,180,90,0.10)',
      wind: 'rgba(200,220,210,0.06)',
      storm: 'rgba(40,40,70,0.22)',
    };
    ctx.fillStyle = colors[this.weather] || 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _tileColor(tile) {
    switch (tile.type) {
      case TILE_TYPES.SEA: return tile.n < 0.15 ? TILE_COLORS.seaDeep : TILE_COLORS.sea;
      case TILE_TYPES.LAKE: return TILE_COLORS.lake;
      case TILE_TYPES.RIVER: return TILE_COLORS.river;
      case TILE_TYPES.BEACH: return TILE_COLORS.beach;
      case TILE_TYPES.PLAINS: return TILE_COLORS.plains;
      case TILE_TYPES.FOREST: return TILE_COLORS.forest;
      case TILE_TYPES.BIG_FOREST: return TILE_COLORS.big_forest;
      case TILE_TYPES.ROCKY: return TILE_COLORS.rocky;
      case TILE_TYPES.MOUNTAIN: return tile.n > 0.88 ? TILE_COLORS.mountainDark : TILE_COLORS.mountain;
      case TILE_TYPES.GIANT_HOLE: return this._giantHoleColor(tile.holeDepth || 0);
      case TILE_TYPES.GIANT_TREE: return TILE_COLORS.giant_tree;
      case TILE_TYPES.SCORCHED_GIANT_TREE: return TILE_COLORS.scorched_giant_tree;
      default: return '#000000';
    }
  }

  // アビス風大穴のグラデーション: 実際のタイル形状(非対称・不規則な縁)そのものを深さで彩色するため、
  // 描画アイコンと地形の輪郭が食い違う(ズレ・重なり破綻)ことが起きない
  _giantHoleColor(depth) {
    const stops = [
      [0.0, [58, 46, 34]],   // 縁: ダークブラウンの断崖
      [0.35, [42, 34, 30]],  // 苔むした岩肌
      [0.6, [26, 24, 32]],   // 薄暗い中層
      [0.85, [14, 14, 26]],  // 深層の青黒
      [1.0, [42, 58, 106]],  // 最深部のかすかな発光
    ];
    let lo = stops[0], hi = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (depth >= stops[i][0] && depth <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
    }
    const span = hi[0] - lo[0] || 1;
    const t = (depth - lo[0]) / span;
    const r = Math.round(lo[1][0] + (hi[1][0] - lo[1][0]) * t);
    const g = Math.round(lo[1][1] + (hi[1][1] - lo[1][1]) * t);
    const b = Math.round(lo[1][2] + (hi[1][2] - lo[1][2]) * t);
    return `rgb(${r},${g},${b})`;
  }
}
