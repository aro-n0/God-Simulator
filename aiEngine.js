// aiEngine.js
// キャラクターの体験(行動履歴・環境変化)を評価し、
//   - 自由な文字列の「好き/苦手」タグ
//   - personalityData.jsのDB、または自由生成による「後天性性格」タグ
//   - 累計行動データに基づく「オリジナル職業」の自動襲名
// を行う。character.jsの _checkTraitEvolution から一定間隔で呼び出される想定。

const MAX_DYNAMIC_TAGS = 5; // likes/dislikes/acquiredPersonality それぞれの保持上限

// 状況に紐づく自由テキストの好き・苦手テンプレート
const EXPERIENCE_TEMPLATES = {
  night_water_calm: { kind: 'like', pool: ['夜の川のせせらぎ', '月明かりに揺れる水面', '夜風に混じる水の音', '静かな夜の湖畔', '星空を映す水面'] },
  storm_damage: { kind: 'dislike', pool: ['雷の大きな音', '稲妻の閃光', '嵐の夜', '雨に打たれること', '雷鳴のとどろき'] },
  social_bond: { kind: 'like', pool: ['気の合う仲間との会話', 'みんなで囲む食卓', '誰かと過ごす時間', '打ち解けた雑談'] },
  hearty_meal: { kind: 'like', pool: ['出来立ての料理の匂い', '働いた後の食事', '温かい食べ物'] },
  exhaustion: { kind: 'dislike', pool: ['延々と続く力仕事', '休む間もない忙しさ', '慢性的な疲れ'] },
  theft_shame: { kind: 'dislike', pool: ['自分のずるさ', '人を裏切ること', 'ばつの悪い沈黙'] },
};

// 後天性性格を自由生成する組み合わせテンプレート(形容+名詞)
const COMPOUND_PERSONALITY_TEMPLATES = {
  greed: { adjectives: ['欲深き', '抜け目ない', '山っ気のある', '一攫千金を夢見る', '強欲な'], nouns: ['一獲千金狙い', '山師気質', '幸運の採掘者', '金脈探しの虫'] },
  bravery: { adjectives: ['恐れ知らずの', '不屈の', '一騎当千の', '肝の据わった'], nouns: ['勇猛な戦士気質', '猛獣狩人の魂', '戦う者の誇り'] },
  crisis: { adjectives: ['修羅場慣れした', '土壇場に強い', '危機を乗り越えた'], nouns: ['生存者の勘', '不死身めいた性分', '危機管理能力の高さ'] },
  isolation: { adjectives: ['孤独を愛する', '世を捨てたような', '一人を好む'], nouns: ['世捨て人', '隠者気質', '孤高の生き方'] },
  nightOwl: { adjectives: ['闇を恐れぬ', '宵っ張りの'], nouns: ['夜行性の性分', '夜更かし気質'] },
  devotion: { adjectives: ['信心深い', '祈りに生きる'], nouns: ['神官のような佇まい', '敬虔な魂'] },
};

function pickFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildCompoundPersonality(key) {
  const def = COMPOUND_PERSONALITY_TEMPLATES[key];
  if (!def) return null;
  return pickFrom(def.adjectives) + pickFrom(def.nouns);
}

function addUnique(arr, text, cap) {
  if (!text) return false;
  if (arr.includes(text)) return false;
  arr.push(text);
  while (arr.length > cap) arr.shift();
  return true;
}

