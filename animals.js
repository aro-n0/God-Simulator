// animals.js
// 鶏(肉/羽/卵)・牛(牛乳/肉)・豚(肉)・虎(牙/皮、危険)の簡易エンティティ。
// map.animals 配列に格納され、main.jsのゲームループから updateAnimals() で毎フレーム更新される。

const ANIMAL_DEFS = {
  chicken: { amount: 3, respawnTime: 20, drops: ['egg', 'feather'], lethal: false, speed: 0.4 },
  cow: { amount: 3, respawnTime: 25, drops: ['milk'], lethal: false, speed: 0.3 },
  pig: { amount: 3, respawnTime: 30, drops: ['meat'], lethal: true, speed: 0.35 },
  tiger: { amount: 2, respawnTime: 60, drops: ['fang', 'hide'], lethal: true, speed: 0.9, dangerous: true },
};

let _animalIdCounter = 1;

function makeAnimal(type, x, y) {
  const def = ANIMAL_DEFS[type];
  return {
    id: 'animal_' + _animalIdCounter++,
    type,
    x,
    y,
    amount: def.amount,
    maxAmount: def.amount,
    isAnimal: true,
    lethal: def.lethal,
    dangerous: !!def.dangerous,
    respawnTimer: 0,
    wanderTarget: null,
    wanderTimer: 0,
    attackCooldown: 0,
  };
}

// 動物の徘徊・被採取後の再湧きを処理する
function updateAnimals(map, dt) {
  for (const a of map.animals) {
    a.attackCooldown = Math.max(0, a.attackCooldown - dt);

    if (a.amount <= 0) {
      a.respawnTimer -= dt;
      if (a.respawnTimer <= 0) {
        let tries = 0;
        do {
          a.x = Math.floor(Math.random() * map.width);
          a.y = Math.floor(Math.random() * map.height);
          tries++;
        } while (!map.isWalkable(a.x, a.y) && tries < 50);
        a.amount = a.maxAmount;
      }
      continue;
    }

    const def = ANIMAL_DEFS[a.type];
    a.wanderTimer -= dt;
    if (!a.wanderTarget || a.wanderTimer <= 0) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 2 + Math.random() * 4;
      a.wanderTarget = {
        x: Math.max(1, Math.min(map.width - 2, a.x + Math.cos(angle) * dist)),
        y: Math.max(1, Math.min(map.height - 2, a.y + Math.sin(angle) * dist)),
      };
      a.wanderTimer = 4 + Math.random() * 4;
    }
    const dx = a.wanderTarget.x - a.x;
    const dy = a.wanderTarget.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.1) {
      const step = Math.min(def.speed * dt, d);
      const nx = a.x + (dx / d) * step;
      const ny = a.y + (dy / d) * step;
      if (map.isWalkable(nx, ny)) {
        a.x = nx;
        a.y = ny;
      }
    }
  }
}

// キャラクターが動物から資源を得る(呼び出し元でamount減算や respawnTimer 開始を行う)
function harvestAnimal(animal) {
  const def = ANIMAL_DEFS[animal.type];
  const drop = def.drops[Math.floor(Math.random() * def.drops.length)];
  animal.amount -= 1;
  if (animal.amount <= 0) animal.respawnTimer = def.respawnTime;
  return drop;
}
