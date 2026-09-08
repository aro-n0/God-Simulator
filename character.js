// character.js
// 自律行動ステートマシン(徘徊/採取/休憩/睡眠/食事/祈り/交流/盗み)、
// 空腹・体力・年齢・寿命・言語レベル・好き嫌いの動的変化を扱う。
// 「現在の気持ち」は言語レベルに関わらず常に日本語で表示される(getMoodText)。

const STATES = {
  WANDER: 'WANDER',
  MOVE_TO_TARGET: 'MOVE_TO_TARGET',
  GATHER: 'GATHER',
  REST: 'REST',
  SLEEP: 'SLEEP',
  EAT: 'EAT',
  PRAY: 'PRAY',
  SOCIAL: 'SOCIAL',
  STEAL: 'STEAL',
  CULT_TASK: 'CULT_TASK',
};

const EMOTES = {
  WANDER: ['散歩中', 'ふらふら中', 'のんびり'],
  MOVE_TO_TARGET: ['向かってる…'],
  GATHER_tree: ['木を伐採中', '木こり中'],
  GATHER_big_tree: ['巨木を伐採中'],
  GATHER_stone: ['採石中'],
  GATHER_ore: ['鉱石を採掘中'],
  GATHER_fish: ['釣りをしている'],
  FARM: ['収穫中'],
  REST: ['休憩中', 'ひとやすみ'],
};

// 「今の気持ち」用の人間らしい独り言プール(システム的な行動名ではなく感情・独白として表示)
const MOOD_PHRASES = {
  WANDER: ['今日はどこへ行こうかな', '天気がいいと気分もいいな', 'のんびり歩くのが好きなんだ', '何か面白いことないかな', 'この道、前にも通ったかな'],
  MOVE_TO_TARGET: ['あそこまで行ってみよう', 'もう少しで着きそうだ', '急がなくちゃ'],
  GATHER_generic: ['この作業、正直めんどくさいな…', 'よし、集中してやろう', '思ったより時間がかかるな', '手が疲れてきたな'],
  GATHER_tree: ['この木、立派だな', '斧を振るうのは気持ちいい', 'いい薪になりそうだ'],
  GATHER_big_tree: ['とんでもなく大きい木だ…', '一人じゃ大変な作業だな'],
  GATHER_stone: ['硬い岩だな…', '掘っても掘ってもきりがない', '腰にくるなあ'],
  GATHER_ore: ['キラキラした鉱石だ', 'これはいい掘り出し物かも'],
  FISH: ['魚が釣れるといいな', '水面が静かで落ち着くよ', '今日は入れ食いかな'],
  FARM: ['やっと収穫できる', '実りの季節はうれしいな'],
  REST: ['ちょっと一息つこう', '疲れたなあ…', 'このまま座っていたい気分だ'],
  SLEEP: ['すやすや…', '夢を見ているみたいだ', 'ぐっすり眠りたいな'],
  EAT: ['お腹が空いていたんだ', 'これはおいしい！', 'やっと人心地ついた'],
  PRAY: ['どうか静まりますように…', '自然の力は恐ろしいな', '無事に過ごせますように'],
  SOCIAL: ['話せて嬉しいな', 'この人とはウマが合いそうだ', 'たまにはおしゃべりもいいね'],
  STEAL: ['ごめん…でも仕方なかったんだ', 'こんなこと、したくなかったのに', '見つかりませんように…'],
  CULT_TASK: ['教祖様のためにやらねば', 'これも信仰のためだ', '早く終わらせよう'],
  HUNGRY: ['お腹すいたな…', '早く何か食べたいよ', '力が出ないよ…'],
  LAKE_NEARBY: ['湖が綺麗だな', '水の音が心地いいよ', 'このあたり、景色がいいな'],
};

