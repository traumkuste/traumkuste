// ── DATA（data.jsonから読み込み済み） ──
// LCOLOR, LTEXT, LEMOJI, LSTATS, BOTTLE_WORDS, DUMMIES, DUNGEONS, ENEMIES, DROPS
// はloadData()で設定されます。下記は初期値（loadData完了前のフォールバック用）
var LCOLOR={}, LTEXT={}, LEMOJI={}, LSTATS={};
var BOTTLE_WORDS=[], DUMMIES=[], DUNGEONS=[], ENEMIES={}, DROPS={};
var EQUIPGEN = null; // data.jsonのequipGenで上書き可（無ければDEFAULT_EQUIPGEN）

// 重み付きランダム選択
function weightedRand(pool) {
  var total = pool.reduce(function(s,i){ return s+(i.w||20); }, 0);
  var r = Math.random() * total;
  var acc = 0;
  for (var i = 0; i < pool.length; i++) {
    acc += (pool[i].w||20);
    if (r < acc) return pool[i];
  }
  return pool[pool.length-1];
}

const XP_PER_LEVEL = 100;

// ── STATE ──
var G = {
  words: [],
  companions: [],
  logs: [],
  inventory: [],
  party: [],
  selDungeon: null,
  selLayer: null,
  bottleQ: [],
  quizQ: [],
  curQuiz: null,
  playerName: '',
  taler: 0,
  laterneUnlocked: false,
  clearedDungeons: [],
  lastBattleLog: [],
  bottleLimit: 6,
  quizDoneToday: {},
  quizDoneDate: '',
  bottleRecent: [],
  playerLevel: 1,
};
// ── UTILS ──
function toast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(function(){ el.classList.remove('show'); }, 2800);
}

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── PIXEL SPRITES（単語×性×層から決定論的に生成） ──
var SPRITE_PAL = {
  '空中都市': {main:'#AFA9EC', accent:'#FFFFFF', dark:'#3C3489'},
  '湖':       {main:'#7F77DD', accent:'#EEEDFE', dark:'#26215C'},
  '庭':       {main:'#639922', accent:'#C0DD97', dark:'#173404'},
  '浜辺':     {main:'#BA7517', accent:'#FAEEDA', dark:'#412402'},
  '海':       {main:'#9FE1CB', accent:'#E1F5EE', dark:'#04342C'},
  '深海':     {main:'#378ADD', accent:'#9FE1CB', dark:'#042C53'}
};
function spriteHash(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function spriteRng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function spriteMask(x,y,g){
  var cx=7.5, cy=8;
  if(g==='das'){var dx=x-cx,dy=y-cy;return dx*dx+dy*dy<46;}
  if(g==='die'){var ex=(x-cx)/5.2, ey=(y-cy)/7.2;return ex*ex+ey*ey<1;}
  return Math.abs(x-cx)+Math.abs(y-cy)<9.5; // der（および性不明）はひし形
}
var spriteCache = {};
// レベルで姿がはっきりする：Lv1-2=シルエット / Lv3-4=目が開く / Lv5+=模様が浮かぶ
function spriteURL(word, article, layer, level) {
  word = String(word || '?');
  var g = article === 'die' ? 'die' : (article === 'das' ? 'das' : (article === 'der' ? 'der' : ['der','die','das'][spriteHash(word.toLowerCase()) % 3]));
  var detail = (level || 1) >= 5 ? 2 : ((level || 1) >= 3 ? 1 : 0);
  var key = word.toLowerCase() + '|' + g + '|' + layer + '|' + detail;
  if (spriteCache[key]) return spriteCache[key];
  var pal = SPRITE_PAL[layer] || SPRITE_PAL['浜辺'];
  var rnd = spriteRng(spriteHash(word.toLowerCase() + '|' + g + '|' + layer));
  var W = 16, H = 16, grid = [], x, y;
  for (y = 0; y < H; y++) { grid[y] = []; for (x = 0; x < W; x++) grid[y][x] = 0; }
  for (y = 0; y < H; y++) {
    for (x = 0; x < 8; x++) {
      if (spriteMask(x, y, g) && rnd() < 0.62) {
        var c = rnd() < 0.22 ? 2 : 1;
        grid[y][x] = c; grid[y][15 - x] = c;
      }
    }
  }
  var eyeY = 5 + Math.floor(rnd() * 3), eyeX = 4 + Math.floor(rnd() * 2);
  if (detail >= 1) { grid[eyeY][eyeX] = 3; grid[eyeY][15 - eyeX] = 3; }
  var cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
  var ctx = cv.getContext('2d');
  for (y = 0; y < H; y++) {
    for (x = 0; x < W; x++) {
      var v = grid[y][x];
      if (!v) continue;
      var edge = false;
      if (v !== 3) {
        if (y === 0 || y === H - 1 || x === 0 || x === W - 1) edge = true;
        else if (!grid[y-1][x] || !grid[y+1][x] || !grid[y][x-1] || !grid[y][x+1]) edge = true;
      }
      ctx.fillStyle = v === 3 ? pal.dark : (edge ? pal.dark : (v === 2 && detail >= 2 ? pal.accent : pal.main));
      ctx.fillRect(x, y, 1, 1);
    }
  }
  var url = cv.toDataURL();
  spriteCache[key] = url;
  return url;
}
function avatarHTML(c, size, extraClass) {
  size = size || 44;
  var img = Math.round(size * 0.72);
  return '<div class="cavatar' + (extraClass ? ' ' + extraClass : '') + '" style="background:' + LCOLOR[c.layer] + ';width:' + size + 'px;height:' + size + 'px;flex-shrink:0">'
    + '<img src="' + spriteURL(c.word, c.article, c.layer, c.level) + '" style="width:' + img + 'px;height:' + img + 'px;image-rendering:pixelated" alt="">'
    + '</div>';
}

// ── 形容詞装備のランダム生成 ──
// 効果＝形容詞の意味。ティアは原級→比較級→最上級（拾った時点で確定）
var DEFAULT_EQUIPGEN = {
  "bases": [
    {
      "de": "Schwert",
      "jp": "剣",
      "icon": "🗡️",
      "stat": "atk",
      "vals": [
        3,
        5,
        8
      ]
    },
    {
      "de": "Schild",
      "jp": "盾",
      "icon": "🛡️",
      "stat": "def",
      "vals": [
        3,
        5,
        8
      ]
    },
    {
      "de": "Feder",
      "jp": "羽根",
      "icon": "🪶",
      "stat": "spd",
      "vals": [
        3,
        5,
        8
      ]
    },
    {
      "de": "Glocke",
      "jp": "鈴",
      "icon": "🔔",
      "stat": "lck",
      "vals": [
        3,
        5,
        8
      ]
    },
    {
      "de": "Mantel",
      "jp": "外套",
      "icon": "🧥",
      "stat": "def",
      "vals": [
        2,
        4,
        6
      ]
    }
  ],
  "adjectives": [
    {
      "forms": [
        "scharf",
        "schärfer",
        "am schärfsten"
      ],
      "jp": "鋭い",
      "effect": "crit",
      "vals": [
        0.1,
        0.16,
        0.25
      ],
      "label": "クリティカル率"
    },
    {
      "forms": [
        "durstig",
        "durstiger",
        "am durstigsten"
      ],
      "jp": "渇いた",
      "effect": "vampire",
      "vals": [
        0.12,
        0.2,
        0.3
      ],
      "label": "吸血（与ダメ回復）"
    },
    {
      "forms": [
        "dornig",
        "dorniger",
        "am dornigsten"
      ],
      "jp": "棘のある",
      "effect": "reflect",
      "vals": [
        0.15,
        0.25,
        0.4
      ],
      "label": "反射（被ダメ返し）"
    },
    {
      "forms": [
        "giftig",
        "giftiger",
        "am giftigsten"
      ],
      "jp": "毒のある",
      "effect": "poison",
      "vals": [
        4,
        7,
        11
      ],
      "label": "毒（毎ターン）"
    },
    {
      "forms": [
        "flüchtig",
        "flüchtiger",
        "am flüchtigsten"
      ],
      "jp": "儚い",
      "effect": "dodge",
      "vals": [
        0.1,
        0.16,
        0.25
      ],
      "label": "回避率"
    },
    {
      "forms": [
        "zäh",
        "zäher",
        "am zähesten"
      ],
      "jp": "しぶとい",
      "effect": "regen",
      "vals": [
        2,
        4,
        6
      ],
      "label": "毎ターンHP回復"
    },
    {
      "forms": [
        "gierig",
        "gieriger",
        "am gierigsten"
      ],
      "jp": "貪欲な",
      "effect": "greed",
      "vals": [
        0.3,
        0.5,
        0.8
      ],
      "label": "Taler獲得"
    },
    {
      "forms": [
        "leise",
        "leiser",
        "am leisesten"
      ],
      "jp": "静かな",
      "effect": "quiet",
      "vals": [
        0.35,
        0.5,
        0.7
      ],
      "label": "狙われにくさ"
    },
    {
      "forms": [
        "hell",
        "heller",
        "am hellsten"
      ],
      "jp": "明るい",
      "effect": "shine",
      "vals": [
        0.15,
        0.25,
        0.4
      ],
      "label": "帰還時ボーナス発見率"
    },
    {
      "forms": [
        "schwer",
        "schwerer",
        "am schwersten"
      ],
      "jp": "重い",
      "effect": "heavy",
      "vals": [
        5,
        8,
        12
      ],
      "label": "DEF大幅上昇"
    }
  ],
  "rareAdjectives": [
    {
      "forms": [
        "gut",
        "besser",
        "am besten"
      ],
      "jp": "良い",
      "effect": "allstats",
      "vals": [
        2,
        4,
        6
      ],
      "label": "全ステータス"
    },
    {
      "forms": [
        "viel",
        "mehr",
        "am meisten"
      ],
      "jp": "多い",
      "effect": "xp",
      "vals": [
        0.3,
        0.6,
        1.0
      ],
      "label": "経験値獲得"
    }
  ],
  "tierJp": [
    "",
    "より",
    "最も"
  ]
};
function genEquip(depth, lck) {
  var EG = EQUIPGEN || DEFAULT_EQUIPGEN;
  var base = rand(EG.bases);
  var isRare = Math.random() < 0.05 + Math.min(lck || 0, 30) * 0.003;
  var pool = (isRare && EG.rareAdjectives && EG.rareAdjectives.length) ? EG.rareAdjectives : EG.adjectives;
  var adj = rand(pool);
  var roll = Math.random() + depth * 0.18 + Math.min(lck || 0, 30) * 0.006;
  var tier = roll > 1.2 ? 2 : (roll > 0.9 ? 1 : 0);
  var v = adj.vals[tier];
  var stat = {};
  stat[base.stat] = base.vals[tier];
  var effects = null;
  if (adj.effect === 'allstats') {
    stat.atk = (stat.atk || 0) + v; stat.def = (stat.def || 0) + v;
    stat.spd = (stat.spd || 0) + v; stat.lck = (stat.lck || 0) + v;
  } else if (adj.effect === 'heavy') {
    stat.def = (stat.def || 0) + v; stat.spd = (stat.spd || 0) - 2;
  } else {
    effects = [{ effect: adj.effect, val: v }];
  }
  var effLabel;
  if (adj.effect === 'allstats') effLabel = '全ステータス+' + v;
  else if (adj.effect === 'heavy') effLabel = 'DEF+' + v + '・SPD-2';
  else effLabel = adj.label + (v < 1 ? '+' + Math.round(v * 100) + '%' : '+' + v);
  // 効果ラベル（日本語版）
  var baseLabel = base.jp + '（' + base.de + '）';
  var statLabel = {atk:'攻撃力', def:'防御力', spd:'速さ', lck:'運'}[base.stat] || base.stat;
  var tierWord = ['', 'より', '最も'][tier];
  var adjLabel = tierWord + adj.jp + '（' + adj.forms[tier] + '）';
  var effectDetail = '';
  if (adj.effect === 'crit')    effectDetail = '攻撃が会心の一撃になることがある（2倍ダメージ）';
  else if (adj.effect === 'vampire') effectDetail = '攻撃のたびに与えたダメージの一部をHPとして吸収する';
  else if (adj.effect === 'reflect') effectDetail = '攻撃を受けたとき、ダメージの一部を跳ね返す';
  else if (adj.effect === 'poison')  effectDetail = '敵に毒を与え、毎ターンHPを削り続ける';
  else if (adj.effect === 'dodge')   effectDetail = '敵の攻撃をかわすことがある';
  else if (adj.effect === 'regen')   effectDetail = '戦闘中、毎ターン自動的にHPが回復する';
  else if (adj.effect === 'greed')   effectDetail = '敵を倒したときに得られるTalerが増える';
  else if (adj.effect === 'quiet')   effectDetail = '敵の単体攻撃の標的になりにくい';
  else if (adj.effect === 'shine')   effectDetail = '帰還時に追加アイテムを見つけることがある';
  else if (adj.effect === 'heavy')   effectDetail = '防御力が大きく上がるが速さが少し下がる';
  else if (adj.effect === 'allstats')effectDetail = 'すべてのステータスが上昇する';
  else if (adj.effect === 'xp')      effectDetail = '戦闘で得られる経験値が増加する';
  else effectDetail = effLabel;
  var item = {
    name: base.de + ': ' + adj.forms[tier],
    type: '装備(仲間)',
    icon: base.icon,
    desc: baseLabel + ' ' + statLabel + '+' + base.vals[tier] + '\n' + adjLabel + ' — ' + effectDetail,
    stat: stat,
    gen: true, rare: !!isRare, tier: tier
  };
  if (effects) item.effects = effects;
  return item;
}
// 仲間の装備から効果を集計（生成装備のeffects配列と、旧来のeffect/effectValueの両対応）
function equipFx(c) {
  var out = {};
  (c.equip || []).forEach(function(e) {
    var effs = e.effects || (e.effect ? [{ effect: e.effect, val: e.effectValue }] : []);
    effs.forEach(function(x) { if (x && x.effect) out[x.effect] = (out[x.effect] || 0) + (x.val || 0); });
  });
  return out;
}

function showScreen(id) {
  var screens = document.querySelectorAll('.screen');
  for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
  document.getElementById(id).classList.add('active');
    if (dungState.active) {
    showScreen('livelog-screen');
    return;
  }
  if (id === 'companions-screen') renderCompanions();
  if (id === 'sofa-screen') { renderSofa(); initDataManagement(); }
  if (id === 'bookshelf-screen') renderBookshelf();
  if (id === 'inventory-screen') renderInventory();
  if (id === 'log-screen') renderLogs();
  if (id === 'dungeon-screen') renderDungeon();
  updateCounts();
}

// ── ライフ管理 ──
function updateCounts() {
  document.getElementById('sw').textContent = G.words.length + '語';
  var talerEl = document.getElementById('taler-display');
  if (talerEl) talerEl.textContent = G.taler + 'T';
  // ログバッジ（未読メッセージ数）
  var unread = G.logs.filter(function(l){ return l.isLetter && !l.read; }).length;
  var logBadge = document.getElementById('log-badge');
  if (logBadge) {
    if (unread > 0) { logBadge.textContent = unread; logBadge.style.display = 'inline'; }
    else { logBadge.style.display = 'none'; }
  }
  var blInfo = document.getElementById('bottle-limit-info');
  if (blInfo) {
    var picked = bottlePickedCount ? bottlePickedCount() : 0;
    var limit = G.bottleLimit || 6;
    blInfo.textContent = '今日拾えるBlatt: ' + (limit - picked) + ' / ' + limit;
  }
  document.getElementById('sc').textContent = G.companions.length + '体';
  var layers = ['空中都市','湖','庭','浜辺','海','深海'];
  for (var i = 0; i < layers.length; i++) {
    var l = layers[i];
    var n = G.words.filter(function(w){ return w.layer === l; }).length;
    var el = document.getElementById('lc-' + l);
    if (el) el.textContent = n + '語';
  }
}
  // 展望台バッジ
  var today = new Date().toLocaleDateString('ja-JP');
var pending = G.words.filter(function(w){ 
  return w.status !== '定着済み' && !G.quizDoneToday[w.word] && G.quizDoneDate === today;
}).length;
if (G.quizDoneDate !== today) {
  pending = G.words.filter(function(w){ return w.status !== '定着済み'; }).length;
}
  var badge = document.getElementById('quiz-badge');
  if (badge) {
    if (pending > 0) { badge.textContent = pending; badge.style.display = 'inline'; }
    else { badge.style.display = 'none'; }
  }

// ── WORD / BOTTLE ──
function addWord(word, meaning, layer, article, fromBottle) {
  var b = LSTATS[layer];
  var v = function(){ return Math.floor(Math.random()*4)-2; };
  var maxHP = 30 + b.def * 2;
  G.words.push({
    word: word, meaning: meaning, layer: layer,
    article: article || '',
    fromBottle: !!fromBottle,
    correctCount: 0, status: '未定着',
    stats: {atk: b.atk+v(), def: b.def+v(), spd: b.spd+v(), lck: b.lck+v()},
    hp: maxHP, maxHP: maxHP, xp: 0, level: 1, equip: []
  });
  updateCounts();
}

function bottlePickedCount() {
  // 既に拾った瓶の数 = 登録済み言葉のうちbottle由来のもの
  return G.words.filter(function(w){ return w.fromBottle; }).length;
}

function openBottle() {
  var limit = G.bottleLimit || 6;
  if (bottlePickedCount() >= limit) {
    toast('今日はもう瓶を拾えないみたい。仲間は家の中に行こうと呼んでいる。');
    return;
  }
  if (!G.bottleQ.length) { toast('今は瓶が流れ着いていない...'); return; }
  var w = G.bottleQ.shift();
  if (G.words.find(function(x){ return x.word === w.word; })) {
    G.bottleQ.push(w);
    if (G.bottleQ.length > 0) openBottle();
    return;
  }
  addWord(w.word, w.meaning, w.layer, w.article || '', true);
  // bottleRecentに追加（先頭に）
  G.bottleRecent = G.bottleRecent || [];
  G.bottleRecent.unshift(w.word);
  if (G.bottleRecent.length > 10) G.bottleRecent.pop();
  toast('「' + w.word + '」が' + w.layer + 'へ流れ着いた');
  saveGame();
  // 展望台への誘導（初回のみ or 毎回）
  setTimeout(function(){
    showBottleGuide(w.word);
  }, 3000);
}

function showBottleGuide(wordName) {
  var guide = document.getElementById('bottle-guide');
  if (!guide) return;
  guide.innerHTML = '展望台から「' + wordName + '」が見える。<br>'
    + '<button id="btn-guide-quiz" style="margin-top:8px;background:#2d6a8f;color:#fff;border:none;border-radius:16px;padding:6px 18px;font-size:12px;cursor:pointer;font-family:Georgia,serif">展望台へ行く</button>';
  guide.style.display = 'block';
  document.getElementById('btn-guide-quiz').addEventListener('click', function(){
    guide.style.display = 'none';
    initQuiz(); showScreen('quiz-screen');
  });
  setTimeout(function(){ guide.style.display = 'none'; }, 8000);
}

// ── REGISTER ──
function registerWord() {
  var word = document.getElementById('reg-word').value.trim();
  var meaning = document.getElementById('reg-meaning').value.trim();
  if (!word || !meaning) { toast('言葉と意味を入力してください'); return; }
  if (!G.selLayer) { toast('送り出す層を選んでください'); return; }
  if (G.words.find(function(w){ return w.word === word; })) { toast('すでに登録されています'); return; }
  addWord(word, meaning, G.selLayer);
  consumeItem('空のBlatt');
  toast('「' + word + '」を' + G.selLayer + 'へ送り出した');
  saveGame();
  document.getElementById('reg-word').value = '';
  document.getElementById('reg-meaning').value = '';
  G.selLayer = null;
  document.querySelectorAll('.lopt').forEach(function(o){ o.classList.remove('sel'); });
  showScreen('world-screen');
}

// ── QUIZ ──
function initQuiz() {
  // 日付チェック：日付が変わったらリセット
  var today = new Date().toLocaleDateString('ja-JP');
  if (G.quizDoneDate !== today) {
    G.quizDoneToday = {};
    G.quizDoneDate = today;
  }
  var pending = G.words.filter(function(w){
    return w.status !== '定着済み' && !G.quizDoneToday[w.word];
  });
  if (!pending.length) {
    var allPending = G.words.filter(function(w){ return w.status !== '定着済み'; });
    if (allPending.length > 0) {
      toast('今日のクイズは終わった。また明日！');
    } else {
      toast('まだ覚えていない言葉がありません');
    }
    showScreen('home-screen');
    return;
  }
  // 最近拾った言葉（bottleRecentに入っているもの）を先頭に
  var recent = G.bottleRecent || [];
  pending.sort(function(a, b) {
    var ai = recent.indexOf(a.word);
    var bi = recent.indexOf(b.word);
    if (ai >= 0 && bi < 0) return -1;
    if (bi >= 0 && ai < 0) return 1;
    return Math.random() - 0.5;
  });
  G.quizQ = pending;
  loadNextQuiz();
}

function loadNextQuiz() {
  if (!G.quizQ.length) {
    toast('今日のクイズは全部終わった！また明日！');
    showScreen('home-screen');
    return;
  }
  G.curQuiz = G.quizQ.shift();
  renderQuiz();
}

function renderQuiz() {
  var q = G.curQuiz;
  document.getElementById('qresult').classList.remove('show');

  var dots = document.getElementById('qdots');
  dots.innerHTML = '';
  for (var i = 0; i < 3; i++) {
    var d = document.createElement('div');
    d.className = 'dot' + (i < q.correctCount ? ' on' : '');
    dots.appendChild(d);
  }

  var cc = document.getElementById('qchoices');
  cc.innerHTML = '';

  if (q.isReverse) {
    // 逆クイズ：日本語が出て、冠詞込みドイツ語4択
    document.getElementById('qarticle').textContent = '';
    document.getElementById('qword').textContent = q.meaning;
    document.getElementById('qlayer').textContent = q.layer + ' — ドイツ語を選ぼう';

    // 正解：冠詞 + word
    var correctAnswer = (q.article ? q.article + ' ' : '') + q.word;
    // ダミー：他の語彙から冠詞+word
    var wrongWords = G.words.filter(function(w){ return w.word !== q.word && w.article; });
    wrongWords.sort(function(){ return Math.random()-.5; });
    var wrongs = wrongWords.slice(0, 3).map(function(w){ return (w.article ? w.article + ' ' : '') + w.word; });
    // 足りない場合はarticleなしで補完
    var allWords = G.words.filter(function(w){ return w.word !== q.word; });
    allWords.sort(function(){ return Math.random()-.5; });
    var idx2 = 0;
    while (wrongs.length < 3 && idx2 < allWords.length) {
      wrongs.push(allWords[idx2].word); idx2++;
    }
    var choices = [correctAnswer].concat(wrongs).sort(function(){ return Math.random()-.5; });
    choices.forEach(function(c) {
      var btn = document.createElement('button');
      btn.className = 'choice';
      btn.textContent = c;
      btn.addEventListener('click', function(){ answerQuiz(c === correctAnswer, btn, correctAnswer); });
      cc.appendChild(btn);
    });

  } else {
    // 通常クイズ：ドイツ語→日本語4択
    var articleStr = q.article ? q.article + ' ' : '';
    document.getElementById('qarticle').textContent = articleStr;
    document.getElementById('qword').textContent = q.word;
    document.getElementById('qlayer').textContent = q.layer;

    var allM = G.words.map(function(w){ return w.meaning; }).filter(function(m){ return m !== q.meaning; });
    var pool = allM.concat(DUMMIES.filter(function(m){ return m !== q.meaning && allM.indexOf(m) < 0; }));
    pool.sort(function(){ return Math.random()-.5; });
    var wrongs = pool.slice(0, 3);
    while (wrongs.length < 3) wrongs.push(rand(DUMMIES));
    var choices = [q.meaning].concat(wrongs).sort(function(){ return Math.random()-.5; });
    choices.forEach(function(c) {
      var btn = document.createElement('button');
      btn.className = 'choice';
      btn.textContent = c;
      btn.addEventListener('click', function(){ answerQuiz(c === q.meaning, btn, q.meaning); });
      cc.appendChild(btn);
    });
  }
}

function answerQuiz(correct, btn, correctMeaning) {
  document.querySelectorAll('.choice').forEach(function(b){ b.style.pointerEvents='none'; });
  var q = G.curQuiz;
  G.quizDoneToday[q.word] = true; // 今日はもう出題しない
  if (correct) {
    btn.classList.add('ok');
    // 半日刻み定着チェック
    var now_ms = Date.now();
    var HALF_DAY = 12 * 60 * 60 * 1000;
    var canProgress = true;
    if (!q.isReverse) {
    if (q.correctCount === 1 && q.lastCorrectAt) {
      // 2回目：12時間以上経過が必要
      if (now_ms - q.lastCorrectAt < HALF_DAY) {
        canProgress = false;
        var hoursLeft = Math.ceil((HALF_DAY - (now_ms - q.lastCorrectAt)) / 3600000);
        document.getElementById('qrestext').textContent = 'もう少し時間が必要だ。あと約' + hoursLeft + '時間後に答えよう。';
        document.getElementById('qresult').classList.add('show');
        return;
      }
    } else if (q.correctCount === 2 && q.lastCorrectAt) {
      // 3回目：最初の正解から24時間以上経過が必要
      var FULL_DAY = 24 * 60 * 60 * 1000;
      if (now_ms - q.firstCorrectAt < FULL_DAY) {
        canProgress = false;
        var hoursLeft2 = Math.ceil((FULL_DAY - (now_ms - q.firstCorrectAt)) / 3600000);
        document.getElementById('qrestext').textContent = 'もう少し時間が必要だ。あと約' + hoursLeft2 + '時間後に答えよう。';
        document.getElementById('qresult').classList.add('show');
        return;
      }
          }
    }
    q.lastCorrectAt = now_ms;
    if (q.correctCount === 0) q.firstCorrectAt = now_ms;
    q.correctCount++;
    if (q.correctCount === 1) promoteProvisional(q);
    q.isReverse = false;
    if (q.correctCount >= 3) { q.status = '定着済み'; promoteFull(q); document.getElementById('qrestext').textContent = '「' + (q.article ? q.article + ' ' : '') + q.word + '」が完全に根付いた。'; }
    else { var aw = q.article ? q.article + ' ' + q.word : q.word; document.getElementById('qrestext').textContent = '正解。' + aw + 'が' + q.layer + 'に根付いていく。（' + q.correctCount + '/3）'; }
  } else {
    btn.classList.add('ng');
    document.querySelectorAll('.choice').forEach(function(b){ if (b.textContent === correctMeaning) b.classList.add('show-ok'); });
    var wrongMsg = q.isReverse
      ? q.meaning + ' — ' + (q.article ? q.article + ' ' : '') + q.word + '。また挑戦しよう。'
      : (q.article ? q.article + ' ' : '') + q.word + ' — ' + q.meaning + '。また出会うことになる。';
    document.getElementById('qrestext').textContent = wrongMsg;
  }
  document.getElementById('qresult').classList.add('show');
}

function promoteProvisional(w) {
  if (G.companions.find(function(c){ return c.word === w.word; })) return;
  var maxHP = w.maxHP;
  w.lastCorrectAt = Date.now();
  G.companions.push({word:w.word, meaning:w.meaning, layer:w.layer, article:w.article||'', status:'仮加入',
    stats:{atk:w.stats.atk,def:w.stats.def,spd:w.stats.spd,lck:w.stats.lck},
    hp:maxHP, maxHP:maxHP, xp:0, level:1, equip:[]});
  toast(w.word + 'が仮加入した');
  updateCounts();
}

function promoteFull(w) {
  var c = G.companions.find(function(x){ return x.word === w.word; });
  if (c) { c.status = '正式加入'; c.stats.atk += 2; c.stats.def += 2; toast(w.word + 'が正式な仲間になった！'); }
  else {
    G.companions.push({word:w.word, meaning:w.meaning, layer:w.layer, article:w.article||'', status:'正式加入',
      stats:{atk:w.stats.atk+2,def:w.stats.def+2,spd:w.stats.spd,lck:w.stats.lck},
      hp:w.maxHP, maxHP:w.maxHP, xp:0, level:1, equip:[]});
    toast(w.word + 'が仲間になった！'); updateCounts(); saveGame();
  }
}

// ── COMPANIONS ──
function renderCompanions() {
  var el = document.getElementById('comp-list');
  if (!G.companions.length) { el.innerHTML = '<p class="empty-msg">まだ仲間がいません。<br>言葉を覚えると出会えます。</p>'; return; }
  el.innerHTML = G.companions.map(function(c, idx) {
    var prov = c.status === '仮加入';
    var hpPct = Math.round(c.hp / c.maxHP * 100);
    var xpPct = Math.round((c.xp % XP_PER_LEVEL) / XP_PER_LEVEL * 100);
    var equipInfo = c.equip.length ? c.equip.map(function(e){ return e.icon; }).join('') : '—';
    var skillInfo = c.skill ? (c.skill === 'heal' ? '💚ヒール' : '🌊Sog') : '—';
    var cIdx = idx;
    return '<div class="comp-card">'
      + avatarHTML(c, 44, prov ? 'prov' : '')
      + '<div style="flex:1;min-width:0">'
      + '<div class="cname">' + c.word + '</div>'
      + '<div class="clayer">' + c.layer + ' — ' + c.meaning + '</div>'
      + '<span class="cbadge ' + (prov ? 'b-prov' : 'b-full') + '">' + c.status + '</span>'
      + (c.inDungeon ? '<span style="font-size:10px;background:#2d6a8f;color:#e8f4fc;padding:2px 7px;border-radius:7px;margin-left:4px">探索中</span>' : '')
      + '<div style="font-size:10px;color:#6b5e4e;margin-top:3px">装備: ' + equipInfo + '　スキル: ' + skillInfo + '</div>'
      + (c.ancestry && c.ancestry.length ? '<div style="font-size:10px;color:#9a8a7a;font-style:italic;margin-top:2px">' + c.ancestry[c.ancestry.length-1] + '</div>' : '')
      + (prov ? '' : '<button class="equip-mgr-btn" data-cidx="' + cIdx + '" style="margin-top:5px;font-size:10px;padding:3px 10px;border:1px solid #c8b89a;border-radius:10px;background:#f5f0e8;cursor:pointer;font-family:Georgia,serif;color:#6b5e4e">装備を管理</button>')
      + '<div class="hp-bar" style="margin-top:5px"><div class="hp-fill" style="width:' + hpPct + '%"></div></div>'
      + '<div class="xp-bar"><div class="xp-fill" style="width:' + xpPct + '%"></div></div>'
      + '</div>'
      + '<div class="cstats">⚔️' + c.stats.atk + ' 🛡️' + c.stats.def + '<br>💨' + c.stats.spd + ' 🍀' + c.stats.lck + '<br>Lv.' + c.level + '</div>'
      + '</div>';
  }).join('');
  // 装備管理ボタン
  el.querySelectorAll('.equip-mgr-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var cidx = parseInt(this.getAttribute('data-cidx'));
      openEquipManager(cidx);
    });
  });
}