// character.js から一定間隔(既存の_evolutionCooldown)で呼ばれる本体処理。
// character の各種カウンタ/フラグを見て、条件を満たしたものを1つずつタグ化する。
function tryGenerateExperienceTags(character) {
  const p = character.params;
  const likes = p.likes || (p.likes = []);
  const dislikes = p.dislikes || (p.dislikes = []);
  const acquired = character.acquiredPersonality || (character.acquiredPersonality = []);
  const excludeAcquired = new Set([...(p.personalityTags || []), ...acquired]);

  // 夜の水辺でくつろいだ体験 → 好き
  if (character.nightWaterTime >= 20 && Math.random() < 0.5) {
    if (addUnique(likes, pickFrom(EXPERIENCE_TEMPLATES.night_water_calm.pool), MAX_DYNAMIC_TAGS)) {
      character.nightWaterTime = 0;
    }
  }

  // 雷雨で被弾した体験 → 苦手
  if (character.stormHits >= 1) {
    addUnique(dislikes, pickFrom(EXPERIENCE_TEMPLATES.storm_damage.pool), MAX_DYNAMIC_TAGS);
    character.stormHits = 0;
  }

  // 木こり/採掘を長く続けた → 好き(既存の単純進化を踏襲しつつ表現を自由化)
  if (character.gatherStreak.tree >= 20 && !likes.includes('木を伐ること')) addUnique(likes, '木を伐ること', MAX_DYNAMIC_TAGS);
  if (character.gatherStreak.big_tree >= 15 && !likes.includes('巨木伐採')) addUnique(likes, '巨木伐採', MAX_DYNAMIC_TAGS);
  if (character.gatherStreak.stone >= 20 && !likes.includes('石を掘ること')) addUnique(likes, '石を掘ること', MAX_DYNAMIC_TAGS);
  if (character.restStreak >= 30 && !likes.includes('昼寝')) addUnique(likes, '昼寝', MAX_DYNAMIC_TAGS);
  if (character.rainExposure >= 15) addUnique(dislikes, '雨', MAX_DYNAMIC_TAGS);

  // 疲労困憊での労働 → 苦手
  if ((character.actionCounts.woodcutting + character.actionCounts.mining + character.actionCounts.farming) >= 40 && character.stamina < 20) {
    addUnique(dislikes, pickFrom(EXPERIENCE_TEMPLATES.exhaustion.pool), MAX_DYNAMIC_TAGS);
  }

  // 盗みを働いた後ろめたさ → 苦手
  if (character.actionCounts.stealing >= 1 && character._stealShameApplied !== character.actionCounts.stealing) {
    character._stealShameApplied = character.actionCounts.stealing;
    addUnique(dislikes, pickFrom(EXPERIENCE_TEMPLATES.theft_shame.pool), MAX_DYNAMIC_TAGS);
  }

  // 鉱石採掘での大成功 → 後天性性格(欲深さ)
  if (character._bigGatherCrit && !character._bigGatherCritApplied) {
    character._bigGatherCritApplied = true;
    addUnique(acquired, buildCompoundPersonality('greed'), MAX_DYNAMIC_TAGS);
  }

  // 虎討伐(戦闘)の達成 → 後天性性格(勇敢)
  if (character.actionCounts.tigerHunts >= 1 && character._braveryApplied !== character.actionCounts.tigerHunts) {
    character._braveryApplied = character.actionCounts.tigerHunts;
    addUnique(acquired, buildCompoundPersonality('bravery'), MAX_DYNAMIC_TAGS);
  }

  // 瀕死からの生還(危機管理) → 後天性性格
  if (character._crisisSurvived && !character._crisisApplied) {
    character._crisisApplied = true;
    addUnique(acquired, buildCompoundPersonality('crisis'), MAX_DYNAMIC_TAGS);
  }

  // 夜間活動の多さ → 後天性性格(夜型)
  if (character.actionCounts.nightActivity >= 120 && !excludeAcquired.has('闇を恐れぬ夜行性の性分')) {
    addUnique(acquired, buildCompoundPersonality('nightOwl'), MAX_DYNAMIC_TAGS);
  }

  // 祈りを重ねた敬虔さ → 後天性性格
  if (character.prayCount >= 5 && !character._devotionApplied) {
    character._devotionApplied = true;
    addUnique(acquired, buildCompoundPersonality('devotion'), MAX_DYNAMIC_TAGS);
  }

  // 孤独(誰とも打ち解けられていない)な生き方 → 後天性性格
  const totalAffinity = Object.values(character.relationships || {}).reduce((s, r) => s + (r.favorability || 0), 0);
  if (character.ageYears >= 25 && totalAffinity < 10 && !character.partnerId && Math.random() < 0.02) {
    addUnique(acquired, buildCompoundPersonality('isolation'), MAX_DYNAMIC_TAGS);
  }

  // 交流が実り好感度が高まった → 好き
  if (character._lastSocialBondBonus && Math.random() < 0.3) {
    character._lastSocialBondBonus = false;
    addUnique(likes, pickFrom(EXPERIENCE_TEMPLATES.social_bond.pool), MAX_DYNAMIC_TAGS);
  }
}

