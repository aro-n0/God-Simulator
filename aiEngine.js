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
  const totalAffinity = Object.values(character.affinity || {}).reduce((s, v) => s + v, 0);
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
  { keys: ['woodcutting', 'farming'], min: 18, title: '森の建築家' },
  { keys: ['nightActivitySlow', 'tigerHunts'], min: 3, title: '漆黒の獣ハンター' },
  { keys: ['praying', 'cooking'], min: 8, title: '豊穣の神官シェフ' },
  { keys: ['mining', 'trading'], min: 15, title: '山師商人' },
  { keys: ['farming', 'cooking'], min: 15, title: '実りの料理人' },
  { keys: ['socializing', 'praying'], min: 10, title: '心癒す語り部' },
  { keys: ['fishing', 'cooking'], min: 12, title: '漁師料理人' },
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