// 装備管理モーダル
function openEquipManager(cidx) {
  var c = G.companions[cidx];
  if (!c) return;
  var modal = document.getElementById('comp-picker-modal');
  var list  = document.getElementById('comp-picker-list');
  document.getElementById('comp-picker-title').textContent = c.word + ' の装備管理';

  var rows = '';
  // 現在の装備スロット（最大2）
  for (var i = 0; i < 2; i++) {
    var e = c.equip[i];
    if (e) {
      rows += '<div class="picker-row" style="justify-content:space-between">'
        + '<div style="display:flex;align-items:center;gap:8px">'
        + '<span style="font-size:22px">' + e.icon + '</span>'
        + '<div><div style="font-size:13px;color:#2c2416;font-weight:600">' + e.name + '</div>'
        + '<div style="font-size:10px;color:#6b5e4e">' + e.desc + '</div></div>'
        + '</div>'
        + '<button class="unequip-btn" data-cidx="' + cidx + '" data-eidx="' + i + '" style="font-size:11px;padding:4px 10px;border:1px solid #c8b89a;border-radius:10px;background:#f5ede0;cursor:pointer;font-family:Georgia,serif;color:#8a5a3a;flex-shrink:0">外す</button>'
        + '</div>';
    } else {
      rows += '<div class="picker-row" style="color:#9a8a7a;font-size:13px;font-style:italic">スロット ' + (i+1) + ' — 空き</div>';
    }
  }
  // インベントリから装備できるアイテム
  var equipable = G.inventory.filter(function(item){ return item.type === '装備(仲間)' && c.equip.length < 2; });
  if (equipable.length) {
    rows += '<div style="font-size:11px;color:#6b5e4e;letter-spacing:1px;margin:10px 0 4px;padding-left:4px">荷物から装備する</div>';
    equipable.forEach(function(item) {
      rows += '<div class="picker-row equip-from-inv" data-cidx="' + cidx + '" data-iname="' + item.name + '">'
        + '<span style="font-size:20px">' + item.icon + '</span>'
        + '<div style="flex:1"><div style="font-size:13px;color:#2c2416;font-weight:600">' + item.name + '</div>'
        + '<div style="font-size:10px;color:#6b5e4e">' + item.desc + '</div></div>'
        + '<div style="font-size:10px;color:#7b9e87">×' + (item.qty||1) + '</div>'
        + '</div>';
    });
  }

  list.innerHTML = rows;

  // 外すボタン
  list.querySelectorAll('.unequip-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var ci = parseInt(this.getAttribute('data-cidx'));
      var ei = parseInt(this.getAttribute('data-eidx'));
      var comp = G.companions[ci];
      var removed = comp.equip.splice(ei, 1)[0];
      // ステータス戻す
      if (removed.stat) {
        Object.keys(removed.stat).forEach(function(k){ comp.stats[k] = Math.max(0, (comp.stats[k]||0) - removed.stat[k]); });
      }
      // インベントリに戻す
      var inv = G.inventory.find(function(i){ return i.name === removed.name; });
      if (inv) inv.qty++;
      else { removed.qty = 1; G.inventory.push(removed); }
      toast(removed.name + 'を外した');
      closeCompPicker();
      renderCompanions();
    });
  });

  // 荷物から装備
  list.querySelectorAll('.equip-from-inv').forEach(function(row) {
    row.addEventListener('click', function() {
      var ci = parseInt(this.getAttribute('data-cidx'));
      var iname = this.getAttribute('data-iname');
      var comp = G.companions[ci];
      var item = G.inventory.find(function(i){ return i.name === iname; });
      if (!item || comp.equip.length >= 2) return;
      doEquip(comp, item);
      closeCompPicker();
      renderCompanions();
    });
  });

  modal.style.display = 'flex';
}

