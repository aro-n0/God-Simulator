// character.js
// 各キャラクターの自律行動ステートマシン、吹き出し演出、好き嫌い/性格の動的変化。

const STATES = {
  WANDER: 'WANDER',
  MOVE_TO_TARGET: 'MOVE_TO_TARGET',
  GATHER: 'GATHER',
  REST: 'REST',
};

const EMOTES = {
  WANDER: ['散歩中', 'ふらふら中', 'のんびり'],
  MOVE_TO_TARGET: ['向かってる…'],
  GATHER_tree: ['木を伐採中', '木こり中'],
  GATHER_stone: ['採石中'],
  REST: ['休憩中', 'お腹空いた…', 'ひとやすみ'],
};

function pickEmote(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

class Character {
  constructor(params, map, x, y, restore) {
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
    this.emote = '';
    this.emoteTimer = 0;
    this.inventory = (restore && restore.inventory) || { tree: 0, stone: 0 };
    this.sprite = buildSpriteCanvas(params);
    this.facing = (restore && restore.facing) || 1;
    this.affiliation = (restore && restore.affiliation) || '無所属';
    this.isRemoteMirror = false; // trueの場合は他プレイヤー(ホスト)からの受信データで描画のみ行う

    // 性格・好き嫌いの動的変化を判定するためのトラッキング
    this.gatherStreak = (restore && restore.gatherStreak) || { tree: 0, stone: 0 };
    this.restStreak = (restore && restore.restStreak) || 0;
    this.rainExposure = (restore && restore.rainExposure) || 0;
    this._evolutionCooldown = 5;
  }

  distTo(tx, ty) {
    return Math.hypot(this.x - tx, this.y - ty);
  }

  findNearbyResource(radius = 12) {
    let best = null;
    let bestDist = Infinity;
    for (const r of this.map.resources) {
      if (r.amount <= 0) continue;
      const d = this.distTo(r.x + 0.5, r.y + 0.5);
      if (d < radius && d < bestDist) {
        best = r;
        bestDist = d;
      }
    }
    return best;
  }

  // isRaining: マップ全体の天候フラグ（ゲームループから渡される）
  update(dt, isRaining) {
    if (this.isRemoteMirror) return; // 観測モードでは自前でシミュレーションしない
    this.emoteTimer -= dt;

    const isOutside = this.state !== STATES.REST;
    if (isRaining && isOutside) this.rainExposure += dt;

    switch (this.state) {
      case STATES.WANDER:
        this._updateWander(dt);
        break;
      case STATES.MOVE_TO_TARGET:
        this._updateMoveToTarget(dt);
        break;
      case STATES.GATHER:
        this._updateGather(dt);
        break;
      case STATES.REST:
        this._updateRest(dt);
        break;
    }
    this.stamina = Math.max(0, Math.min(100, this.stamina));
    this._checkTraitEvolution(dt);
  }

  _setEmote(text) {
    this.emote = text;
    this.emoteTimer = 3;
  }

  _updateWander(dt) {
    this.stamina -= dt * 0.6;
    if (this.stamina < this.params.restThreshold) {
      this.state = STATES.REST;
      this._setEmote(pickEmote(EMOTES.REST));
      return;
    }
    const nearby = this.findNearbyResource();
    if (nearby && Math.random() < 0.02) {
      this.gatherTarget = nearby;
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
    this._moveToward(this.wanderTarget.x, this.wanderTarget.y, dt, 0.5);
  }

  _updateMoveToTarget(dt) {
    this.stamina -= dt * 0.6;
    if (!this.gatherTarget || this.gatherTarget.amount <= 0) {
      this.state = STATES.WANDER;
      return;
    }
    const arrived = this._moveToward(this.gatherTarget.x + 0.5, this.gatherTarget.y + 0.5, dt, 1);
    if (arrived) {
      this.state = STATES.GATHER;
      this.gatherTimer = 0;
      this._setEmote(pickEmote(EMOTES['GATHER_' + this.gatherTarget.type] || ['作業中']));
    }
  }

  _updateGather(dt) {
    this.stamina -= dt * 0.3;
    if (this.stamina < this.params.restThreshold) {
      this.state = STATES.REST;
      this._setEmote(pickEmote(EMOTES.REST));
      return;
    }
    if (!this.gatherTarget || this.gatherTarget.amount <= 0) {
      this.state = STATES.WANDER;
      return;
    }
    this.gatherTimer += dt;
    const bonus = this.params.gatherBonus[this.gatherTarget.type] || 1;
    const rate = 0.5 * bonus * this.params.gatherEffMul;
    if (this.gatherTimer > 1 / rate) {
      this.gatherTimer = 0;
      const type = this.gatherTarget.type;
      this.gatherTarget.amount -= 1;
      this.inventory[type] = (this.inventory[type] || 0) + 1;
      this.gatherStreak[type] = (this.gatherStreak[type] || 0) + 1;
      if (Math.random() < 0.3) this._setEmote(pickEmote(EMOTES['GATHER_' + type] || ['作業中']));
      if (this.gatherTarget.amount <= 0) {
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
    if (this.stamina >= 90) this.state = STATES.WANDER;
  }

  _moveToward(tx, ty, dt, speedMul = 1) {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.15) return true;
    const speed = this.params.speed * speedMul * dt;
    const step = Math.min(speed, d);
    const nx = this.x + (dx / d) * step;
    const ny = this.y + (dy / d) * step;
    if (this.map.isWalkable(nx, ny)) {
      this.x = nx;
      this.y = ny;
      this.facing = dx >= 0 ? 1 : -1;
    } else {
      this.wanderTarget = null;
    }
    return false;
  }

  // 日常行動の蓄積に応じて「好き・苦手」を追加/変化させる（数秒おきに判定）
  _checkTraitEvolution(dt) {
    this._evolutionCooldown -= dt;
    if (this._evolutionCooldown > 0) return;
    this._evolutionCooldown = 5;

    const likes = this.params.likes || (this.params.likes = []);
    const dislikes = this.params.dislikes || (this.params.dislikes = []);
    const MAX_TAGS = 4;

    if (this.gatherStreak.tree >= 20 && !likes.includes('木を伐ること')) {
      likes.push('木を伐ること');
      if (likes.length > MAX_TAGS) likes.shift();
    }
    if (this.gatherStreak.stone >= 20 && !likes.includes('石を掘ること')) {
      likes.push('石を掘ること');
      if (likes.length > MAX_TAGS) likes.shift();
    }
    if (this.restStreak >= 30 && !likes.includes('昼寝')) {
      likes.push('昼寝');
      if (likes.length > MAX_TAGS) likes.shift();
    }
    if (this.rainExposure >= 15 && !dislikes.includes('雨')) {
      dislikes.push('雨');
      if (dislikes.length > MAX_TAGS) dislikes.shift();
    }
  }

  // モーダル表示用の「現在の気持ち」
  getMoodText() {
    switch (this.state) {
      case STATES.GATHER:
        return this.emote || '作業に集中している';
      case STATES.REST:
        return this.stamina < 30 ? 'お腹が空いている…' : '休憩している';
      case STATES.MOVE_TO_TARGET:
        return '目的地へ向かっている';
      default:
        return this.emote || '元気に過ごしている';
    }
  }

  // マルチプレイ同期用にシリアライズ（軽量）
  serialize() {
    return { x: this.x, y: this.y, state: this.state, emote: this.emote, facing: this.facing };
  }

  // オートセーブ用にシリアライズ（復元に必要な全情報）
  fullSerialize() {
    return {
      params: this.params,
      x: this.x,
      y: this.y,
      state: this.state,
      stamina: this.stamina,
      inventory: this.inventory,
      facing: this.facing,
      affiliation: this.affiliation,
      gatherStreak: this.gatherStreak,
      restStreak: this.restStreak,
      rainExposure: this.rainExposure,
    };
  }
}
