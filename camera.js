// camera.js
// マウスホイールでズーム、ドラッグでパン移動するワールドカメラ。
// タブレット向けに2本指ピンチズーム＋2本指パン、1本指タップ検出（onTapコールバック）にも対応。

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
    this._touchState = null;
    this.onTap = null; // (screenX, screenY) => void  main.js側で設定
    this._bind();
  }

  _bind() {
    const c = this.canvas;
    c.style.touchAction = 'none';

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

    // --- タッチ操作 ---
    c.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          const t0 = e.touches[0];
          const t1 = e.touches[1];
          const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
          const mid = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
          this._touchState = {
            mode: 'pinch',
            initialDistance: dist,
            initialZoom: this.zoom,
            anchorWorld: this.screenToWorld(mid.x, mid.y),
          };
        } else if (e.touches.length === 1) {
          const t = e.touches[0];
          this._touchState = { mode: 'tap', startX: t.clientX, startY: t.clientY, moved: false, startTime: Date.now() };
        }
      },
      { passive: false }
    );

    c.addEventListener(
      'touchmove',
      (e) => {
        if (!this._touchState) return;
        if (this._touchState.mode === 'pinch' && e.touches.length === 2) {
          e.preventDefault();
          const t0 = e.touches[0];
          const t1 = e.touches[1];
          const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
          const mid = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
          const newZoom = Math.min(
            this.maxZoom,
            Math.max(this.minZoom, this._touchState.initialZoom * (dist / this._touchState.initialDistance))
          );
          const rect = this.canvas.getBoundingClientRect();
          this.zoom = newZoom;
          // ピンチ中心のワールド座標を固定したまま、指の中点移動量をパンとして反映
          this.x = this._touchState.anchorWorld.x - (mid.x - rect.width / 2) / newZoom;
          this.y = this._touchState.anchorWorld.y - (mid.y - rect.height / 2) / newZoom;
        } else if (this._touchState.mode === 'tap' && e.touches.length === 1) {
          const t = e.touches[0];
          const dx = t.clientX - this._touchState.startX;
          const dy = t.clientY - this._touchState.startY;
          if (Math.hypot(dx, dy) > 10) this._touchState.moved = true;
        }
      },
      { passive: false }
    );

    c.addEventListener('touchend', (e) => {
      if (!this._touchState) return;
      if (this._touchState.mode === 'tap' && !this._touchState.moved && Date.now() - this._touchState.startTime < 350) {
        if (typeof this.onTap === 'function') this.onTap(this._touchState.startX, this._touchState.startY);
      }
      if (e.touches.length === 0) this._touchState = null;
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
