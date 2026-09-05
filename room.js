// room.js
// PeerJS(P2P)を用いた簡易マルチプレイ共有。
// ホストはマップシード＋キャラパラメータを配信し、以後は位置/状態のスナップショットを
// 一定間隔でブロードキャストする。ゲストはそれを受信して観測専用で描画する。
// ワールド選択画面から生成されるためGameインスタンスに依存せず初期化できる。

class RoomManager {
  constructor() {
    this.game = null;
    this.peer = null;
    this.conns = [];
    this.isHost = false;
    this.roomKey = null;
  }

  attachGame(game) {
    this.game = game;
  }

  _genKey() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  createRoom(roomName) {
    if (typeof Peer === 'undefined') {
      this._setStatus('PeerJSライブラリの読み込みに失敗しました（オフライン環境の可能性があります）');
      return;
    }
    this.isHost = true;
    this.roomKey = this._genKey();
    this._setStatus('ルームを作成中...');
    this.peer = new Peer('civgame-' + this.roomKey);

    this.peer.on('open', () => {
      this._setStatus(`ルーム作成完了！ キー: ${this.roomKey}（このキーを友達に共有してください）`);
      recordRoom(this.roomKey, roomName, 'host');
    });

    this.peer.on('connection', (conn) => {
      this.conns.push(conn);
      conn.on('open', () => {
        if (this.game) {
          conn.send({
            type: 'init',
            seed: this.game.map.seed,
            characters: this.game.characters.map((c) => c.params),
          });
        }
        this._setStatus(`ゲストが接続しました（現在 ${this.conns.length} 人観測中）`);
      });
      conn.on('close', () => {
        this.conns = this.conns.filter((c) => c !== conn);
      });
    });

    this.peer.on('error', (err) => this._setStatus('接続エラー: ' + err.type));
    this._startBroadcastLoop();
  }

  joinRoom(key, roomName) {
    if (typeof Peer === 'undefined') {
      this._setStatus('PeerJSライブラリの読み込みに失敗しました（オフライン環境の可能性があります）');
      return;
    }
    this.isHost = false;
    this.roomKey = key;
    this._setStatus('ホストへ接続中...');
    this.peer = new Peer();

    this.peer.on('open', () => {
      const conn = this.peer.connect('civgame-' + key);
      conn.on('open', () => {
        this._setStatus('ホストに接続しました。観測モードで表示します。');
        recordRoom(key, roomName, 'guest');
      });
      conn.on('data', (data) => this._onData(data));
      conn.on('error', (err) => this._setStatus('接続エラー: ' + err));
      this.conns.push(conn);
    });

    this.peer.on('error', (err) => this._setStatus('接続エラー: ' + err.type));
  }

  _onData(data) {
    if (data.type === 'init') {
      if (typeof window.onMultiplayerInit === 'function') {
        window.onMultiplayerInit(data.seed, data.characters);
      }
    } else if (data.type === 'snapshot') {
      if (this.game) this.game.applyRemoteSnapshot(data.chars);
    }
  }

  _startBroadcastLoop() {
    setInterval(() => {
      if (!this.isHost || this.conns.length === 0 || !this.game) return;
      const snapshot = { type: 'snapshot', chars: this.game.characters.map((c) => c.serialize()) };
      for (const conn of this.conns) {
        if (conn.open) conn.send(snapshot);
      }
    }, 200);
  }

  _setStatus(msg) {
    const el = document.getElementById('room-status');
    if (el) el.textContent = msg;
    const wsEl = document.getElementById('ws-room-status');
    if (wsEl) wsEl.textContent = msg;
  }
}
