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
  diary: '',
  hasDiary: false,
  seenAdjectives: [],
  levelMsgSeen: {},  // 表示済みレベルメッセージ
  omiyageDate: '',  // 最後におみやげを受け取った日付
  deepestFloor: 0,  // 水鏡の路の最深記録
  mirrorRoomUnlocked: false,  // 人魚の部屋解放フラグ
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
  grid[eyeY][eyeX] = 3; grid[eyeY][15 - eyeX] = 3; // 常に目を表示
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
  if (id === 'world-screen') checkOmiyage();
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


// ── 仲間の台詞（レベルで育つ） ──
function companionSpeech(c) {
  var lv = c.level || 1;
  var a = c.article ? c.article + ' ' : '';
  if (lv < 2) return '';
  if (lv === 2) return '…' + c.word + '.';
  if (lv === 3) return a + c.word + '.';
  if (lv === 4) return a + c.word + ' — ' + c.meaning + '。';
  // Lv5+: 単語ごとの例文プール（あれば使う、なければ汎用）
  var pool = (c.speeches && c.speeches.length) ? c.speeches : GENERIC_SPEECHES[c.layer] || GENERIC_SPEECHES['浜辺'];
  var seed = 0;
  for (var i = 0; i < c.word.length; i++) seed = (seed * 31 + c.word.charCodeAt(i)) >>> 0;
  var idx = (seed + lv) % pool.length;
  return '「' + pool[idx] + '」';
}
var GENERIC_SPEECHES = {
  '空中都市': [
    'Hoch oben ist es still. — 高いところは静かだ。',
    'Die Wolken tragen Träume. — 雲は夢を運ぶ。',
    'Ich sehe weit. — 遠くまで見える。',
    'Der Wind erzählt etwas. — 風が何かを語っている。',
    'Frei sein ist schön. — 自由であることは美しい。',
  ],
  '湖': [
    'Das Wasser erinnert sich. — 水は覚えている。',
    'Alles spiegelt sich. — すべてが映っている。',
    'Es ist so ruhig hier. — ここはとても静かだ。',
    'Manchmal weint der See. — 湖がときどき泣いている。',
    'Stille hat eine Farbe. — 静けさには色がある。',
  ],
  '庭': [
    'Etwas wächst hier. — 何かが育っている。',
    'Die Wurzeln sind tief. — 根は深い。',
    'Ein Käfer läuft vorbei. — 虫が通り過ぎた。',
    'Heute regnet es nicht. — 今日は雨が降らない。',
    'Die Blumen riechen gut. — 花のにおいがいい。',
  ],
  '浜辺': [
    'Die Wellen kommen und gehen. — 波は来ては去る。',
    'Ich habe etwas gefunden. — 何か見つけた。',
    'Der Sand ist warm. — 砂が温かい。',
    'Ein Boot liegt da. — 舟がそこにある。',
    'Hörst du das Meer? — 海が聞こえる？',
  ],
  '海': [
    'Tief unten leuchtet es. — 深いところで光っている。',
    'Die Strömung ist stark. — 流れが強い。',
    'Etwas schwimmt vorbei. — 何かが泳いでいった。',
    'Das Salz schmecke ich. — 塩の味がする。',
    'Unter Wasser ist es anders. — 水の中は違う世界だ。',
  ],
  '深海': [
    'Hier unten vergisst man die Zeit. — ここでは時間を忘れる。',
    'Dunkelheit hat einen Klang. — 暗闇には音がある。',
    'Etwas Altes schläft hier. — 古いものがここで眠っている。',
    'Ich kann das Licht nicht sehen. — 光が見えない。',
    'Wer hat diese Laterne angezündet? — 誰がこの灯りをつけた？',
  ],
};


// ── おみやげシステム（1日1回、0:00リセット） ──
var OMIYAGE_POOLS = {
  '空中都市': [
    {type:'言葉', text:'空の色にも名前がある。Himmelblau — 空の青。'},
    {type:'言葉', text:'雲が城の形をしていた。Wolkenschloss — 雲の城。'},
    {type:'言葉', text:'Morgenrot — 朝焼け。空が燃えるように赤い。'},
    {type:'言葉', text:'Abenddämmerung — 夕暮れ。光が静かに溶けていく。'},
    {type:'言葉', text:'Sternenstaub — 星屑。空から降ってきたのかもしれない。'},
  ],
  '湖': [
    {type:'言葉', text:'Heimweh — 故郷を恋しく思うこと。'},
    {type:'言葉', text:'Geborgenheit — 守られている安心感。訳せない言葉。'},
    {type:'言葉', text:'Mitgefühl — 一緒に感じること。共感。'},
    {type:'言葉', text:'Weltschmerz — 世界の痛み。世界が思い通りにならない悲しみ。'},
    {type:'言葉', text:'Zuneigung — 誰かに向かう気持ち。好意。'},
  ],
  '庭': [
    {type:'言葉', text:'Löwenzahn — タンポポ。ライオンの歯という名前。'},
    {type:'言葉', text:'Marienkäfer — てんとう虫。マリアの虫。'},
    {type:'言葉', text:'Gänseblümchen — ヒナギク。小さなガチョウの花。'},
    {type:'言葉', text:'Glühwürmchen — 蛍。光る小さな虫。'},
    {type:'言葉', text:'Sonnenblume — ひまわり。太陽の花。'},
  ],
  '浜辺': [
    {type:'アイテム', item:{name:'砂浜の瓶', type:'素材', icon:'🫙', desc:'浜辺の進化の石の素材', qty:1}},
    {type:'アイテム', item:{name:'流木の欠片', type:'素材', icon:'🪵', desc:'浜辺の進化の石の素材', qty:1}},
    {type:'Taler', amount:8, text:'浜辺で小さな袋を見つけた。'},
    {type:'Taler', amount:15, text:'波打ち際に何かが光っていた。'},
    {type:'装備'},
  ],
  '海': [
    {type:'言葉', text:'深いところに何かがいるらしい。次の探索が楽しみだ。'},
    {type:'言葉', text:'海流が変わったみたいだ。新しい道が開けるかもしれない。'},
    {type:'言葉', text:'遠くで大きな影を見た。怖くはない、不思議だった。'},
    {type:'言葉', text:'珊瑚の奥に隠された通路を見つけた気がする。'},
    {type:'言葉', text:'海の底から歌が聞こえた。誰の声だろう。'},
  ],
  '深海': [
    {type:'言葉', text:'Unheimlich — 不気味な。でも家（Heim）の反対だから、本当は「馴染みのない」。'},
    {type:'言葉', text:'Vergänglichkeit — 移ろいゆくこと。すべてはいつか終わる。'},
    {type:'言葉', text:'Zwielicht — 薄明。二つの光の間。'},
    {type:'言葉', text:'Augenblick — 瞬間。目の一瞬のまばたき。'},
    {type:'言葉', text:'Zeitgeist — 時代の精神。空気のようなもの。'},
  ],
};

function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
}

function checkOmiyage() {
  if (!G.companions.length) return;
  var today = todayStr();
  if (G.omiyageDate === today) return;
  // おみやげを生成
  var sender = rand(G.companions);
  var pool = OMIYAGE_POOLS[sender.layer] || OMIYAGE_POOLS['浜辺'];
  var gift = pool[Math.floor(Math.random() * pool.length)];
  // おみやげアイテムをインベントリに追加
  var omiyageItem = {
    name: sender.word + 'のおみやげ',
    type: 'おみやげ',
    icon: '🎁',
    desc: sender.word + '（' + sender.layer + '）からのおみやげ',
    qty: 1,
    _gift: gift,
    _senderWord: sender.word,
    _senderLayer: sender.layer,
    _senderArticle: sender.article || '',
  };
  G.inventory.push(omiyageItem);
  G.omiyageDate = today;
  saveGame();
  // 通知を表示
  showOmiyageNotice(sender);
}

function showOmiyageNotice(sender) {
  // まずトースト通知（既存UI）
  var el = document.getElementById('omiyage-notice');
  if (el) {
    el.innerHTML = '<div style="display:flex;align-items:center;gap:10px">'
      + avatarHTML(sender, 32)
      + '<div style="flex:1">'
      + '<div style="font-size:13px;color:#2c2416;font-weight:600">' + sender.word + 'がおみやげを持ってきた</div>'
      + '<div style="font-size:11px;color:#6b5e4e;font-style:italic">荷物を確認しよう</div>'
      + '</div>'
      + '</div>';
    el.style.display = 'block';
    el.onclick = function() {
      el.style.display = 'none';
      showScreen('inventory-screen');
    };
  }
  // 演出ポップアップ
  var layerColor = LCOLOR[sender.layer] || '#c8b89a';
  var avatarInline = '<div style="display:inline-flex;align-items:center;justify-content:center;background:' + layerColor + ';width:52px;height:52px;border-radius:50%;margin:0 auto 10px;box-shadow:0 0 0 3px #fff">'
    + '<img src="' + spriteURL(sender.word, sender.article, sender.layer, sender.level) + '" style="width:38px;height:38px;image-rendering:pixelated" alt="">'
    + '</div>';
  showEventPopup({
    icon: '',
    title: sender.word + 'がおみやげを持ってきた',
    body: avatarInline + '\n「持ってきたよ。」\n荷物の中に入れておいたから、確認してね。',
    buttonLabel: '荷物を開ける',
    onClose: function() { showScreen('inventory-screen'); }
  });
}