// ============ オリジナル職業の自動襲名 ============

const JOB_TITLE_COMBOS = [
  { keys: ['woodcutting', 'building'], min: 3, title: '森の建築家' },
  { keys: ['nightActivitySlow', 'tigerHunts'], min: 3, title: '漆黒の獣ハンター' },
  { keys: ['praying', 'cooking'], min: 8, title: '豊穣の神官シェフ' },
  { keys: ['mining', 'building'], min: 3, title: '山師建築家' },
  { keys: ['farming', 'cooking'], min: 15, title: '実りの料理人' },
  { keys: ['socializing', 'praying'], min: 10, title: '心癒す語り部' },
  { keys: ['stealing', 'hunting'], min: 6, title: '影の狩人' },
];

const JOB_TITLE_SOLO = {
  woodcutting: ['熟練の木こり', '森の伐採名人'],
  mining: ['熟練の鉱夫', '岩盤の探求者'],
  farming: ['実りの農夫', '大地の担い手'],
  fishing: ['凄腕の漁師', '波間の釣り人'],
  cooking: ['村の料理人', '味自慢のシェフ'],
  praying: ['信心深き祈り手', '静寂の求道者'],
  socializing: ['人気者', '村のムードメーカー'],
  hunting: ['腕利きの狩人', '獣狩りの名手'],
  building: ['街づくりの匠', '棟梁'],
};

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// character.actionCounts を評価し、条件を満たせばオリジナル職業名を返す(満たさなければnull)
function evaluateJobTitle(character) {
  const counts = Object.assign({}, character.actionCounts, {
    nightActivitySlow: Math.floor(character.actionCounts.nightActivity / 40),
  });

  for (const combo of JOB_TITLE_COMBOS) {
    if (combo.keys.every((k) => (counts[k] || 0) >= combo.min)) return combo.title;
  }

  let topKey = null, topVal = 0;
  for (const k in character.actionCounts) {
    if (k === 'nightActivity') continue; // 単体では職業名にしない(組み合わせ専用)
    if ((character.actionCounts[k] || 0) > topVal) { topVal = character.actionCounts[k]; topKey = k; }
  }
  if (topKey && topVal >= 10 && JOB_TITLE_SOLO[topKey]) {
    const options = JOB_TITLE_SOLO[topKey];
    return options[hashStr(character.id + topKey) % options.length];
  }
  return null;
}

// ============ 基礎資格(システム上の行動権限)と動的肩書き(称号)の分離 ============
// 「資格」は一度得ると失われない累積的な行動権限。「称号」(dynamicJob/evaluateJobTitle)は
// AIが自由に創出・更新する演出的な二つ名であり、両者は明確に別管理とする。

