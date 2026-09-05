// character.js
// 各キャラクターの自律行動ステートマシンと吹き出し演出。

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
    this.isRemoteMirror = false; // trueの場合は他プレイヤー(ホスト)からの受信データで描画のみ行う
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

  update(dt) {
    if (this.isRemoteMirror) return; // 観測モードでは自前でシミュレーションしない
    this.emoteTimer -= dt;
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
      this.gatherTarget.amount -= 1;
      this.inventory[this.gatherTarget.type] = (this.inventory[this.gatherTarget.type] || 0) + 1;
      if (Math.random() < 0.3) this._setEmote(pickEmote(EMOTES['GATHER_' + this.gatherTarget.type] || ['作業中']));
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
    };
  }
}