// おみやげを開封
function openOmiyage(item) {
  var gift = item._gift;
  var sender = item._senderWord || '???';
  var layer = item._senderLayer || '浜辺';
  consumeItem(item.name);

  if (!gift) {
    toast(sender + 'からのおみやげ…何も入っていなかった。');
    renderInventory();
    return;
  }

  if (gift.type === '言葉') {
    // ログに追加（手紙風の表示）
    G.logs.unshift({
      time: now(),
      text: sender + 'のおみやげ: ' + gift.text,
      isLetter: true,
      read: false
    });
    toast('📜 ' + sender + 'が言葉を持ってきた');

  } else if (gift.type === 'Taler') {
    G.taler += gift.amount;
    updateCounts();
    G.logs.unshift({ time: now(), text: sender + 'のおみやげ: ' + gift.text + '（+' + gift.amount + 'T）' });
    toast('💰 ' + gift.amount + 'Talerを手に入れた');

  } else if (gift.type === 'アイテム') {
    var gi = Object.assign({}, gift.item);
    var existing = G.inventory.find(function(i){ return i.name === gi.name; });
    if (existing) existing.qty = (existing.qty||1) + 1;
    else { gi.qty = 1; G.inventory.push(gi); }
    G.logs.unshift({ time: now(), text: sender + 'のおみやげ: ' + gi.icon + gi.name + 'を持ってきた' });
    toast(gi.icon + ' ' + gi.name + 'を手に入れた');

  } else if (gift.type === '装備') {
    // 浜辺層の装備をランダム生成
    var eq = genEquip(0, 10);
    var existing = G.inventory.find(function(i){ return i.name === eq.name; });
    if (existing) existing.qty = (existing.qty||1) + 1;
    else { eq.qty = 1; G.inventory.push(eq); }
    G.logs.unshift({ time: now(), text: sender + 'のおみやげ: ' + eq.icon + eq.name + 'を拾ってきた' });
    toast(eq.icon + ' ' + eq.name + 'を手に入れた！');
  }

  saveGame();
  renderInventory();
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
  var now_ms = Date.now();
  var HALF_DAY = 12 * 60 * 60 * 1000;
  var FULL_DAY = 24 * 60 * 60 * 1000;
  var pending = G.words.filter(function(w){
    if (w.status === '定着済み') return false;
    if (G.quizDoneToday[w.word]) return false;
    // 時間ゲートチェック：まだ答えられない問題は除外
    if (w.correctCount === 1 && w.lastCorrectAt && (now_ms - w.lastCorrectAt < HALF_DAY)) return false;
    if (w.correctCount === 2 && w.firstCorrectAt && (now_ms - w.firstCorrectAt < FULL_DAY)) return false;
    return true;
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
+ (companionSpeech(c) ? '<div class="comp-speech" data-cidx="' + cIdx + '" style="display:none">' + companionSpeech(c) + '</div>' : '')
      + (prov ? '' : '<button class="equip-mgr-btn" data-cidx="' + cIdx + '" style="margin-top:5px;font-size:10px;padding:3px 10px;border:1px solid #c8b89a;border-radius:10px;background:#f5f0e8;cursor:pointer;font-family:Georgia,serif;color:#6b5e4e">装備を管理</button>')
      + '<div class="hp-bar" style="margin-top:5px"><div class="hp-fill" style="width:' + hpPct + '%"></div></div>'
      + '<div class="xp-bar"><div class="xp-fill" style="width:' + xpPct + '%"></div></div>'
      + '</div>'
      + '<div class="cstats">⚔️' + c.stats.atk + ' 🛡️' + c.stats.def + '<br>💨' + c.stats.spd + ' 🍀' + c.stats.lck + '<br>Lv.' + c.level + '</div>'
      + '</div>';
  }).join('');
  // 装備管理ボタン
  el.querySelectorAll('.equip-mgr-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var cidx = parseInt(this.getAttribute('data-cidx'));
      openEquipManager(cidx);
    });
  });
  // 仲間カードタップで台詞表示
  el.querySelectorAll('.comp-card').forEach(function(card, idx) {
    card.style.cursor = 'pointer';
    card.addEventListener('click', function() {
      var bubble = this.querySelector('.comp-speech');
      if (!bubble) return;
      // 他の開いている台詞を閉じる
      el.querySelectorAll('.comp-speech.open').forEach(function(b) {
        if (b !== bubble) { b.classList.remove('open'); b.style.display = 'none'; }
      });
      if (bubble.classList.contains('open')) {
        bubble.classList.remove('open');
        bubble.style.display = 'none';
      } else {
        bubble.style.display = 'block';
        // アニメーションのためにリフローを挟む
        bubble.offsetHeight;
        bubble.classList.add('open');
      }
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
    // 解放条件チェック
    var isLocked = false;
    var lockReason = '';
    if (d.mirrorRoomRequired && !G.mirrorRoomUnlocked) {
      isLocked = true;
      lockReason = '水鏡の路 50階をクリアすると解放される';
    } else if (d.unlockAfter && G.clearedDungeons.indexOf(d.unlockAfter) < 0) {
      isLocked = true;
      lockReason = d.unlockAfter + 'をクリアすると解放される';
    }
    if (isLocked) {
      return '<div class="dcard" style="opacity:0.45;pointer-events:none">'
        + '<div class="dcard-name">🔒 ???</div>'
        + '<div class="dcard-desc">' + lockReason + '</div>'
        + '</div>';
    }
    var timeStr = d.type === 'floor'
      ? '5階ごとに帰還判断 • 最深記録: ' + (G.deepestFloor || 0) + '階'
      : '所要時間 約' + d.dur + '秒（実時間）• 敵' + d.encounters + '体';
    return '<div class="dcard' + (G.selDungeon && G.selDungeon.id === d.id ? ' sel' : '') + '" data-dung="' + d.id + '">'
      + '<div class="dcard-name">' + d.name + '</div>'
      + '<div class="dcard-desc">' + d.desc + '</div>'
      + '<div class="dcard-time">' + timeStr + '</div>'
      + '</div>';
  }).join('');
  document.querySelectorAll('.dcard[data-dung]').forEach(function(el) {
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

  // フロアダンジョン（水鏡の路など）は専用ルートへ
  if (dung.type === 'floor') {
    G.party = [];
    G.selDungeon = null;
    startMirrorDungeon(party, dung);
    if (typeof dungFx !== 'undefined') dungFx.start(dung.layer);
    showScreen('livelog-screen');
    return;
  }

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
var dungState = { interval: null, elapsed: 0, duration: 0, party: [], dung: null, events: [], failed: false, inBattle: false, pendingFinish: false, herbUsed: false, dropBoost: false, active: false, startedAt: 0, battleLog: [], currentEnemy: null, sessionItems: [], floorMode: false, levelUps: [] };

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
  dungState.levelUps = [];
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
    var isBoss = (dung.layer === '深海' && i === enc - 1);
    events.push({ time: Math.floor(dung.dur / (enc + 1) * (i + 1)), type: 'battle', boss: isBoss });
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
      if (ev.type === 'battle') triggerBattle(ev.boss);
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
function triggerBattle(isBoss) {
  if (dungState.failed) return;
  var alive = dungState.party.filter(function(c){ return c.hp > 0; });
  if (!alive.length) { dungState.failed = true; return; }
  dungState.inBattle = true;

  var enemy = isBoss ? '深淵の王' : rand(ENEMIES[dungState.dung.layer]);
  var dungLayer = dungState.dung ? dungState.dung.layer : '浜辺';
  var enemyAtk, enemyDef, enemyHP;
  var isDeepSea = dungLayer === '深海';
  // ── フロアモード（水鏡の路）の敵ステータス ──
  if (dungState.floorMode) {
    var f = mirrorState.floor;
    var lakeEnemies = (ENEMIES['湖'] && ENEMIES['湖'].length) ? ENEMIES['湖'] : ['水鏡の幻', '揺らぐ影', '湖底の番人'];
    if (!isBoss) enemy = rand(lakeEnemies);
    enemyAtk = Math.floor(8 + f * 2.2) + Math.floor(Math.random() * 6);
    enemyDef = Math.floor(4 + f * 1.3) + Math.floor(Math.random() * 4);
    enemyHP  = Math.floor(70 + f * 22) + Math.floor(Math.random() * Math.max(20, f * 8));
  } else if (dungLayer === '浜辺') {
    enemyAtk = 7 + Math.floor(Math.random() * 8);
    enemyDef = 5  + Math.floor(Math.random() * 5);
    enemyHP  = 60 + Math.floor(Math.random() * 50);  // 変更なし
  } else if (dungLayer === '海') {
    enemyAtk = 16 + Math.floor(Math.random() * 12);  // +3 (~20%強化)
    enemyDef = 10 + Math.floor(Math.random() * 8);   // +2 (~20%強化)
    enemyHP  = 180 + Math.floor(Math.random() * 85); // +30 (~20%強化)
  } else if (!isBoss) {
    enemyAtk = 21 + Math.floor(Math.random() * 16);  // +3 (~17%強化)
    enemyDef = 14 + Math.floor(Math.random() * 12);  // +2 (~17%強化)
    enemyHP  = 290 + Math.floor(Math.random() * 115); // +40 (~16%強化)
  } else {
    // 深淵の王（ボス）
    enemyAtk = 32 + Math.floor(Math.random() * 14);  // +4 (~14%強化)
    enemyDef = 21 + Math.floor(Math.random() * 10);  // +3 (~17%強化)
    enemyHP  = 700 + Math.floor(Math.random() * 230); // +100 (~17%強化)
  }

  dungState.currentEnemy = enemy;
  if (isBoss) {
    addLL('danger', '地鳴りがする。深淵の底から、何かが這い上がってきた。');
    setTimeout(function(){ addLL('danger', '── 深淵の王 ──'); }, 400);
  } else {
    addLL('battle', enemy + 'が現れた！');
  }

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
        if (dungState.floorMode) { finishMirrorDungeon(false); return; }
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
        var tBase = dungState.floorMode ? (5 + Math.floor(mirrorState.floor * 1.5) + Math.floor(Math.random() * 8))
          : (isDeepSea ? 15 + Math.floor(Math.random()*16)
          : (dungLayer === '海' ? 8 + Math.floor(Math.random()*9) : 4 + Math.floor(Math.random()*5)));
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
            // 帰還後ポップアップのためにキューへ積む
            if (!dungState.levelUps) dungState.levelUps = [];
            dungState.levelUps.push({ word: c.word, level: c.level });
            setTimeout(function(){ if (dungState.active) addLL('normal', c.word + 'はレベルアップした。（Lv.' + c.level + '）'); }, 300);
          }
        });
        renderLiveHP();
        dungState.inBattle = false;
        dungState.currentEnemy = null;
        renderLiveHP();
        // フロアモードは次の階へ進む
        if (dungState.floorMode) {
          if (Math.random() < 0.55) triggerFloorItem();
          setTimeout(onFloorBattleClear, 700);
          return;
        }
        if (dungState.pendingFinish) finishDungeon();
        return;
      }

      // ── 敵の反撃 ──
      var isAOE = (isDeepSea && Math.random() < 0.3) || (dungState.floorMode && mirrorState.floor >= 15 && Math.random() < 0.25);
      if (isAOE) {
        // 全体攻撃
        addLL('danger', enemy + 'の全体攻撃！');
        var refTotal = 0;
        var aoeLog = [];
        fighters.forEach(function(c) {
          var afx = equipFx(c);
          if (afx.dodge && Math.random() < afx.dodge) {
            aoeLog.push(c.word + 'はかわした');
            return;
          }
          var defMod = c.status === '仮加入' ? 0.9 : 1.0;
          if (c.layer === dungLayer) defMod *= 1.1;
          var dmg = Math.max(1, Math.floor(enemyAtk * 0.6) - Math.floor(c.stats.def * defMod * 0.4) + Math.floor(Math.random()*6));
          c.hp = Math.max(0, c.hp - dmg);
          if (afx.reflect && dmg > 0) refTotal += Math.max(1, Math.floor(dmg * afx.reflect));
          aoeLog.push(c.hp <= 0 ? c.word + ' -' + dmg + '（倒れた）' : c.word + ' -' + dmg + '（残' + c.hp + '）');
        });
        addLL('danger', aoeLog.join('、'));
        if (refTotal > 0) {
          enemyHP = Math.max(0, enemyHP - refTotal);
          addLL('battle', '棘が合計' + refTotal + 'のダメージを返した。（敵残HP: ' + enemyHP + '）');
        }
      } else {
        // 単体攻撃：SPDが低いほど狙われやすい重み付きランダム
        // weight = max(1, maxSPD - SPD + 4) で最低SPDでも最高SPDの数倍程度に収まる
        var maxSpd = fighters.reduce(function(m,c){ return Math.max(m, c.stats.spd||0); }, 0);
        var pool = fighters.map(function(c) {
          var qfx = equipFx(c);
          var base = Math.max(1, maxSpd - (c.stats.spd||0) + 4);
          // leise装備は重みを大幅に下げる（狙われにくい）
          var w = qfx.quiet ? Math.max(1, Math.floor(base * (1 - qfx.quiet))) : base;
          return { c: c, w: w };
        });
        var totalW = pool.reduce(function(s,p){ return s+p.w; }, 0);
        var roll = Math.random() * totalW;
        var acc = 0;
        var target = pool[pool.length-1].c;
        for (var pi = 0; pi < pool.length; pi++) {
          acc += pool[pi].w;
          if (roll < acc) { target = pool[pi].c; break; }
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
        if (dungState.floorMode) { finishMirrorDungeon(false); return; }
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

// ── 敵スプライト（手描きドット絵を後で差し替え可能な構造） ──
// ENEMY_SPRITES['敵名'] = 'data:image/png;base64,...' で差し替え可能
var ENEMY_SPRITES = {};

// 手描きドット絵がない場合の暫定生成スプライト
// 層の色を使い、仲間より「ギザギザした・威圧的な」形状にする
var ENEMY_PAL = {
  '浜辺': {main:'#c8a87a', accent:'#e8d4b0', dark:'#5c3e00', bg:'#DFCBA9'},
  '海':   {main:'#1d6e8a', accent:'#5abcdc', dark:'#0a2a3c', bg:'#508CA4'},
  '深海': {main:'#1a3a6e', accent:'#4a8ab0', dark:'#020818', bg:'#0A122A'},
  '湖':   {main:'#5a4aaa', accent:'#c8c0f0', dark:'#1a1040', bg:'#CEC7E2'},
};
function enemySpriteURL(name, layer) {
  if (ENEMY_SPRITES[name]) return ENEMY_SPRITES[name];
  var pal = ENEMY_PAL[layer] || ENEMY_PAL['浜辺'];
  var seed = 0;
  for (var i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) >>> 0;
  var rng = (function(s) { return function() {
    s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >> 17)) >>> 0; s = (s ^ (s << 5)) >>> 0;
    return s / 4294967296;
  }; })(seed || 1);

  var W = 16, H = 16;
  var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  var ctx = cv.getContext('2d');
  // 敵は非対称＋ギザギザにする（仲間との視覚的差別化）
  var grid = [];
  for (var y = 0; y < H; y++) { grid[y] = []; for (var x = 0; x < W; x++) grid[y][x] = 0; }
  // 横広がりの不規則シルエット
  for (var y = 2; y < 14; y++) {
    var rowW = 3 + Math.floor(rng() * 8);
    var xStart = 2 + Math.floor(rng() * 5);
    for (var x = xStart; x < xStart + rowW && x < 15; x++) {
      grid[y][x] = rng() < 0.7 ? 1 : 0;
    }
  }
  // ギザギザの牙・突起（上部）
  for (var i = 0; i < 3; i++) {
    var tx = 3 + Math.floor(rng() * 10);
    for (var ty = 0; ty < 3; ty++) if (grid[3 + ty] && grid[3 + ty][tx]) grid[ty][tx] = 1;
  }
  // 目（赤）
  var eyeY = 3 + Math.floor(rng() * 3);
  var eyeX1 = 4 + Math.floor(rng() * 2);
  var eyeX2 = eyeX1 + 2 + Math.floor(rng() * 2);
  if (eyeX2 < 15) { grid[eyeY][eyeX1] = 3; grid[eyeY][eyeX2] = 3; }

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = grid[y][x]; if (!v) continue;
      var edge = y===0||y===H-1||x===0||x===W-1||!grid[y-1]||!grid[y-1][x]||!grid[y+1]||!grid[y+1][x]||!grid[y][x-1]||!grid[y][x+1];
      var isEdge = v!==3 && (y===0||y===H-1||x===0||x===W-1||(grid[y-1]&&!grid[y-1][x])||(grid[y+1]&&!grid[y+1][x])||!grid[y][x-1]||!grid[y][x+1]);
      ctx.fillStyle = v===3 ? '#cc2222' : (isEdge ? pal.dark : (rng()<0.2 ? pal.accent : pal.main));
      ctx.fillRect(x, y, 1, 1);
    }
  }
  var url = cv.toDataURL();
  ENEMY_SPRITES['__gen__' + name] = url; // キャッシュ
  return url;
}