const QUALIFICATION_DEFS = {
  鍛冶師: '鉄/金/石を加工できる資格',
  鉱夫: 'つるはしを使い鉱石/石を効率よく採掘できる資格',
  大工: '原木を木材へ加工できる資格(原木の採集自体は誰でも可能)',
  料理人: '調理器具を使い高度な料理を作れる資格(火による基本調理は誰でも可能)',
  漁業: '魚を捕獲し、深水域を探索できる資格。水場での移動減速が軽減される',
  農民: 'クワを使い作物を育成・管理できる資格',
  酪農家: 'ハサミ等を使い羊毛・卵を安全に回収できる資格',
  狩人: '動物を効率的に狩猟・解体できる資格(動物への攻撃自体は誰でも可能)',
  医師: '体力(HP/傷)を治療できる資格(空腹回復は不可)',
  建築士: '壁・屋根・ドアの構造を組み合わせた建物を建設できる資格',
  商人: '需要を察知し交易・物々交換で生計を立てられる資格',
  兵士: '治安維持・警備・戦闘を担い、装備補正を最大限活かせる資格',
  吟遊詩人: '噂や出来事を広め、歌で感情を癒し対価を得られる資格',
  魔法使い: '杖を用いてランドマーク研究や天候変化などの奇跡を起こせる資格',
  村長: '村の統治権を持つ資格。都市計画・税率・共有備蓄庫の管理を行える(1村につき常に1人)',
};

// 資格によっては専用道具の所持が条件になる({資格名: 必要な道具アイテム名})
const QUALIFICATION_TOOL_REQUIREMENTS = {
  鉱夫: 'つるはし',
  農民: 'クワ',
  酪農家: 'ハサミ',
  料理人: '調理器具',
  魔法使い: '杖',
};

// character.actionCounts/params.job/所持道具 を見て、未取得の資格があれば付与する(累積・一度得たら失わない)
function evaluateQualifications(character) {
  if (!character.qualifications) character.qualifications = [];
  const have = new Set(character.qualifications);
  const hasTool = (q) => {
    const tool = QUALIFICATION_TOOL_REQUIREMENTS[q];
    return !tool || character.getItemCount(tool) > 0;
  };
  const grant = (q) => { if (!have.has(q) && hasTool(q)) { character.qualifications.push(q); have.add(q); } };
  const job = character.params.job;
  const counts = character.actionCounts;

  if (job === '鍛冶師' || counts.mining >= 15) grant('鍛冶師');
  if (job === '鉱夫' || (hasTool('鉱夫') && counts.mining >= 3)) grant('鉱夫');
  if (job === '大工' || counts.woodcutting >= 10) grant('大工');
  if (hasTool('料理人') && counts.cooking >= 1) grant('料理人');
  if (job === '漁師' || character.params.canFish) grant('漁業');
  if (job === '農民' || (hasTool('農民') && counts.farming >= 1)) grant('農民');
  if (hasTool('酪農家')) grant('酪農家');
  if (job === '兵士' || counts.hunting >= 3) grant('狩人');
  if (counts.healing >= 5) grant('医師');
  if (counts.building >= 1) grant('建築士');
  if (job === '商人') grant('商人');
  if (job === '兵士') grant('兵士');
  if (counts.socializing >= 10 && (character.params.cha || 0) >= 7) grant('吟遊詩人');
  if (job === '魔法使い' && hasTool('魔法使い')) grant('魔法使い');
}

// ============ 能力・資格図鑑(アンロック方式) ============

const ABILITY_CODEX_DEFS = {
  怪力: 'STRが高いキャラクターの証。重い荷物や力仕事を苦にしない',
  俊足: 'AGIが高いキャラクターの証。移動速度が速い',
  賢者: 'INTが高いキャラクターの証。学習・言語習得が早い',
  人気者: 'CHAが高いキャラクターの証。周囲との交流で好感度が上がりやすい',
  見習い: 'まだ特に秀でた能力を発揮していない',
};

const ANIMAL_ABILITY_CODEX_DEFS = {
  早起き: '朝の訪れにいち早く気づく',
  目ざとい: '周囲の変化によく気づく',
  マイペース: '自分のペースを崩さない',
  もぐもぐ: '食べることが好き',
  食いしんぼう: 'とにかく食欲旺盛',
  きれい好き: '体を清潔に保つ習性がある',
  百獣の王: '森の頂点に立つ風格を持つ',
  俊敏: '素早い身のこなしを持つ',
  'モコモコ(耐寒)': 'ふわふわの毛で寒さに強い',
  のんびり屋: 'いつも自分のペースでのんびりしている',
};

