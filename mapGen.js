// mapGen.js
// パーリン(風)ノイズによる100x100有限マップ生成。外周は強制的に海にして世界の端を作る。
// 地形: 海/平原/森林/巨大森林/山脈/岩石地帯/砂浜/川/湖/大穴(無限鉱石)。
// 資源(木/石/鉱石)・農地(小麦/リンゴ/野菜)・動物の初期配置もここで行う。

const TILE_TYPES = {
  SEA: 'sea',
  LAKE: 'lake',
  RIVER: 'river',
  BEACH: 'beach',
  PLAINS: 'plains',
  FOREST: 'forest',
  BIG_FOREST: 'big_forest',
  ROCKY: 'rocky',
  MOUNTAIN: 'mountain',
  HOLE: 'hole',
};

const TILE_COLORS = {
  sea: '#2a5c8a',
  seaDeep: '#173d5c',
  lake: '#2f6a95',
  river: '#3a7ab0',
  beach: '#e3d2a0',
  plains: '#5fa845',
  forest: '#2d6a34',
  big_forest: '#1f4a24',
  rocky: '#8a7a6a',
  mountain: '#7d7d7d',
  mountainDark: '#5c5c5c',
  hole: '#170f0a',
};

const TILE_SIZE = 16; // ワールド座標上の1タイルのピクセル基準サイズ

const CROP_STAGE_DURATION = 12; // 1成長段階に必要な秒数（雨で短縮）
const CROP_TYPES = ['wheat', 'apple', 'vegetable'];

class GameMap {
  constructor(seed, width = 100, height = 100) {
    this.seed = seed >>> 0;
    this.width = width;
    this.height = height;
    this.noise = new ValueNoise2D(this.seed);
    this.tiles = [];
    this.resources = []; // { x,y,type:'tree'|'big_tree'|'stone'|'ore'|'fish', amount, isWater? }
    this.crops = []; // { x,y,type, stage(0-3), timer }
    this.animals = []; // animals.js が生成/更新する
    this._generate();
  }