// ── DUNGEON ──
function renderDungeon() {
  // 選択ダンジョンの層カラーを50%透過でオーバーレイ
  var screen = document.getElementById('dungeon-screen');
  if (screen && G.selDungeon) {
    var lc = LCOLOR[G.selDungeon.layer] || '#1a3050';
    // hex→rgbaに変換
    var r = parseInt(lc.slice(1,3),16), g = parseInt(lc.slice(3,5),16), b = parseInt(lc.slice(5,7),16);
    screen.style.background = 'linear-gradient(180deg, rgba('+r+','+g+','+b+',0.35) 0%, #1a2a3e 60%)';
  } else if (screen) {
    screen.style.background = '#1a2a3e';
  }
  renderPartySlots();
  var el = document.getElementById('dlist');
  el.innerHTML = DUNGEONS.map(function(d) {
    return '<div class="dcard' + (G.selDungeon && G.selDungeon.id === d.id ? ' sel' : '') + '" data-dung="' + d.id + '">'
      + '<div class="dcard-name">' + d.name + '</div>'
      + '<div class="dcard-desc">' + d.desc + '</div>'
      + '<div class="dcard-time">所要時間 約' + d.dur + '秒（実時間）• 敵' + d.encounters + '体</div>'
      + '</div>';
  }).join('');
  document.querySelectorAll('.dcard').forEach(function(el) {
    el.addEventListener('click', function() {
      var id = parseInt(this.getAttribute('data-dung'));
      G.selDungeon = DUNGEONS.find(function(d){ return d.id === id; });
      renderDungeon();
    });
  });
  updateSendBtn();
}

function renderPartySlots() {
  var el = document.getElementById('pslots');
  el.innerHTML = '';
  for (var i = 0; i < 3; i++) {
    var slot = document.createElement('div');
    var c = G.party[i];
    slot.className = 'pslot' + (c ? ' filled' : '');
    if (c) {
      slot.innerHTML = '<img src="' + spriteURL(c.word, c.article, c.layer, c.level) + '" style="width:26px;height:26px;image-rendering:pixelated" alt="">'
        + '<span class="sname">' + c.word + '</span>'
        + '<span class="sremove" data-i="' + i + '">×</span>';
      slot.querySelector('.sremove').addEventListener('click', function(e) {
        e.stopPropagation();
        var idx = parseInt(this.getAttribute('data-i'));
        G.party.splice(idx, 1);
        renderPartySlots();
        updateSendBtn();
      });
      // タップで入れ替え
      (function(idx){ slot.addEventListener('click', function(e){
        if (e.target.classList.contains('sremove')) return;
        openPartyPicker(idx);
      }); })(i);
    } else {
      slot.innerHTML = '<span style="font-size:22px;color:#4a6a8e">+</span>'
        + '<span style="font-size:9px;color:#4a6a8e;margin-top:2px">追加</span>';
      slot.addEventListener('click', (function(idx){ return function(){ openPartyPicker(idx); }; })(i));
    }
    el.appendChild(slot);
  }
}

// パーティスロット用仲間ピッカー
function openPartyPicker(slotIdx) {
  var avail = G.companions.filter(function(c){
    return (c.status === '正式加入' || c.status === '仮加入') && G.party.indexOf(c) < 0 && !c.inDungeon;
  });
  if (!avail.length) {
    var allFull = G.companions.filter(function(c){ return c.status === '正式加入' || c.status === '仮加入'; });
    if (allFull.length > 0 && allFull.every(function(c){ return c.inDungeon; })) {
      toast('全員が探索中です。帰宅を待ちましょう');
    } else {
      toast('正式加入の仲間がいません。クイズで3回正解しよう');
    }
    return;
  }

  var modal = document.getElementById('comp-picker-modal');
  var list  = document.getElementById('comp-picker-list');
  document.getElementById('comp-picker-title').textContent = 'パーティに加える仲間を選ぶ';

  // ソートボタン
  var sortBar = document.getElementById('party-sort-bar');
  if (!sortBar) {
    sortBar = document.createElement('div');
    sortBar.id = 'party-sort-bar';
    sortBar.style.cssText = 'display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap';
    list.parentElement.insertBefore(sortBar, list);
  }
  var currentSort = 'level';
  function renderSortedList(sortKey) {
    currentSort = sortKey;
    var sorted = avail.slice().sort(function(a, b) {
      if (sortKey === 'level') return b.level - a.level;
      if (sortKey === 'atk')   return b.stats.atk - a.stats.atk;
      if (sortKey === 'def')   return b.stats.def - a.stats.def;
      if (sortKey === 'lck')   return b.stats.lck - a.stats.lck;
      return 0;
    });
    sortBar.innerHTML = [
      {key:'level', label:'Lv'},
      {key:'atk',   label:'⚔️ATK'},
      {key:'def',   label:'🛡️DEF'},
      {key:'lck',   label:'🍀LCK'},
    ].map(function(s) {
      var active = s.key === sortKey;
      return '<button data-sort="' + s.key + '" style="'
        + 'padding:4px 10px;border-radius:12px;border:1px solid #c8b89a;'
        + 'background:' + (active ? '#2c2416' : '#fff') + ';'
        + 'color:' + (active ? '#f5f0e8' : '#6b5e4e') + ';'
        + 'font-size:11px;cursor:pointer;font-family:Georgia,serif">'
        + s.label + '</button>';
    }).join('');
    sortBar.querySelectorAll('button').forEach(function(btn) {
      btn.addEventListener('click', function() {
        renderSortedList(this.getAttribute('data-sort'));
      });
    });
    list.innerHTML = sorted.map(function(c) {
      var skillLabel = c.skill ? (c.skill === 'heal' ? '💚ヒール' : '🌊Sog') : 'なし';
      var equipLabel = c.equip.length ? c.equip.map(function(e){ return e.icon; }).join('') : '—';
      return '<div class="picker-row" data-mode="party" data-name="' + c.word + '">'
        + avatarHTML(c, 36)
        + '<div style="flex:1">'
        + '<div style="font-size:14px;color:#2c2416;font-weight:600">' + c.word + '</div>'
        + '<div style="font-size:10px;color:#6b5e4e">Lv.' + c.level + '　装備:' + equipLabel + '　スキル:' + skillLabel + '　🍀' + c.stats.lck + '</div>'
        + '</div>'
        + '<div style="font-size:11px;color:#7b9e87;flex-shrink:0">⚔️' + c.stats.atk + ' 🛡️' + c.stats.def + '</div>'
        + '</div>';
    }).join('');
    list.querySelectorAll('.picker-row[data-mode="party"]').forEach(function(row) {
      row.addEventListener('click', function() {
        var name = this.getAttribute('data-name');
        var c = G.companions.find(function(x){ return x.word === name; });
        if (!c) return;
        G.party[slotIdx] = c;
        if (sortBar) sortBar.remove();
        closeCompPicker();
        renderPartySlots();
        updateSendBtn();
        toast(c.word + 'をパーティに追加');
      });
    });
  }
  renderSortedList('level');

  // 以下の既存list.innerHTMLは不要になるのでダミー変数で吸収
  var _dummy = avail.map(function(c) {
    var skillLabel = c.skill ? (c.skill === 'heal' ? '💚ヒール' : '🌊Sog') : 'なし';
    var equipLabel = c.equip.length ? c.equip.map(function(e){ return e.icon; }).join('') : '—';
    return '<div class="picker-row" data-mode="party" data-name="' + c.word + '">'
      + avatarHTML(c, 36)
      + '<div style="flex:1">'
      + '<div style="font-size:14px;color:#2c2416;font-weight:600">' + c.word + '</div>'
      + '<div style="font-size:10px;color:#6b5e4e">Lv.' + c.level + '　装備:' + equipLabel + '　スキル:' + skillLabel + '　🍀' + c.stats.lck + '</div>'
      + '</div>'
      + '<div style="font-size:11px;color:#7b9e87;flex-shrink:0">⚔️' + c.stats.atk + ' 🛡️' + c.stats.def + '</div>'
      + '</div>';
  }).join('');

  // イベントはrenderSortedList内で処理

  modal.style.display = 'flex';
}

function updateSendBtn() {
  var ok = G.party.filter(Boolean).length > 0 && !!G.selDungeon;
  document.getElementById('btn-send').disabled = !ok;
}

function sendParty() {
  var party = G.party.filter(Boolean);
  var dung = G.selDungeon;
  if (!party.length || !dung) return;
  party.forEach(function(c){ c.hp = c.maxHP; c.inDungeon = true; });
  var lightInv = G.inventory.find(function(i){ return i.name === '深海の灯り'; });
  var useLight = !!lightInv;
  if (useLight) { consumeItem('深海の灯り'); toast('深海の灯りを持って出発した。'); }
  G.party = [];
  G.selDungeon = null;
  startDungeon(party, dung, useLight);
  if (typeof dungFx !== 'undefined') dungFx.start(dung.layer);
  showScreen('livelog-screen');
}

// ── LIVE DUNGEON ──
var dungState = { interval: null, elapsed: 0, duration: 0, party: [], dung: null, events: [], failed: false, inBattle: false, pendingFinish: false, herbUsed: false, dropBoost: false, active: false, startedAt: 0, battleLog: [], currentEnemy: null, sessionItems: [] };

function startDungeon(party, dung, dropBoost) {
  dungState.party = party;
  dungState.dung = dung;
  dungState.elapsed = 0;
  dungState.duration = dung.dur;
  dungState.failed = false;
  dungState.inBattle = false;
  dungState.pendingFinish = false;
  dungState.herbUsed = false;
  dungState.dropBoost = !!dropBoost;
  dungState.active = true;
  dungState.startedAt = Date.now();
  dungState.battleLog = [];
  dungState.sessionItems = [];
  dungState.events = buildEvents(dung, party);

  document.getElementById('ll-title').textContent = dung.name + ' を探索中';
  document.getElementById('ll-scroll').innerHTML = '';
  document.getElementById('ll-timer').textContent = '00:00';
  renderLiveHP();

  if (dungState.interval) clearInterval(dungState.interval);
  dungState.interval = setInterval(tickDungeon, 1000);
}