const CODEX_ENTRIES = [
  ...Object.keys(QUALIFICATION_DEFS).map((id) => ({ id, category: '資格', description: QUALIFICATION_DEFS[id] })),
  ...Object.keys(ABILITY_CODEX_DEFS).map((id) => ({ id, category: '能力', description: ABILITY_CODEX_DEFS[id] })),
  ...Object.keys(ANIMAL_ABILITY_CODEX_DEFS).map((id) => ({ id, category: '動物特性', description: ANIMAL_ABILITY_CODEX_DEFS[id] })),
];

// ============ 物々交換(バーター)エコシステム ============
const ITEM_VALUE_TABLE = {
  原木: 1, 木材: 2, 枝: 1, 伝説の枝: 50, リンゴ: 2, 小麦: 2, 野菜: 2, 牛肉: 5, 牛乳: 3, 羊毛: 4,
  羊肉: 5, 豚肉: 4, 鶏肉: 3, 羽: 1, 卵: 2, 牙: 8, 虎皮: 12, 土: 1, 砂: 1, 石: 1, 石材: 3,
  鉄鉱石: 6, 鉄: 10, 金鉱石: 15, 金: 25, 水: 1,
};

function estimateItemValue(itemId) {
  if (ITEM_VALUE_TABLE[itemId] != null) return ITEM_VALUE_TABLE[itemId];
  const dynDef = DYNAMIC_ITEM_REGISTRY[itemId];
  if (dynDef) return 10 + (dynDef.atkBonus || 0) * 3 + (dynDef.defBonus || 0) * 3;
  return 3;
}

// 双方の余剰在庫から、価値が釣り合う(または好感度で許容される)交換を1件試みる
function attemptBarter(a, b) {
  const findSurplus = (owner, excludeItem) => {
    let best = null, bestQty = 1;
    for (const slot of owner.inventorySlots) {
      if (!slot || slot.item === excludeItem) continue;
      const qty = owner.getItemCount(slot.item);
      if (qty > bestQty && !isEquipment(slot.item)) { best = slot.item; bestQty = qty; }
    }
    return best;
  };
  const offerFromA = findSurplus(a, null);
  const offerFromB = findSurplus(b, offerFromA);
  if (!offerFromA || !offerFromB || offerFromA === offerFromB) return null;

  const valueA = estimateItemValue(offerFromA);
  const valueB = estimateItemValue(offerFromB);
  const favor = (a.getFavorability(b.id) + b.getFavorability(a.id)) / 2;
  const tolerance = 1 + Math.max(0, favor) / 100;
  if (valueA > valueB * 2 * tolerance || valueB > valueA * 2 * tolerance) return null;

  const qtyA = Math.max(1, Math.round(valueB / valueA));
  const qtyB = Math.max(1, Math.round(valueA / valueB));
  const movedA = a.removeFromInventory(offerFromA, Math.min(qtyA, a.getItemCount(offerFromA)));
  const movedB = b.removeFromInventory(offerFromB, Math.min(qtyB, b.getItemCount(offerFromB)));
  if (movedA <= 0 || movedB <= 0) {
    if (movedA > 0) a.addToInventory(offerFromA, movedA);
    if (movedB > 0) b.addToInventory(offerFromB, movedB);
    return null;
  }
  a.addToInventory(offerFromB, movedB);
  b.addToInventory(offerFromA, movedA);
  a.adjustFavorability(b.id, 5);
  b.adjustFavorability(a.id, 5);
  a.addMemory(`${b.params.name}と物々交換した(${offerFromA}⇔${offerFromB})`, 3);
  b.addMemory(`${a.params.name}と物々交換した(${offerFromB}⇔${offerFromA})`, 3);
  return { itemA: offerFromA, qtyA: movedA, itemB: offerFromB, qtyB: movedB };
}