  _generate() {
    const edgeMargin = 4;
    for (let y = 0; y < this.height; y++) {
      const row = [];
      for (let x = 0; x < this.width; x++) {
        const distToEdge = Math.min(x, y, this.width - 1 - x, this.height - 1 - y);
        let n = this.noise.octaveNoise(x / 24, y / 24, 5, 0.55);

        if (distToEdge < edgeMargin) {
          const falloff = (edgeMargin - distToEdge) * 0.09;
          n = Math.min(n, 0.25) - falloff;
        }

        let type;
        if (n < 0.32) type = TILE_TYPES.SEA;
        else if (n < 0.56) type = TILE_TYPES.PLAINS;
        else if (n < 0.75) type = TILE_TYPES.FOREST;
        else if (n < 0.8) type = TILE_TYPES.ROCKY;
        else type = TILE_TYPES.MOUNTAIN;

        row.push({ type, n, distToEdge });
      }
      this.tiles.push(row);
    }

    const rand = mulberry32((this.seed + 999) >>> 0);

    // 内陸の低地(海判定だが外周の強制海ではない)を「湖」に変換
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = this.tiles[y][x];
        if (t.type === TILE_TYPES.SEA && t.distToEdge > edgeMargin + 6) {
          t.type = TILE_TYPES.LAKE;
        }
      }
    }

    // 川: second-passのノイズ帯で平原/森林を横切る細い川を作る
    const riverNoise = new ValueNoise2D((this.seed + 4242) >>> 0);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = this.tiles[y][x];
        if (t.type === TILE_TYPES.PLAINS || t.type === TILE_TYPES.FOREST) {
          const rv = riverNoise.octaveNoise(x / 30, y / 30, 3, 0.5);
          if (Math.abs(rv - 0.5) < 0.012) t.type = TILE_TYPES.RIVER;
        }
      }
    }

    // 砂浜: 海/湖に隣接する平原
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = this.tiles[y][x];
        if (t.type !== TILE_TYPES.PLAINS) continue;
        const neighbors = [
          this.getTile(x + 1, y), this.getTile(x - 1, y),
          this.getTile(x, y + 1), this.getTile(x, y - 1),
        ];
        if (neighbors.some((n2) => n2 && (n2.type === TILE_TYPES.SEA || n2.type === TILE_TYPES.LAKE))) {
          if (rand() < 0.85) t.type = TILE_TYPES.BEACH;
        }
      }
    }

    // 巨大森林(削れる巨木)への昇格
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = this.tiles[y][x];
        if (t.type === TILE_TYPES.FOREST && rand() < 0.02) t.type = TILE_TYPES.BIG_FOREST;
      }
    }

    // 大穴(無限鉱石)を平原・岩石地帯に稀に配置
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = this.tiles[y][x];
        if ((t.type === TILE_TYPES.PLAINS || t.type === TILE_TYPES.ROCKY) && rand() < 0.0015) {
          t.type = TILE_TYPES.HOLE;
        }
      }
    }

    // 資源・農地・魚・動物の配置
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = this.tiles[y][x];
        switch (t.type) {
          case TILE_TYPES.FOREST:
            if (rand() < 0.07) {
              const amt = 5 + Math.floor(rand() * 6);
              this.resources.push({ x, y, type: 'tree', amount: amt, maxAmount: amt });
            }
            break;
          case TILE_TYPES.BIG_FOREST:
            if (rand() < 0.55) {
              const amt = 25 + Math.floor(rand() * 15);
              this.resources.push({ x, y, type: 'big_tree', amount: amt, maxAmount: amt });
            }
            break;
          case TILE_TYPES.MOUNTAIN:
            if (rand() < 0.05) this.resources.push({ x, y, type: 'stone', amount: 5 + Math.floor(rand() * 6) });
            break;
          case TILE_TYPES.ROCKY:
            if (rand() < 0.12) this.resources.push({ x, y, type: 'stone', amount: 8 + Math.floor(rand() * 8) });
            break;
          case TILE_TYPES.HOLE:
            this.resources.push({ x, y, type: 'ore', amount: Infinity });
            break;
          case TILE_TYPES.PLAINS:
            if (rand() < 0.02) {
              this.crops.push({ x, y, type: CROP_TYPES[Math.floor(rand() * CROP_TYPES.length)], stage: Math.floor(rand() * 2), timer: 0 });
            } else if (rand() < 0.006) {
              this.animals.push(makeAnimal('chicken', x, y));
            } else if (rand() < 0.01) {
              this.animals.push(makeAnimal('cow', x, y));
            } else if (rand() < 0.01) {
              this.animals.push(makeAnimal('pig', x, y));
            }
            break;
          case TILE_TYPES.RIVER:
          case TILE_TYPES.LAKE:
            if (rand() < 0.35) this.resources.push({ x, y, type: 'fish', amount: Infinity, isWater: true });
            break;
          case TILE_TYPES.FOREST_EDGE: // unused placeholder
            break;
        }
        if ((t.type === TILE_TYPES.FOREST || t.type === TILE_TYPES.BIG_FOREST) && rand() < 0.0009) {
          this.animals.push(makeAnimal('tiger', x, y));
        }
      }
    }
  }

  getTile(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    return this.tiles[y][x];
  }

  getResourceAt(tx, ty) {
    return this.resources.find((r) => r.x === tx && r.y === ty && r.amount > 0);
  }

  isWalkable(x, y) {
    const t = this.getTile(Math.floor(x), Math.floor(y));
    if (!t) return false;
    return t.type !== TILE_TYPES.SEA && t.type !== TILE_TYPES.LAKE;
  }

  // 雨天時に木/巨木をゆっくり回復させる
  regenerateTrees(dt, regenMul) {
    if (regenMul <= 0) return;
    for (const r of this.resources) {
      if ((r.type === 'tree' || r.type === 'big_tree') && r.maxAmount && r.amount < r.maxAmount) {
        r.amount = Math.min(r.maxAmount, r.amount + dt * regenMul);
      }
    }
  }

  // 農作物の成長更新。growthMul: 雨/恵みの雨で成長速度を上げる係数
  updateCrops(dt, growthMul) {
    for (const crop of this.crops) {
      if (crop.stage >= 3) continue;
      crop.timer += dt * growthMul;
      if (crop.timer >= CROP_STAGE_DURATION) {
        crop.timer = 0;
        crop.stage += 1;
      }
    }
  }
}
