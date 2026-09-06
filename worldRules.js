// worldRules.js
// 近接した住民同士のアドリブ会話(神視点で眺めて楽しむための演出セリフ)。
// 以前あった「この世界のルール」解説パネルはUIから削除されたため、
// 実際に使用されるダイアログ生成部分のみを残している。

const DIALOGUE_LINES = {
  greeting: ['やあ、調子はどう？', 'おはよう！', 'いい天気だね', 'また会ったね'],
  friendly: ['一緒に頑張ろう！', 'あなたと話すと元気が出るよ', 'ありがとう、助かったよ'],
  tired: ['ちょっと疲れたなあ…', '休憩したい気分だよ', 'お腹が空いてきた…'],
  rain: ['雨が続くね…', '早く止んでほしいな', '作物にはいい雨だね'],
  storm: ['雷が怖いよ…', 'どうか静まりますように', '巨木の下に集まろう'],
  steal_victim: ['あ！私の食料が…！', 'ひどいよ…', '信じられない…'],
};

function pickDialogue(category) {
  const pool = DIALOGUE_LINES[category] || DIALOGUE_LINES.greeting;
  return pool[Math.floor(Math.random() * pool.length)];
}