function pickMood(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const FOOD_VALUES = {
  小麦: 12, リンゴ: 14, 野菜: 13, 牛肉: 20, 牛乳: 10, 卵: 8, 豚肉: 18, 鶏肉: 16, 羊肉: 19,
};
// 素材の精製(伐採/採掘した原材料を加工品に変える。休憩中にまれに行う)
const RAW_TO_PROCESSED = { 原木: '木材', 石: '石材', 鉄鉱石: '鉄', 金鉱石: '金' };

const AGE_YEARS_PER_DAY = 1; // 1ゲーム内日 = 1年
const ADULT_AGE = 16;
const CROP_TO_ITEM = { wheat: '小麦', apple: 'リンゴ', vegetable: '野菜' };
const INVENTORY_SLOT_COUNT = 10; // マイクラ風: 所持スロットは10個固定
const INVENTORY_STACK_LIMIT = 99; // 1スロットあたりの最大スタック数

let _charIdCounter = 1;

function pickEmote(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

class Character {
  constructor(params, map, x, y, restore) {
    this.id = (restore && restore.id) || 'char_' + _charIdCounter++ + '_' + Math.floor(Math.random() * 100000);
    this.params = params;
    this.map = map;
    this.x = x;
    this.y = y;
    this.state = (restore && restore.state) || STATES.WANDER;
    this.stamina = restore && typeof restore.stamina === 'number' ? restore.stamina : 100;
    this.wanderTarget = null;
    this.wanderTimer = 0;
    this.gatherTarget = null;
    this.gatherTimer = 0;
    this.actionTimer = 0;
    this.emote = '';
    this.emoteTimer = 0;
    this.inventorySlots = new Array(INVENTORY_SLOT_COUNT).fill(null);
    if (restore && restore.inventorySlots) {
      this.inventorySlots = restore.inventorySlots;
    } else if (restore && restore.inventory) {
      for (const key in restore.inventory) this.addToInventory(key, restore.inventory[key]);
    }
    this.sprite = buildSpriteCanvas(params);
    this.facing = (restore && restore.facing) || 1;
    this.affiliation = (restore && restore.affiliation) || '無所属';
    this.isRemoteMirror = false;
    this.isDead = false;

    // 生命・欲求
    this.hunger = restore && typeof restore.hunger === 'number' ? restore.hunger : 100;
    this.hp = restore && typeof restore.hp === 'number' ? restore.hp : 100;
    this.gender = (restore && restore.gender) || (Math.random() < 0.5 ? 'male' : 'female');
    this.ageYears = restore && typeof restore.ageYears === 'number' ? restore.ageYears : 16 + Math.random() * 20;
    this.lifespanYears = restore && typeof restore.lifespanYears === 'number' ? restore.lifespanYears : 40 + Math.random() * 80;
    this._ageSpeedMul = 1;

    // 言語・社会
    this.languageLevel = (restore && restore.languageLevel) || 1;
    this.languageProgress = (restore && restore.languageProgress) || 0;
    this.partnerId = (restore && restore.partnerId) || null;
    this.marriageCooldown = 0;
    this.childCooldown = 0;
    this.titleTags = (restore && restore.titleTags) || [];
    this.prayCount = (restore && restore.prayCount) || 0;
    this.relationships = (restore && restore.relationships) || {}; // { targetId: {relationType, favorability(-100~100)} }
    this.memories = (restore && restore.memories) || []; // { id, event, importance, timestamp }

    // 性格(先天性は誕生時に確定・以後不変。後天性は体験により追加/更新される)
    this.acquiredPersonality = (restore && restore.acquiredPersonality) || [];
    if (!this.params.personalityTags) this.params.personalityTags = pickInnateTraits();
    this.dynamicJob = (restore && restore.dynamicJob) || null; // AI創出の「称号」
    this.cultName = (restore && restore.cultName) || null;
    this.pendingCultCommand = (restore && restore.pendingCultCommand) || null;
    this.qualifications = (restore && restore.qualifications) || []; // システム上の「資格」(累積保持)
    this._jobEvalCooldown = 8;

    // 体験トリガー用の行動カウンタ・一時フラグ(aiEngine.jsが参照)
    this.actionCounts = (restore && restore.actionCounts) || {
      woodcutting: 0, mining: 0, farming: 0, fishing: 0, cooking: 0,
      praying: 0, socializing: 0, hunting: 0, tigerHunts: 0, stealing: 0, nightActivity: 0, building: 0, healing: 0,
    };
    this.nightWaterTime = (restore && restore.nightWaterTime) || 0;
    this.stormHits = 0;
    this._crisisSurvived = false;
    this._bigGatherCrit = false;

    // 戦闘ステータス(防御力/攻撃力/攻撃速度)。装備品の効果はインベントリから自動加算される
    this.baseAtk = (restore && restore.baseAtk) || 5;
    this.baseDef = (restore && restore.baseDef) || 5;
    this.atkSpeed = (restore && restore.atkSpeed) || 1; // 初期値1: 1秒毎に1回攻撃
    this._attackTimer = 0;
    this._equipAtkBonus = 0;
    this._equipDefBonus = 0;

    // クラフト・建築・廃棄の間引きタイマー
    this._craftCooldown = 6 + Math.random() * 6;
    this._buildCooldown = 10 + Math.random() * 10;
    this._disposalCooldown = 12 + Math.random() * 8;

    // 動的変化トラッキング
    this.gatherStreak = (restore && restore.gatherStreak) || { tree: 0, stone: 0, big_tree: 0 };
    this.restStreak = (restore && restore.restStreak) || 0;
    this.rainExposure = (restore && restore.rainExposure) || 0;
    this._evolutionCooldown = 5;
  }

  distTo(tx, ty) {
    return Math.hypot(this.x - tx, this.y - ty);
  }

  findNearbyResource(radius, filterFn) {
    let best = null;
    let bestDist = Infinity;
    for (const r of this.map.resources) {
      if (r.amount <= 0) continue;
      if (filterFn && !filterFn(r)) continue;
      const d = this.distTo(r.x + 0.5, r.y + 0.5);
      if (d < radius && d < bestDist) {
        best = r;
        bestDist = d;
      }
    }
    return best;
  }

  // 空腹時に優先して探す食料源(完熟作物・収穫可能な動物)
  findFoodSource(radius) {
    for (const crop of this.map.crops) {
      if (crop.stage < 3) continue;
      const d = this.distTo(crop.x + 0.5, crop.y + 0.5);
      if (d < radius) return { x: crop.x, y: crop.y, type: crop.type, isCrop: true, amount: 1 };
    }
    for (const a of this.map.animals) {
      if (a.amount <= 0) continue;
      if (a.dangerous) continue;
      const d = this.distTo(a.x, a.y);
      if (d < radius) return a;
    }
    return null;
  }

  getEffectiveAtk() {
    return this.baseAtk + this._equipAtkBonus;
  }

  getEffectiveDef() {
    return this.baseDef + this._equipDefBonus;
  }

  // インベントリ内の武器/防具を自動検出してステータス補正を再計算する(専用装備枠は持たない)
  _updateEquipmentBonus() {
    let atkB = 0, defB = 0;
    for (const slot of this.inventorySlots) {
      if (slot && isEquipment(slot.item)) {
        const b = getEquipmentBonus(slot.item);
        atkB += b.atk;
        defB += b.def;
      }
    }
    this._equipAtkBonus = atkB;
    this._equipDefBonus = defB;
  }

  // 素材からの動的クラフト、および建材が貯まった際の建築(コストは自ら評価し消費する)
  _checkCraftingAndBuilding(dt) {
    this._craftCooldown -= dt;
    if (this._craftCooldown <= 0) {
      this._craftCooldown = 10 + Math.random() * 10;
      craftDynamicItem(this);
    }
    this._buildCooldown -= dt;
    if (this._buildCooldown <= 0) {
      this._buildCooldown = 20 + Math.random() * 20;
      const built = tryConstructBuilding(this, this.map);
      if (built) this.actionCounts.building += 1;
    }
  }

  // 不要アイテムの廃棄(ポイ捨て/海捨て/燃焼/埋設)。インベントリが埋まってきた際に判断する
  _checkDisposal(dt) {
    this._disposalCooldown -= dt;
    if (this._disposalCooldown > 0) return;
    this._disposalCooldown = 15 + Math.random() * 15;

    const usedSlots = this.inventorySlots.filter(Boolean).length;
    if (usedSlots < this.inventorySlots.length) return; // 満杯でなければ廃棄しない

    // 食料でも装備でもない、比較的余りやすい素材から処分先を選ぶ
    const disposableSlot = this.inventorySlots.find((s) => s && !FOOD_VALUES[s.item] && !isEquipment(s.item));
    if (!disposableSlot) return;
    const item = disposableSlot.item;

    const nearWater = this._isNearWater();
    const nearFire = this.map.buildings.some((b) => b.category === 'campfire' && this.distTo(b.x, b.y) < 3);

    let method;
    if (nearWater) method = 'sea';
    else if (nearFire) method = 'burn';
    else method = Math.random() < 0.5 ? 'litter' : 'bury';

    this.removeFromInventory(item, 1);
    if (method === 'litter') {
      this.map.groundItems.push({ x: Math.round(this.x), y: Math.round(this.y), item, count: 1 });
      this._setEmote('ポイ捨てしてしまった…');
    } else if (method === 'sea') {
      this._setEmote('海に捨てた');
    } else if (method === 'burn') {
      this._setEmote('火にくべた');
    } else {
      this._setEmote('土に埋めた');
    }
  }

  // ============ マイクラ風スロット式インベントリ(10スロット・1スロット最大99個) ============
  addToInventory(item, qty) {
    if (!item || qty <= 0) return 0;
    const stackLimit = getItemStackLimit(item);
    let remaining = qty;
    for (const slot of this.inventorySlots) {
      if (remaining <= 0) break;
      if (slot && slot.item === item && slot.count < stackLimit) {
        const space = stackLimit - slot.count;
        const add = Math.min(space, remaining);
        slot.count += add;
        remaining -= add;
      }
    }
    for (let i = 0; i < this.inventorySlots.length && remaining > 0; i++) {
      if (!this.inventorySlots[i]) {
        const add = Math.min(stackLimit, remaining);
        this.inventorySlots[i] = { item, count: add };
        remaining -= add;
      }
    }
    return qty - remaining; // 実際に格納できた数(満杯の場合は一部/全部入らないことがある)
  }

  removeFromInventory(item, qty) {
    let remaining = qty;
    for (const slot of this.inventorySlots) {
      if (remaining <= 0) break;
      if (slot && slot.item === item) {
        const take = Math.min(slot.count, remaining);
        slot.count -= take;
        remaining -= take;
      }
    }
    for (let i = 0; i < this.inventorySlots.length; i++) {
      if (this.inventorySlots[i] && this.inventorySlots[i].count <= 0) this.inventorySlots[i] = null;
    }
    return qty - remaining;
  }

  getItemCount(item) {
    return this.inventorySlots.reduce((sum, s) => sum + (s && s.item === item ? s.count : 0), 0);
  }

  hasFood() {
    return this.inventorySlots.some((s) => s && FOOD_VALUES[s.item] && s.count > 0);
  }

  getBestFoodItem() {
    let best = null, bestVal = -1;
    for (const s of this.inventorySlots) {
      if (s && FOOD_VALUES[s.item] && FOOD_VALUES[s.item] > bestVal) { best = s.item; bestVal = FOOD_VALUES[s.item]; }
    }
    return best;
  }

  // isNight/weather/ageDeltaYears/moveSpeedMul/fatigueMul はゲームループから渡される
  update(dt, ctx) {
    if (this.isRemoteMirror) return;
    ctx = ctx || {};
    if (this.hp <= 0) { this.isDead = true; return; }

    this.emoteTimer -= dt;
    this.ageYears += ctx.ageDeltaYears || 0;

    // 言語レベルは年齢・時間経過で緩やかに上昇する
    this.languageProgress += dt * (0.5 + (this.params.int || 5) * 0.05);
    if (this.languageProgress > 40 && this.languageLevel < 5) {
      this.languageProgress = 0;
      this.languageLevel += 1;
    }

    // 年齢に応じた移動速度の低下(寿命の70%を超えると徐々に遅くなる)
    const ratio = this.ageYears / this.lifespanYears;
    if (ratio > 0.7) this._ageSpeedMul = Math.max(0.3, 1 - ((ratio - 0.7) / 0.3) * 0.7);
    else this._ageSpeedMul = 1;
    if (ratio >= 1) this.hp -= dt * 2.5; // 寿命超過で衰弱

    // 空腹・体力の増減(天候で悪天候時は消耗が早い)
    const hungerRate = 0.12 * (ctx.fatigueMul || 1);
    this.hunger = Math.max(0, this.hunger - dt * hungerRate);
    if (this.hunger <= 0) this.hp = Math.max(0, this.hp - dt * 2);
    else if (this.hunger > 40 && this.hp < 100) this.hp = Math.min(100, this.hp + dt * 0.3);

    if (this.marriageCooldown > 0) this.marriageCooldown -= dt;
    if (this.childCooldown > 0) this.childCooldown -= dt;

    const isOutside = this.state !== STATES.REST && this.state !== STATES.SLEEP;
    if (ctx.weather === 'rain' || ctx.weather === 'blessed_rain' || ctx.weather === 'storm') {
      if (isOutside) this.rainExposure += dt;
    }
    if (ctx.weather === 'storm' && isOutside && Math.random() < dt * 0.01) {
      this.hp = Math.max(0, this.hp - 8);
      this.stormHits += 1;
    }
    if (ctx.isNight && this.state !== STATES.SLEEP) this.actionCounts.nightActivity += dt;
    if (ctx.isNight && this._isNearWater() && (this.state === STATES.WANDER || this.state === STATES.REST)) {
      this.nightWaterTime += dt;
    }
    if (this.hp < 15) this._crisisFlag = true;
    if (this._crisisFlag && this.hp > 50) { this._crisisFlag = false; this._crisisSurvived = true; }

    // --- 優先度: 教祖の命令(最優先) > 睡眠(夜) > 空腹での食事 > 天候での祈り > 通常AI ---
    if (this.pendingCultCommand && this.state !== STATES.CULT_TASK) {
      this.state = STATES.CULT_TASK;
      this.actionTimer = 8 + Math.random() * 6;
      this._setEmote('教祖の命令を実行中');
    }

    if (this.state !== STATES.CULT_TASK) {
      if (ctx.isNight) {
        if (this.state !== STATES.SLEEP) { this.state = STATES.SLEEP; this._setEmote('眠っている'); }
      } else if (this.state === STATES.SLEEP) {
        this.state = STATES.WANDER;
      }
    }

    if (this.state !== STATES.SLEEP && this.state !== STATES.CULT_TASK) {
      if (this.hunger < 35 && this.hasFood() && this.state !== STATES.EAT) {
        this._startEat();
      } else if (
        ctx.weather === 'storm' &&
        this.state !== STATES.PRAY &&
        this.state !== STATES.EAT &&
        Math.random() < 0.004 * (1 + (this.params.int || 5) / 10)
      ) {
        this.state = STATES.PRAY;
        this.actionTimer = 4 + Math.random() * 3;
        this.prayCount += 1;
        this._setEmote('祈っている');
        if (this.prayCount >= 5 && !this.titleTags.includes('信心深い')) this.titleTags.push('信心深い');
      }
    }

    const moveSpeedMul = (ctx.moveSpeedMul || 1) * this._ageSpeedMul;

    switch (this.state) {
      case STATES.WANDER: this._updateWander(dt, moveSpeedMul); break;
      case STATES.MOVE_TO_TARGET: this._updateMoveToTarget(dt, moveSpeedMul); break;
      case STATES.GATHER: this._updateGather(dt); break;
      case STATES.REST: this._updateRest(dt); break;
      case STATES.SLEEP: this._updateSleep(dt); break;
      case STATES.EAT: this._updateAction(dt, EMOTES.REST); break;
      case STATES.PRAY: this._updateAction(dt, ['祈っている']); break;
      case STATES.SOCIAL: this._updateAction(dt, ['交流中']); break;
      case STATES.STEAL: this._updateAction(dt, ['こっそり…']); break;
      case STATES.CULT_TASK: this._updateCultTask(dt); break;
    }
    this.stamina = Math.max(0, Math.min(100, this.stamina));
    this.hp = Math.max(0, Math.min(100, this.hp));
    if (this.hp <= 0) this.isDead = true;
    this._checkTraitEvolution(dt);

    this._jobEvalCooldown -= dt;
    if (this._jobEvalCooldown <= 0) {
      this._jobEvalCooldown = 20;
      const title = evaluateJobTitle(this);
      if (title) this.dynamicJob = title;
      evaluateQualifications(this);
    }

    this._updateEquipmentBonus();
    this._checkCraftingAndBuilding(dt);
    this._checkDisposal(dt);
  }

  _startEat() {
    const key = this.getBestFoodItem();
    if (!key) return;
    this.removeFromInventory(key, 1);
    let value = FOOD_VALUES[key] || 10;
    const nearFire = this.map.buildings.some((b) => b.category === 'campfire' && this.distTo(b.x, b.y) < 3);
    if (nearFire) { value *= 1.5; this.actionCounts.cooking += 1; }
    this.hunger = Math.min(100, this.hunger + value);
    this.state = STATES.EAT;
    this.actionTimer = 1.5;
    this._setEmote('食事中');
  }

  _updateAction(dt, emotePool) {
    this.actionTimer -= dt;
    if (Math.random() < 0.02) this._setEmote(pickEmote(emotePool));
    if (this.actionTimer <= 0) this.state = STATES.WANDER;
  }

  _updateCultTask(dt) {
    this.actionTimer -= dt;
    if (Math.random() < 0.02) this._setEmote('教祖の命令を実行中');
    if (this.actionTimer <= 0) {
      this.pendingCultCommand = null;
      this.state = STATES.WANDER;
    }
  }

  _setEmote(text) {
    this.emote = text;
    this.emoteTimer = 3;
  }

  _updateWander(dt, moveSpeedMul) {
    this._tigerMemoryLogged = false;
    this.stamina -= dt * 0.6;
    if (this.stamina < this.params.restThreshold) {
      this.state = STATES.REST;
      this._setEmote(pickEmote(EMOTES.REST));
      return;
    }

    // 近くに落ちているアイテムがあれば拾う(ポイ捨てされた物を他人が拾得可能に)
    const groundIdx = this.map.groundItems.findIndex((g) => this.distTo(g.x, g.y) < 1.2);
    if (groundIdx !== -1) {
      const g = this.map.groundItems[groundIdx];
      const picked = this.addToInventory(g.item, g.count);
      if (picked > 0) {
        this.map.groundItems.splice(groundIdx, 1);
        this._setEmote('何かを拾った');
      }
    }

    // 超巨大樹は伐採できないが、近くを探索すると稀に伝説の枝が見つかる
    if (this.map.giantTreeCenter && !this.map.isGiantTreeFullyScorched()) {
      const gt = this.map.giantTreeCenter;
      if (this.distTo(gt.x, gt.y) < 8 && Math.random() < 0.002) {
        if (this.addToInventory('伝説の枝', 1) > 0) this._setEmote('伝説の枝を見つけた！');
      }
    }

    // 空腹なら食料源を優先探索、平常時は木/石などの資源探索
    let target = null;
    let isFood = false;
    if (this.hunger < 55) {
      target = this.findFoodSource(14);
      isFood = !!target;
    }
    if (!target && Math.random() < 0.02) {
      target = this.findNearbyResource(12, null);
    }
    if (target) {
      this.gatherTarget = target;
      this.gatherTarget.isFoodTarget = isFood;
      this.state = STATES.MOVE_TO_TARGET;
      this._setEmote(pickEmote(EMOTES.MOVE_TO_TARGET));
      return;
    }

    this.wanderTimer -= dt;
    if (!this.wanderTarget || this.wanderTimer <= 0) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 3 + Math.random() * 5;
      let tx = this.x + Math.cos(angle) * dist;
      let ty = this.y + Math.sin(angle) * dist;
      tx = Math.max(1, Math.min(this.map.width - 2, tx));
      ty = Math.max(1, Math.min(this.map.height - 2, ty));
      this.wanderTarget = { x: tx, y: ty };
      this.wanderTimer = 3 + Math.random() * 3;
      if (Math.random() < 0.3) this._setEmote(pickEmote(EMOTES.WANDER));
    }
    this._moveToward(this.wanderTarget.x, this.wanderTarget.y, dt, 0.5 * moveSpeedMul);
  }

  _updateMoveToTarget(dt, moveSpeedMul) {
    this.stamina -= dt * 0.6;
    if (!this.gatherTarget || this.gatherTarget.amount <= 0) {
      this.state = STATES.WANDER;
      return;
    }
    const arriveRadius = this.gatherTarget.isWater ? 1.1 : this.gatherTarget.isAnimal ? 0.8 : 0.15;
    const arrived = this._moveToward(this.gatherTarget.x + 0.5, this.gatherTarget.y + 0.5, dt, moveSpeedMul, arriveRadius);
    if (arrived) {
      this.state = STATES.GATHER;
      this.gatherTimer = 0;
      const key = 'GATHER_' + (this.gatherTarget.type || '');
      this._setEmote(pickEmote(EMOTES[key] || EMOTES.FARM));
    }
  }

  _updateGather(dt) {
    this.stamina -= dt * 0.3;
    if (this.stamina < this.params.restThreshold) {
      this.state = STATES.REST;
      this._setEmote(pickEmote(EMOTES.REST));
      return;
    }
    const target = this.gatherTarget;
    if (!target) { this.state = STATES.WANDER; return; }

    // 作物(成長ベース)
    if (target.isCrop) {
      const crop = this.map.crops.find((c) => c.x === target.x && c.y === target.y);
      if (!crop || crop.stage < 3) { this.gatherTarget = null; this.state = STATES.WANDER; return; }
      this.gatherTimer += dt;
      if (this.gatherTimer > 1.5) {
        this.gatherTimer = 0;
        crop.stage = 0; crop.timer = 0;
        this.addToInventory(CROP_TO_ITEM[crop.type] || crop.type, 1);
        this.actionCounts.farming += 1;
        this.gatherTarget = null;
        this.state = STATES.WANDER;
      }
      return;
    }

    // 動物(卵/牛乳/毛皮/肉、羊は毛刈り優先)
    if (target.isAnimal) {
      if (target.amount <= 0) { this.gatherTarget = null; this.state = STATES.WANDER; return; }

      if (target.dangerous) {
        // 攻撃速度に応じた戦闘。ダメージ=max(0, 攻撃力-防御力)。相手も反撃してくる
        this._attackTimer -= dt;
        if (this._attackTimer <= 0) {
          this._attackTimer = 1 / (this.atkSpeed || 1);
          const drops = attackDangerousAnimal(target, this.getEffectiveAtk());
          this.actionCounts.hunting += 1;
          if (target.type === 'tiger') this.actionCounts.tigerHunts += 1;
          if (drops) {
            drops.forEach((d) => this.addToInventory(d, 1));
            this.gatherTarget = null;
            this.state = STATES.WANDER;
            return;
          }
        }
        target.attackTimer -= dt;
        if (target.attackTimer <= 0) {
          target.attackTimer = 1 / (target.atkSpeed || 1);
          const dmg = Math.max(0, target.atk - this.getEffectiveDef());
          this.hp = Math.max(0, this.hp - dmg);
          if (dmg > 0 && !this._tigerMemoryLogged) { this._tigerMemoryLogged = true; this.addMemory('虎に襲われた', 8); }
          if (this.hp <= 0) { this.gatherTarget = null; this.state = STATES.WANDER; }
        }
        return;
      }

      this.gatherTimer += dt;
      if (this.gatherTimer > 1.2) {
        this.gatherTimer = 0;
        let drop = null;
        if (target.type === 'sheep') drop = shearAnimal(target);
        else if (target.type === 'chicken') drop = layEgg(target);
        if (!drop) drop = harvestAnimal(target);
        this.addToInventory(drop, 1);
        if (target.amount <= 0) { this.gatherTarget = null; this.state = STATES.WANDER; }
      }
      return;
    }

    // 通常資源(木/巨木/石/鉱石/水/砂)
    if (target.amount <= 0) { this.gatherTarget = null; this.state = STATES.WANDER; return; }
    this.gatherTimer += dt;
    const bonus = (this.params.gatherBonus && this.params.gatherBonus[target.type]) || 1;
    const rate = 0.5 * bonus * this.params.gatherEffMul;
    if (this.gatherTimer > 1 / rate) {
      this.gatherTimer = 0;
      const type = target.type;
      if (target.amount !== Infinity) target.amount -= 1;

      if (type === 'tree' || type === 'big_tree') {
        this.addToInventory('原木', type === 'big_tree' ? 4 : 2);
        this.actionCounts.woodcutting += 1;
        if (Math.random() < 0.15) this.addToInventory('枝', 1);
      } else if (type === 'stone') {
        this.addToInventory('石', 1);
        this.actionCounts.mining += 1;
        if (Math.random() < 0.2) this.addToInventory('土', 1);
      } else if (type === 'ore') {
        // 大穴採掘時のみ: 鉄鉱石10%・金鉱石5%(それ以外は空振り)
        if (target.isGiant && !this._abyssMemoryLogged) { this._abyssMemoryLogged = true; this.addMemory('大穴を調査した', 5); }
        const roll = Math.random();
        if (roll < 0.1) { this.addToInventory('鉄鉱石', 1); if (target.isGiant) this._bigGatherCrit = true; }
        else if (roll < 0.15) { this.addToInventory('金鉱石', 1); if (target.isGiant) this._bigGatherCrit = true; }
        this.actionCounts.mining += 1;
      } else if (type === 'water') {
        // 容器(バケツ/コップ)を持っていないと水は汲めない
        const containerKey = Object.keys(WATER_CONTAINERS).find((k) => this.getItemCount(k) > 0);
        if (containerKey) {
          this.removeFromInventory(containerKey, 1);
          this.addToInventory(WATER_CONTAINERS[containerKey], 1);
        }
      } else if (type === 'sand') {
        this.addToInventory('砂', 1);
      }

      if (this.gatherStreak[type] != null) this.gatherStreak[type] += 1;
      if (Math.random() < 0.3) this._setEmote(pickEmote(EMOTES['GATHER_' + type] || ['作業中']));
      if (target.amount <= 0) {
        this.gatherTarget = null;
        this.state = STATES.WANDER;
      } else if (Math.random() > this.params.gatherPersist * 0.9) {
        this.state = STATES.WANDER;
      }
    }
  }

  _updateRest(dt) {
    this.stamina += dt * 8;
    this.restStreak += dt;
    if (Math.random() < 0.01) this._setEmote(pickEmote(EMOTES.REST));
    // 素材を精製することがある(原木→木材、石→石材、鉱石→金属)
    if (!this._cookedThisRest) {
      const rawKey = Object.keys(RAW_TO_PROCESSED).find((k) => this.getItemCount(k) > 0);
      if (rawKey && Math.random() < 0.4) {
        this.removeFromInventory(rawKey, 1);
        const processed = RAW_TO_PROCESSED[rawKey];
        this.addToInventory(processed, 1);
        this._setEmote('加工中');
      }
      this._cookedThisRest = true;
    }
    if (this.stamina >= 90) { this.state = STATES.WANDER; this._cookedThisRest = false; }
  }

  _updateSleep(dt) {
    this.stamina = Math.min(100, this.stamina + dt * 15);
    this.hunger = Math.max(0, this.hunger - dt * 0.05);
    this.hp = Math.min(100, this.hp + dt * 1.5);
  }

  _moveToward(tx, ty, dt, speedMul = 1, arriveRadius = 0.15) {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < arriveRadius) return true;
    // 水場に入っていると移動速度が低下する(漁師資格保持者は軽減)
    let waterMul = 1;
    if (this.map.isWaterTile(this.x, this.y)) {
      waterMul = this.qualifications.includes('漁業') ? 0.8 : 0.5;
    }
    const speed = this.params.speed * speedMul * waterMul * dt;
    const step = Math.min(speed, d);
    const nx = this.x + (dx / d) * step;
    const ny = this.y + (dy / d) * step;
    if (this.map.isWalkable(nx, ny)) {
      this.x = nx; this.y = ny;
      this.facing = dx >= 0 ? 1 : -1;
    } else {
      this.wanderTarget = null;
    }
    return false;
  }

  // 体験に基づく好き・苦手・後天性性格の自由生成をaiEngine.jsへ委譲する(数秒おきに判定)
  _checkTraitEvolution(dt) {
    this._evolutionCooldown -= dt;
    if (this._evolutionCooldown > 0) return;
    this._evolutionCooldown = 5;
    tryGenerateExperienceTags(this);
  }

  // 能力タグ(ステータスから自動導出)
  // ============ 人間関係(relationships)・エピソード記憶(memories) ============
  getFavorability(targetId) {
    const r = this.relationships[targetId];
    return r ? r.favorability : 0;
  }

  adjustFavorability(targetId, delta) {
    if (!this.relationships[targetId]) this.relationships[targetId] = { relationType: null, favorability: 0 };
    const r = this.relationships[targetId];
    r.favorability = Math.max(-100, Math.min(100, r.favorability + delta));
    return r.favorability;
  }

  setRelationType(targetId, relationType) {
    if (!this.relationships[targetId]) this.relationships[targetId] = { relationType: null, favorability: 0 };
    this.relationships[targetId].relationType = relationType;
  }

  // 体験を短期・長期記憶として記録する(重要度が低いものから古い順に間引かれる)
  addMemory(event, importance) {
    this.memories.push({ id: 'mem_' + Date.now() + '_' + Math.floor(Math.random() * 10000), event, importance: importance || 1, timestamp: Date.now() });
    const MAX_MEMORIES = 20;
    if (this.memories.length > MAX_MEMORIES) {
      this.memories.sort((a, b) => a.importance - b.importance || a.timestamp - b.timestamp);
      this.memories.shift();
    }
  }

  getAbilityTags() {
    const tags = [];
    const p = this.params;
    if ((p.str || 0) >= 8) tags.push('怪力');
    if ((p.agi || 0) >= 8) tags.push('俊足');
    if ((p.int || 0) >= 8) tags.push('賢者');
    if ((p.cha || 0) >= 8) tags.push('人気者');
    if (tags.length === 0) tags.push('見習い');
    return tags;
  }

  // モーダル/吹き出し表示用の「現在の気持ち」。言語レベルに関わらず常に日本語の
  // 人間らしい独白として表示され、数秒間は同じ内容を保持する(頻繁に切り替わらないように)。
  getMoodText() {
    if (this.isDead) return '……';

    if (this._moodPhraseTimer == null) this._moodPhraseTimer = 0;
    this._moodPhraseTimer -= 1 / 30; // getMoodTextは概ね毎フレーム呼ばれる想定の簡易減衰

    if (this._moodPhraseTimer > 0 && this._moodPhraseState === this.state) {
      return this._moodPhrase || this._pickMoodPhrase();
    }
    return this._pickMoodPhrase();
  }

  _pickMoodPhrase() {
    this._moodPhraseTimer = 4 + Math.random() * 3;
    this._moodPhraseState = this.state;

    if (this.hunger < 25 && this.state !== STATES.EAT) {
      this._moodPhrase = pickMood(MOOD_PHRASES.HUNGRY);
      return this._moodPhrase;
    }

    if ((this.state === STATES.WANDER || this.state === STATES.REST) && this._isNearWater() && Math.random() < 0.4) {
      this._moodPhrase = pickMood(MOOD_PHRASES.LAKE_NEARBY);
      return this._moodPhrase;
    }

    let pool;
    switch (this.state) {
      case STATES.SLEEP: pool = MOOD_PHRASES.SLEEP; break;
      case STATES.EAT: pool = MOOD_PHRASES.EAT; break;
      case STATES.PRAY: pool = MOOD_PHRASES.PRAY; break;
      case STATES.SOCIAL: pool = MOOD_PHRASES.SOCIAL; break;
      case STATES.STEAL: pool = MOOD_PHRASES.STEAL; break;
      case STATES.CULT_TASK: pool = MOOD_PHRASES.CULT_TASK; break;
      case STATES.MOVE_TO_TARGET: pool = MOOD_PHRASES.MOVE_TO_TARGET; break;
      case STATES.REST: pool = MOOD_PHRASES.REST; break;
      case STATES.GATHER: {
        const type = this.gatherTarget && this.gatherTarget.type;
        pool = MOOD_PHRASES['GATHER_' + type] || (this.gatherTarget && this.gatherTarget.isCrop ? MOOD_PHRASES.FARM : MOOD_PHRASES.GATHER_generic);
        break;
      }
      default: pool = MOOD_PHRASES.WANDER;
    }
    this._moodPhrase = pickMood(pool || MOOD_PHRASES.WANDER);
    return this._moodPhrase;
  }

  _isNearWater() {
    const tx = Math.round(this.x), ty = Math.round(this.y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const t = this.map.getTile(tx + dx, ty + dy);
        if (t && (t.type === 'lake' || t.type === 'river' || t.type === 'sea')) return true;
      }
    }
    return false;
  }

  serialize() {
    return { x: this.x, y: this.y, state: this.state, emote: this.emote, facing: this.facing };
  }

  fullSerialize() {
    return {
      id: this.id, params: this.params, x: this.x, y: this.y, state: this.state,
      stamina: this.stamina, inventorySlots: this.inventorySlots, facing: this.facing,
      affiliation: this.affiliation, gatherStreak: this.gatherStreak, restStreak: this.restStreak,
      rainExposure: this.rainExposure, hunger: this.hunger, hp: this.hp, gender: this.gender,
      ageYears: this.ageYears, lifespanYears: this.lifespanYears, languageLevel: this.languageLevel,
      languageProgress: this.languageProgress, partnerId: this.partnerId, titleTags: this.titleTags,
      prayCount: this.prayCount, relationships: this.relationships, memories: this.memories, acquiredPersonality: this.acquiredPersonality,
      dynamicJob: this.dynamicJob, actionCounts: this.actionCounts, nightWaterTime: this.nightWaterTime,
      qualifications: this.qualifications, baseAtk: this.baseAtk, baseDef: this.baseDef, atkSpeed: this.atkSpeed,
      cultName: this.cultName, pendingCultCommand: this.pendingCultCommand,
    };
  }
}
