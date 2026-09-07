// buildings.js
// 「壁・屋根・ドア」を基本構造とする家4種・焚き火1種・大型家2種を定義する。
// キャラクター自身が所持素材からテーマ(木造/石造/虎皮の狩人風など)を判定し、
// コスト(素材)を自ら評価・消費して世界にオブジェクトとして設置する(ハイブリッド建築システムの基盤)。

const BUILDING_DEFS = {
  house_wood: { category: 'house', label: '木造の家', cost: { 木材: 20, 枝: 5 }, theme: 'wood' },
  house_stone: { category: 'house', label: '石造りの家', cost: { 石材: 18, 木材: 8 }, theme: 'stone' },
  house_hide: { category: 'house', label: '虎皮の狩人小屋', cost: { 虎皮: 4, 木材: 10 }, theme: 'hide' },
  house_clay: { category: 'house', label: '土造りの家', cost: { 土: 20, 砂: 8 }, theme: 'clay' },
  campfire: { category: 'campfire', label: '焚き火', cost: { 枝: 4, 石: 3 }, theme: 'fire' },
  grand_hall_stone: { category: 'large_house', label: '石造りの礼拝堂', cost: { 石材: 45, 鉄: 5, 木材: 10 }, theme: 'stone' },
  grand_hall_gold: { category: 'large_house', label: '黄金の館', cost: { 金: 15, 石材: 30, 木材: 15 }, theme: 'gold' },
};

// キャラクターの手持ち素材から最もふさわしいテーマ/建物種別を判定する
function pickBuildingPlan(character) {
  const counts = {
    木材: character.getItemCount('木材'), 石材: character.getItemCount('石材'),
    虎皮: character.getItemCount('虎皮'), 土: character.getItemCount('土'),
    金: character.getItemCount('金'), 鉄: character.getItemCount('鉄'),
  };

  // 大型建築(大穴や大樹級の資材備蓄がある場合)を優先評価
  if (counts.金 >= BUILDING_DEFS.grand_hall_gold.cost.金 && canAfford(character, BUILDING_DEFS.grand_hall_gold.cost)) {
    return 'grand_hall_gold';
  }
  if (counts.石材 >= BUILDING_DEFS.grand_hall_stone.cost.石材 && canAfford(character, BUILDING_DEFS.grand_hall_stone.cost)) {
    return 'grand_hall_stone';
  }

  // 通常サイズの家: 最も豊富な素材のテーマを選ぶ
  const candidates = [
    { id: 'house_hide', qty: counts.虎皮 },
    { id: 'house_stone', qty: counts.石材 },
    { id: 'house_clay', qty: counts.土 },
    { id: 'house_wood', qty: counts.木材 },
  ];
  candidates.sort((a, b) => b.qty - a.qty);
  for (const c of candidates) {
    if (canAfford(character, BUILDING_DEFS[c.id].cost)) return c.id;
  }

  if (canAfford(character, BUILDING_DEFS.campfire.cost)) return 'campfire';
  return null;
}

function canAfford(character, cost) {
  for (const material in cost) {
    if (character.getItemCount(material) < cost[material]) return false;
  }
  return true;
}

function payCost(character, cost) {
  for (const material in cost) {
    character.removeFromInventory(material, cost[material]);
  }
}

// キャラクターが自らコストを評価し、賄えるなら建物を1つ建てる(建てた種別IDを返す。建てなければnull)
function tryConstructBuilding(character, map) {
  const planId = pickBuildingPlan(character);
  if (!planId) return null;
  const def = BUILDING_DEFS[planId];
  if (!canAfford(character, def.cost)) return null;

  // 近くに既存の建物が密集しすぎていないか確認
  const tooClose = map.buildings.some((b) => Math.hypot(b.x - character.x, b.y - character.y) < 3);
  if (tooClose) return null;

  payCost(character, def.cost);
  map.buildings.push({
    id: 'bld_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
    type: planId,
    category: def.category,
    theme: def.theme,
    label: def.label,
    x: character.x,
    y: character.y,
    ownerId: character.id,
    ownerName: character.params.name,
  });
  return planId;
}
