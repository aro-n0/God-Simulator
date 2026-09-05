// noise.js
// シード可能な疑似乱数生成器 (mulberry32) と、それを用いた簡易2Dバリューノイズ。
// 真のPerlinノイズではないが、地形生成には十分な滑らかさを持つ。

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class ValueNoise2D {
  constructor(seed = 1234) {
    this.seed = seed >>> 0;
    const rand = mulberry32(this.seed);
    this.gridSize = 256;
    this.grid = new Float32Array(this.gridSize * this.gridSize);
    for (let i = 0; i < this.grid.length; i++) this.grid[i] = rand();
  }

  _get(x, y) {
    const gs = this.gridSize;
    x = ((x % gs) + gs) % gs;
    y = ((y % gs) + gs) % gs;
    return this.grid[y * gs + x];
  }

  _smooth(t) {
    return t * t * (3 - 2 * t);
  }

  noise(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const sx = this._smooth(x - x0);
    const sy = this._smooth(y - y0);
    const n00 = this._get(x0, y0);
    const n10 = this._get(x1, y0);
    const n01 = this._get(x0, y1);
    const n11 = this._get(x1, y1);
    const ix0 = n00 + (n10 - n00) * sx;
    const ix1 = n01 + (n11 - n01) * sx;
    return ix0 + (ix1 - ix0) * sy;
  }

  // オクターブ合成でより自然な地形にする
  octaveNoise(x, y, octaves = 4, persistence = 0.5) {
    let total = 0;
    let freq = 1;
    let amp = 1;
    let maxAmp = 0;
    for (let i = 0; i < octaves; i++) {
      total += this.noise(x * freq, y * freq) * amp;
      maxAmp += amp;
      amp *= persistence;
      freq *= 2;
    }
    return total / maxAmp;
  }
}