function buildEvents(dung, party) {
  var events = [];
  var enc = dung.encounters;
  for (var i = 0; i < enc; i++) {
    events.push({ time: Math.floor(dung.dur / (enc + 1) * (i + 1)), type: 'battle' });
  }
  // 基本アイテムイベント（常に1回）
  events.push({ time: Math.floor(Math.random() * (dung.dur - 4)) + 2, type: 'item' });
  // lckボーナス：パーティの平均lckが12以上で追加アイテムチャンス
  if (party && party.length) {
    var avgLck = party.reduce(function(s, c){ return s + (c.stats.lck || 0); }, 0) / party.length;
    // lck12で+20%、lck20で+60%の確率で追加アイテム
    var bonusChance = Math.min(0.6, (avgLck - 8) * 0.05);
    if (bonusChance > 0 && Math.random() < bonusChance) {
      var bonusTime = Math.floor(Math.random() * (dung.dur - 4)) + 2;
      events.push({ time: bonusTime, type: 'item', bonus: true });
    }
  }
  return events.sort(function(a, b){ return a.time - b.time; });
}

function tickDungeon() {
  // 実時間ベースで経過秒を計算
  var e = Math.floor((Date.now() - dungState.startedAt) / 1000);
  dungState.elapsed = e;
  var mm = String(Math.floor(e / 60)).padStart(2, '0');
  var ss = String(e % 60).padStart(2, '0');
  var timerEl = document.getElementById('ll-timer');
  if (timerEl) timerEl.textContent = mm + ':' + ss;

  dungState.events.forEach(function(ev) {
    if (ev.time <= e && !ev.done) {
      ev.done = true;
      if (ev.type === 'battle') triggerBattle();
      else triggerItem(ev.bonus || false);
    }
  });

  if (e >= dungState.duration || dungState.failed) {
    clearInterval(dungState.interval);
    if (dungState.inBattle) {
      dungState.pendingFinish = true;
    } else {
      finishDungeon();
    }
  }
  // 定期セーブ（10秒ごと）
  if (e % 10 === 0) saveGame();
}

// 戦闘：敵にHPを持たせ、どちらかが0になるまでターンを繰り返す
function triggerBattle() {
  if (dungState.failed) return;
  var alive = dungState.party.filter(function(c){ return c.hp > 0; });
  if (!alive.length) { dungState.failed = true; return; }
  dungState.inBattle = true;

  var enemy = rand(ENEMIES[dungState.dung.layer]);
  var dungLayer = dungState.dung ? dungState.dung.layer : '浜辺';
  var enemyAtk, enemyDef, enemyHP;
  var isDeepSea = dungLayer === '深海';
  if (dungLayer === '浜辺') {
    enemyAtk = 7 + Math.floor(Math.random() * 8);
    enemyDef = 5  + Math.floor(Math.random() * 5);
    enemyHP  = 60 + Math.floor(Math.random() * 50);  // 80-129
  } else if (dungLayer === '海') {
    enemyAtk = 13 + Math.floor(Math.random() * 10);
    enemyDef = 8  + Math.floor(Math.random() * 7);
    enemyHP  = 150 + Math.floor(Math.random() * 70); // 150-219
  } else {
    enemyAtk = 18 + Math.floor(Math.random() * 14);
    enemyDef = 12 + Math.floor(Math.random() * 10);
    enemyHP  = 250 + Math.floor(Math.random() * 100); // 250-349
  }

  dungState.currentEnemy = enemy;
  addLL('battle', enemy + 'が現れた！');

  // Sog発動チェック（先手で敵ATK削減）
  var sogUser = alive.find(function(c){ return c.skill === 'sog'; });
  if (sogUser && Math.random() < 0.4) {
    enemyAtk = Math.max(1, Math.floor(enemyAtk * 0.6));
    setTimeout(function(){
      if (!dungState.active) return;
      addLL('battle', sogUser.word + 'のSog発動。引き潮が' + enemy + 'の力を奪った。');
    }, 300);
  }

  // SPD順にソート（高い順）
  function getSortedFighters() {
    return dungState.party.filter(function(c){ return c.hp > 0; })
      .slice().sort(function(a,b){ return b.stats.spd - a.stats.spd; });
  }

  function doTurn(delay) {
    setTimeout(function() {
      if (!dungState.active || dungState.failed) return;

      var fighters = getSortedFighters();
      if (!fighters.length) {
        dungState.failed = true;
        dungState.inBattle = false;
        addLL('danger', '誰も立っていない。扉の向こうから、静かに戻ってきた…');
        if (dungState.pendingFinish) finishDungeon();
        return;
      }

      // ── 全員が順番に攻撃 ──
      var totalDealt = 0;
      var attackLog = [];
      var poisonDmg = 0;
      fighters.forEach(function(c) {
        if (enemyHP <= 0) return;
        var fx = equipFx(c);
        var atkMod = c.status === '仮加入' ? 0.9 : 1.0;
        if (c.layer === dungLayer) atkMod *= 1.1;
        var dmgDealt = Math.max(1, Math.floor((c.stats.atk + Math.floor(Math.random()*6) - Math.floor(enemyDef*0.5)) * atkMod));
        var crit = fx.crit && Math.random() < fx.crit;
        if (crit) dmgDealt *= 2;
        enemyHP = Math.max(0, enemyHP - dmgDealt);
        totalDealt += dmgDealt;
        attackLog.push(c.word + 'が' + dmgDealt + (crit ? '（会心！）' : ''));
        if (fx.vampire && dmgDealt > 0) {
          c.hp = Math.min(c.maxHP, c.hp + Math.max(1, Math.floor(dmgDealt * fx.vampire)));
        }
        if (fx.poison) poisonDmg = Math.max(poisonDmg, fx.poison);
      });

      // 攻撃ログをまとめて表示
      if (attackLog.length === 1) {
        addLL('battle', attackLog[0] + 'のダメージ。（敵残HP: ' + enemyHP + '）');
      } else if (attackLog.length > 1) {
        addLL('battle', attackLog.join('、') + '、計' + totalDealt + 'のダメージ。（敵残HP: ' + enemyHP + '）');
      }

      // 毒のダメージ（giftig装備）
      if (poisonDmg > 0 && enemyHP > 0) {
        enemyHP = Math.max(0, enemyHP - poisonDmg);
        addLL('battle', '毒が回る。' + enemy + 'に' + poisonDmg + 'のダメージ。（敵残HP: ' + enemyHP + '）');
      }

      // 敵を倒した
      if (enemyHP <= 0) {
        var lastHitter = fighters[fighters.length-1];
        addLL('battle', enemy + 'を倒した！');
        // Talerドロップ（gierig装備で増える）
        var tBase = isDeepSea ? 15 + Math.floor(Math.random()*16)
          : (dungLayer === '海' ? 8 + Math.floor(Math.random()*9) : 4 + Math.floor(Math.random()*5));
        var greed = 0;
        fighters.forEach(function(c){ var gfx = equipFx(c); if (gfx.greed) greed = Math.max(greed, gfx.greed); });
        var talerGain = Math.round(tBase * (1 + greed));
        G.taler += talerGain;
        updateCounts();
        addLL('item', enemy + 'は' + talerGain + 'Talerを落とした。');
        var xpGain = 20 + Math.floor(Math.random() * 15);
        fighters.forEach(function(c) {
          var xfx = equipFx(c);
          c.xp += Math.round(xpGain * (1 + (xfx.xp || 0)));
          if (c.xp >= c.level * XP_PER_LEVEL) {
            c.level++;
            c.stats.atk += 2; c.stats.def += 2; c.stats.spd += 1; c.stats.lck += 1;
            c.maxHP += 6; c.hp = Math.min(c.hp + 6, c.maxHP);
            setTimeout(function(){ if (dungState.active) addLL('normal', c.word + 'はレベルアップした。（Lv.' + c.level + '）'); }, 300);
          }
        });
        renderLiveHP();
        dungState.inBattle = false;
        dungState.currentEnemy = null;
        renderLiveHP();
        if (dungState.pendingFinish) finishDungeon();
        return;
      }

      // ── 敵の反撃 ──
      var isAOE = isDeepSea && Math.random() < 0.3; // 深海は30%で全体攻撃
      if (isAOE) {
        // 全体攻撃
        addLL('danger', enemy + 'の全体攻撃！');
        var refTotal = 0;
        fighters.forEach(function(c) {
          var afx = equipFx(c);
          if (afx.dodge && Math.random() < afx.dodge) return;
          var defMod = c.status === '仮加入' ? 0.9 : 1.0;
          if (c.layer === dungLayer) defMod *= 1.1;
          var dmg = Math.max(1, Math.floor(enemyAtk * 0.6) - Math.floor(c.stats.def * defMod * 0.4) + Math.floor(Math.random()*6));
          c.hp = Math.max(0, c.hp - dmg);
          if (afx.reflect && dmg > 0) refTotal += Math.max(1, Math.floor(dmg * afx.reflect));
        });
        var dmgLog = fighters.map(function(c){ return c.word + ' -' + (c.hp <= 0 ? '(倒れた)' : c.hp + '残'); }).join('、');
        addLL('danger', dmgLog);
        if (refTotal > 0) {
          enemyHP = Math.max(0, enemyHP - refTotal);
          addLL('battle', '棘が合計' + refTotal + 'のダメージを返した。（敵残HP: ' + enemyHP + '）');
        }
      } else {
        // 単体攻撃（SPD低い仲間を優先。leise装備は狙われにくい）
        var candidates = fighters.slice().sort(function(a,b){ return a.stats.spd - b.stats.spd; });
        var target = candidates[candidates.length - 1];
        for (var ti = 0; ti < candidates.length; ti++) {
          var qfx = equipFx(candidates[ti]);
          if (ti < candidates.length - 1 && qfx.quiet && Math.random() < qfx.quiet) continue;
          target = candidates[ti];
          break;
        }
        var tfx = equipFx(target);
        var defMod = target.status === '仮加入' ? 0.9 : 1.0;
        if (target.layer === dungLayer) defMod *= 1.1;
        if (tfx.dodge && Math.random() < tfx.dodge) {
          addLL('battle', enemy + 'の攻撃。だが' + target.word + 'はひらりとかわした。');
        } else {
          var dmg = Math.max(2, enemyAtk - Math.floor(target.stats.def * defMod * 0.6) + Math.floor(Math.random()*8));
          target.hp = Math.max(0, target.hp - dmg);
          addLL('battle', enemy + 'の攻撃。' + target.word + 'は-' + dmg + 'HP（残り' + target.hp + '）');
          if (tfx.reflect && dmg > 0) {
            var refDmg = Math.max(1, Math.floor(dmg * tfx.reflect));
            enemyHP = Math.max(0, enemyHP - refDmg);
            addLL('battle', target.word + 'の棘が' + refDmg + 'のダメージを返した。（敵残HP: ' + enemyHP + '）');
          }
        }
      }
      renderLiveHP();

      // 倒れた仲間を報告
      fighters.forEach(function(c) {
        if (c.hp <= 0) addLL('danger', c.word + 'は力尽きた。');
      });

      // 全滅チェック
      if (dungState.party.every(function(c){ return c.hp <= 0; })) {
        dungState.failed = true;
        dungState.inBattle = false;
        addLL('danger', '誰も立っていない。扉の向こうから、静かに戻ってきた…');
        if (dungState.pendingFinish) finishDungeon();
        return;
      }

      // zäh装備：自然回復
      var regened = false;
      dungState.party.forEach(function(c) {
        if (c.hp <= 0 || c.hp >= c.maxHP) return;
        var rfx = equipFx(c);
        if (rfx.regen) { c.hp = Math.min(c.maxHP, c.hp + rfx.regen); regened = true; }
      });
      if (regened) renderLiveHP();

      // 塩漬けの薬草チェック
      if (!dungState.herbUsed) {
        var herbInv = G.inventory.find(function(i){ return i.name === '塩漬けの薬草'; });
        var wounded = dungState.party.filter(function(c){ return c.hp > 0 && c.hp <= c.maxHP / 2; });
        if (herbInv && wounded.length) {
          dungState.herbUsed = true;
          wounded.forEach(function(c){ c.hp = Math.min(c.maxHP, c.hp + 30); });
          consumeItem('塩漬けの薬草');
          renderLiveHP();
          addLL('item', '塩漬けの薬草が効いた。傷ついた仲間のHPが30回復した。');
        }
      }
      // ヒールチェック
      var healUser = dungState.party.filter(function(c){ return c.hp > 0 && c.skill === 'heal'; })[0];
      if (healUser && Math.random() < 0.35) {
        var healAmt = Math.floor(healUser.stats.lck * 0.8) + 3;
        dungState.party.forEach(function(c){ c.hp = Math.min(c.maxHP, c.hp + healAmt); });
        renderLiveHP();
        addLL('item', healUser.word + 'はヒールを使った。パーティのHPが' + healAmt + '回復した。');
      }

      if (!dungState.failed) {
        doTurn(enemyHP > 0 ? 1400 : 600);
      }

    }, delay);
  }

  doTurn(800);
}

function triggerItem(isBonus) {
  if (dungState.failed) return;
  var pool = DROPS[dungState.dung.layer];
  var count = dungState.dropBoost ? 2 : 1;
  var alive = dungState.party.filter(function(c){ return c.hp > 0; });
  var finder = alive.length ? alive[0] : dungState.party[0];
  // lckの高い仲間が発見者になりやすい
  var lckFinder = alive.slice().sort(function(a,b){ return (b.stats.lck||0)-(a.stats.lck||0); })[0] || finder;
  for (var di = 0; di < count; di++) {
    var item = Object.assign({}, weightedRand(pool));
    if (item.type === '生成装備') {
      var gDepth = dungState.dung.layer === '深海' ? 2 : (dungState.dung.layer === '海' ? 1 : 0);
      item = genEquip(gDepth, (lckFinder && lckFinder.stats ? lckFinder.stats.lck : 0) || 0);
      if (item.rare || item.tier === 2) addLL('success', '✨ ただならぬ気配を放つ装備だ。');
    }
    var msg = isBonus
      ? lckFinder.word + 'の勘が働いた。' + item.icon + '「' + item.name + '」を見つけた。'
      : finder.word + 'が ' + item.icon + '「' + item.name + '」を見つけた。';
    addLL('item', msg);
    var existing = G.inventory.find(function(i){ return i.name === item.name; });
    if (existing) existing.qty = (existing.qty || 1) + 1;
    else { item.qty = 1; G.inventory.push(item); }
    dungState.sessionItems.push(item.name); // 今回取得アイテムを記録
  }
  if (dungState.dropBoost) dungState.dropBoost = false;
}

