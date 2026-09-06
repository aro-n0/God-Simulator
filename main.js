// main.js
// Canvasセットアップ、ゲームループ、天候/昼夜/寿命システム、婚姻・出産、
// 住民作成モーダル・キャラ一覧・世界のルールパネル・キャラ詳細モーダルの結線。

let game;

const WEATHER_EFFECTS = {
  clear: { moveSpeedMul: 1, fatigueMul: 1, cropGrowthMul: 1, treeRegenMul: 0, label: '☀ 晴れ' },
  rain: { moveSpeedMul: 0.85, fatigueMul: 1.2, cropGrowthMul: 1.5, treeRegenMul: 0.3, label: '🌧 雨' },
  blessed_rain: { moveSpeedMul: 0.9, fatigueMul: 1.1, cropGrowthMul: 2.2, treeRegenMul: 0.8, label: '🌦 恵みの雨' },
  wind: { moveSpeedMul: 0.8, fatigueMul: 1.15, cropGrowthMul: 1, treeRegenMul: 0, label: '🌬 強風' },
  storm: { moveSpeedMul: 0.7, fatigueMul: 1.3, cropGrowthMul: 1.3, treeRegenMul: 0.4, label: '⛈ 雷雨' },
};
const WEATHER_ORDER = ['clear', 'rain', 'blessed_rain', 'wind', 'storm'];
const WEATHER_WEIGHTS = [0.45, 0.22, 0.1, 0.13, 0.1];