var ENEMY_EMOJI = {
  '砂浜の亡霊': '👻', '潮の番人': '🦀', '流木の怪': '🪵',
  '珊瑚の守護者': '🪸', '光る深魚': '🐠', '海流の精': '🌊',
  '深淵の番人': '🦑', '忘却の影': '🌑', '原初の怪魚': '🐟',
  '水鏡の霊': '🪞', '湖底の番人': '🐊', '揺らぐ影': '👁️',
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
    var vsStr = '';
    if (dungState.inBattle && dungState.currentEnemy) {
      var _eLayer = dungState.dung ? dungState.dung.layer : '浜辺';
      var _eSrc = enemySpriteURL(dungState.currentEnemy, _eLayer);
      vsStr = '<span style="font-size:16px;color:#5a8ab0;margin:0 6px">⚔️</span>'
        + '<img src="' + _eSrc + '" style="width:36px;height:36px;image-rendering:pixelated;vertical-align:middle" title="' + dungState.currentEnemy + '" alt="">';
    }
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
  dungState.party.forEach(function(c){ c.hp = c.maxHP; c.inDungeon = false; });
  dungState.active = false;
  G.lastBattleLog = dungState.battleLog.slice(); // 最新戦闘ログを保存
  if (typeof dungFx !== 'undefined') dungFx.stop();
  renderLiveHP();
  saveGame();
  checkPlayerLevel();
  // レベルアップポップアップをキューから順に表示（同仲間は最終レベルのみ）
  var lvQueue = (dungState.levelUps || []).slice();
  dungState.levelUps = [];
  var lvMap = {};
  lvQueue.forEach(function(e){ lvMap[e.word] = e.level; });
  var lvDedupe = Object.keys(lvMap).map(function(w){ return { word: w, level: lvMap[w] }; });
  // 深海神殿クリア時は仲間会話シーンが終わってからレベルアップを表示
  var justClearedDeepSea = dungState.dung && dungState.dung.name === '深海神殿'
    && G.clearedDungeons.indexOf('深海神殿') >= 0
    && lvDedupe.length > 0;
  if (justClearedDeepSea) {
    window._pendingLvQueue = lvDedupe;
  } else if (lvDedupe.length > 0) {
    setTimeout(function(){ startLevelUpQueue(lvDedupe); }, 800);
  } else {
    setTimeout(function(){ toast('探索完了！ログを確認しよう'); }, 500);
  }
}