function addLL(type, text) {
  var el = document.getElementById('ll-scroll');
  if (el) {
    var div = document.createElement('div');
    div.className = 'll-entry ll-' + type;
    div.textContent = text;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }
  // battleLogに記録（最新30件まで）
  if (dungState.battleLog) {
    dungState.battleLog.push({ type: type, text: text });
    if (dungState.battleLog.length > 30) dungState.battleLog.shift();
  }
}

// 敵絵文字マップ
var ENEMY_EMOJI = {
  '砂浜の亡霊': '👻', '潮の番人': '🦀', '流木の怪': '🪵',
  '珊瑚の守護者': '🪸', '光る深魚': '🐠', '海流の精': '🌊',
  '深淵の番人': '🦑', '忘却の影': '🌑', '原初の怪魚': '🐟',
};

function renderLiveHP() {
  var el = document.getElementById('ll-hp');
  el.innerHTML = dungState.party.map(function(c) {
    var pct = Math.round(c.hp / c.maxHP * 100);
    var col = pct > 60 ? '#4a8a5a' : pct > 30 ? '#c8a84b' : '#a04040';
    var isDead = c.hp <= 0;
    return '<div class="hp-row" style="' + (isDead ? 'opacity:.35' : '') + '">'
      + '<div class="hp-name" style="font-size:10px;color:#7a9ab8;width:70px">' + c.word + '</div>'
      + '<div class="hp-track"><div class="hp-fill2" style="width:' + pct + '%;background:' + col + '"></div></div>'
      + '<div class="hp-val">' + c.hp + '/' + c.maxHP + '</div>'
      + '</div>';
  }).join('');

  // アイコンエリア更新
  var iconEl = document.getElementById('ll-battle-icons');
  if (iconEl) {
    var partyIcons = dungState.party.map(function(c, ci) {
      var dead = c.hp <= 0;
      var animStyle = dead
        ? 'opacity:.25;filter:grayscale(1);display:inline-block;margin:0 4px'
        : 'animation:float' + (ci % 3) + ' ' + (2.2 + ci * 0.4) + 's ease-in-out infinite;display:inline-block;margin:0 4px';
      return '<span title="' + c.word + '" style="' + animStyle + '">'
        + '<img src="' + spriteURL(c.word, c.article, c.layer, c.level) + '" style="width:28px;height:28px;image-rendering:pixelated;vertical-align:middle" alt=""></span>';
    }).join('');
    var enemyEmoji = dungState.currentEnemy ? (ENEMY_EMOJI[dungState.currentEnemy] || '👾') : '';
    var vsStr = dungState.inBattle && enemyEmoji
      ? '<span style="font-size:16px;color:#5a8ab0;margin:0 6px">⚔️</span><span>' + enemyEmoji + '</span>'
      : '';
    iconEl.innerHTML = partyIcons + vsStr;
  }
}

function finishDungeon() {
  var survived = dungState.party.filter(function(c){ return c.hp > 0; });
  var allNames = dungState.party.map(function(c){ return c.word; }).join('・');
  if (!survived.length || dungState.failed) {
    // 全滅：取得したアイテムを失う
    var lost = dungState.sessionItems || [];
    lost.forEach(function(name) {
      var inv = G.inventory.find(function(i){ return i.name === name; });
      if (inv) {
        inv.qty = (inv.qty || 1) - 1;
        if (inv.qty <= 0) G.inventory = G.inventory.filter(function(i){ return i.name !== name; });
      }
    });
    addLL('danger', allNames + 'は敗れて戻ってきた…');
    if (lost.length) addLL('danger', '持ち帰るはずだった荷物は、深海に沈んだ。');
    G.logs.unshift({ time: now(), text: allNames + 'は' + dungState.dung.name + 'から敗退して戻った。' });
  } else {
    // 1体でも生存：探索成功
    var survivedNames = survived.map(function(c){ return c.word; }).join('・');
    var fellNames = dungState.party.filter(function(c){ return c.hp <= 0; }).map(function(c){ return c.word; });
    addLL('success', survivedNames + 'は無事に戻ってきた。');
    if (fellNames.length) {
      addLL('normal', fellNames.join('・') + 'も、なんとか帰り着いた。');
    }
    // hell装備：帰還時にボーナスアイテム
    var shine = 0;
    dungState.party.forEach(function(c){ var sfx = equipFx(c); if (sfx.shine) shine = Math.max(shine, sfx.shine); });
    if (shine > 0 && Math.random() < shine) {
      addLL('item', '明るい光に照らされて、見落としていた何かが見つかった。');
      triggerItem(true);
    }
    G.logs.unshift({ time: now(), text: survivedNames + 'が' + dungState.dung.name + 'から帰還した。' });
    checkDungeonClear(dungState.dung.name);
  }
  // 帰宅時に全員HP全快・探索フラグ解除
  dungState.party.forEach(function(c){ c.hp = c.maxHP; c.inDungeon = false; });
  dungState.active = false;
  G.lastBattleLog = dungState.battleLog.slice(); // 最新戦闘ログを保存
  if (typeof dungFx !== 'undefined') dungFx.stop();
  renderLiveHP();
  saveGame();
  checkPlayerLevel();
  setTimeout(function(){ toast('探索完了！ログを確認しよう'); }, 500);
}

function now() {
  return new Date().toLocaleTimeString('ja-JP', {hour:'2-digit', minute:'2-digit'});
}

// ── INVENTORY ──
function renderInventory() {
  var el = document.getElementById('inv-grid');
  if (!G.inventory.length) {
    el.innerHTML = '<p class="empty-msg" style="grid-column:1/-1">まだアイテムがありません。<br>ダンジョンを探索しよう。</p>';
    return;
  }
  el.innerHTML = G.inventory.map(function(item, idx) {
    return '<div class="inv-card" data-idx="' + idx + '">'
      + '<div class="inv-icon">' + item.icon + '</div>'
      + '<div class="inv-name">' + item.name + '</div>'
      + '<div class="inv-type">' + item.type + '</div>'
      + '<div class="inv-qty">× ' + (item.qty || 1) + '</div>'
      + '</div>';
  }).join('');
  document.querySelectorAll('.inv-card').forEach(function(card) {
    card.addEventListener('click', function() {
      var idx = parseInt(this.getAttribute('data-idx'));
      useItem(G.inventory[idx]);
    });
  });
  // 進化石錬成エリア
  renderCraftArea();
}

function renderCraftArea() {
  var existing = document.getElementById('craft-area');
  if (existing) existing.remove();

  // 層ごとに素材5個以上あれば錬成可能
  var LAYER_MAT = {
    '浜辺': ['砂浜の瓶','流木の欠片'],
    '海':   ['珊瑚片','光魚の鱗'],
    '深海': ['深海の結晶','暗闇の欠片'],
  };
  var craftable = [];
  Object.keys(LAYER_MAT).forEach(function(layer) {
    var mats = LAYER_MAT[layer];
    var total = 0;
    mats.forEach(function(name) {
      var inv = G.inventory.find(function(i){ return i.name === name; });
      if (inv) total += (inv.qty || 1);
    });
    if (total >= 5) craftable.push(layer);
  });

  var container = document.getElementById('inv-grid').parentElement;
  var div = document.createElement('div');
  div.id = 'craft-area';
  div.style.cssText = 'margin-top:16px;padding-top:14px;border-top:1px solid #c8b89a';

  if (!craftable.length) {
    div.innerHTML = '<div style="font-size:11px;color:#9a8a7a;font-style:italic;text-align:center">素材が2個以上揃うと、ここで進化の石を錬成できます</div>';
  } else {
    div.innerHTML = '<div style="font-size:12px;color:#6b5e4e;letter-spacing:1px;margin-bottom:10px">⚗️ 進化の石を錬成する</div>'
      + craftable.map(function(layer) {
        return '<div style="background:#fff;border:1px solid #c8b89a;border-radius:10px;padding:11px 13px;margin-bottom:8px;display:flex;align-items:center;gap:10px;cursor:pointer" data-craft-layer="' + layer + '">'
          + '<span style="font-size:22px">💠</span>'
          + '<div style="flex:1"><div style="font-size:13px;color:#2c2416;font-weight:600">' + layer + 'の進化の石</div>'
          + '<div style="font-size:10px;color:#6b5e4e">素材×5 → 進化の石×1</div></div>'
          + '<div style="font-size:11px;color:#7b9e87">錬成する</div>'
          + '</div>';
      }).join('');
  }

  container.appendChild(div);

  div.querySelectorAll('[data-craft-layer]').forEach(function(el) {
    el.addEventListener('click', function() {
      craftEvoStone(this.getAttribute('data-craft-layer'));
    });
  });
}

function craftEvoStone(layer) {
  var LAYER_MAT = {
    '浜辺': ['砂浜の瓶','流木の欠片'],
    '海':   ['珊瑚片','光魚の鱗'],
    '深海': ['深海の結晶','暗闇の欠片'],
  };
  var mats = LAYER_MAT[layer];
  var consumed = 0;
  mats.forEach(function(name) {
    while (consumed < 5) {
      var inv = G.inventory.find(function(i){ return i.name === name; });
      if (!inv || inv.qty <= 0) break;
      inv.qty--; consumed++;
      if (inv.qty <= 0) G.inventory = G.inventory.filter(function(i){ return i.name !== name; });
    }
  });
  if (consumed < 5) { toast('素材が足りません'); return; }
  var stoneName = layer + 'の進化の石';
  var existing = G.inventory.find(function(i){ return i.name === stoneName; });
  if (existing) existing.qty++;
  else G.inventory.push({name:stoneName, type:'進化の石', icon:'💠', desc:layer+'の仲間2体を合成する', qty:1, layer:layer});
  toast(stoneName + 'を錬成した！');
  renderInventory();
}

// ── アイテム使用モーダル ──
var pendingItem = null;

function useItem(item) {
  if (!item) return;
  if (item.type === 'Blatt') { showScreen('register-screen'); toast('空のBlattを使った'); return; }
  if (item.type === '装備(仲間)') { openCompPicker(item, 'equip'); return; }
  if (item.type === 'スキル魂') { openCompPicker(item, 'skill'); return; }
  if (item.type === '進化の石') { openEvoStep1(item); return; }
  if (item.type === '素材') { toast(item.name + ' — ' + item.desc + '\n実験台で進化の石を錬成できます（素材×2）'); return; }
  if (item.type === '謎のアイテム') {
    if (G.laterneUnlocked) toast(item.name + ' — Laterneのお店で売れるかもしれない');
    else toast(item.name + ' — 価値がありそうだが、使い道がわからない');
    return;
  }
  if (item.type === '手紙') { useLetter(item); return; }
  if (item.type === '消耗品') {
    toast(item.name + ': ' + item.desc);
    return;
  }
  toast(item.name + ': ' + item.desc);
}

function openCompPicker(item, mode) {
  var avail = G.companions.filter(function(c){
    if (mode === 'equip') return (c.status === '正式加入' || c.status === '仮加入') && c.equip.length < 2;
if (mode === 'skill') return (c.status === '正式加入' || c.status === '仮加入') && !c.skill;
    if (mode === 'equip') return c.equip.length < 2;
    if (mode === 'skill') return !c.skill;
    return true;
  });
  if (!avail.length) {
    if (mode === 'equip') toast('装備できる仲間がいません（1体につき2つまで）');
    else toast('スキルを付与できる仲間がいません（スキルなし・正式加入のみ）');
    return;
  }
  pendingItem = {item: item, mode: mode};

  var modal = document.getElementById('comp-picker-modal');
  var list  = document.getElementById('comp-picker-list');
  document.getElementById('comp-picker-title').textContent =
    mode === 'equip' ? item.icon + ' ' + item.name + ' を誰に装備する？'
                     : item.icon + ' ' + item.name + ' を誰に使う？';

  list.innerHTML = avail.map(function(c, i) {
    var equipInfo = c.equip.map(function(e){ return e.icon; }).join('') || '—';
    var skillInfo = c.skill ? c.skill : '—';
    return '<div class="picker-row" data-name="' + c.word + '">'
      + avatarHTML(c, 36)
      + '<div style="flex:1">'
      + '<div style="font-size:14px;color:#2c2416;font-weight:600">' + c.word + '</div>'
      + '<div style="font-size:10px;color:#6b5e4e">装備: ' + equipInfo + '　スキル: ' + skillInfo + '</div>'
      + '</div>'
      + '<div style="font-size:11px;color:#7b9e87">⚔️' + c.stats.atk + ' 🛡️' + c.stats.def + '</div>'
      + '</div>';
  }).join('');

  list.querySelectorAll('.picker-row').forEach(function(row) {
    row.addEventListener('click', function() {
      var name = this.getAttribute('data-name');
      var c = G.companions.find(function(x){ return x.word === name; });
      if (!c || !pendingItem) return;
      if (pendingItem.mode === 'equip') doEquip(c, pendingItem.item);
      else doSkill(c, pendingItem.item);
      closeCompPicker();
    });
  });

  modal.style.display = 'flex';
}

function closeCompPicker() {
  document.getElementById('comp-picker-modal').style.display = 'none';
  pendingItem = null;
  var sb = document.getElementById('party-sort-bar');
  if (sb) sb.remove();
}

function doEquip(c, item) {
  c.equip.push(item);
  if (item.stat) {
    Object.keys(item.stat).forEach(function(k){ c.stats[k] = (c.stats[k] || 0) + item.stat[k]; });
  }
  consumeItem(item.name);
  toast(c.word + 'に' + item.icon + item.name + 'を装備した');
  renderInventory();
}

function doSkill(c, item) {
  c.skill = item.skill;
  consumeItem(item.name);
  var skillLabel = item.skill === 'heal' ? 'ヒール' : 'Sog';
  toast(c.word + 'はスキル「' + skillLabel + '」を習得した！');
  renderInventory();
  renderCompanions();
}

function consumeItem(name) {
  var found = G.inventory.find(function(i){ return i.name === name; });
  if (found) { found.qty--; if (found.qty <= 0) G.inventory = G.inventory.filter(function(i){ return i.name !== name; }); }
}


// ── 進化システム ──
var evoState = { stone: null, base: null, partner: null };

function closeEvo() {
  document.getElementById('evo-modal').style.display = 'none';
  evoState = { stone: null, base: null, partner: null };
}

// Step1: 進化の石を使う → ベースとなる仲間を選ぶ
function openEvoStep1(stone) {
  var avail = G.companions.filter(function(c){
    return c.status === '正式加入' && c.layer === stone.layer;
  });
  if (avail.length < 2) {
    toast(stone.layer + 'の正式加入仲間が2体必要です（現在' + avail.length + '体）');
    return;
  }
  evoState.stone = stone;
  document.getElementById('evo-title').textContent = '💠 進化 — 素材①を選ぶ';
  document.getElementById('evo-sub').textContent = stone.layer + 'の仲間を2体合成します。まず1体目を選んでください。';
  renderEvoCompList(avail, function(c) {
    evoState.base = c;
    openEvoStep2();
  });
  document.getElementById('evo-modal').style.display = 'flex';
}

