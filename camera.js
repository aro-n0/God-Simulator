// camera.js
// マウスホイールでズーム、ドラッグでパン移動するワールドカメラ。

class Camera {
  constructor(canvas) {
    this.canvas = canvas;
    this.x = 50 * TILE_SIZE;
    this.y = 50 * TILE_SIZE;
    this.zoom = 1.6;
    this.minZoom = 0.4;
    this.maxZoom = 4.5;
    this._dragging = false;
    this._lastMouse = { x: 0, y: 0 };
    this._moved = false;
    this._bind();
  }

  _bind() {
    const c = this.canvas;

    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const delta = -e.deltaY * 0.0012;
        this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * (1 + delta)));
      },
      { passive: false }
    );

    c.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this._dragging = true;
      this._moved = false;
      this._lastMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - this._lastMouse.x;
      const dy = e.clientY - this._lastMouse.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this._moved = true;
      this._lastMouse = { x: e.clientX, y: e.clientY };
      this.x -= dx / this.zoom;
      this.y -= dy / this.zoom;
    });

    window.addEventListener('mouseup', () => {
      this._dragging = false;
    });
  }

  worldToScreen(wx, wy) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (wx - this.x) * this.zoom + rect.width / 2,
      y: (wy - this.y) * this.zoom + rect.height / 2,
    };
  }

  screenToWorld(sx, sy) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (sx - rect.width / 2) / this.zoom + this.x,
      y: (sy - rect.height / 2) / this.zoom + this.y,
    };
  }
}
