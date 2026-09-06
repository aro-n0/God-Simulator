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
  HUNGRY: ['お腹すいたな…', '早く何か食べたいよ', '力が出ないよ…'],
  LAKE_NEARBY: ['湖が綺麗だな', '水の音が心地いいよ', 'このあたり、景色がいいな'],
};

function pickMood(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const FOOD_VALUES = {
  wheat: 12, apple: 14, vegetable: 13, meat: 18, milk: 10, egg: 8, fish: 15,
  bread: 32, cooked_meat: 36, cooked_fish: 30, cooked_vegetable: 28,
};
const RAW_TO_COOKED = { wheat: 'bread', meat: 'cooked_meat', fish: 'cooked_fish', vegetable: 'cooked_vegetable' };

const AGE_YEARS_PER_DAY = 3; // 1ゲーム内日 = 3年(短時間で寿命を観測できるようにする調整値)
const ADULT_AGE = 16;

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
    this.inventory = (restore && restore.inventory) || {};
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
    this.affinity = (restore && restore.affinity) || {};

    // 性格(先天性は誕生時に確定・以後不変。後天性は体験により追加/更新される)
    this.acquiredPersonality = (restore && restore.acquiredPersonality) || [];
    if (!this.params.personalityTags) this.params.personalityTags = pickInnateTraits();
    this.dynamicJob = (restore && restore.dynamicJob) || null;
    this._jobEvalCooldown = 8;

    // 体験トリガー用の行動カウンタ・一時フラグ(aiEngine.jsが参照)
    this.actionCounts = (restore && restore.actionCounts) || {
      woodcutting: 0, mining: 0, farming: 0, fishing: 0, cooking: 0,
      praying: 0, socializing: 0, hunting: 0, tigerHunts: 0, stealing: 0, nightActivity: 0,
    };
    this.nightWaterTime = (restore && restore.nightWaterTime) || 0;
    this.stormHits = 0;
    this._crisisSurvived = false;
    this._bigGatherCrit = false;

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

  // 空腹時に優先して探す食料源(完熟作物・収穫可能な動物・魚)
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
    if (this.params.canFish) {
      const fish = this.findNearbyResource(radius, (r) => r.type === 'fish');
      if (fish) return fish;
    }
    return null;
  }

  hasFood() {
    return Object.keys(this.inventory).some((k) => FOOD_VALUES[k] && this.inventory[k] > 0);
  }

  _bestFoodKey() {
    let best = null, bestVal = -1;
    for (const k in this.inventory) {
      if (FOOD_VALUES[k] && this.inventory[k] > 0 && FOOD_VALUES[k] > bestVal) {
        best = k; bestVal = FOOD_VALUES[k];
      }
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

    // --- 優先度: 睡眠(夜) > 空腹での食事 > 天候での祈り > 通常AI ---
    if (ctx.isNight) {
      if (this.state !== STATES.SLEEP) { this.state = STATES.SLEEP; this._setEmote('眠っている'); }
    } else if (this.state === STATES.SLEEP) {
      this.state = STATES.WANDER;
    }

    if (this.state !== STATES.SLEEP) {
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
    }
  }

  _startEat() {
    const key = this._bestFoodKey();
    if (!key) return;
    this.inventory[key] -= 1;
    if (this.inventory[key] <= 0) delete this.inventory[key];
    this.hunger = Math.min(100, this.hunger + (FOOD_VALUES[key] || 10));
    this.state = STATES.EAT;
    this.actionTimer = 1.5;
    this._setEmote('食事中');
  }

  _updateAction(dt, emotePool) {
    this.actionTimer -= dt;
    if (Math.random() < 0.02) this._setEmote(pickEmote(emotePool));
    if (this.actionTimer <= 0) this.state = STATES.WANDER;
  }

  _setEmote(text) {
    this.emote = text;
    this.emoteTimer = 3;
  }

  _updateWander(dt, moveSpeedMul) {
    this.stamina -= dt * 0.6;
    if (this.stamina < this.params.restThreshold) {
      this.state = STATES.REST;
      this._setEmote(pickEmote(EMOTES.REST));
      return;
    }

    // 空腹なら食料源を優先探索、平常時は木/石などの資源探索
    let target = null;
    let isFood = false;
    if (this.hunger < 55) {
      target = this.findFoodSource(14);
      isFood = !!target;
    }
    if (!target && Math.random() < 0.02) {
      target = this.findNearbyResource(12, (r) => r.type !== 'fish' || this.params.canFish);
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
        this.inventory[crop.type] = (this.inventory[crop.type] || 0) + 1;
        this.actionCounts.farming += 1;
        this.gatherTarget = null;
        this.state = STATES.WANDER;
      }
      return;
    }

    // 動物(卵/牛乳/毛皮/肉、羊は毛刈り優先)
    if (target.isAnimal) {
      if (target.amount <= 0) { this.gatherTarget = null; this.state = STATES.WANDER; return; }
      this.gatherTimer += dt;
      if (this.gatherTimer > 1.2) {
        this.gatherTimer = 0;
        let drop = null;
        if (target.type === 'sheep') drop = shearAnimal(target);
        const wasHunt = !drop;
        if (!drop) drop = harvestAnimal(target);
        this.inventory[drop] = (this.inventory[drop] || 0) + 1;
        if (wasHunt) {
          this.actionCounts.hunting += 1;
          if (target.type === 'tiger') this.actionCounts.tigerHunts += 1;
        }
        if (target.amount <= 0) { this.gatherTarget = null; this.state = STATES.WANDER; }
      }
      return;
    }

    // 通常資源(木/巨木/石/鉱石/魚)
    if (target.amount <= 0) { this.gatherTarget = null; this.state = STATES.WANDER; return; }
    this.gatherTimer += dt;
    const bonus = (this.params.gatherBonus && this.params.gatherBonus[target.type]) || 1;
    const rate = 0.5 * bonus * this.params.gatherEffMul;
    if (this.gatherTimer > 1 / rate) {
      this.gatherTimer = 0;
      const type = target.type;
      if (target.amount !== Infinity) target.amount -= 1;
      this.inventory[type] = (this.inventory[type] || 0) + 1;
      if (this.gatherStreak[type] != null) this.gatherStreak[type] += 1;
      if (type === 'tree' || type === 'big_tree') this.actionCounts.woodcutting += 1;
      if (type === 'stone') this.actionCounts.mining += 1;
      if (type === 'ore') {
        this.actionCounts.mining += 1;
        if (target.isGiant && Math.random() < 0.1) this._bigGatherCrit = true;
      }
      if (type === 'fish') this.actionCounts.fishing += 1;
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
    // 生の食材を持っていれば休憩中に調理することがある
    if (!this._cookedThisRest) {
      const rawKey = Object.keys(RAW_TO_COOKED).find((k) => this.inventory[k] > 0);
      if (rawKey && Math.random() < 0.4) {
        this.inventory[rawKey] -= 1;
        if (this.inventory[rawKey] <= 0) delete this.inventory[rawKey];
        const cooked = RAW_TO_COOKED[rawKey];
        this.inventory[cooked] = (this.inventory[cooked] || 0) + 1;
        this.actionCounts.cooking += 1;
        this._setEmote('料理中');
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
    const speed = this.params.speed * speedMul * dt;
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
      stamina: this.stamina, inventory: this.inventory, facing: this.facing,
      affiliation: this.affiliation, gatherStreak: this.gatherStreak, restStreak: this.restStreak,
      rainExposure: this.rainExposure, hunger: this.hunger, hp: this.hp, gender: this.gender,
      ageYears: this.ageYears, lifespanYears: this.lifespanYears, languageLevel: this.languageLevel,
      languageProgress: this.languageProgress, partnerId: this.partnerId, titleTags: this.titleTags,
      prayCount: this.prayCount, affinity: this.affinity, acquiredPersonality: this.acquiredPersonality,
      dynamicJob: this.dynamicJob, actionCounts: this.actionCounts, nightWaterTime: this.nightWaterTime,
    };
  }
}