// Step2: パートナーを選ぶ
function openEvoStep2() {
  var avail = G.companions.filter(function(c){
    return c.status === '正式加入' && c.layer === evoState.stone.layer && c !== evoState.base;
  });
  document.getElementById('evo-title').textContent = '💠 進化 — 素材②を選ぶ';
  document.getElementById('evo-sub').textContent = '「' + evoState.base.word + '」と合成する相手を選んでください。';
  renderEvoCompList(avail, function(c) {
    evoState.partner = c;
    openEvoStep3();
  });
}

// Step3: 新しい名前を選ぶ
function openEvoStep3() {
  var b = evoState.base, p = evoState.partner;
  document.getElementById('evo-title').textContent = '💠 進化 — 名前を選ぶ';
  document.getElementById('evo-sub').textContent = '生まれる新しい仲間の名前を選んでください。';

  // ステータス計算（両者の平均 + ボーナス）
  var newAtk = Math.floor((b.stats.atk + p.stats.atk) / 2) + 3;
  var newDef = Math.floor((b.stats.def + p.stats.def) / 2) + 3;
  var newSpd = Math.floor((b.stats.spd + p.stats.spd) / 2) + 2;
  var newLck = Math.floor((b.stats.lck + p.stats.lck) / 2) + 2;
  var newMaxHP = Math.floor((b.maxHP + p.maxHP) / 2) + 10;

  // スキル引き継ぎ（50%）
  var skills = [b.skill, p.skill].filter(Boolean);
  var inheritedSkill = null;
  if (skills.length > 0 && Math.random() < 0.5) {
    inheritedSkill = skills[Math.floor(Math.random() * skills.length)];
  }

  var skillLabel = inheritedSkill ? (inheritedSkill === 'heal' ? '💚ヒール' : '🌊Sog') : 'なし';
  var preview = '<div style="background:#e8e0d0;border-radius:10px;padding:12px;margin-bottom:14px;font-size:12px;color:#6b5e4e;line-height:1.8">'
    + '<div style="font-size:11px;color:#9a8a7a;margin-bottom:4px">新しい仲間のステータス</div>'
    + '⚔️' + newAtk + '　🛡️' + newDef + '　💨' + newSpd + '　🍀' + newLck + '<br>'
    + 'HP: ' + newMaxHP + '　Lv.1スタート　スキル: ' + skillLabel + '<br>'
    + '<span style="font-size:10px;color:#9a8a7a">育てることでより強くなります</span>'
    + '</div>';

  var nameOpts = '<div style="display:flex;flex-direction:column;gap:8px">'
    + [b.word, p.word].map(function(word) {
      return '<div class="picker-row evo-name-opt" data-word="' + word + '" style="justify-content:space-between">'
        + '<div><div style="font-size:16px;color:#2c2416;font-weight:600;letter-spacing:1px">' + word + '</div>'
        + '<div style="font-size:10px;color:#6b5e4e">この名前を選ぶ</div></div>'
        + '<div style="font-size:20px">' + LEMOJI[evoState.stone.layer] + '</div>'
        + '</div>';
    }).join('')
    + '</div>';

  document.getElementById('evo-body').innerHTML = preview + nameOpts;

  // ストアしておく
  evoState.pending = { atk: newAtk, def: newDef, spd: newSpd, lck: newLck, maxHP: newMaxHP, skill: inheritedSkill };

  document.querySelectorAll('.evo-name-opt').forEach(function(el) {
    el.addEventListener('click', function() {
      var chosenWord = this.getAttribute('data-word');
      openEvoStep4(chosenWord);
    });
  });
}

// Step4: 確認
function openEvoStep4(chosenWord) {
  var b = evoState.base, p = evoState.partner;
  var otherWord = chosenWord === b.word ? p.word : b.word;
  document.getElementById('evo-title').textContent = '💠 進化 — 確認';
  document.getElementById('evo-sub').textContent = 'この合成は取り消せません。';

  var skillLabel = evoState.pending.skill ? (evoState.pending.skill === 'heal' ? '💚ヒール' : '🌊Sog') : 'なし';

  document.getElementById('evo-body').innerHTML =
    '<div style="background:#e8e0d0;border-radius:10px;padding:14px;margin-bottom:16px;line-height:2;font-size:13px;color:#2c2416">'
    + '<img src="' + spriteURL(b.word, b.article, b.layer, b.level) + '" style="width:20px;height:20px;image-rendering:pixelated;vertical-align:-3px" alt=""> ' + b.word
    + '　＋　'
    + '<img src="' + spriteURL(p.word, p.article, p.layer, p.level) + '" style="width:20px;height:20px;image-rendering:pixelated;vertical-align:-3px" alt=""> ' + p.word
    + '<br>→　<strong>' + chosenWord + '</strong>（Lv.1）として誕生<br>'
    + '<span style="font-size:11px;color:#6b5e4e">かつて「' + otherWord + '」と呼ばれた存在を宿している</span><br>'
    + '<span style="font-size:11px;color:#6b5e4e">スキル: ' + skillLabel + '</span>'
    + '</div>'
    + '<button id="btn-evo-confirm" style="width:100%;background:#2c2416;color:#f5f0e8;border:none;border-radius:20px;padding:14px;font-size:15px;cursor:pointer;font-family:Georgia,serif">合成する</button>'
    + '<button onclick="closeEvo()" style="width:100%;background:none;border:1px solid #c8b89a;border-radius:20px;padding:12px;font-size:14px;cursor:pointer;font-family:Georgia,serif;color:#6b5e4e;margin-top:8px">キャンセル</button>';

  document.getElementById('btn-evo-confirm').addEventListener('click', function() {
    doEvolve(chosenWord, otherWord);
  });
}

// 実際の合成処理
function doEvolve(chosenWord, otherWord) {
  var b = evoState.base, p = evoState.partner, st = evoState.pending, stone = evoState.stone;
  var layer = stone.layer;

  // 進化の石消費
  consumeItem(stone.name);

  // 素材仲間を削除
  G.companions = G.companions.filter(function(c){ return c !== b && c !== p; });

  // 新仲間作成
  var newComp = {
    word: chosenWord,
    meaning: b.word === chosenWord ? b.meaning : p.meaning,
    article: (b.word === chosenWord ? b.article : p.article) || '',
    layer: layer,
    status: '正式加入',
    stats: { atk: st.atk, def: st.def, spd: st.spd, lck: st.lck },
    hp: st.maxHP, maxHP: st.maxHP,
    xp: 0, level: 1, equip: [],
    skill: st.skill,
    ancestry: ['かつて「' + otherWord + '」と呼ばれた存在を宿している'],
  };
  G.companions.push(newComp);

  // ログ
  G.logs.unshift({
    time: now(),
    text: '「' + b.word + '」と「' + p.word + '」が合わさり、「' + chosenWord + '」が誕生した。'
  });

  closeEvo();
  toast('「' + chosenWord + '」が誕生した！');
  saveGame();
  updateCounts();
  renderCompanions();
  renderInventory();
  showScreen('companions-screen');
}

function renderEvoCompList(list, onSelect) {
  var body = document.getElementById('evo-body');
  body.innerHTML = list.map(function(c) {
    var skillLabel = c.skill ? (c.skill === 'heal' ? '💚ヒール' : '🌊Sog') : 'なし';
    var equipLabel = c.equip.length ? c.equip.map(function(e){ return e.icon; }).join('') : '—';
    return '<div class="picker-row evo-comp-opt" style="margin-bottom:8px">'
      + avatarHTML(c, 40)
      + '<div style="flex:1">'
      + '<div style="font-size:14px;color:#2c2416;font-weight:600">' + c.word + ' <span style="font-size:10px;color:#9a8a7a;font-weight:400">Lv.' + c.level + '</span></div>'
      + '<div style="font-size:10px;color:#6b5e4e">' + c.meaning + '　装備:' + equipLabel + '　スキル:' + skillLabel + '</div>'
      + '</div>'
      + '<div style="font-size:11px;color:#7b9e87;flex-shrink:0">⚔️' + c.stats.atk + '<br>🛡️' + c.stats.def + '</div>'
      + '</div>';
  }).join('');

  body.querySelectorAll('.evo-comp-opt').forEach(function(el, i) {
    el.addEventListener('click', (function(comp){ return function(){ onSelect(comp); }; })(list[i]));
  });
}

// ── LOGS ──
function renderLogs() {
  // 未読メッセージを既読にする
  G.logs.forEach(function(l){ if (l.isLetter) l.read = true; });
  updateCounts(); // バッジを更新
  var el = document.getElementById('log-list');
  var hasBattleLog = G.lastBattleLog && G.lastBattleLog.length > 0;
  var hasLogs = G.logs && G.logs.length > 0;
  if (!hasBattleLog && !hasLogs) {
    el.innerHTML = '<p class="empty-msg">まだ記録がありません。</p>';
    return;
  }
  var html = '';
  if (hasBattleLog) {
    html += '<div style="font-size:11px;color:#6b5e4e;letter-spacing:1px;margin-bottom:8px">最新の探索記録</div>';
    html += '<div style="background:#1a2a3e;border-radius:10px;padding:12px;margin-bottom:16px;display:flex;flex-direction:column;gap:5px">';
    html += G.lastBattleLog.map(function(e) {
      var col = e.type==='battle' ? '#f0b8a0'
              : e.type==='danger' ? '#f08080'
              : e.type==='item'   ? '#a0e0a8'
              : e.type==='success'? '#80e0a0' : '#a8c4e0';
      return '<div style="font-size:12px;font-style:italic;color:' + col + ';line-height:1.6">' + e.text + '</div>';
    }).join('');
    html += '</div>';
  }
  if (hasLogs) {
    if (hasBattleLog) html += '<div style="font-size:11px;color:#6b5e4e;letter-spacing:1px;margin-bottom:8px">帰宅記録</div>';
    html += G.logs.map(function(l) {
      var cardStyle = l.isLetter ? 'background:#f5f0e8;border-color:#c8a84b;' : '';
    return '<div class="log-card" style="' + cardStyle + '"><div class="log-time">' + l.time + (l.isLetter ? ' ✉️' : '') + '</div><div class="log-text">' + l.text + '</div></div>';
    }).join('');
  }
  el.innerHTML = html;
}

// ── 名前入力 ──
function initNameEntry() {
  document.getElementById('btn-name-submit').addEventListener('click', function() {
    var name = document.getElementById('name-input').value.trim();
    if (!name) { toast('名前を入力してください'); return; }
    G.playerName = name;
    updatePlayerName();
    saveGame();
    showScreen('world-screen');
  });
  document.getElementById('name-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') document.getElementById('btn-name-submit').click();
  });
}

function updatePlayerName() {
  var n = G.playerName || '?';
  var sl = document.getElementById('sofa-label');
  if (sl) sl.textContent = n + 'のソファ';
  var st = document.getElementById('sofa-title');
  if (st) st.textContent = n + 'のソファ　Lv.' + (G.playerLevel || 1);
}

// ── 本棚（語彙リスト）──
function renderBookshelf() {
  var el = document.getElementById('bookshelf-list');
  if (!el) return;
  if (!G.words.length) {
    el.innerHTML = '<p class="empty-msg">まだ言葉がありません。<br>浜辺の瓶を拾ってみよう。</p>';
    return;
  }
  // 層ごとにグループ化
  var layers = ['空中都市','湖','庭','浜辺','海','深海'];
  var html = '';
  layers.forEach(function(layer) {
    var words = G.words.filter(function(w){ return w.layer === layer; });
    if (!words.length) return;
    html += '<div style="font-size:11px;letter-spacing:1px;color:#6b5e4e;margin:10px 0 6px;padding-left:2px">'
      + LEMOJI[layer] + ' ' + layer + '</div>';
    words.forEach(function(w) {
      var articleSpan = w.article
        ? '<span style="font-size:11px;color:#9a8a7a;font-style:italic;margin-right:4px">' + w.article + '</span>'
        : '';
      html += '<div style="background:#fff;border:1px solid #c8b89a;border-radius:8px;padding:9px 12px;display:flex;align-items:center;justify-content:space-between">'
        + '<div>' + articleSpan + '<span style="font-size:14px;color:#2c2416;font-weight:600">' + w.word + '</span></div>'
        + '<span style="font-size:12px;color:#6b5e4e">' + w.meaning + '</span>'
        + '</div>';
    });
  });
  el.innerHTML = html;
}

// ── 手紙 ──
function useLetter(item) {
  var provs = G.words.filter(function(w){
    return w.status !== '定着済み' && G.companions.find(function(c){ return c.word === w.word && c.status === '仮加入'; });
  });
  if (!provs.length) { toast('今は手紙を送る仮加入の仲間がいない'); return; }

  var modal = document.getElementById('comp-picker-modal');
  var list  = document.getElementById('comp-picker-list');
  document.getElementById('comp-picker-title').textContent = '✉️ 誰に手紙を送る？';

  list.innerHTML = provs.map(function(w) {
    var c = G.companions.find(function(x){ return x.word === w.word; });
    return '<div class="picker-row" data-letter-word="' + w.word + '">'
      + avatarHTML(w, 36, 'prov')
      + '<div style="flex:1"><div style="font-size:14px;color:#2c2416;font-weight:600">' + w.word + '</div>'
      + '<div style="font-size:10px;color:#6b5e4e">' + w.meaning + ' — 仮加入 (' + w.correctCount + '/3)</div></div>'
      + '</div>';
  }).join('');

  list.querySelectorAll('[data-letter-word]').forEach(function(row) {
    row.addEventListener('click', function() {
      var word = this.getAttribute('data-letter-word');
      var w = G.words.find(function(x){ return x.word === word; });
      if (!w) return;
      // quizDoneTodayのフラグを外してクイズキューに追加（逆クイズとしてマーク）
      G.quizDoneToday[w.word] = false;
      w.isReverse = true; // 逆クイズフラグ
      G.quizQ.unshift(w); // 次の問題として先頭に追加
      consumeItem('手紙');
      closeCompPicker();
      toast(w.word + 'への手紙を送った。展望台に向かおう。');
      saveGame();
    });
  });
  modal.style.display = 'flex';
}

// ── データ管理 ──
function initDataManagement() {
  var backupBtn = document.getElementById('btn-backup');
  var resetBtn  = document.getElementById('btn-reset');
  var confirmDiv = document.getElementById('reset-confirm');
  var resetYes  = document.getElementById('btn-reset-yes');
  var resetNo   = document.getElementById('btn-reset-no');
  if (!backupBtn) return;

  backupBtn.addEventListener('click', function() {
    var data = localStorage.getItem('traumkuste_save');
    if (!data) { toast('セーブデータがありません'); return; }
    var playerName = G.playerName || 'プレイヤー';
    var wordCount = G.words.length;
    var compCount = G.companions.length;
    var subject = encodeURIComponent('Traumküste バックアップ — ' + playerName);
    var body = encodeURIComponent(
      'Traumküste セーブデータ\n' +
      '======================\n' +
      'プレイヤー名: ' + playerName + '\n' +
      '登録語数: ' + wordCount + '\n' +
      '仲間数: ' + compCount + '\n' +
      'Taler: ' + G.taler + '\n\n' +
      '--- セーブデータ（以下を保管） ---\n' +
      data
    );
    window.location.href = 'mailto:?subject=' + subject + '&body=' + body;
  });

  resetBtn.addEventListener('click', function() {
    confirmDiv.style.display = 'block';
  });
  resetNo.addEventListener('click', function() {
    confirmDiv.style.display = 'none';
  });
  resetYes.addEventListener('click', function() {
    localStorage.removeItem('traumkuste_save');
    toast('データをリセットしました');
    setTimeout(function(){ location.reload(); }, 1200);
  });
}