function now() {
  return new Date().toLocaleTimeString('ja-JP', {hour:'2-digit', minute:'2-digit'});
}

// ══════════════════════════════════════════════
//  水鏡の路 — フロア制ダンジョンシステム
// ══════════════════════════════════════════════
var mirrorState = {
  active: false, floor: 0, party: [], sessionItems: [],
  dung: null, failed: false, paused: false, checkpointEvery: 5
};

function startMirrorDungeon(party, dung) {
  // dungState を戦闘エンジンとして再利用
  dungState.party = party;
  dungState.dung = dung;
  dungState.elapsed = 0;
  dungState.duration = 999999; // タイムアップなし
  dungState.failed = false;
  dungState.inBattle = false;
  dungState.pendingFinish = false;
  dungState.herbUsed = false;
  dungState.dropBoost = false;
  dungState.active = true;
  dungState.startedAt = Date.now();
  dungState.battleLog = [];
  dungState.sessionItems = [];
  dungState.levelUps = [];
  dungState.events = []; // 時間イベントなし
  dungState.floorMode = true;
  if (dungState.interval) clearInterval(dungState.interval);

  mirrorState.active = true;
  mirrorState.floor = 0;
  mirrorState.party = party;
  mirrorState.sessionItems = [];
  mirrorState.dung = dung;
  mirrorState.failed = false;
  mirrorState.paused = false;
  mirrorState.checkpointEvery = dung.checkpointEvery || 5;

  document.getElementById('ll-title').textContent = '水鏡の路';
  document.getElementById('ll-scroll').innerHTML = '';
  document.getElementById('ll-timer').textContent = '0階';
  renderLiveHP();
  addLL('normal', '水面に踏み込む。鏡のような静けさが、足元に広がっている。');
  setTimeout(runNextMirrorFloor, 1800);
}

function runNextMirrorFloor() {
  if (!mirrorState.active || mirrorState.failed || mirrorState.paused) return;
  mirrorState.floor++;
  var timerEl = document.getElementById('ll-timer');
  if (timerEl) timerEl.textContent = mirrorState.floor + '階';
  dungState.herbUsed = false;
  addLL('normal', '── ' + mirrorState.floor + '階 ──');
  triggerBattle(false);
}

function onFloorBattleClear() {
  if (!mirrorState.active || mirrorState.failed) return;
  var floor = mirrorState.floor;
  if (floor > (G.deepestFloor || 0)) G.deepestFloor = floor;
  // 50階ゴール（チェックポイントより先に評価）
  if (floor === 50) {
    setTimeout(showMirrorEndingModal, 700);
    return;
  }
  if (floor % mirrorState.checkpointEvery === 0) {
    setTimeout(showMirrorCheckpoint, 700);
  } else {
    setTimeout(runNextMirrorFloor, 1400);
  }
}

var MIRROR_PROPHECY = [
  '水面に小さな波紋が広がった。この先に、何かの気配がある。',
  '水鏡が一瞬揺らいだ。奥から、冷たい光が差し込んでくる。',
  '鏡の底で、星のような光が見えた。手が届きそうな気がする。',
  'ここより先は、言葉も届かない場所だ。それでも、進むか？',
  '水鏡はあなたの顔を映した。その瞳の奥に、何が見えるか。',
];

function showMirrorCheckpoint() {
  mirrorState.paused = true;
  var floor = mirrorState.floor;
  var idx = Math.min(Math.floor(floor / mirrorState.checkpointEvery) - 1, MIRROR_PROPHECY.length - 1);
  var prophecy = MIRROR_PROPHECY[Math.max(0, idx)];
  document.getElementById('mirror-floor-text').textContent = floor + '階';
  document.getElementById('mirror-prophecy').textContent = prophecy;
  document.getElementById('mirror-modal').style.display = 'flex';
  addLL('normal', '── 水鏡 ──');
  addLL('normal', prophecy);
}

function mirrorReturn() {
  document.getElementById('mirror-modal').style.display = 'none';
  finishMirrorDungeon(true);
}

function mirrorContinue() {
  document.getElementById('mirror-modal').style.display = 'none';
  mirrorState.paused = false;
  addLL('normal', 'さらに深く潜る決意をした。');
  setTimeout(runNextMirrorFloor, 1000);
}

function triggerFloorItem() {
  var pool = DROPS['湖'];
  if (!pool || !pool.length) return;
  var floor = mirrorState.floor;
  var alive = mirrorState.party.filter(function(c){ return c.hp > 0; });
  var lckFinder = alive.slice().sort(function(a,b){ return (b.stats.lck||0)-(a.stats.lck||0); })[0] || mirrorState.party[0];
  var finder = alive[0] || mirrorState.party[0];
  var item = Object.assign({}, weightedRand(pool));
  if (item.type === '生成装備') {
    var gDepth = Math.min(2, Math.floor(floor / 5));
    item = genEquip(gDepth, lckFinder ? (lckFinder.stats.lck || 0) : 0);
    if (item.rare || item.tier === 2) addLL('success', '✨ ただならぬ気配を放つ装備だ。');
  }
  addLL('item', finder.word + 'が ' + item.icon + '「' + item.name + '」を見つけた。');
  var existing = G.inventory.find(function(i){ return i.name === item.name; });
  if (existing) existing.qty = (existing.qty || 1) + 1;
  else { item.qty = 1; G.inventory.push(item); }
  mirrorState.sessionItems.push(item.name);
  dungState.sessionItems.push(item.name);
}

