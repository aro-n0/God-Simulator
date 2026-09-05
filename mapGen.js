// mapGen.js
// パーリン(風)ノイズによる100x100有限マップ生成。外周は強制的に海にして世界の端を作る。

const TILE_TYPES = { SEA: 'sea', PLAINS: 'plains', FOREST: 'forest', MOUNTAIN: 'mountain' };

const TILE_COLORS = {
  sea: '#2a5c8a',
  seaDeep: '#173d5c',
  plains: '#5fa845',
  forest: '#2d6a34',
  mountain: '#7d7d7d',
  mountainDark: '#5c5c5c',
};

const TILE_SIZE = 16; // ズーム1倍時の1タイルあたりのピクセルサイズ

class GameMap {
  constructor(seed, width = 100, height = 100) {
    this.seed = seed >>> 0;
    this.width = width;
    this.height = height;
    this.noise = new ValueNoise2D(this.seed);
    this.tiles = [];
    this.resources = []; // { x, y, type: 'tree' | 'stone', amount }
    this._generate();
  }

  _generate() {
    const edgeMargin = 4; // 世界の端（海の壁）の厚み
    for (let y = 0; y < this.height; y++) {
      const row = [];
      for (let x = 0; x < this.width; x++) {
        const distToEdge = Math.min(x, y, this.width - 1 - x, this.height - 1 - y);
        let n = this.noise.octaveNoise(x / 24, y / 24, 5, 0.55);

        // 世界の端は強制的に海にし、有限世界の境界（世界脈）を表現する
        if (distToEdge < edgeMargin) {
          const falloff = (edgeMargin - distToEdge) * 0.09;
          n = Math.min(n, 0.25) - falloff;
        }

        let type;
        if (n < 0.32) type = TILE_TYPES.SEA;
        else if (n < 0.56) type = TILE_TYPES.PLAINS;
        else if (n < 0.75) type = TILE_TYPES.FOREST;
        else type = TILE_TYPES.MOUNTAIN;

        row.push({ type, n });
      }
      this.tiles.push(row);
    }

    // 資源（木・石）のランダム配置
    const rand = mulberry32((this.seed + 999) >>> 0);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = this.tiles[y][x].type;
        if (t === TILE_TYPES.FOREST && rand() < 0.07) {
          this.resources.push({ x, y, type: 'tree', amount: 5 + Math.floor(rand() * 6) });
        } else if (t === TILE_TYPES.MOUNTAIN && rand() < 0.05) {
          this.resources.push({ x, y, type: 'stone', amount: 5 + Math.floor(rand() * 6) });
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
    return !!t && t.type !== TILE_TYPES.SEA;
  }
}