// ── ソファ ──
function renderSofa() {
  updatePlayerName();
  var wordsEl = document.getElementById('sofa-words');
  var logsEl = document.getElementById('sofa-logs');
  if (!wordsEl || !logsEl) return;

  // 覚えた言葉
  var settled = G.words.filter(function(w){ return w.status === '定着済み'; });
  if (!settled.length) {
    wordsEl.innerHTML = '<div style="font-size:12px;color:#9a8a7a;font-style:italic">まだ定着した言葉がありません</div>';
  } else {
    wordsEl.innerHTML = settled.map(function(w) {
      return '<div style="background:#fff;border:1px solid #c8b89a;border-radius:8px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center">'
        + '<span style="font-size:13px;color:#2c2416;font-weight:600">' + w.word + '</span>'
        + '<span style="font-size:11px;color:#6b5e4e">' + w.meaning + ' — ' + w.layer + '</span>'
        + '</div>';
    }).join('');
  }

  // 最近のログ（名前入り）
  var recentLogs = G.logs.slice(0, 5);
  if (!recentLogs.length) {
    logsEl.innerHTML = '<div style="font-size:12px;color:#9a8a7a;font-style:italic">まだ記録がありません</div>';
  } else {
    logsEl.innerHTML = recentLogs.map(function(l) {
      return '<div style="background:#fff;border:1px solid #c8b89a;border-radius:8px;padding:8px 12px">'
        + '<div style="font-size:10px;color:#9a8a7a;margin-bottom:3px">' + l.time + '</div>'
        + '<div style="font-size:12px;color:#2c2416;font-style:italic">' + l.text + '</div>'
        + '</div>';
    }).join('');
  }
}

// ── Laterneのお店 ──
var MYSTERY_ITEMS = ['光る貝殻', '古い羅針盤', '星図'];
var MYSTERY_PRICES = { '光る貝殻': 8, '古い羅針盤': 12, '星図': 15 };

function renderLaterneShop() {
  var sellEl = document.getElementById('laterne-sell');
  var talerEl = document.getElementById('laterne-taler');
  if (talerEl) talerEl.textContent = G.taler;

  var sellable = G.inventory.filter(function(i){ return MYSTERY_ITEMS.indexOf(i.name) >= 0; });
  if (!sellEl) return;
  if (!sellable.length) {
    sellEl.innerHTML = '<div style="font-size:12px;color:#5a8ab0;font-style:italic">売れるアイテムがない</div>';
  } else {
    sellEl.innerHTML = sellable.map(function(item) {
      var price = MYSTERY_PRICES[item.name] || 5;
      return '<div class="dcard" style="display:flex;align-items:center;gap:10px;cursor:pointer" data-sell="' + item.name + '">'
        + '<span style="font-size:20px">' + item.icon + '</span>'
        + '<div style="flex:1"><div class="dcard-name">' + item.name + '</div>'
        + '<div class="dcard-desc">×' + (item.qty||1) + '</div></div>'
        + '<div style="font-size:12px;color:#c8a84b;flex-shrink:0">+' + price + 'T</div>'
        + '</div>';
    }).join('');
    sellEl.querySelectorAll('[data-sell]').forEach(function(el) {
      el.addEventListener('click', function() {
        var name = this.getAttribute('data-sell');
        var item = G.inventory.find(function(i){ return i.name === name; });
        var price = MYSTERY_PRICES[name] || 5;
        if (!item) return;
        item.qty = (item.qty||1) - 1;
        if (item.qty <= 0) G.inventory = G.inventory.filter(function(i){ return i.name !== name; });
        G.taler += price;
        updateCounts();
        toast(name + 'を' + price + 'Talerで売った');
        renderLaterneShop();
      });
    });
  }
}

function buyItem(name, price, type, props) {
  if (G.taler < price) { toast('Talerが足りない'); return; }
  G.taler -= price;
  var existing = G.inventory.find(function(i){ return i.name === name; });
  if (existing) existing.qty = (existing.qty||1) + 1;
  else {
    var item = Object.assign({ name: name, qty: 1 }, props);
    G.inventory.push(item);
  }
  updateCounts();
  toast(name + 'を購入した（残り' + G.taler + 'T）');
  renderLaterneShop();
}

// ── ダンジョンクリア判定 ──
// ── プレイヤーレベル ──
var PLAYER_LEVEL_MESSAGES = {
  2:  { layer: null,    text: 'ダンジョンで手紙がみつからないかな' },
  3:  { layer: null,    text: '最近、新しい言葉を覚えた？' },
  4:  { layer: '浜辺', text: '波の音が聞こえる夜は、なんだか遠くへ行きたくなる' },
  5:  { layer: '庭',   text: '今日の天気はどうだった？' },
  6:  { layer: null,    text: 'スキルの魂が見つかるといいのにな' },
  7:  { layer: '深海', text: '深いところには、まだ名前のないものがいる' },
  8:  { layer: '湖',   text: '静かな日が続いている。君はどうだろう' },
  9:  { layer: null,    text: 'もうすぐ、新しい扉が開くかもしれない' },
  10: { layer: null,    text: 'ふぁーあ。あくびだよ' },
};

function checkPlayerLevel() {
  if (!G.companions.length) return;
  // 仲間の最高レベルを取得
  var maxLevel = G.companions.reduce(function(mx, c){ return Math.max(mx, c.level || 1); }, 1);
  if (maxLevel <= G.playerLevel) return;

  // レベルアップ
  var oldLevel = G.playerLevel;
  G.playerLevel = maxLevel;

  // 各レベルのメッセージを順番に処理
  for (var lv = oldLevel + 1; lv <= maxLevel; lv++) {
    var msg = PLAYER_LEVEL_MESSAGES[lv];
    if (!msg) continue;

    // 送り主を選ぶ
    var sender = null;
    if (msg.layer) {
      var layerComps = G.companions.filter(function(c){ return c.layer === msg.layer; });
      sender = layerComps.length ? rand(layerComps) : rand(G.companions);
    } else {
      sender = rand(G.companions);
    }

    // ログに追加
    var logText = sender.word + 'が呟いた。「' + msg.text + '」';
    G.logs.unshift({ time: now(), text: logText, isLetter: true, read: false });
    setTimeout(function(t){ toast(t); }(logText.slice(0, 30) + '...'), lv * 500);
  }
  saveGame();
}

function checkDungeonClear(dungName) {
  if (G.clearedDungeons.indexOf(dungName) < 0) {
    G.clearedDungeons.push(dungName);
    // ダンジョンクリアごとに瓶上限+3
    G.bottleLimit = (G.bottleLimit || 3) + 3;
    toast('新しい瓶が流れ着くようになった。（上限+3）');
    if (dungName === '霧の入り江') {
      var survived = dungState.party.filter(function(c){ return c.hp > 0; });
      var hero = survived.length ? survived[0].word : dungState.party[0].word;
      G.logs.unshift({ time: now(), text: 'はじめての冒険を終えて、' + hero + 'は嬉しそうだ。浜辺の方から瓶の鳴る音が聞こえた。' });
    }
    if (dungName === '深海神殿') {
      G.laterneUnlocked = true;
      var row = document.getElementById('laterne-row');
      if (row) row.style.display = 'block';
      G.logs.unshift({ time: now(), text: 'Laterneのお店を見つけた。チョウチンアンコウのLaterneは、にやりとした。' });
      setTimeout(function(){
        toast('深海の底に、小さな灯りが見えた。');
      }, 1000);
      saveGame();
    }
  }
}

// ── 謎アイテムのuseItem処理 ──
// useItemに謎アイテムの処理を追加（既存のuseItemを拡張）

// ── SAVE / LOAD ──
var SAVE_KEY = 'traumkuste_save';

function saveGame() {
  try {
    var data = {
      words: G.words,
      companions: G.companions,
      logs: G.logs,
      inventory: G.inventory,
      playerName: G.playerName,
      taler: G.taler,
      laterneUnlocked: G.laterneUnlocked,
      clearedDungeons: G.clearedDungeons,
      lastBattleLog: G.lastBattleLog,
      bottleLimit: G.bottleLimit,
      quizDoneToday: G.quizDoneToday,
      quizDoneDate: G.quizDoneDate,
      bottleRecent: G.bottleRecent || [],
      // ダンジョン探索中状態
      activeDungeon: dungState.active ? {
        dungId: dungState.dung ? dungState.dung.id : null,
        partyWords: dungState.party.map(function(c){ return c.word; }),
        startedAt: dungState.startedAt,
        duration: dungState.duration,
        failed: dungState.failed,
        battleLog: dungState.battleLog || [],
      } : null,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch(e) { console.warn('save failed', e); }
}

function loadGame() {
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    var data = JSON.parse(raw);
    G.words = data.words || [];
    G.companions = data.companions || [];
    G.logs = data.logs || [];
    G.inventory = data.inventory || [];
    G.playerName = data.playerName || '';
    G.taler = data.taler || 0;
    G.laterneUnlocked = data.laterneUnlocked || false;
    G.clearedDungeons = data.clearedDungeons || [];
    G.lastBattleLog = data.lastBattleLog || [];
    G.bottleLimit = data.bottleLimit !== undefined ? data.bottleLimit : 6;
    G.quizDoneToday = data.quizDoneToday || {};
    G.quizDoneDate = data.quizDoneDate || '';
    G.bottleRecent = data.bottleRecent || [];
    // G.companions内のequipは参照のみ（IDなし）なのでそのまま使える
    // G.partyはリロード時はクリア（再編成してもらう）
    G.party = [];
    // ダンジョン再開（実時間計算）
    if (data.activeDungeon) {
      var ad = data.activeDungeon;
      var dung = DUNGEONS.find(function(d){ return d.id === ad.dungId; });
      if (dung) {
        var elapsed = Math.floor((Date.now() - ad.startedAt) / 1000);
        if (elapsed < ad.duration) {
          // まだ探索中 → resumeDungeon
          var party = ad.partyWords.map(function(w){
            return G.companions.find(function(c){ return c.word === w; });
          }).filter(Boolean);
          if (party.length) resumeDungeon(party, dung, ad.startedAt, ad.battleLog || []);
        } else {
          // 時間が過ぎていた → 自動成功扱い
          autoFinishDungeon(ad, dung);
        }
      }
    }
    return true;
  } catch(e) { console.warn('load failed', e); return false; }
}

// ダンジョン再開（バックグラウンド経過分を反映）
function resumeDungeon(party, dung, startedAt, prevLog) {
  dungState.party = party;
  dungState.dung = dung;
  dungState.startedAt = startedAt;
  dungState.duration = dung.dur;
  dungState.failed = false;
  dungState.inBattle = false;
  dungState.pendingFinish = false;
  dungState.herbUsed = false;
  dungState.dropBoost = false;
  dungState.active = true;
  dungState.battleLog = prevLog;
  if (typeof dungFx !== 'undefined') dungFx.start(dung.layer);
  party.forEach(function(c){ c.hp = c.maxHP; });

  // 経過秒を計算してelapseを設定
  var nowSec = Math.floor((Date.now() - startedAt) / 1000);
  dungState.elapsed = nowSec;

  // イベントを再生成（済みのものはスキップ）
  dungState.events = buildEvents(dung, party);
  dungState.events.forEach(function(ev){ if (ev.time <= nowSec) ev.done = true; });

  document.getElementById('ll-title').textContent = dung.name + ' を探索中（再開）';
  document.getElementById('ll-scroll').innerHTML = prevLog.map(function(e){
    var d = document.createElement('div');
    d.className = 'll-entry ll-' + e.type;
    d.textContent = e.text;
    return d.outerHTML;
  }).join('');
  renderLiveHP();

  showScreen('livelog-screen');
  if (dungState.interval) clearInterval(dungState.interval);
  dungState.interval = setInterval(tickDungeon, 1000);
}

// 離脱中に時間が過ぎたダンジョンを自動処理
function autoFinishDungeon(ad, dung) {
  var party = ad.partyWords.map(function(w){
    return G.companions.find(function(c){ return c.word === w; });
  }).filter(Boolean);
  if (!party.length) return;
  var names = party.map(function(c){ return c.word; }).join('・');
  // 簡易XP付与（戦闘したとみなす）
  party.forEach(function(c){
    var xp = 30 + Math.floor(Math.random() * 20);
    c.xp = (c.xp || 0) + xp;
    if (c.xp >= c.level * 100) { c.level++; c.stats.atk += 2; c.stats.def += 2; }
    c.hp = c.maxHP;
    c.inDungeon = false;
  });
  G.logs.unshift({ time: now(), text: names + 'が' + dung.name + 'から帰還した。（留守中に完了）' });
  checkDungeonClear(dung.name);
  checkPlayerLevel();
  saveGame();
  toast(names + 'が帰ってきた！（ログを確認しよう）');
}

// ── EVENT BINDINGS ──
function bindAll() {
  // nav buttons (all duplicated navs)
  document.querySelectorAll('.nbtn[data-screen]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      showScreen(this.getAttribute('data-screen'));
    });
  });

  // world
  document.getElementById('btn-bottle').addEventListener('click', openBottle);
  document.getElementById('btn-write').addEventListener('click', function(){
  var hasBlatt = G.inventory.find(function(i){ return i.name === '空のBlatt'; });
  if (!hasBlatt) { toast('空のBlattがない。ダンジョンで見つけよう。'); return; }
  showScreen('register-screen');
});

  // layer rows

  ['空中都市','湖','庭','浜辺','海','深海'].forEach(function(l) {
    var el = document.getElementById('layer-' + l);
    if (el) el.addEventListener('click', function() {
      var ws = G.words.filter(function(w){ return w.layer === l; });
      if (!ws.length) { toast(l + 'にはまだ言葉がない'); return; }
      toast(l + ': ' + ws.slice(0,3).map(function(w){ return w.word; }).join('・') + (ws.length > 3 ? '...' : ''));
    });
  });

  // home
  document.getElementById('btn-goto-sofa').addEventListener('click', function(){ renderSofa(); showScreen('sofa-screen'); });
  document.getElementById('btn-goto-quiz').addEventListener('click', function(){ initQuiz(); showScreen('quiz-screen'); });
  document.getElementById('btn-goto-bookshelf').addEventListener('click', function(){ renderBookshelf(); showScreen('bookshelf-screen'); });
  document.getElementById('btn-goto-inventory').addEventListener('click', function(){ showScreen('inventory-screen'); });
  document.getElementById('btn-goto-door').addEventListener('click', function(){
  if (!G.companions.find(function(c){ return c.status === '正式加入' || c.status === '仮加入'; })) {
    toast('まだ仲間がいません。展望台でクイズに答えよう'); return;
  }
  showScreen('dungeon-screen');
});

  // quiz
  document.getElementById('btn-quiz-back').addEventListener('click', function(){ showScreen('home-screen'); });
  document.getElementById('btn-next-quiz').addEventListener('click', function(){ loadNextQuiz(); });

  // register
  document.getElementById('btn-reg-back').addEventListener('click', function(){ showScreen('world-screen'); });
  document.querySelectorAll('.lopt').forEach(function(el) {
    el.addEventListener('click', function() {
      G.selLayer = this.getAttribute('data-layer');
      document.querySelectorAll('.lopt').forEach(function(o){ o.classList.remove('sel'); });
      this.classList.add('sel');
    });
  });
  document.getElementById('btn-reg-submit').addEventListener('click', registerWord);

  // dungeon
  document.getElementById('btn-dung-back').addEventListener('click', function(){ showScreen('home-screen'); });
  document.getElementById('btn-laterne-back').addEventListener('click', function(){ showScreen('world-screen'); });
  document.getElementById('btn-buy-herb').addEventListener('click', function(){
    buyItem('塩漬けの薬草', 15, '消耗品', {type:'消耗品', icon:'🌿', desc:'HP半分以下で自動30回復（消耗品）'});
  });
  document.getElementById('btn-buy-light').addEventListener('click', function(){
    buyItem('深海の灯り', 20, '消耗品', {type:'消耗品', icon:'🔦', desc:'次のダンジョンでアイテムドロップ率UP'});
  });
  document.getElementById('btn-send').addEventListener('click', sendParty);
}