function finishMirrorDungeon(success) {
  mirrorState.active = false;
  mirrorState.paused = false;
  dungState.floorMode = false;
  dungState.active = false;
  document.getElementById('mirror-modal').style.display = 'none';

  var allNames = mirrorState.party.map(function(c){ return c.word; }).join('・');
  var survived = mirrorState.party.filter(function(c){ return c.hp > 0; });
  var reachedFloor = mirrorState.floor;

  if (!success || !survived.length) {
    var lost = mirrorState.sessionItems || [];
    lost.forEach(function(name) {
      var inv = G.inventory.find(function(i){ return i.name === name; });
      if (inv) {
        inv.qty = (inv.qty || 1) - 1;
        if (inv.qty <= 0) G.inventory = G.inventory.filter(function(i){ return i.name !== name; });
      }
    });
    addLL('danger', allNames + 'は倒れ、水面に浮かんで戻ってきた…');
    if (lost.length) addLL('danger', '持ち帰るはずだった荷物は、水底に沈んだ。');
    G.logs.unshift({ time: now(), text: allNames + 'は水鏡の路 ' + reachedFloor + '階で力尽きた。' });
  } else {
    var survivedNames = survived.map(function(c){ return c.word; }).join('・');
    var isRecord = reachedFloor >= (G.deepestFloor || 0);
    addLL('success', survivedNames + 'は水鏡を抜けて、無事に帰還した。');
    addLL('normal', '到達階: ' + reachedFloor + '階' + (isRecord ? '　（最深記録）' : ''));
    G.logs.unshift({ time: now(), text: survivedNames + 'が水鏡の路 ' + reachedFloor + '階から帰還した。' });
    if (G.clearedDungeons.indexOf('水鏡の路') < 0) {
      G.clearedDungeons.push('水鏡の路');
      G.bottleLimit = (G.bottleLimit || 6) + 3;
      toast('新しい瓶が流れ着くようになった。（上限+3）');
    }
  }

  mirrorState.party.forEach(function(c){ c.hp = c.maxHP; c.inDungeon = false; });
  G.lastBattleLog = dungState.battleLog.slice();
  if (typeof dungFx !== 'undefined') dungFx.stop();
  renderLiveHP();
  saveGame();
  checkPlayerLevel();
  // レベルアップポップアップをキューから順に表示（同仲間は最終レベルのみ）
  var lvQueue = (dungState.levelUps || []).slice();
  dungState.levelUps = [];
  var lvMap2 = {};
  lvQueue.forEach(function(e){ lvMap2[e.word] = e.level; });
  var lvDedupe2 = Object.keys(lvMap2).map(function(w){ return { word: w, level: lvMap2[w] }; });
  if (lvDedupe2.length > 0) {
    setTimeout(function(){ startLevelUpQueue(lvDedupe2); }, 800);
  } else {
    setTimeout(function(){ toast('探索完了！ログを確認しよう'); }, 500);
  }
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
      + (item.desc ? '<div class="inv-desc">' + item.desc.replace(/\n/g, '<br>') + '</div>' : '')
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

  // 層ごとに素材10個以上あれば錬成可能
  var LAYER_MAT = {
    '浜辺': ['砂浜の瓶','流木の欠片'],
    '海':   ['珊瑚片','光魚の鱗'],
    '深海': ['深海の結晶','暗闇の欠片'],
    '湖':   ['湖底の結晶','水鏡の欠片'],
  };
  var craftable = [];
  Object.keys(LAYER_MAT).forEach(function(layer) {
    var mats = LAYER_MAT[layer];
    var total = 0;
    mats.forEach(function(name) {
      var inv = G.inventory.find(function(i){ return i.name === name; });
      if (inv) total += (inv.qty || 1);
    });
    if (total >= 10) craftable.push(layer);
  });

  var container = document.getElementById('inv-grid').parentElement;
  var div = document.createElement('div');
  div.id = 'craft-area';
  div.style.cssText = 'margin-top:16px;padding-top:14px;border-top:1px solid #c8b89a';

  if (!craftable.length) {
    div.innerHTML = '<div style="font-size:11px;color:#9a8a7a;font-style:italic;text-align:center">素材が10個以上揃うと、ここで進化の石を錬成できます</div>';
  } else {
    div.innerHTML = '<div style="font-size:12px;color:#6b5e4e;letter-spacing:1px;margin-bottom:10px">⚗️ 進化の石を錬成する</div>'
      + craftable.map(function(layer) {
        return '<div style="background:#fff;border:1px solid #c8b89a;border-radius:10px;padding:11px 13px;margin-bottom:8px;display:flex;align-items:center;gap:10px;cursor:pointer" data-craft-layer="' + layer + '">'
          + '<span style="font-size:22px">💠</span>'
          + '<div style="flex:1"><div style="font-size:13px;color:#2c2416;font-weight:600">' + layer + 'の進化の石</div>'
          + '<div style="font-size:10px;color:#6b5e4e">素材×10 → 進化の石×1</div></div>'
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
    '湖':   ['湖底の結晶','水鏡の欠片'],
  };
  var mats = LAYER_MAT[layer];
  var consumed = 0;
  mats.forEach(function(name) {
    while (consumed < 10) {
      var inv = G.inventory.find(function(i){ return i.name === name; });
      if (!inv || inv.qty <= 0) break;
      inv.qty--; consumed++;
      if (inv.qty <= 0) G.inventory = G.inventory.filter(function(i){ return i.name !== name; });
    }
  });
  if (consumed < 10) { toast('素材が足りません'); return; }
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
  if (item.type === 'おみやげ') { openOmiyage(item); return; }
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
  // 日記帳セクション
  var diaryEl = document.getElementById('sofa-diary');
  if (diaryEl) {
    if (G.hasDiary) {
      diaryEl.style.display = 'block';
      var ta = document.getElementById('diary-textarea');
      if (ta) ta.value = G.diary || '';
    } else {
      diaryEl.style.display = 'none';
    }
  }
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

// ── 日記帳の購入 ──
function buyDiary() {
  if (G.hasDiary) { toast('すでに日記帳を持っている'); return; }
  if (G.taler < 200) { toast('Talerが足りない'); return; }
  G.taler -= 200;
  G.hasDiary = true;
  updateCounts();
  renderLaterneShop();
  toast('日記帳を手に入れた。ソファから書ける。');
  saveGame();
}

// ── 暗号の紙片の購入 ──
function buyCipher() {
  if (G.taler < 80) { toast('Talerが足りない'); return; }
  var EG = EQUIPGEN || DEFAULT_EQUIPGEN;
  var allAdjs = (EG.adjectives || []).concat(EG.rareAdjectives || []);
  var unseen = allAdjs.filter(function(a) {
    return G.seenAdjectives.indexOf(a.forms[0]) < 0;
  });
  if (!unseen.length) { toast('すべての形容詞を知っている'); return; }
  G.taler -= 80;
  var picked = unseen[Math.floor(Math.random() * unseen.length)];
  G.seenAdjectives.push(picked.forms[0]);
  updateCounts();
  renderLaterneShop();
  saveGame();
  // 紙片演出
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(10,22,40,0.85);z-index:200;display:flex;align-items:center;justify-content:center';
  var card = document.createElement('div');
  card.style.cssText = 'background:#1a3050;border:1px solid #5a8ab0;border-radius:16px;padding:32px 28px;max-width:300px;text-align:center;color:#b8d4f0';
  card.innerHTML = '<div style="font-size:11px;letter-spacing:2px;color:#5a8ab0;margin-bottom:12px">暗号の紙片</div>'
    + '<div style="font-size:10px;color:#7a9ab8;margin-bottom:16px;font-style:italic">紙片を広げた。</div>'
    + '<div style="font-size:28px;letter-spacing:3px;margin-bottom:8px">' + picked.forms[0] + '</div>'
    + '<div style="font-size:12px;color:#5a8ab0;margin-bottom:4px">' + picked.forms[1] + ' → ' + picked.forms[2] + '</div>'
    + '<div style="font-size:11px;color:#7a9ab8;font-style:italic;margin-top:16px">効果は不明。この言葉を宿した装備を見つければわかるかもしれない。</div>'
    + '<div style="margin-top:20px"><button onclick="this.closest(\'div[style*=fixed]\').remove()" style="background:#2d6a8f;color:#e8f4fc;border:none;border-radius:20px;padding:8px 24px;font-size:13px;cursor:pointer;font-family:Georgia,serif">閉じる</button></div>';
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function buyItem(name, price, type, props) {
  if (G.taler < price) { toast('Talerが足りない'); return; }
  // 消耗品の所持上限チェック（最大3個）
  var existing = G.inventory.find(function(i){ return i.name === name; });
  if (existing && (existing.qty || 1) >= 3) {
    toast(name + 'は3個まで持てます'); return;
  }
  G.taler -= price;
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
  8:  { layer: '湖',   text: '誰かが泳いで近づいてくる時もある。' },
  9:  { layer: null,    text: 'もうすぐ、新しい扉が開くかもしれない' },
  10: { layer: null,    text: 'ふぁーあ。あくびだよ' },
};

function checkPlayerLevel() {
  if (!G.companions.length) return;
  var maxLevel = G.companions.reduce(function(mx, c){ return Math.max(mx, c.level || 1); }, 1);
  G.playerLevel = maxLevel;

  // 各レベルのメッセージ（一度だけ）
  if (!G.levelMsgSeen) G.levelMsgSeen = {};
  for (var lv = 2; lv <= maxLevel; lv++) {
    if (G.levelMsgSeen[lv]) continue;
    var msg = PLAYER_LEVEL_MESSAGES[lv];
    if (!msg) continue;

    G.levelMsgSeen[lv] = true;

    var sender = null;
    if (msg.layer) {
      var layerComps = G.companions.filter(function(c){ return c.layer === msg.layer; });
      sender = layerComps.length ? rand(layerComps) : rand(G.companions);
    } else {
      sender = rand(G.companions);
    }
    var logText = sender.word + 'が呟いた。「' + msg.text + '」';
    G.logs.unshift({ time: now(), text: logText, isLetter: true, read: false });
    toast(logText.slice(0, 30) + '...');
  }
  saveGame();
}

function checkDungeonClear(dungName) {
  if (G.clearedDungeons.indexOf(dungName) < 0) {
    G.clearedDungeons.push(dungName);
    // ダンジョンクリアごとに瓶上限+3
    G.bottleLimit = (G.bottleLimit || 3) + 3;

    // エリア解放ポップアップ
    var dung = DUNGEONS.find(function(d){ return d.name === dungName; });
    var layerColor = (dung && LCOLOR[dung.layer]) ? LCOLOR[dung.layer] : null;
    var hexToRgba = function(hex, a) {
      if (!hex || hex.length < 7) return 'rgba(0,0,0,' + a + ')';
      var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    };

    if (dungName === '霧の入り江') {
      var survived = dungState.party.filter(function(c){ return c.hp > 0; });
      var hero = survived.length ? survived[0].word : dungState.party[0].word;
      G.logs.unshift({ time: now(), text: 'はじめての冒険を終えて、' + hero + 'は嬉しそうだ。浜辺の方から瓶の鳴る音が聞こえた。' });
      setTimeout(function(){
        showEventPopup({
          icon: '🐚', title: '霧の入り江を踏破した',
          body: hero + 'は波打ち際に立ち、振り返った。\n新しい瓶が、浜辺へ流れ着くようになった。',
          buttonLabel: '家へ帰る',
        });
      }, 1000);
    } else if (dungName === '珊瑚の迷宮') {
      var surv2 = dungState.party.filter(function(c){ return c.hp > 0; });
      var hero2 = surv2.length ? surv2[0].word : dungState.party[0].word;
      setTimeout(function(){
        showEventPopup({
          icon: '🪸', title: '珊瑚の迷宮を踏破した',
          body: '光の届かない深さから、帰ってきた。\n新しい瓶が流れ着くようになった。',
          buttonLabel: '帰還する',
          bgColor: hexToRgba('#508CA4', 0.85),
          innerBg: '#e8f4fc',
        });
      }, 1000);
    } else if (dungName === '深海神殿') {
      G.laterneUnlocked = true;
      var row = document.getElementById('laterne-row');
      if (row) row.style.display = 'block';
      G.logs.unshift({ time: now(), text: 'Laterneのお店を見つけた。チョウチンアンコウのLaterneは、にやりとした。' });
      saveGame();
      // 仲間会話シーンを先に表示（レベルアップはシーン後に）
      setTimeout(function(){
        showDeepSeaClearScene();
      }, 1000);
    } else {
      toast('新しい瓶が流れ着くようになった。（上限+3）');
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
      diary: G.diary || '',
      hasDiary: G.hasDiary || false,
      seenAdjectives: G.seenAdjectives || [],
      lastBattleLog: G.lastBattleLog,
      bottleLimit: G.bottleLimit,
      quizDoneToday: G.quizDoneToday,
      quizDoneDate: G.quizDoneDate,
      bottleRecent: G.bottleRecent || [],
      omiyageDate: G.omiyageDate || '',
      levelMsgSeen: G.levelMsgSeen || {},
      deepestFloor: G.deepestFloor || 0,
      mirrorRoomUnlocked: G.mirrorRoomUnlocked || false,
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
    G.diary = data.diary || '';
    G.hasDiary = data.hasDiary || false;
    G.seenAdjectives = data.seenAdjectives || [];
    G.lastBattleLog = data.lastBattleLog || [];
    G.bottleLimit = data.bottleLimit !== undefined ? data.bottleLimit : 6;
    G.quizDoneToday = data.quizDoneToday || {};
    G.quizDoneDate = data.quizDoneDate || '';
    G.bottleRecent = data.bottleRecent || [];
    G.omiyageDate = data.omiyageDate || '';
    G.levelMsgSeen = data.levelMsgSeen || {};
    G.deepestFloor = data.deepestFloor || 0;
    G.mirrorRoomUnlocked = data.mirrorRoomUnlocked || false;
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
      // 湖は人魚の部屋フラグが立っていれば専用モーダルへ
      if (l === '湖' && G.mirrorRoomUnlocked) {
        openMirrorRoom();
        return;
      }
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
    buyItem('塩漬けの薬草', 100, '消耗品', {type:'消耗品', icon:'🌿', desc:'HP半分以下で自動30回復（消耗品）'});
  });
  document.getElementById('btn-buy-light').addEventListener('click', function(){
    buyItem('深海の灯り', 150, '消耗品', {type:'消耗品', icon:'🔦', desc:'次のダンジョンでアイテムドロップ率UP'});
  });
  document.getElementById('btn-buy-diary').addEventListener('click', buyDiary);
  document.getElementById('btn-buy-cipher').addEventListener('click', buyCipher);
  // 日記の保存
  document.addEventListener('input', function(e) {
    if (e.target && e.target.id === 'diary-textarea') {
      G.diary = e.target.value.slice(0, 600);
      saveGame();
    }
  });
  document.getElementById('btn-send').addEventListener('click', sendParty);
}

// ── data.json読み込み ──
// 層カラーをCSSに動的注入（data.jsonの値が唯一の真実）

// ── 層の背景画像（base64 data URI。差し替え可能） ──
// 画像を追加する場合: LAYER_IMGS['層名'] = 'data:image/jpeg;base64,...';
var LAYER_IMGS = {
  '空中都市': 'data:image/jpeg;base64,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',
  '湖':       'data:image/jpeg;base64,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',
  '庭':       'data:image/jpeg;base64,/9j/4QDKRXhpZgAATU0AKgAAAAgABgESAAMAAAABAAEAAAEaAAUAAAABAAAAVgEbAAUAAAABAAAAXgEoAAMAAAABAAIAAAITAAMAAAABAAEAAIdpAAQAAAABAAAAZgAAAAAAAABIAAAAAQAAAEgAAAABAAeQAAAHAAAABDAyMjGRAQAHAAAABAECAwCgAAAHAAAABDAxMDCgAQADAAAAAQABAACgAgAEAAAAAQAAAamgAwAEAAAAAQAAAPukBgADAAAAAQAAAAAAAAAAAAD/4gIoSUNDX1BST0ZJTEUAAQEAAAIYYXBwbAQAAABtbnRyUkdCIFhZWiAH5gABAAEAAAAAAABhY3NwQVBQTAAAAABBUFBMAAAAAAAAAAAAAAAAAAAAAAAA9tYAAQAAAADTLWFwcGwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAApkZXNjAAAA/AAAADBjcHJ0AAABLAAAAFB3dHB0AAABfAAAABRyWFlaAAABkAAAABRnWFlaAAABpAAAABRiWFlaAAABuAAAABRyVFJDAAABzAAAACBjaGFkAAAB7AAAACxiVFJDAAABzAAAACBnVFJDAAABzAAAACBtbHVjAAAAAAAAAAEAAAAMZW5VUwAAABQAAAAcAEQAaQBzAHAAbABhAHkAIABQADNtbHVjAAAAAAAAAAEAAAAMZW5VUwAAADQAAAAcAEMAbwBwAHkAcgBpAGcAaAB0ACAAQQBwAHAAbABlACAASQBuAGMALgAsACAAMgAwADIAMlhZWiAAAAAAAAD21QABAAAAANMsWFlaIAAAAAAAAIPfAAA9v////7tYWVogAAAAAAAASr8AALE3AAAKuVhZWiAAAAAAAAAoOAAAEQsAAMi5cGFyYQAAAAAAAwAAAAJmZgAA8qcAAA1ZAAAT0AAACltzZjMyAAAAAAABDEIAAAXe///zJgAAB5MAAP2Q///7ov///aMAAAPcAADAbv/bAIQAAgICAgICBAICBAUEBAQFBwUFBQUHCQcHBwcHCQsJCQkJCQkLCwsLCwsLCw0NDQ0NDQ8PDw8PEREREREREREREQEDAwMEBAQHBAQHEQwKDBERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERER/90ABAAb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',
  '浜辺':     'data:image/jpeg;base64,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',
  '海':       'data:image/jpeg;base64,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',
  '深海':     'data:image/jpeg;base64,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'
};
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
    css += '.' + cls + '{background:' + bg + '!important;color:' + tc + '!important;overflow:hidden;position:relative}';
    var img = LAYER_IMGS[layer];
    if (img) {
      // 右端にぼんやり見える装飾画像（テキストの邪魔をしない）
      css += '.' + cls + '::after{'
        + 'content:"";position:absolute;right:0;top:0;bottom:0;width:55%;'
        + 'background:url(' + img + ') right center/cover no-repeat;'
        + 'opacity:0.22;'
        + 'mask-image:linear-gradient(to left,rgba(0,0,0,0.8) 0%,rgba(0,0,0,0) 100%);'
        + '-webkit-mask-image:linear-gradient(to left,rgba(0,0,0,0.8) 0%,rgba(0,0,0,0) 100%)'
        + '}';
    }
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

// ══════════════════════════════════════════════
//  人魚の部屋（専用スクリーン）
// ══════════════════════════════════════════════
var DRESSER_TEXTS = [
  '貝殻のブラシ。まだ髪の毛が残っている。',
  '読めない文字で書かれたメモ。海の言葉かもしれない。',
  'なぜか陸の花が、乾かずに咲いている。',
  '小さな鏡。映っているのは、今と少し違う海だ。',
  '真珠のボタンが三つ。どの服についていたのだろう。',
];

var MIRROR_ROOM_SPEECHES = [
  '「！」',
  '「……」',
  '「おーい」',
  '「きらきら」',
  '「……」',
  '「何する？」',
];

var _mirrorRoomSpeechTimer = null;
var _mirrorStarAnim = null;

function openMirrorRoom() {
  var screen = document.getElementById('mirror-room-screen');
  // ナビを隠してスクリーン表示
  document.querySelectorAll('.screen.active').forEach(function(s){ s.classList.remove('active'); });
  screen.classList.add('active');

  // ドレッサーと引き出しリセット
  var dresserEl = document.getElementById('mirror-room-dresser');
  var drawerEl  = document.getElementById('mirror-room-drawer-text');
  if (dresserEl) dresserEl.style.display = 'block';
  if (drawerEl)  { drawerEl.style.display = 'none'; drawerEl.textContent = ''; }

  // 宝貝を配置
  var shellsEl = document.getElementById('mirror-room-shells');
  if (shellsEl) {
    shellsEl.innerHTML = ['🐚','🦪','🪸','🌟','💫'].map(function(emoji, i) {
      return '<div style="font-size:' + (20 + Math.floor(Math.random()*10)) + 'px;opacity:' + (0.5 + Math.random()*0.5).toFixed(2)
        + ';animation:float' + (i%3) + ' ' + (2.5+i*0.4).toFixed(1) + 's ease-in-out infinite;cursor:default">' + emoji + '</div>';
    }).join('');
  }

  // 仲間スプライトを表示（最大6体、湖層優先）
  var spritesEl = document.getElementById('mirror-room-sprites');
  var pool = G.companions.filter(function(c){ return c.status === '正式加入' || c.status === '仮加入'; });
  var lake  = pool.filter(function(c){ return c.layer === '湖'; });
  var others = pool.filter(function(c){ return c.layer !== '湖'; });
  var shown = lake.concat(others).slice(0, 6);
  if (!shown.length) shown = pool.slice(0, 6);
  if (spritesEl) {
    spritesEl.innerHTML = shown.map(function(c, idx) {
      var layerColor = LCOLOR[c.layer] || '#c8b89a';
      var dur = (2.0 + idx * 0.38).toFixed(2);
      return '<div style="display:flex;flex-direction:column;align-items:center;gap:4px">'
        + '<div style="background:' + layerColor + ';width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;'
        + 'animation:float' + (idx%3) + ' ' + dur + 's ease-in-out infinite;box-shadow:0 0 12px rgba(180,100,255,0.4)">'
        + '<img src="' + spriteURL(c.word, c.article, c.layer, c.level) + '" style="width:30px;height:30px;image-rendering:pixelated" alt="">'
        + '</div>'
        + '<div style="font-size:9px;color:#a080c8">' + c.word + '</div>'
        + '</div>';
    }).join('');
  }

  // 仲間のセリフをランダムに切り替え
  var speechEl = document.getElementById('mirror-room-speech');
  if (speechEl && shown.length) {
    var pickSpeech = function() {
      var c = shown[Math.floor(Math.random() * shown.length)];
      var s = MIRROR_ROOM_SPEECHES[Math.floor(Math.random() * MIRROR_ROOM_SPEECHES.length)];
      speechEl.textContent = c.word + ' — ' + s;
    };
    pickSpeech();
    if (_mirrorRoomSpeechTimer) clearInterval(_mirrorRoomSpeechTimer);
    _mirrorRoomSpeechTimer = setInterval(pickSpeech, 4000);
  }

  // 星のカーテンアニメーション
  var canvas = document.getElementById('mirror-room-stars');
  if (canvas) {
    canvas.width  = canvas.offsetWidth  || 400;
    canvas.height = canvas.offsetHeight || 700;
    var ctx = canvas.getContext('2d');
    var stars = [];
    for (var i = 0; i < 120; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.8 + 0.3,
        speed: Math.random() * 0.4 + 0.1,
        phase: Math.random() * Math.PI * 2,
        color: ['#e0d0ff','#c0e0ff','#ffd8f0','#fffce0'][Math.floor(Math.random()*4)],
      });
    }
    var frameId;
    var drawStars = function(t) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach(function(s) {
        var alpha = 0.4 + 0.6 * Math.abs(Math.sin(t * s.speed * 0.001 + s.phase));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y + Math.sin(t * s.speed * 0.0008 + s.phase) * 6, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      frameId = requestAnimationFrame(drawStars);
    };
    if (_mirrorStarAnim) cancelAnimationFrame(_mirrorStarAnim);
    _mirrorStarAnim = requestAnimationFrame(drawStars);
  }
}

function openDresserDrawer() {
  var dresserEl = document.getElementById('mirror-room-dresser');
  var drawerEl  = document.getElementById('mirror-room-drawer-text');
  if (!drawerEl) return;
  var text = DRESSER_TEXTS[Math.floor(Math.random() * DRESSER_TEXTS.length)];
  drawerEl.textContent = '「' + text + '」';
  drawerEl.style.display = 'block';
  if (dresserEl) dresserEl.style.display = 'none';
}

function closeMirrorRoomScreen() {
  if (_mirrorRoomSpeechTimer) { clearInterval(_mirrorRoomSpeechTimer); _mirrorRoomSpeechTimer = null; }
  if (_mirrorStarAnim) { cancelAnimationFrame(_mirrorStarAnim); _mirrorStarAnim = null; }
  var screen = document.getElementById('mirror-room-screen');
  screen.classList.remove('active');
  showScreen('world-screen');
}

// 旧モーダル互換（呼び出し箇所があれば）
function closeMirrorRoom() { closeMirrorRoomScreen(); }

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

// ──────────────────────────────────────────────
//  レベルアップポップアップ
// ──────────────────────────────────────────────
var _lvQueue = [];

function startLevelUpQueue(queue) {
  _lvQueue = queue || [];
  showNextLevelUpPopup();
}

function showNextLevelUpPopup() {
  if (!_lvQueue.length) {
    // キューが空になったらトースト
    toast('探索完了！ログを確認しよう');
    return;
  }
  var entry = _lvQueue.shift(); // { word, level }
  // G.companionsから該当仲間を探す
  var c = G.companions.find(function(x){ return x.word === entry.word; });
  if (!c) { showNextLevelUpPopup(); return; } // 見つからなければスキップ

  var popup = document.getElementById('levelup-popup');
  var layerColor = LCOLOR[c.layer] || '#c8b89a';

  // アバター（大きめ・64px）
  var avatarEl = document.getElementById('levelup-avatar');
  avatarEl.innerHTML = '<div style="background:' + layerColor + ';width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 4px #fff,0 0 0 6px ' + layerColor + '44">'
    + '<img src="' + spriteURL(c.word, c.article, c.layer, c.level) + '" style="width:46px;height:46px;image-rendering:pixelated" alt="">'
    + '</div>';

  // 仲間名・レベル
  document.getElementById('levelup-name').textContent = c.word;
  document.getElementById('levelup-lv').textContent = 'Lv. ' + c.level + ' になった';

  // セリフ
  var speech = companionSpeech(c);
  document.getElementById('levelup-speech').textContent = speech || '';

  // 表示
  popup.style.display = 'flex';
}

function closeLevelUpPopup() {
  var popup = document.getElementById('levelup-popup');
  popup.style.display = 'none';
  // 次のポップアップへ（少し間を置く）
  setTimeout(showNextLevelUpPopup, 300);
}

// ══════════════════════════════════════════════
//  汎用演出ポップアップ（showEventPopup）
// ══════════════════════════════════════════════
var _eventQueue = [];

// config = { icon, title, body, buttonLabel, onClose, bgColor, textColor }
function showEventPopup(config) {
  var popup = document.getElementById('event-popup');
  var bg    = document.getElementById('event-popup-bg');
  var inner = document.getElementById('event-popup-inner');
  document.getElementById('event-popup-icon').textContent  = config.icon  || '';
  document.getElementById('event-popup-title').textContent = config.title || '';
  document.getElementById('event-popup-body').innerHTML    = (config.body  || '').replace(/\n/g, '<br>');
  var btn = document.getElementById('event-popup-btn');
  btn.textContent = config.buttonLabel || '閉じる';

  // 背景色・テキスト色カスタマイズ
  if (config.bgColor) {
    bg.style.background = config.bgColor;
    inner.style.background = config.innerBg || '#f5f0e8';
  } else {
    bg.style.background = 'rgba(0,0,0,0.65)';
    inner.style.background = '#f5f0e8';
  }
  if (config.dark) {
    inner.style.background = config.innerBg || '#0d1a2e';
    document.getElementById('event-popup-title').style.color = config.titleColor || '#b8d4f0';
    document.getElementById('event-popup-body').style.color  = config.bodyColor  || '#6a9abf';
    btn.style.background = '#2d6a8f';
    btn.style.color = '#e8f4fc';
  } else {
    document.getElementById('event-popup-title').style.color = '#2c2416';
    document.getElementById('event-popup-body').style.color  = '#4a3c2e';
    btn.style.background = '#2c2416';
    btn.style.color = '#f5f0e8';
  }

  popup.style.display = 'flex';

  // ボタンを付け替え（都度addEventListenerしないようにcloneで）
  var newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', function() {
    popup.style.display = 'none';
    if (typeof config.onClose === 'function') config.onClose();
    // キューに続きがあれば次を表示
    if (_eventQueue.length) {
      var next = _eventQueue.shift();
      setTimeout(function(){ showEventPopup(next); }, 300);
    }
  });
}

// キューに積んで順番に表示
function queueEventPopup(config) {
  _eventQueue.push(config);
}

// キューを開始（最初の1個を表示）
function startEventQueue(configs) {
  if (!configs || !configs.length) return;
  _eventQueue = configs.slice(1);
  showEventPopup(configs[0]);
}

// ══════════════════════════════════════════════
//  深海クリア → 水鏡の路開放 仲間会話シーン
// ══════════════════════════════════════════════
function showDeepSeaClearScene() {
  var comps = G.companions.filter(function(c){ return c.status === '正式加入' || c.status === '仮加入'; });
  if (!comps.length) {
    // 仲間がいなければ単純トーストで終わり
    setTimeout(function(){ toast('湖の層に、扉が現れた。'); }, 600);
    return;
  }

  var used = [];

  // 1体目：湖層の仲間（いなければ全体からランダム）
  var lakeComps = comps.filter(function(c){ return c.layer === '湖'; });
  var c1 = lakeComps.length ? rand(lakeComps) : rand(comps);
  used.push(c1.word);

  // 2体目：高レベルの仲間（1体目と別）
  var c2candidates = comps.filter(function(c){ return used.indexOf(c.word) < 0; })
    .sort(function(a,b){ return b.level - a.level; });
  var c2 = c2candidates.length ? c2candidates[0] : null;
  if (c2) used.push(c2.word);

  // 3体目：浅い層・低レベル（1・2体目と別）
  var shallowLayers = ['空中都市','庭','浜辺'];
  var c3candidates = comps.filter(function(c){ return used.indexOf(c.word) < 0 && shallowLayers.indexOf(c.layer) >= 0; });
  if (!c3candidates.length) c3candidates = comps.filter(function(c){ return used.indexOf(c.word) < 0; });
  c3candidates.sort(function(a,b){ return a.level - b.level; });
  var c3 = c3candidates.length ? c3candidates[0] : null;

  // ポップアップを順番に組み立て
  var popups = [];

  function makeAvatar(c, sz) {
    sz = sz || 48;
    var layerColor = LCOLOR[c.layer] || '#c8b89a';
    return '<div style="display:inline-flex;align-items:center;justify-content:center;background:' + layerColor + ';width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;margin:0 auto 8px;box-shadow:0 0 0 3px #fff">'
      + '<img src="' + spriteURL(c.word, c.article, c.layer, c.level) + '" style="width:' + Math.round(sz*0.72) + 'px;height:' + Math.round(sz*0.72) + 'px;image-rendering:pixelated" alt="">'
      + '</div>';
  }

  // 1体目セリフ
  popups.push({
    icon: '', title: c1.word,
    body: makeAvatar(c1) + '「' + c1.word + '……この路は、迷路だと思う、知ってるよ。\n迷うかもしれない。でも探してる宝物がある。」',
    buttonLabel: '…',
    bodyColor: '#4a3c2e', titleColor: '#2c2416',
  });

  // 2体目セリフ
  if (c2) {
    popups.push({
      icon: '', title: c2.word,
      body: makeAvatar(c2) + '「行こう。' + c1.word + 'がそう言っている。」',
      buttonLabel: '…',
    });
  }

  // 3体目セリフ
  if (c3) {
    popups.push({
      icon: '', title: c3.word,
      body: makeAvatar(c3) + '「こわい？　でも……行く。' + c3.word + 'だから、行く。」',
      buttonLabel: '…',
    });
  }

  // プレイヤー
  popups.push({
    title: G.playerName || 'あなた',
    body: '湖の層に、扉が現れた。',
    buttonLabel: '応援するよ',
    onClose: function() {
      // 仲間会話シーンが終わってからレベルアップを表示
      if (window._pendingLvQueue && window._pendingLvQueue.length) {
        startLevelUpQueue(window._pendingLvQueue);
        window._pendingLvQueue = null;
      }
    }
  });

  setTimeout(function(){ startEventQueue(popups); }, 800);
}

// ══════════════════════════════════════════════
//  水鏡の路 50階エンディング
// ══════════════════════════════════════════════
function showMirrorEndingModal() {
  mirrorState.paused = true;
  var modal = document.getElementById('mirror-ending-modal');

  document.getElementById('mirror-ending-title').textContent = '50階──人魚のドレッサーがある部屋';
  document.getElementById('mirror-ending-body').innerHTML =
    '水鏡の路は、ここで終わっていた。<br><br>'
    + '薄明かりの中に、白いドレッサーが置いてある。<br>'
    + '貝殻と海草で飾られた、誰かのものだった部屋。';

  // 仲間のセリフ
  var alive = mirrorState.party.filter(function(c){ return c.hp > 0; });
  var speaker = alive.length ? alive[0] : (mirrorState.party[0] || null);
  var companionEl = document.getElementById('mirror-ending-companion');
  companionEl.textContent = speaker ? '「' + speaker.word + '素敵な場所……ここでみんなで遊びたい。<br>……引き出しを開けてみよう。」' : '';

  var actionsEl = document.getElementById('mirror-ending-actions');
  actionsEl.innerHTML =
    '<button id="btn-mirror-drawer" style="background:#162840;border:1px solid #4a7aaa;border-radius:14px;padding:14px 16px;color:#b8d4f0;font-size:14px;cursor:pointer;font-family:Georgia,serif;letter-spacing:1px">引き出しを開ける</button>';

  modal.style.display = 'flex';

  document.getElementById('btn-mirror-drawer').addEventListener('click', function() {
    // ステップ2：引き出しの中身
    document.getElementById('mirror-ending-body').innerHTML =
      'なぜか、陸の花が乾かずに咲いている。<br>'
      + '種の入った小さな袋もある。<br><br>'
      + '貝殻のブラシには、まだ髪の毛が残っていた。';
    companionEl.textContent = speaker ? '「' + speaker.word + '……庭に植えてみよう。」' : '「庭に植えてみよう。」';
    actionsEl.innerHTML =
      '<button id="btn-mirror-plant" style="background:#0a2a14;border:1px solid #2a7a3a;border-radius:14px;padding:14px 16px;color:#80e0a0;font-size:14px;cursor:pointer;font-family:Georgia,serif;letter-spacing:1px">種を植える</button>';

    document.getElementById('btn-mirror-plant').addEventListener('click', function() {
      modal.style.display = 'none';
      // 夜の森解放 & mirrorRoomUnlocked
      G.mirrorRoomUnlocked = true;
      G.logs.unshift({ time: now(), text: '水鏡の路の最奥で、人魚の部屋を見つけた。種を庭に植えた。<br>これからは、湖から人魚の部屋に、いつでも行ける。' });
      saveGame();
      toast('庭が、森を教えてくれる。');
      // 帰還処理（ミラーダンジョン終了）
      finishMirrorDungeon(true);
    });
  });
}