// ============ 社会組織: 村長・教団 ============

// クラスタ内で村長が未任命なら、最もCHAが高い者を村長に任命する
// クラスタ内の村長を任命/維持する。村長資格は1村につき常に1人だけ(交代時は旧村長から剥奪)。
// 無職者が村長になった場合は職業名も「村長」にする。既に職業がある場合は職業名を維持し資格のみ追加する。
function assignOrUpdateMayor(clusterMembers, allCharacters, villageName, map) {
  if (!map.villages) map.villages = {};
  if (!map.villages[villageName]) map.villages[villageName] = { color: randomVillageColor(), mayorId: null };
  const villageInfo = map.villages[villageName];

  const stillMayor = clusterMembers.find((m) => m.id === villageInfo.mayorId);
  if (stillMayor) return stillMayor; // 既に有効な村長がいれば維持(不要な交代を避ける)

  const candidate = clusterMembers.reduce((best, m) => (!best || (m.params.cha || 0) > (best.params.cha || 0) ? m : best), null);
  if (!candidate) return null;

  // 旧村長がいれば資格・職業を剥奪(村を離れた/死亡した場合も含めallCharactersから探す)
  if (villageInfo.mayorId) {
    const oldMayor = allCharacters.find((m) => m.id === villageInfo.mayorId);
    if (oldMayor) revokeMayor(oldMayor);
  }

  if (!candidate.qualifications.includes('村長')) candidate.qualifications.push('村長');
  if (!candidate.params.job) {
    candidate._originalJobBeforeMayor = null;
    candidate.params.job = '村長';
  }
  villageInfo.mayorId = candidate.id;
  candidate.addMemory(`${villageName}の村長に選ばれた`, 8);
  clusterMembers.forEach((m) => {
    if (m !== candidate) { m.setRelationType(candidate.id, '村長'); m.adjustFavorability(candidate.id, 5); }
  });
  return candidate;
}

function revokeMayor(character) {
  character.qualifications = character.qualifications.filter((q) => q !== '村長');
  if (character.params.job === '村長') character.params.job = character._originalJobBeforeMayor || null;
}

function randomVillageColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 65%, 55%)`;
}

function foundCult(character, cultName) {
  if (character.titleTags.includes('教祖')) return false;
  character.titleTags.push('教祖');
  character.cultName = cultName;
  character.addMemory(`「${cultName}」を設立した`, 9);
  return true;
}

// 2,000種の性格データとの相性・好感度・カリスマから入信可否を判定する
function evaluateCultInvite(inviter, invitee) {
  if (invitee.titleTags.includes('教祖') || (invitee.relationships[inviter.id] || {}).relationType === '教祖') return false;
  const favor = invitee.getFavorability(inviter.id);
  const charmBonus = (inviter.params.cha || 0) * 2;
  const susceptible = (invitee.params.personalityTags || []).some(
    (t) => t.includes('影響されやすい') || t.includes('素直') || t.includes('信心') || t.includes('寂しがり')
  );
  const chance = Math.max(0.01, (favor + charmBonus + (susceptible ? 20 : 0)) / 200);
  if (Math.random() < chance) {
    invitee.setRelationType(inviter.id, '教祖');
    invitee.cultName = inviter.cultName;
    invitee.addMemory(`「${inviter.cultName}」に入信した`, 7);
    if (!invitee.titleTags.includes('信者')) invitee.titleTags.push('信者');
    return true;
  }
  return false;
}

// 教祖から信者への命令は最優先タスクとして扱う(character.pendingCultCommandに格納)
function issueCultCommand(leader, follower, commandText) {
  const rel = follower.relationships[leader.id];
  if (!rel || rel.relationType !== '教祖') return false;
  follower.pendingCultCommand = commandText;
  follower.addMemory(`教祖から命令を受けた: ${commandText}`, 6);
  return true;
}