// ── data.json読み込み ──
// 層カラーをCSSに動的注入（data.jsonの値が唯一の真実）
function injectLayerCSS() {
  var existing = document.getElementById('layer-css-dynamic');
  if (existing) existing.remove();
  var layerMap = {
    '空中都市': 'l-sky',
    '湖':       'l-lake',
    '庭':       'l-garden',
    '浜辺':     'l-shore',
    '海':       'l-sea',
    '深海':     'l-deep',
  };
  var css = '';
  Object.keys(layerMap).forEach(function(layer) {
    var cls = layerMap[layer];
    var bg  = LCOLOR[layer] || '#ccc';
    var tc  = LTEXT[layer]  || '#000';
    css += '.' + cls + '{background:' + bg + '!important;color:' + tc + '!important}';
  });
  var style = document.createElement('style');
  style.id = 'layer-css-dynamic';
  style.textContent = css;
  document.head.appendChild(style);
}

function loadData(callback) {
  fetch('data.json?v=' + Date.now())
    .then(function(r){ return r.json(); })
    .then(function(d) {
      LCOLOR   = d.layers.color;
      LTEXT    = d.layers.text;
      LEMOJI   = d.layers.emoji;
      LSTATS   = d.layers.stats;
      BOTTLE_WORDS = d.bottleWords;
      DUMMIES  = d.dummies;
      DUNGEONS = d.dungeons;
      ENEMIES  = d.enemies;
      DROPS    = d.drops;
      if (d.equipGen) EQUIPGEN = d.equipGen;
      injectLayerCSS();
      callback();
    })
    .catch(function(e) {
      console.error('data.json読み込み失敗:', e);
      // フォールバック：最低限のデータをインラインで設定
      LCOLOR={'空中都市':'#E5D0E3','湖':'#CEC7E2','庭':'#B1EBB2','浜辺':'#FAD1C7','海':'#508CA4','深海':'#2d4a6e'};
      LTEXT={'空中都市':'#3a1f3a','湖':'#ffffff','庭':'#2a3a1e','浜辺':'#5c3e00','海':'#ffffff','深海':'#b8d4f0'};
      LEMOJI={'空中都市':'🏰','湖':'🌊','庭':'🌿','浜辺':'🐚','海':'🐟','深海':'🦑'};
      LSTATS={'空中都市':{atk:8,def:6,spd:14,lck:12},'湖':{atk:6,def:12,spd:8,lck:14},'庭':{atk:10,def:10,spd:10,lck:10},'浜辺':{atk:8,def:8,spd:10,lck:14},'海':{atk:14,def:6,spd:12,lck:8},'深海':{atk:14,def:12,spd:6,lck:8}};
      BOTTLE_WORDS=[{word:'Traum',meaning:'夢',layer:'空中都市'},{word:'Schweigen',meaning:'沈黙',layer:'深海'},{word:'Welle',meaning:'波',layer:'浜辺'}];
      DUMMIES=['空','水','光','影','石','花','夢','波','霧','音'];
      DUNGEONS=[{id:1,name:'霧の入り江',layer:'浜辺',dur:20,encounters:2,desc:'霧の中に古い難破船が見える'}];
      ENEMIES={'浜辺':['砂浜の亡霊','潮の番人'],'海':['珊瑚の守護者'],'深海':['深淵の番人']};
      DROPS={'浜辺':[{name:'空のBlatt',type:'Blatt',icon:'📄',desc:'言葉を登録できる',w:20}],'海':[],'深海':[]};
      injectLayerCSS();
      callback();
    });
}

bindAll();
initNameEntry();
loadData(function() {
  G.bottleQ = BOTTLE_WORDS.slice().sort(function(){ return Math.random()-.5; });

// セーブデータを読み込む
var hasSave = loadGame();
updateCounts();
updatePlayerName();

// Laterne解放済みなら表示
if (G.laterneUnlocked) {
  var lr = document.getElementById('laterne-row');
  if (lr) lr.style.display = 'block';
}

// セーブデータがあれば名前入力をスキップ
if (hasSave && G.playerName) {
  showScreen('world-screen');
} else {
  document.getElementById('nameentry-screen').classList.add('active');
}
updateCounts();
  // ログタブ全てにバッジspanを動的に挿入
  document.querySelectorAll('.nbtn[data-screen="log-screen"]').forEach(function(btn) {
    var span = btn.querySelector('span');
    if (span && !btn.querySelector('#log-badge')) {
      var badge = document.createElement('span');
      badge.id = 'log-badge';
      badge.style.cssText = 'display:none;background:#c8a84b;color:#fff;font-size:10px;padding:1px 6px;border-radius:10px;margin-left:3px;vertical-align:middle';
      span.appendChild(badge);
    }
  });
}); // loadData終わり

// ──────────────────────────────────────────────
//  浜辺アニメーション（波＋きらめき）
// ──────────────────────────────────────────────
(function() {
  function initShore() {
    var cv = document.getElementById('shore-cv');
    if (!cv) return;
    var W, H, ctx;
    function resize() {
      W = cv.offsetWidth || 360; H = cv.offsetHeight || 56;
      cv.width = W; cv.height = H;
    }
    resize();
    var sparks = [];
    for (var i = 0; i < 14; i++) {
      sparks.push({ x: Math.random(), y: 0.2 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2, speed: 0.008 + Math.random() * 0.012,
        size: 1.2 + Math.random() * 1.8 });
    }
    var t = 0;
    function draw() {
      W = cv.offsetWidth || 360; H = cv.offsetHeight || 56;
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, W, H);
      t += 0.012;
      var off1 = Math.sin(t * 0.9) * 0.08;
      ctx.beginPath();
      for (var x = 0; x <= W; x += 4) {
        var y = H * (0.55 + off1 + Math.sin(x / W * Math.PI * 2.8 + t) * 0.12 + Math.sin(x / W * Math.PI * 5 + t * 1.3) * 0.05);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H); ctx.closePath();
      ctx.fillStyle = 'rgba(120,190,210,0.22)'; ctx.fill();
      var off2 = Math.sin(t * 1.1 + 1) * 0.07;
      ctx.beginPath();
      for (var x = 0; x <= W; x += 4) {
        var y = H * (0.68 + off2 + Math.sin(x / W * Math.PI * 2.2 + t * 1.15 + 0.8) * 0.10 + Math.sin(x / W * Math.PI * 4.5 + t * 0.9) * 0.04);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H); ctx.closePath();
      ctx.fillStyle = 'rgba(100,170,200,0.30)'; ctx.fill();
      sparks.forEach(function(s) {
        s.phase += s.speed;
        var bri = (Math.sin(s.phase) + 1) / 2;
        if (bri < 0.3) return;
        var sx = ((s.x + t * 0.018) % 1) * W;
        var sy = s.y * H;
        ctx.save(); ctx.globalAlpha = bri * 0.85;
        ctx.fillStyle = '#fff'; ctx.shadowColor = '#aee8ff'; ctx.shadowBlur = 4;
        ctx.beginPath(); ctx.arc(sx, sy, s.size * bri, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });
      requestAnimationFrame(draw);
    }
    draw();
    window.addEventListener('resize', resize);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initShore);
  else setTimeout(initShore, 200);
})();

// ──────────────────────────────────────────────
//  ダンジョンエフェクト
// ──────────────────────────────────────────────
var dungFx = (function() {
  var cv, ctx2, raf = null, t2 = 0, fxLayer = null;
  var fogP = [], coralP = [], deepP = [];
  function getCV() { if (!cv) cv = document.getElementById('dung-fx'); return cv; }

  function initFog() {
    fogP = [];
    for (var i = 0; i < 22; i++) fogP.push({
      x: Math.random(), y: Math.random(), r: 60 + Math.random() * 110,
      vx: (Math.random() - 0.5) * 0.0004, vy: (Math.random() - 0.5) * 0.0002,
      alpha: 0.04 + Math.random() * 0.07, phase: Math.random() * Math.PI * 2 });
  }
  function initCoral() {
    coralP = [];
    for (var i = 0; i < 35; i++) coralP.push({
      x: Math.random(), y: Math.random(),
      vy: -(0.0003 + Math.random() * 0.0006), vx: (Math.random() - 0.5) * 0.0002,
      r: 1.5 + Math.random() * 2.5, alpha: 0.3 + Math.random() * 0.5,
      hue: 160 + Math.random() * 80, phase: Math.random() * Math.PI * 2 });
  }
  function initDeep() {
    deepP = [];
    for (var i = 0; i < 50; i++) deepP.push({
      x: Math.random(), y: Math.random(),
      vy: -(0.0001 + Math.random() * 0.0004), vx: (Math.random() - 0.5) * 0.00015,
      r: 0.8 + Math.random() * 1.8, alpha: 0.2 + Math.random() * 0.6,
      hue: 190 + Math.random() * 60, phase: Math.random() * Math.PI * 2 });
  }

  function frame() {
    if (!getCV()) return;
    var W = cv.offsetWidth || 400, H = window.innerHeight;
    cv.width = W; cv.height = H;
    ctx2 = cv.getContext('2d');
    t2++;
    ctx2.clearRect(0, 0, W, H);

    if (fxLayer === '浜辺') {
      fogP.forEach(function(p) {
        p.x += p.vx; p.y += p.vy; p.phase += 0.003;
        if (p.x < -0.2) p.x = 1.2; if (p.x > 1.2) p.x = -0.2;
        if (p.y < -0.1) p.y = 1.1; if (p.y > 1.1) p.y = -0.1;
        var a = p.alpha * (0.7 + 0.3 * Math.sin(p.phase));
        var g = ctx2.createRadialGradient(p.x*W, p.y*H, 0, p.x*W, p.y*H, p.r);
        g.addColorStop(0, 'rgba(220,230,235,'+a+')'); g.addColorStop(1, 'rgba(220,230,235,0)');
        ctx2.fillStyle = g; ctx2.beginPath(); ctx2.arc(p.x*W, p.y*H, p.r, 0, Math.PI*2); ctx2.fill();
      });
    } else if (fxLayer === '海') {
      for (var li = 0; li < 6; li++) {
        var lx = (0.1 + li*0.16 + Math.sin(t2*0.008+li*1.2)*0.06)*W;
        var g2 = ctx2.createLinearGradient(lx,0,lx+10,H);
        var la = 0.04+0.03*Math.sin(t2*0.015+li);
        g2.addColorStop(0,'rgba(80,200,180,0)'); g2.addColorStop(0.4,'rgba(80,200,180,'+la+')');
        g2.addColorStop(0.7,'rgba(80,200,180,'+la+')'); g2.addColorStop(1,'rgba(80,200,180,0)');
        ctx2.fillStyle = g2; ctx2.fillRect(lx, 0, 8+Math.sin(t2*0.01+li)*4, H);
      }
      coralP.forEach(function(p) {
        p.x += p.vx+Math.sin(t2*0.012+p.phase)*0.0003; p.y += p.vy; p.phase += 0.02;
        if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
        var a = p.alpha*(0.6+0.4*Math.sin(p.phase));
        ctx2.beginPath(); ctx2.arc(p.x*W, p.y*H, p.r, 0, Math.PI*2);
        ctx2.fillStyle = 'hsla('+p.hue+',70%,75%,'+a+')'; ctx2.fill();
      });
    } else if (fxLayer === '深海') {
      var dg = ctx2.createLinearGradient(0,0,0,H);
      dg.addColorStop(0,'rgba(5,10,30,0)');
      dg.addColorStop(0.5,'rgba(5,15,40,'+(0.10+0.04*Math.sin(t2*0.007))+')');
      dg.addColorStop(1,'rgba(10,20,60,'+(0.18+0.06*Math.cos(t2*0.009))+')');
      ctx2.fillStyle = dg; ctx2.fillRect(0,0,W,H);
      deepP.forEach(function(p) {
        p.x += p.vx+Math.sin(t2*0.008+p.phase)*0.0002; p.y += p.vy; p.phase += 0.015;
        if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
        var pulse = 0.5+0.5*Math.sin(p.phase*1.5);
        ctx2.save(); ctx2.beginPath();
        ctx2.arc(p.x*W, p.y*H, p.r*(0.8+0.4*pulse), 0, Math.PI*2);
        ctx2.fillStyle = 'hsla('+p.hue+',80%,70%,'+(p.alpha*pulse)+')';
        ctx2.shadowColor = 'hsla('+p.hue+',90%,70%,0.5)'; ctx2.shadowBlur = 7;
        ctx2.fill(); ctx2.restore();
      });
    }
    raf = requestAnimationFrame(frame);
  }

  return {
    start: function(dungLayer) {
      fxLayer = dungLayer;
      t2 = 0;
      if (dungLayer === '浜辺') initFog();
      else if (dungLayer === '海') initCoral();
      else if (dungLayer === '深海') initDeep();
      else return;
      if (!getCV()) return;
      cv.classList.add('active');
      if (raf) cancelAnimationFrame(raf);
      frame();
    },
    stop: function() {
      if (getCV()) cv.classList.remove('active');
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      fxLayer = null;
    }
  };
})();