const DAY_LENGTH_SEC = 24 * 60; // 1日=24分(現実時間, x1速度時)
const NIGHT_START_SEC = 16 * 60; // 昼16分/夜8分
// ADULT_AGE は character.js で定義済みのものをそのまま利用する(重複宣言を避ける)
const MAX_POPULATION = 90;
const VILLAGE_NAME_POOL = ['あさひ村', 'みどり村', 'かぜの村', 'いずみ村', 'たいよう村', 'つき村'];

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

    // アイコンキャッシュ(木/巨木/岩/鉱石/作物/動物)
    this._buildIconCache();

    this._modalChar = null;
    this._modalRefreshCounter = 0;
    this._bindModals();

    if (config.remoteInit) {
      this.seed = config.remoteInit.seed;
      this.map = new GameMap(this.seed);
      this.characters = config.remoteInit.characters.map((p) => {
        const c = new Character(p, this.map, 50, 50);
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
    }

    this.room = window.roomManager || null;
    if (this.room) this.room.attachGame(this);

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
  }

  _startAutosave() {
    this._autosaveTimer = setInterval(() => this._saveWorld(), 5000);
    window.addEventListener('beforeunload', () => this._saveWorld());
  }

  _saveWorld() {
    if (!this.worldId || this.isObserverMode) return;
    updateWorldData(this.worldId, { seed: this.seed, characters: this.characters.map((c) => c.fullSerialize()) });
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
    document.getElementById('rules-modal-close').addEventListener('click', () => this._closeModal('rules-modal'));
    document.getElementById('animal-modal-close').addEventListener('click', () => this._closeModal('animal-modal'));
    ['char-modal', 'roster-modal', 'rules-modal', 'creator-modal', 'animal-modal'].forEach((id) => {
      const modal = document.getElementById(id);
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
    });

    document.getElementById('btn-open-roster').addEventListener('click', () => {
      this._renderRoster();
      document.getElementById('roster-modal').classList.add('open');
    });
    document.getElementById('btn-open-rules').addEventListener('click', () => {
      this._renderRules();
      document.getElementById('rules-modal').classList.add('open');
    });
  }

  _closeModal(id) {
    document.getElementById(id).classList.remove('open');
    if (id === 'char-modal') this._modalChar = null;
    if (id === 'animal-modal') this._modalAnimal = null;
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

  _renderRules() {
    document.getElementById('rules-text-body').textContent = WORLD_RULES_TEXT.trim();
    const table = document.getElementById('rules-behavior-table');
    table.innerHTML = '<tr><th>性格ラベル</th><th>実際の挙動</th></tr>' +
      PERSONALITY_BEHAVIOR_MAP.map((r) => `<tr><td>${r.label}</td><td>${r.effect}</td></tr>`).join('');
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

    if (closestChar && (!closestAnimal || closestCharDist <= closestAnimalDist)) {
      this._openCharacterModal(closestChar);
    } else if (closestAnimal) {
      this._openAnimalModal(closestAnimal);
    }
  }

  _retriggerBubble(el) {
    el.classList.remove('bubble-pop');
    void el.offsetWidth; // reflow でアニメーションを再生させる
    el.classList.add('bubble-pop');
  }

  _openAnimalModal(a) {
    this._modalAnimal = a;
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
    document.getElementById('char-modal-affiliation').textContent = c.affiliation || '無所属';
    document.getElementById('char-modal-job').textContent = c.params.job || 'なし';
    const bubble = document.getElementById('char-modal-mood-bubble');
    const newMood = c.getMoodText();
    if (bubble.textContent !== newMood) { bubble.textContent = newMood; this._retriggerBubble(bubble); }
    document.getElementById('char-modal-basestats').textContent =
      `${c.params.str || '-'} / ${c.params.agi || '-'} / ${c.params.int || '-'} / ${c.params.cha || '-'}`;
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
    fill('char-modal-ability-tags', c.getAbilityTags(), 'tag-ability', '能力');
    fill('char-modal-title-tags', c.titleTags, 'tag-title', '肩書き');
    fill('char-modal-likes', c.params.likes, 'tag-like', '好き');
    fill('char-modal-dislikes', c.params.dislikes, 'tag-dislike', '苦手');
    const invEntries = Object.keys(c.inventory || {}).filter((k) => c.inventory[k] > 0).map((k) => `${k}x${c.inventory[k]}`);
    fill('char-modal-inventory', invEntries, 'tag-inventory', null);
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
        a.affinity[b.id] = Math.min(100, (a.affinity[b.id] || 0) + gain);
        b.affinity[a.id] = Math.min(100, (b.affinity[a.id] || 0) + gain);

        if (!busy(a) && !busy(b) && Math.random() < 0.15) {
          a.state = STATES.SOCIAL; a.actionTimer = 2.5; a._setEmote(pickDialogue('greeting'));
          b.state = STATES.SOCIAL; b.actionTimer = 2.5; b._setEmote(pickDialogue('friendly'));
        }

        // 結婚判定
        if (
          !a.partnerId && !b.partnerId && a.gender !== b.gender &&
          a.ageYears >= ADULT_AGE && b.ageYears >= ADULT_AGE &&
          a.languageLevel >= 2 && b.languageLevel >= 2 &&
          a.affinity[b.id] >= 60 && b.affinity[a.id] >= 60 &&
          Math.random() < 0.05
        ) {
          a.partnerId = b.id; b.partnerId = a.id;
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
        }

        // 犯罪(窃盗)判定
        const tryTheft = (thief, victim) => {
          if (thief.hunger < 15 && !thief.hasFood() && thief.stamina < 35 && victim.hasFood() && (thief.affinity[victim.id] || 0) < 20) {
            if (Math.random() < 0.15) {
              const key = victim._bestFoodKey();
              if (key) {
                victim.inventory[key] -= 1;
                if (victim.inventory[key] <= 0) delete victim.inventory[key];
                thief.inventory[key] = (thief.inventory[key] || 0) + 1;
                victim.affinity[thief.id] = Math.max(0, (victim.affinity[thief.id] || 0) - 30);
                thief.state = STATES.STEAL; thief.actionTimer = 1.5; thief._setEmote('盗んでしまった…');
                victim._setEmote(pickDialogue('steal_victim'));
                if (!thief.titleTags.includes('犯罪者')) thief.titleTags.push('犯罪者');
              }
            }
          }
        };
        tryTheft(a, b);
        tryTheft(b, a);
      }
    }
  }

  _updateVillages() {
    const alive = this.characters.filter((c) => !c.isRemoteMirror && !c.isDead);
    const visited = new Set();
    let villageIndex = 0;
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
          const name = existing ? existing.affiliation : VILLAGE_NAME_POOL[villageIndex % VILLAGE_NAME_POOL.length];
          cluster.forEach((m) => { m.affiliation = name; });
          villageIndex++;
        }
      }
    }
  }

  // ============ メインループ ============
  _loop(now) {
    const realDt = Math.min(0.1, (now - this._lastTime) / 1000);
    this._lastTime = now;
    const dt = realDt * this.speedMultiplier;

    // 天候
    this._weatherTimer -= dt;
    if (this._weatherTimer <= 0) {
      this.weather = this._pickWeather();
      this._weatherTimer = this.weather === 'storm' ? 12 + Math.random() * 10 : 25 + Math.random() * 25;
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
    };

    if (!this.isObserverMode) {
      for (const c of this.characters) c.update(dt, ctx);
      this.characters = this.characters.filter((c) => !c.isDead);

      this.map.updateCrops(dt, weatherEffect.cropGrowthMul);
      this.map.regenerateTrees(dt, weatherEffect.treeRegenMul);
      updateAnimals(this.map, dt);
      this.map.updateFire(dt);
      if (this.weather === 'storm' && this.map.giantTreeBurning.size === 0 && !this.map.isGiantTreeFullyScorched()) {
        if (Math.random() < dt * 0.01) this.map.igniteGiantTree();
      }

      this._socialTimer -= dt;
      if (this._socialTimer <= 0) { this._socialTimer = 3; this._updateSocialSystems(); }
      this._villageTimer -= dt;
      if (this._villageTimer <= 0) { this._villageTimer = 15; this._updateVillages(); }
    }

    if (this._modalChar) {
      this._modalRefreshCounter++;
      if (this._modalRefreshCounter % 15 === 0) this._refreshModal();
    }
    if (this._modalAnimal) {
      if (this._modalRefreshCounter % 30 === 0) this._refreshAnimalModal();
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

    // 超巨大樹(燃焼中は延焼タイルを炎アイコンで強調表示。地形色自体は焼失に応じて変化する)
    if (this.map.giantTreeCenter) {
      const gt = this.map.giantTreeCenter;
      if (gt.x + 6 >= x0 && gt.x - 6 <= x1 && gt.y + 6 >= y0 && gt.y - 6 <= y1) {
        if (this.map.giantTreeBurning.size === 0 && !this.map.isGiantTreeFullyScorched()) {
          const screen = this.camera.worldToScreen(gt.x * TILE_SIZE + TILE_SIZE / 2, gt.y * TILE_SIZE + TILE_SIZE / 2);
          const size = ts * 8.2;
          ctx.drawImage(this.icons.giant_tree, screen.x - size / 2, screen.y - size / 2, size, size);
        } else {
          for (const key of this.map.giantTreeBurning.keys()) {
            const [fx, fy] = key.split(',').map(Number);
            const screen = this.camera.worldToScreen(fx * TILE_SIZE + TILE_SIZE / 2, fy * TILE_SIZE + TILE_SIZE / 2);
            const size = ts * 0.9;
            ctx.drawImage(this.icons.fire, screen.x - size / 2, screen.y - size / 2, size, size);
          }
        }
      }
    }

    // 大穴(世界に1つの巨大鉱脈)
    if (this.map.giantHoleCenter) {
      const gh = this.map.giantHoleCenter;
      if (gh.x + 6 >= x0 && gh.x - 6 <= x1 && gh.y + 6 >= y0 && gh.y - 6 <= y1) {
        const screen = this.camera.worldToScreen(gh.x * TILE_SIZE + TILE_SIZE / 2, gh.y * TILE_SIZE + TILE_SIZE / 2);
        const size = ts * 7.8;
        ctx.drawImage(this.icons.ore, screen.x - size / 2, screen.y - size / 2, size, size);
      }
    }

    // キャラクター(スプライトを1/4サイズで描画)
    const humanScale = 0.28;
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
      case TILE_TYPES.GIANT_HOLE: return TILE_COLORS.giant_hole;
      case TILE_TYPES.GIANT_TREE: return TILE_COLORS.giant_tree;
      case TILE_TYPES.SCORCHED_GIANT_TREE: return TILE_COLORS.scorched_giant_tree;
      default: return '#000000';
    }
  }
}
