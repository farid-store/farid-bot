// ═══════════════════════════════════════════════════════════════════
//  FARID STORE BOT V10 — Full Admin Edition
//  Vercel Serverless Webhook Handler
// ═══════════════════════════════════════════════════════════════════

import fetch from 'node-fetch';

// ── CONFIG ──────────────────────────────────────────────────────────
const BOT_TOKEN  = process.env.BOT_TOKEN;
const ADMIN_IDS  = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const BIN_ID     = process.env.BIN_ID     || '699644fdae596e708f3582af';
const JSONBIN_KEY = process.env.JSONBIN_KEY || '$2a$10$tcKHEWwuz2sqRoMCKJfga.1xxTFW0RxpXUPnP.NI4YbivtlK1xxau';

const TG   = `https://api.telegram.org/bot${BOT_TOKEN}`;
const BIN  = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

const GOAL = 100_000_000;
const MILESTONES = [10,20,30,40,50,60,75,90].map(v => v * 1_000_000);

const BRAND_ICONS = {
  Apple:'🍎', Samsung:'🌌', Xiaomi:'🟠', Oppo:'🟢', Vivo:'🔵',
  Realme:'🟡', Infinix:'⚡', Tecno:'🔷', iTel:'⬛', Other:'📦'
};

// Session state per user (in-memory, reset on cold start)
const sessions = {};

// ── UTILS ────────────────────────────────────────────────────────────
const rp = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(n||0);
const rpShort = n => {
  if (!n) return 'Rp 0';
  if (n >= 1e9) return `Rp ${(n/1e9).toFixed(1)} M`;
  if (n >= 1e6) return `Rp ${(n/1e6).toFixed(1)} Jt`;
  if (n >= 1e3) return `Rp ${(n/1e3).toFixed(0)} Rb`;
  return `Rp ${n}`;
};

const pct = (n,d) => d > 0 ? Math.min(100,(n/d*100)).toFixed(1) : '0.0';

const bar = (val, max, len=10) => {
  const filled = Math.round(Math.min(val/max,1)*len);
  return '█'.repeat(filled) + '░'.repeat(len-filled);
};

const now = () => new Date();
const mkStr = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const monthLabel = mk => {
  const [y,m] = mk.split('-');
  const names = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${names[+m-1]} ${y}`;
};
const longMonth = mk => {
  const [y,m] = mk.split('-');
  const names = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  return `${names[+m-1]} ${y}`;
};

function getBrand(name) {
  const n = name.toUpperCase();
  if (n.includes('IPHONE')||n.includes('APPLE')||n.includes('IPAD')) return 'Apple';
  if (n.includes('SAMSUNG')||n.includes('GALAXY')||n.startsWith('SAM ')) return 'Samsung';
  if (n.includes('XIAOMI')||n.includes('REDMI')||n.includes('POCO')||n.includes('MI ')) return 'Xiaomi';
  if (n.includes('OPPO')||n.includes('RENO')) return 'Oppo';
  if (n.includes('VIVO')||n.includes('IQOO')) return 'Vivo';
  if (n.includes('REALME')||n.includes('NARZO')) return 'Realme';
  if (n.includes('INFINIX')) return 'Infinix';
  if (n.includes('TECNO')) return 'Tecno';
  if (n.includes('ITEL')) return 'iTel';
  return 'Other';
}

function parseDate(s) {
  if (!s || s === 'Imported') return new Date();
  if (s.includes('-') && s.length === 10) return new Date(s+'T00:00:00');
  const p = s.split(' ')[0].split('/');
  if (p.length === 3) return new Date(+p[2], +p[1]-1, +p[0]);
  return new Date();
}

// ── JSONBIN API ──────────────────────────────────────────────────────
async function getData() {
  const r = await fetch(`${BIN}/latest`, {
    headers: { 'X-Master-Key': JSONBIN_KEY }
  });
  if (!r.ok) throw new Error(`JSONBin GET failed: ${r.status}`);
  const j = await r.json();
  return j.record;
}

async function putData(db) {
  const r = await fetch(BIN, {
    method: 'PUT',
    headers: { 'Content-Type':'application/json', 'X-Master-Key': JSONBIN_KEY },
    body: JSON.stringify(db)
  });
  if (!r.ok) throw new Error(`JSONBin PUT failed: ${r.status}`);
  return r.json();
}

// ── TELEGRAM API ─────────────────────────────────────────────────────
async function tg(method, body) {
  const r = await fetch(`${TG}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
}

const send      = (chat, text, extra={}) => tg('sendMessage', { chat_id:chat, text, parse_mode:'HTML', ...extra });
const edit      = (chat, msg, text, extra={}) => tg('editMessageText', { chat_id:chat, message_id:msg, text, parse_mode:'HTML', ...extra });
const editKb    = (chat, msg, kb) => tg('editMessageReplyMarkup', { chat_id:chat, message_id:msg, reply_markup:{ inline_keyboard:kb } });
const answer    = (id, text='', alert=false) => tg('answerCallbackQuery', { callback_query_id:id, text, show_alert:alert });
const deleteMsg = (chat, msg) => tg('deleteMessage', { chat_id:chat, message_id:msg });

// ── AUTH ─────────────────────────────────────────────────────────────
const isAdmin = uid => ADMIN_IDS.includes(String(uid)) || ADMIN_IDS.length === 0;

// ── DATA COMPUTATION ──────────────────────────────────────────────────
function compute(db) {
  const nowDate = new Date();
  const nowMk   = mkStr();

  let monthly = {}, brands = {}, allTx = [];
  let startBal = Number(db.startBalance)||0;
  let belanja=0, income=0, profitMain=0, profitExtra=0;
  let floatModal=0, floatPrice=0, totalUnit=0;
  let agingStocks = [];

  for (const i of (db.items||[])) {
    const ts = i.id ? Math.floor(i.id) : Date.now();
    if (i.status === 'sold') {
      totalUnit++;
      if (i.type === 'new') { belanja += i.modal; allTx.push({id:ts,name:i.name,type:'buy',amount:i.modal}); }
      income += i.price;
      const p = i.price - i.modal;
      profitMain += p;
      const brand = getBrand(i.name);
      if (!brands[brand]) brands[brand] = {profit:0,count:0,revenue:0};
      brands[brand].profit  += p;
      brands[brand].count++;
      brands[brand].revenue += i.price;
      const soldD = parseDate(i.soldAt);
      const mk    = mkStr(soldD);
      allTx.push({id:soldD.getTime(), name:i.name, type:'sold', amount:i.price, profit:p, mk});
      if (!monthly[mk]) monthly[mk] = {units:0,profit:0,income:0,expense:0};
      monthly[mk].units++;
      monthly[mk].profit  += p;
      monthly[mk].income  += i.price;
      monthly[mk].expense += i.modal;
    } else if (i.status === 'stok') {
      if (i.type === 'new') { belanja += i.modal; allTx.push({id:ts,name:i.name,type:'buy',amount:i.modal}); }
      floatPrice += i.price;
      floatModal += i.modal;
      const ageDays = i.id ? Math.floor((nowDate - new Date(Math.floor(i.id)))/86400000) : 0;
      agingStocks.push({name:i.name, modal:i.modal, price:i.price, days:ageDays, id:i.id, brand:getBrand(i.name)});
    }
  }

  for (const p of (db.extraProfits||[])) {
    profitExtra += p.profit;
    totalUnit++;
    const d  = new Date(Math.floor(p.id));
    const mk = mkStr(d);
    allTx.push({id:Math.floor(p.id), name:p.name||'Laba Jasa', type:'extra', amount:p.profit, mk});
    if (!monthly[mk]) monthly[mk] = {units:0,profit:0,income:0,expense:0};
    monthly[mk].profit  += p.profit;
    monthly[mk].units++;
    monthly[mk].income  += p.profit;
  }

  const totalProfit = profitMain + profitExtra;
  const cashSisa    = startBal - belanja + income;
  const totalAset   = cashSisa + floatPrice;
  const avgMargin   = totalUnit > 0 ? totalProfit / totalUnit : 0;

  agingStocks.sort((a,b) => b.days - a.days);
  allTx.sort((a,b) => b.id - a.id);

  const curMonth = monthly[nowMk] || {units:0,profit:0,income:0,expense:0};

  // Milestone
  const prevMil = MILESTONES.filter(m => m <= totalAset).at(-1) || 0;
  const nextMil = MILESTONES.find(m => m > totalAset) || GOAL;

  return {
    monthly, brands, allTx,
    startBal, belanja, income, profitMain, profitExtra, totalProfit,
    floatModal, floatPrice, cashSisa, totalAset, totalUnit, avgMargin,
    agingStocks, curMonth, nowMk, prevMil, nextMil,
    stokCount: (db.items||[]).filter(i => i.status==='stok').length,
    soldCount: totalUnit,
  };
}

// ══════════════════════════════════════════════════════════════════════
//  MESSAGES
// ══════════════════════════════════════════════════════════════════════

// ── MENU UTAMA ────────────────────────────────────────────────────────
function menuUtama() {
  return {
    text: `🏪 <b>FARID STORE</b> — Admin Panel\n━━━━━━━━━━━━━━━━━━━━━\nPilih menu yang ingin kamu akses:`,
    kb: [
      [{ text:'📊 Dashboard', callback_data:'menu_dashboard' }, { text:'📦 Stok & Inventori', callback_data:'menu_stok' }],
      [{ text:'💳 Transaksi', callback_data:'menu_transaksi' }, { text:'📈 Analitik', callback_data:'menu_analitik' }],
      [{ text:'➕ Catat Masuk', callback_data:'aksi_masuk' },   { text:'✅ Tandai Terjual', callback_data:'aksi_terjual' }],
      [{ text:'💰 Laba Jasa', callback_data:'aksi_ekstra' },    { text:'⚙️ Pengaturan', callback_data:'menu_settings' }],
      [{ text:'🔄 Refresh Data', callback_data:'refresh' }]
    ]
  };
}

// ── DASHBOARD ─────────────────────────────────────────────────────────
async function msgDashboard(db) {
  const c = compute(db);
  const pctGoal  = pct(c.totalAset, GOAL);
  const barGoal  = bar(c.totalAset, GOAL, 12);
  const pctMil   = pct(c.totalAset - c.prevMil, c.nextMil - c.prevMil, 12);
  const barMil   = bar(c.totalAset - c.prevMil, c.nextMil - c.prevMil, 12);

  // ETA estimate
  const sortedMks = Object.keys(c.monthly).sort().slice(-3);
  const avg3 = sortedMks.reduce((s,k) => s + c.monthly[k].profit, 0) / (sortedMks.length || 1);
  let etaStr = '—';
  if (c.totalAset >= GOAL) etaStr = '✅ TERCAPAI!';
  else if (avg3 > 0) {
    const d = new Date(); d.setMonth(d.getMonth() + Math.ceil((GOAL - c.totalAset)/avg3));
    etaStr = longMonth(mkStr(d));
  }

  const curMk = c.nowMk;
  const cm    = c.curMonth;

  const txt = `
🏪 <b>FARID STORE — DASHBOARD</b>
━━━━━━━━━━━━━━━━━━━━━━━━━

💰 <b>TOTAL ASET</b>
${rp(c.totalAset)}
<code>${barGoal}</code> ${pctGoal}% dari 100Jt

🏁 <b>MILESTONE BERIKUTNYA</b>
Target → ${rp(c.nextMil)}
<code>${barMil}</code> ${pct(c.totalAset - c.prevMil, c.nextMil - c.prevMil)}%
📅 ETA: <b>${etaStr}</b>

📊 <b>BREAKDOWN ASET</b>
├ 💵 Kas Tunai: ${rp(c.cashSisa)}
└ 📦 Nilai Stok: ${rp(c.floatPrice)}

📈 <b>LABA AKUMULASI</b>
${rp(c.totalProfit)} dari ${c.totalUnit} unit
Rata-rata margin: ${rpShort(c.avgMargin)}/unit

📅 <b>BULAN INI</b> (${longMonth(curMk)})
├ 💚 Omset: ${rp(cm.income)}
├ ❤️ HPP: ${rp(cm.expense)}
├ 💛 Laba: ${rp(cm.profit)}
└ 📦 Terjual: ${cm.units} unit

🗃️ <b>STOK GUDANG</b>
${c.stokCount} item • Modal: ${rp(c.floatModal)} • Harga: ${rp(c.floatPrice)}
`.trim();

  return {
    text: txt,
    kb: [
      [{ text:'📈 Analitik Detail', callback_data:'menu_analitik' }, { text:'💳 Transaksi', callback_data:'menu_transaksi' }],
      [{ text:'📦 Lihat Stok', callback_data:'stok_list_1' }, { text:'⏳ Stok Lama', callback_data:'stok_aging' }],
      [{ text:'🔄 Refresh', callback_data:'dash_refresh' }, { text:'🏠 Menu', callback_data:'menu_utama' }]
    ]
  };
}

// ── STOK MENU ────────────────────────────────────────────────────────
async function msgStokMenu(db) {
  const c = compute(db);
  const items = (db.items||[]).filter(i => i.status==='stok');
  const byBrand = {};
  items.forEach(i => { const b = getBrand(i.name); if(!byBrand[b]) byBrand[b]={count:0,modal:0}; byBrand[b].count++; byBrand[b].modal+=i.modal; });

  let brandRows = Object.entries(byBrand).sort((a,b)=>b[1].count-a[1].count)
    .map(([b,v]) => `${BRAND_ICONS[b]||'📦'} ${b}: ${v.count} unit • ${rpShort(v.modal)}`).join('\n');

  const txt = `
📦 <b>MANAJEMEN STOK GUDANG</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
Total: <b>${items.length} item</b>
Modal: ${rp(c.floatModal)} | Harga Jual: ${rp(c.floatPrice)}
Potensi Laba: ${rp(c.floatPrice - c.floatModal)}

📊 <b>KOMPOSISI MEREK</b>
${brandRows || '—'}
`.trim();

  return {
    text: txt,
    kb: [
      [{ text:'📋 Daftar Semua Stok', callback_data:'stok_list_1' }],
      [{ text:'⏳ Stok Mengendap (>14 hari)', callback_data:'stok_aging' }],
      [{ text:'🔍 Cari Stok', callback_data:'stok_cari' }],
      [{ text:'➕ Catat Barang Masuk', callback_data:'aksi_masuk' }],
      [{ text:'✅ Tandai Terjual', callback_data:'aksi_terjual' }],
      [{ text:'🔄 Refresh', callback_data:'menu_stok' }, { text:'🏠 Menu', callback_data:'menu_utama' }]
    ]
  };
}

// ── DAFTAR STOK (PAGINATED) ──────────────────────────────────────────
async function msgStokList(db, page=1) {
  const LIMIT = 8;
  const items = (db.items||[]).filter(i => i.status==='stok');
  items.sort((a,b) => (a.id||0) - (b.id||0));

  const total = items.length;
  const pages = Math.ceil(total/LIMIT) || 1;
  const p     = Math.min(Math.max(page,1), pages);
  const slice = items.slice((p-1)*LIMIT, p*LIMIT);

  let rows = slice.map((i,idx) => {
    const no   = (p-1)*LIMIT + idx + 1;
    const days = i.id ? Math.floor((new Date()-new Date(Math.floor(i.id)))/86400000) : 0;
    const age  = days > 30 ? '🔴' : days > 14 ? '🟡' : '🟢';
    return `${no}. ${age} <b>${i.name}</b>\n    Modal: ${rpShort(i.modal)} → Jual: ${rpShort(i.price)} (${days}hr)`;
  }).join('\n\n');

  const txt = `
📦 <b>DAFTAR STOK</b> (hal. ${p}/${pages})
━━━━━━━━━━━━━━━━━━━━━━━━━
${rows || 'Stok kosong!'}
━━━━━━━━━━━━━━━━━━━━━━━━━
🟢 < 14hr  🟡 14-30hr  🔴 > 30hr
Total: ${total} item
`.trim();

  const navRow = [];
  if (p > 1)     navRow.push({ text:'⬅️ Sebelumnya', callback_data:`stok_list_${p-1}` });
  if (p < pages) navRow.push({ text:'Selanjutnya ➡️', callback_data:`stok_list_${p+1}` });

  const kb = [];
  if (navRow.length) kb.push(navRow);
  kb.push([{ text:'📦 Menu Stok', callback_data:'menu_stok' }, { text:'🏠 Menu', callback_data:'menu_utama' }]);

  return { text: txt.trim(), kb };
}

// ── STOK AGING ───────────────────────────────────────────────────────
async function msgStokAging(db) {
  const c     = compute(db);
  const aging = c.agingStocks;

  if (aging.length === 0) {
    return {
      text: `⏳ <b>STOK MENGENDAP</b>\n\nTidak ada stok yang mengendap. Perputaran barang lancar! ✅`,
      kb: [[{ text:'📦 Stok', callback_data:'menu_stok' }, { text:'🏠 Menu', callback_data:'menu_utama' }]]
    };
  }

  const rows = aging.slice(0,12).map((i,idx) => {
    const icon = i.days > 30 ? '🔴' : i.days > 14 ? '🟡' : '🟢';
    return `${idx+1}. ${icon} <b>${i.name}</b>\n    Modal: ${rpShort(i.modal)} | <b>${i.days} hari</b>`;
  }).join('\n\n');

  const over30 = aging.filter(i => i.days > 30).length;
  const over14 = aging.filter(i => i.days > 14 && i.days <= 30).length;

  return {
    text: `
⏳ <b>STOK MENGENDAP</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 > 30 hari: ${over30} item
🟡 14–30 hari: ${over14} item

${rows}
`.trim(),
    kb: [
      [{ text:'✅ Tandai Terjual', callback_data:'aksi_terjual' }],
      [{ text:'📦 Stok', callback_data:'menu_stok' }, { text:'🏠 Menu', callback_data:'menu_utama' }]
    ]
  };
}

// ── TRANSAKSI MENU ───────────────────────────────────────────────────
async function msgTransaksi(db) {
  const c   = compute(db);
  const tx5 = c.allTx.slice(0, 5);

  const rows = tx5.map(tx => {
    const icon  = tx.type==='sold' ? '📤' : tx.type==='buy' ? '📥' : '⭐';
    const sign  = tx.type==='buy' ? '-' : '+';
    const d     = new Date(tx.id);
    const ds    = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
    const extra = tx.type==='sold' ? ` (laba: ${rpShort(tx.profit)})` : '';
    return `${icon} ${ds} <b>${tx.name}</b>\n    ${sign}${rpShort(tx.amount)}${extra}`;
  }).join('\n\n');

  return {
    text: `
💳 <b>MUTASI TRANSAKSI</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📤 Keluar (pembelian): ${rp(c.belanja)}
📥 Masuk (penjualan): ${rp(c.income)}
⭐ Laba Ekstra: ${rp(c.profitExtra)}

<b>5 TRANSAKSI TERAKHIR</b>
${rows || '—'}
`.trim(),
    kb: [
      [{ text:'📊 Semua Tx (10 terakhir)', callback_data:'tx_list_10' }],
      [{ text:'📅 Filter Bulan Ini', callback_data:'tx_bulan_ini' }],
      [{ text:'💰 Arus Kas per Bulan', callback_data:'tx_cashflow' }],
      [{ text:'➕ Catat Masuk', callback_data:'aksi_masuk' }, { text:'✅ Terjual', callback_data:'aksi_terjual' }],
      [{ text:'⭐ Laba Jasa', callback_data:'aksi_ekstra' }],
      [{ text:'🏠 Menu', callback_data:'menu_utama' }]
    ]
  };
}

// ── TX LIST ──────────────────────────────────────────────────────────
async function msgTxList(db, limit=10) {
  const c  = compute(db);
  const tx = c.allTx.slice(0, limit);

  const rows = tx.map((tx, idx) => {
    const icon = tx.type==='sold' ? '📤' : tx.type==='buy' ? '📥' : '⭐';
    const sign = tx.type==='buy' ? '−' : '+';
    const d    = new Date(tx.id);
    const ds   = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    const extra = tx.type==='sold' ? `\n    💛 Laba: ${rpShort(tx.profit)}` : '';
    return `${idx+1}. ${icon} <b>${tx.name}</b>\n    📅 ${ds} | ${sign}${rp(tx.amount)}${extra}`;
  }).join('\n\n');

  return {
    text: `💳 <b>${limit} TRANSAKSI TERAKHIR</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n${rows || '—'}`,
    kb: [
      [{ text:'💳 Menu Tx', callback_data:'menu_transaksi' }, { text:'🏠 Menu', callback_data:'menu_utama' }]
    ]
  };
}

// ── CASHFLOW PER BULAN ────────────────────────────────────────────────
async function msgCashflow(db) {
  const c   = compute(db);
  const mks = Object.keys(c.monthly).sort().reverse().slice(0, 6);

  const rows = mks.map(mk => {
    const m   = c.monthly[mk];
    const net = m.income - m.expense;
    const icon = net > 0 ? '✅' : '❌';
    return `${icon} <b>${longMonth(mk)}</b>\n  💚 Omset: ${rpShort(m.income)} | ❤️ HPP: ${rpShort(m.expense)}\n  💛 Laba: ${rpShort(m.profit)} | 📦 ${m.units} unit`;
  }).join('\n\n');

  return {
    text: `💰 <b>ARUS KAS PER BULAN</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n${rows || '—'}`,
    kb: [
      [{ text:'💳 Menu Tx', callback_data:'menu_transaksi' }, { text:'🏠 Menu', callback_data:'menu_utama' }]
    ]
  };
}

// ── ANALITIK ──────────────────────────────────────────────────────────
async function msgAnalitik(db) {
  const c = compute(db);

  // Top brands
  const bArr = Object.entries(c.brands).sort((a,b) => b[1].profit - a[1].profit).slice(0,5);
  const brandRows = bArr.map(([b,v], i) => {
    const medal = ['🥇','🥈','🥉','4️⃣','5️⃣'][i];
    const icon  = BRAND_ICONS[b]||'📦';
    return `${medal} ${icon} <b>${b}</b>\n   Laba: ${rp(v.profit)} | ${v.count} unit`;
  }).join('\n\n');

  // Monthly trend (last 4)
  const sortedMks = Object.keys(c.monthly).sort().slice(-4);
  const trendRows = sortedMks.reverse().map(mk => {
    const m   = c.monthly[mk];
    const bLen = bar(m.profit, Math.max(...sortedMks.map(k => c.monthly[k].profit||0)), 8);
    return `📅 <b>${monthLabel(mk)}</b>: ${rpShort(m.profit)}\n  <code>${bLen}</code> ${m.units}unit`;
  }).join('\n\n');

  // Aging summary
  const over30 = c.agingStocks.filter(i => i.days > 30).length;
  const over14 = c.agingStocks.filter(i => i.days > 14 && i.days <= 30).length;

  return {
    text: `
📈 <b>ANALITIK LENGKAP</b>
━━━━━━━━━━━━━━━━━━━━━━━━━

🔥 <b>TOP MEREK (ALL TIME)</b>
${brandRows || '—'}

📊 <b>TREN LABA 4 BULAN</b>
${trendRows || '—'}

⚠️ <b>PERINGATAN STOK</b>
🔴 Mengendap > 30hr: ${over30} item
🟡 Mengendap 14-30hr: ${over14} item
Total stok: ${c.stokCount} item
`.trim(),
    kb: [
      [{ text:'🔥 Top Brand Detail', callback_data:'analitik_brand' }],
      [{ text:'📊 Tren Bulanan', callback_data:'analitik_tren' }],
      [{ text:'⏳ Stok Aging', callback_data:'stok_aging' }],
      [{ text:'📋 Laporan Lengkap', callback_data:'laporan_full' }],
      [{ text:'🏠 Menu', callback_data:'menu_utama' }]
    ]
  };
}

// ── TOP BRAND DETAIL ─────────────────────────────────────────────────
async function msgBrandDetail(db) {
  const c    = compute(db);
  const bArr = Object.entries(c.brands).sort((a,b) => b[1].profit - a[1].profit);

  const rows = bArr.map(([b,v], i) => {
    const icon   = BRAND_ICONS[b]||'📦';
    const margin = v.count > 0 ? v.profit/v.count : 0;
    const bLen   = bar(v.profit, bArr[0][1].profit, 10);
    return `${icon} <b>${b}</b>\n<code>${bLen}</code>\nLaba: ${rp(v.profit)} | ${v.count} unit\nMargin/unit: ${rpShort(margin)} | Omset: ${rpShort(v.revenue)}`;
  }).join('\n\n');

  return {
    text: `🔥 <b>DETAIL TOP MEREK</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n${rows || '—'}`,
    kb: [[{ text:'📈 Analitik', callback_data:'menu_analitik' }, { text:'🏠 Menu', callback_data:'menu_utama' }]]
  };
}

// ── TREN BULANAN ─────────────────────────────────────────────────────
async function msgTren(db) {
  const c    = compute(db);
  const mks  = Object.keys(c.monthly).sort();
  const maxP = Math.max(...mks.map(k => c.monthly[k].profit||0), 1);

  const rows = mks.reverse().map(mk => {
    const m = c.monthly[mk];
    const b = bar(m.profit, maxP, 10);
    const netIcon = m.profit > 0 ? '✅' : '❌';
    return `${netIcon} <b>${longMonth(mk)}</b>\n<code>${b}</code> ${rpShort(m.profit)}\n💚 ${rpShort(m.income)} | ❤️ ${rpShort(m.expense)} | 📦 ${m.units}unit`;
  }).join('\n\n');

  return {
    text: `📊 <b>TREN BULANAN (SEMUA)</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n${rows || '—'}`,
    kb: [[{ text:'📈 Analitik', callback_data:'menu_analitik' }, { text:'🏠 Menu', callback_data:'menu_utama' }]]
  };
}

// ── LAPORAN LENGKAP ───────────────────────────────────────────────────
async function msgLaporanFull(db) {
  const c   = compute(db);
  const pctGoal = pct(c.totalAset, GOAL);
  const bArr = Object.entries(c.brands).sort((a,b) => b[1].profit - a[1].profit).slice(0,3);

  const nowDate = new Date();
  const tanggal = `${String(nowDate.getDate()).padStart(2,'0')}/${String(nowDate.getMonth()+1).padStart(2,'0')}/${nowDate.getFullYear()}`;

  return {
    text: `
📋 <b>LAPORAN LENGKAP FARID STORE</b>
📅 Per ${tanggal}
━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 <b>PROGRES TARGET 100 JT</b>
Total Aset: ${rp(c.totalAset)}
Progress: ${pctGoal}%
<code>${bar(c.totalAset, GOAL, 14)}</code>

💰 <b>RINGKASAN FINANSIAL</b>
├ Modal Awal: ${rp(c.startBal)}
├ Total Belanja: ${rp(c.belanja)}
├ Total Omset: ${rp(c.income)}
├ Laba Produk: ${rp(c.profitMain)}
├ Laba Jasa: ${rp(c.profitExtra)}
├ Total Laba: ${rp(c.totalProfit)}
├ Kas Tersisa: ${rp(c.cashSisa)}
└ Stok Gudang: ${rp(c.floatPrice)}

📦 <b>INVENTORI</b>
├ Stok Saat Ini: ${c.stokCount} item
├ Modal Stok: ${rp(c.floatModal)}
├ Nilai Jual Stok: ${rp(c.floatPrice)}
└ Potensi Laba Stok: ${rp(c.floatPrice - c.floatModal)}

📊 <b>PENJUALAN</b>
├ Total Terjual: ${c.soldCount} unit
└ Avg Margin: ${rp(c.avgMargin)}/unit

🏆 <b>TOP 3 MEREK</b>
${bArr.map(([b,v],i)=>`${['🥇','🥈','🥉'][i]} ${b}: ${rp(v.profit)} (${v.count}unit)`).join('\n')}
`.trim(),
    kb: [
      [{ text:'📈 Analitik', callback_data:'menu_analitik' }, { text:'📊 Dashboard', callback_data:'menu_dashboard' }],
      [{ text:'🏠 Menu', callback_data:'menu_utama' }]
    ]
  };
}

// ── TX BULAN INI ──────────────────────────────────────────────────────
async function msgTxBulanIni(db) {
  const c  = compute(db);
  const mk = c.nowMk;
  const tx = c.allTx.filter(t => t.mk === mk || (t.id && mkStr(new Date(t.id)) === mk)).slice(0, 15);

  const rows = tx.map((t, i) => {
    const icon  = t.type==='sold' ? '📤' : t.type==='buy' ? '📥' : '⭐';
    const d     = new Date(t.id);
    const ds    = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
    return `${i+1}. ${icon} <b>${t.name}</b>\n    ${ds} | ${rpShort(t.amount)}`;
  }).join('\n\n');

  const cm = c.curMonth;
  return {
    text: `
📅 <b>TRANSAKSI ${longMonth(mk).toUpperCase()}</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
💚 Omset: ${rp(cm.income)}
❤️ HPP: ${rp(cm.expense)}
💛 Laba: ${rp(cm.profit)}
📦 Terjual: ${cm.units} unit

<b>DETAIL TRANSAKSI:</b>
${rows || '—'}
`.trim(),
    kb: [[{ text:'💳 Menu Tx', callback_data:'menu_transaksi' }, { text:'🏠 Menu', callback_data:'menu_utama' }]]
  };
}

// ── SETTINGS ─────────────────────────────────────────────────────────
function msgSettings(db) {
  const startBal = Number(db.startBalance)||0;
  return {
    text: `
⚙️ <b>PENGATURAN</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
Modal Awal: ${rp(startBal)}

Kamu bisa mengubah konfigurasi data toko di sini.
`.trim(),
    kb: [
      [{ text:'💼 Ubah Modal Awal', callback_data:'set_modal' }],
      [{ text:'💰 Tambah Laba Jasa', callback_data:'aksi_ekstra' }],
      [{ text:'🏠 Menu', callback_data:'menu_utama' }]
    ]
  };
}

// ══════════════════════════════════════════════════════════════════════
//  AKSI — ALUR INPUT MULTI-STEP
// ══════════════════════════════════════════════════════════════════════

// Sesi state machine
function getSession(uid) { if (!sessions[uid]) sessions[uid] = {}; return sessions[uid]; }
function clearSession(uid) { sessions[uid] = {}; }

async function handleInput(chat, uid, text, db) {
  const sess = getSession(uid);

  // ── CATAT BARANG MASUK ───────────────────────────────────────────
  if (sess.step === 'masuk_nama') {
    sess.nama = text;
    sess.step = 'masuk_modal';
    await send(chat, `✏️ Nama: <b>${text}</b>\n\nKetik <b>harga modal</b> (angka saja, contoh: 1500000):`);
    return;
  }
  if (sess.step === 'masuk_modal') {
    const val = parseInt(text.replace(/\D/g,''));
    if (!val || val <= 0) { await send(chat, '❌ Harga tidak valid. Coba lagi:'); return; }
    sess.modal = val;
    sess.step  = 'masuk_harga';
    await send(chat, `✏️ Modal: <b>${rp(val)}</b>\n\nKetik <b>harga jual</b>:`);
    return;
  }
  if (sess.step === 'masuk_harga') {
    const val = parseInt(text.replace(/\D/g,''));
    if (!val || val <= 0) { await send(chat, '❌ Harga tidak valid. Coba lagi:'); return; }
    sess.harga = val;
    sess.step  = 'masuk_tipe';
    const margin = val - sess.modal;
    const pctM   = pct(margin, val);
    await send(chat, `
✏️ Harga Jual: <b>${rp(val)}</b>
Margin: <b>${rp(margin)}</b> (${pctM}%)

Tipe barang:`, {
      reply_markup: { inline_keyboard: [
        [{ text:'🆕 Baru (modal keluar)', callback_data:'masuk_tipe_new' }],
        [{ text:'♻️ Konsinyasi/Titipan', callback_data:'masuk_tipe_konsinyasi' }]
      ]}
    });
    return;
  }

  // ── TANDAI TERJUAL ───────────────────────────────────────────────
  if (sess.step === 'terjual_cari') {
    // Filter stok by keyword
    const keyword = text.toLowerCase();
    const items   = (db.items||[]).filter(i => i.status==='stok' && i.name.toLowerCase().includes(keyword));
    if (items.length === 0) {
      await send(chat, `❌ Tidak ada stok yang mengandung kata "<b>${text}</b>".\nCoba kata lain:`);
      return;
    }
    sess.step         = 'terjual_pilih';
    sess.cariResults  = items.slice(0, 8);
    const kb = items.slice(0, 8).map((item, i) => [{ text:`${i+1}. ${item.name} (${rpShort(item.price)})`, callback_data:`terjual_item_${i}` }]);
    kb.push([{ text:'❌ Batal', callback_data:'cancel' }]);
    await send(chat, `🔍 Ditemukan <b>${items.length}</b> item:\nPilih barang yang terjual:`, { reply_markup:{ inline_keyboard:kb } });
    return;
  }

  if (sess.step === 'terjual_harga') {
    const val = parseInt(text.replace(/\D/g,''));
    if (!val || val <= 0) { await send(chat, '❌ Harga tidak valid. Coba lagi:'); return; }
    sess.hargaJual = val;
    sess.step = 'terjual_konfirmasi';
    const item   = sess.selectedItem;
    const profit = val - item.modal;
    await send(chat, `
✅ <b>KONFIRMASI PENJUALAN</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Barang: <b>${item.name}</b>
💰 Modal: ${rp(item.modal)}
💵 Harga Jual: ${rp(val)}
💛 Laba: ${rp(profit)}
📅 Tgl Jual: ${new Date().toLocaleDateString('id-ID')}

Konfirmasi penjualan ini?`, {
      reply_markup: { inline_keyboard: [
        [{ text:'✅ Ya, Konfirmasi', callback_data:'terjual_confirm' }, { text:'❌ Batal', callback_data:'cancel' }]
      ]}
    });
    return;
  }

  // ── LABA JASA ────────────────────────────────────────────────────
  if (sess.step === 'ekstra_nama') {
    sess.ekstraNama = text;
    sess.step       = 'ekstra_nominal';
    await send(chat, `✏️ Keterangan: <b>${text}</b>\n\nKetik <b>nominal laba</b>:`);
    return;
  }
  if (sess.step === 'ekstra_nominal') {
    const val = parseInt(text.replace(/\D/g,''));
    if (!val || val <= 0) { await send(chat, '❌ Nominal tidak valid. Coba lagi:'); return; }
    sess.ekstraNominal = val;
    sess.step = 'ekstra_konfirmasi';
    await send(chat, `
⭐ <b>KONFIRMASI LABA JASA</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Keterangan: <b>${sess.ekstraNama}</b>
💰 Nominal: <b>${rp(val)}</b>

Catat laba ini?`, {
      reply_markup: { inline_keyboard: [
        [{ text:'✅ Ya, Catat', callback_data:'ekstra_confirm' }, { text:'❌ Batal', callback_data:'cancel' }]
      ]}
    });
    return;
  }

  // ── SET MODAL ────────────────────────────────────────────────────
  if (sess.step === 'set_modal') {
    const val = parseInt(text.replace(/\D/g,''));
    if (!val || val <= 0) { await send(chat, '❌ Nominal tidak valid. Coba lagi:'); return; }
    sess.newModal = val;
    sess.step = 'set_modal_konfirmasi';
    await send(chat, `
💼 <b>KONFIRMASI UBAH MODAL</b>
Modal baru: <b>${rp(val)}</b>

Lanjutkan perubahan ini?`, {
      reply_markup: { inline_keyboard: [
        [{ text:'✅ Ya', callback_data:'set_modal_confirm' }, { text:'❌ Batal', callback_data:'cancel' }]
      ]}
    });
    return;
  }

  // ── CARI STOK ────────────────────────────────────────────────────
  if (sess.step === 'stok_cari') {
    const keyword = text.toLowerCase();
    const items   = (db.items||[]).filter(i => i.name.toLowerCase().includes(keyword));
    const stok    = items.filter(i => i.status==='stok');
    const sold    = items.filter(i => i.status==='sold');

    if (items.length === 0) {
      await send(chat, `🔍 Tidak ada barang "<b>${text}</b>"\n\nKetik keyword lain atau /menu untuk kembali.`);
      return;
    }

    const rows = stok.slice(0,5).map((i,idx) => {
      const d = i.id ? Math.floor((new Date()-new Date(Math.floor(i.id)))/86400000) : 0;
      return `📦 <b>${i.name}</b>\nModal: ${rpShort(i.modal)} | Jual: ${rpShort(i.price)} | ${d} hari`;
    }).join('\n\n');

    await send(chat, `
🔍 <b>HASIL PENCARIAN: "${text}"</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Di Stok: ${stok.length} item
✅ Sudah Terjual: ${sold.length} item

${rows || '—'}
`, { reply_markup:{ inline_keyboard:[[{ text:'📦 Menu Stok', callback_data:'menu_stok' }]] } });
    clearSession(uid);
    return;
  }

  // Fallback: tidak ada sesi aktif
  await send(chat, `❓ Tidak ada aksi aktif. Ketik /menu untuk ke menu utama.`);
}

// ══════════════════════════════════════════════════════════════════════
//  CALLBACK HANDLER
// ══════════════════════════════════════════════════════════════════════
async function handleCallback(cb) {
  const chat = cb.message.chat.id;
  const uid  = cb.from.id;
  const mid  = cb.message.message_id;
  const data = cb.data;
  await answer(cb.id);

  if (!isAdmin(uid)) {
    await answer(cb.id, '⛔ Kamu tidak punya akses!', true);
    return;
  }

  let db;
  try { db = await getData(); }
  catch (e) { await send(chat, '❌ Gagal ambil data. Coba lagi.'); return; }

  // ── NAVIGASI MENU ────────────────────────────────────────────────
  if (data === 'menu_utama' || data === 'refresh') {
    const m = menuUtama();
    await edit(chat, mid, m.text, { reply_markup:{ inline_keyboard: m.kb } });
    return;
  }

  if (data === 'menu_dashboard' || data === 'dash_refresh') {
    const m = await msgDashboard(db);
    await edit(chat, mid, m.text, { reply_markup:{ inline_keyboard: m.kb } });
    return;
  }

  if (data === 'menu_stok') {
    const m = await msgStokMenu(db);
    await edit(chat, mid, m.text, { reply_markup:{ inline_keyboard: m.kb } });
    return;
  }

  if (data.startsWith('stok_list_')) {
    const page = parseInt(data.split('_')[2]) || 1;
    const m    = await msgStokList(db, page);
    await edit(chat, mid, m.text, { reply_markup:{ inline_keyboard: m.kb } });
    return;
  }

  if (data === 'stok_aging') {
    const m = await msgStokAging(db);
    await edit(chat, mid, m.text, { reply_markup:{ inline_keyboard: m.kb } });
    return;
  }

  if (data === 'menu_transaksi') {
    const m = await msgTransaksi(db);
    await edit(chat, mid, m.text, { reply_markup:{ inline_keyboard: m.kb } });
    return;
  }

  if (data === 'tx_list_10') {
    const m = await msgTxList(db, 10);
    await edit(chat, mid, m.text, { reply_markup:{ inline_keyboard: m.kb } });
    return;
  }

  if (data === 'tx_bulan_ini') {
    const m = await msgTxBulanIni(db);
    await edit(chat, mid, m.text, { reply_markup:{ inline_keyboard: m.kb } });
    return;
  }

  if (data === 'tx_cashflow') {
    const m = await msgCashflow(db);
    await edit(chat, mid, m.text, { reply_markup:{ inline_keyboard: m.kb } });
    return;
  }

  if (data === 'menu_analitik') {
    const m = await msgAnalitik(db);
    await edit(chat, mid, m.text, { reply_markup:{ inline_keyboard: m.kb } });
    return;
  }

  if (data === 'analitik_brand') {
    const m = await msgBrandDetail(db);
    await edit(chat, mid, m.text, { reply_markup:{ inline_keyboard: m.kb } });
    return;
  }

  if (data === 'analitik_tren') {
    const m = await msgTren(db);
    await edit(chat, mid, m.text, { reply_markup:{ inline_keyboard: m.kb } });
    return;
  }

  if (data === 'laporan_full') {
    const m = await msgLaporanFull(db);
    await edit(chat, mid, m.text, { reply_markup:{ inline_keyboard: m.kb } });
    return;
  }

  if (data === 'menu_settings') {
    const m = msgSettings(db);
    await edit(chat, mid, m.text, { reply_markup:{ inline_keyboard: m.kb } });
    return;
  }

  // ── AKSI: CATAT MASUK ────────────────────────────────────────────
  if (data === 'aksi_masuk') {
    clearSession(uid);
    getSession(uid).step = 'masuk_nama';
    await edit(chat, mid, `
➕ <b>CATAT BARANG MASUK</b>
━━━━━━━━━━━━━━━━━━━━━━━━━

Ketik <b>nama barang</b> lengkap:
(contoh: iPhone 13 128GB Black)
`, { reply_markup:{ inline_keyboard:[[{ text:'❌ Batal', callback_data:'cancel' }]] } });
    return;
  }

  if (data === 'masuk_tipe_new' || data === 'masuk_tipe_konsinyasi') {
    const sess = getSession(uid);
    sess.tipe  = data === 'masuk_tipe_new' ? 'new' : 'konsinyasi';
    // Simpan ke DB
    try {
      db.items = db.items || [];
      db.items.push({
        id: Date.now(),
        name: sess.nama,
        modal: sess.modal,
        price: sess.harga,
        status: 'stok',
        type: sess.tipe,
        addedAt: new Date().toISOString()
      });
      await putData(db);
      clearSession(uid);
      const margin = sess.harga - sess.modal;
      await edit(chat, mid, `
✅ <b>BARANG BERHASIL DICATAT!</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Nama: <b>${sess.nama}</b>
💰 Modal: ${rp(sess.modal)}
💵 Harga Jual: ${rp(sess.harga)}
💛 Potensi Laba: ${rp(margin)}
🏷️ Tipe: ${sess.tipe === 'new' ? '🆕 Baru' : '♻️ Konsinyasi'}
📅 Dicatat: ${new Date().toLocaleDateString('id-ID')}
`, { reply_markup:{ inline_keyboard:[
        [{ text:'➕ Catat Lagi', callback_data:'aksi_masuk' }],
        [{ text:'📦 Lihat Stok', callback_data:'menu_stok' }, { text:'🏠 Menu', callback_data:'menu_utama' }]
      ]}});
    } catch (e) {
      await edit(chat, mid, '❌ Gagal menyimpan. Coba lagi.', { reply_markup:{ inline_keyboard:[[{ text:'🏠 Menu', callback_data:'menu_utama' }]] }});
    }
    return;
  }

  // ── AKSI: TANDAI TERJUAL ──────────────────────────────────────────
  if (data === 'aksi_terjual') {
    clearSession(uid);
    getSession(uid).step = 'terjual_cari';
    await edit(chat, mid, `
✅ <b>TANDAI BARANG TERJUAL</b>
━━━━━━━━━━━━━━━━━━━━━━━━━

Ketik <b>nama barang</b> atau <b>kata kunci</b> untuk dicari:
`, { reply_markup:{ inline_keyboard:[[{ text:'❌ Batal', callback_data:'cancel' }]] } });
    return;
  }

  if (data.startsWith('terjual_item_')) {
    const idx  = parseInt(data.split('_')[2]);
    const sess = getSession(uid);
    const item = sess.cariResults?.[idx];
    if (!item) { await send(chat, '❌ Item tidak ditemukan.'); return; }
    sess.selectedItem = item;
    sess.step = 'terjual_harga';
    await edit(chat, mid, `
✅ <b>KONFIRMASI BARANG</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Barang: <b>${item.name}</b>
💰 Modal: ${rp(item.modal)}
💵 Harga List: ${rp(item.price)}

Ketik <b>harga jual aktual</b> (atau kosongkan untuk pakai harga list ${rp(item.price)}):
`, { reply_markup:{ inline_keyboard:[
      [{ text:`💵 Pakai harga list: ${rpShort(item.price)}`, callback_data:'terjual_harga_list' }],
      [{ text:'❌ Batal', callback_data:'cancel' }]
    ]}});
    return;
  }

  if (data === 'terjual_harga_list') {
    const sess = getSession(uid);
    if (!sess.selectedItem) { await send(chat, '❌ Sesi tidak valid. Mulai lagi.'); return; }
    sess.hargaJual = sess.selectedItem.price;
    sess.step      = 'terjual_konfirmasi';
    const profit   = sess.hargaJual - sess.selectedItem.modal;
    await edit(chat, mid, `
✅ <b>KONFIRMASI PENJUALAN</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Barang: <b>${sess.selectedItem.name}</b>
💰 Modal: ${rp(sess.selectedItem.modal)}
💵 Harga Jual: ${rp(sess.hargaJual)}
💛 Laba: ${rp(profit)}

Konfirmasi?`, { reply_markup:{ inline_keyboard:[
      [{ text:'✅ Ya, Konfirmasi', callback_data:'terjual_confirm' }, { text:'❌ Batal', callback_data:'cancel' }]
    ]}});
    return;
  }

  if (data === 'terjual_confirm') {
    const sess = getSession(uid);
    const item = sess.selectedItem;
    if (!item) { await send(chat, '❌ Sesi tidak valid.'); return; }
    try {
      const idx = (db.items||[]).findIndex(i => i.id === item.id);
      if (idx === -1) throw new Error('Item not found');
      db.items[idx].status = 'sold';
      db.items[idx].price  = sess.hargaJual;
      db.items[idx].soldAt = new Date().toISOString().slice(0,10);
      await putData(db);
      clearSession(uid);
      const profit = sess.hargaJual - item.modal;
      await edit(chat, mid, `
🎉 <b>BARANG BERHASIL TERJUAL!</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Barang: <b>${item.name}</b>
💵 Harga Jual: ${rp(sess.hargaJual)}
💛 Laba: <b>${rp(profit)}</b>
📅 Tgl: ${new Date().toLocaleDateString('id-ID')}
`, { reply_markup:{ inline_keyboard:[
        [{ text:'✅ Tandai Terjual Lagi', callback_data:'aksi_terjual' }],
        [{ text:'📊 Dashboard', callback_data:'menu_dashboard' }, { text:'🏠 Menu', callback_data:'menu_utama' }]
      ]}});
    } catch (e) {
      await edit(chat, mid, '❌ Gagal update data. Coba lagi.', { reply_markup:{ inline_keyboard:[[{ text:'🏠 Menu', callback_data:'menu_utama' }]] }});
    }
    return;
  }

  // ── AKSI: LABA JASA ──────────────────────────────────────────────
  if (data === 'aksi_ekstra') {
    clearSession(uid);
    getSession(uid).step = 'ekstra_nama';
    await edit(chat, mid, `
⭐ <b>CATAT LABA JASA / EKSTRA</b>
━━━━━━━━━━━━━━━━━━━━━━━━━

Ketik <b>keterangan / nama transaksi</b>:
(contoh: Servis HP, Joki Unlock, dll)
`, { reply_markup:{ inline_keyboard:[[{ text:'❌ Batal', callback_data:'cancel' }]] } });
    return;
  }

  if (data === 'ekstra_confirm') {
    const sess = getSession(uid);
    try {
      db.extraProfits = db.extraProfits || [];
      db.extraProfits.push({
        id: Date.now(),
        name: sess.ekstraNama,
        profit: sess.ekstraNominal,
        date: new Date().toISOString().slice(0,10)
      });
      await putData(db);
      clearSession(uid);
      await edit(chat, mid, `
✅ <b>LABA JASA DICATAT!</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Keterangan: <b>${sess.ekstraNama}</b>
💰 Nominal: <b>${rp(sess.ekstraNominal)}</b>
📅 Tanggal: ${new Date().toLocaleDateString('id-ID')}
`, { reply_markup:{ inline_keyboard:[
        [{ text:'⭐ Catat Lagi', callback_data:'aksi_ekstra' }],
        [{ text:'📊 Dashboard', callback_data:'menu_dashboard' }, { text:'🏠 Menu', callback_data:'menu_utama' }]
      ]}});
    } catch (e) {
      await edit(chat, mid, '❌ Gagal menyimpan.', { reply_markup:{ inline_keyboard:[[{ text:'🏠 Menu', callback_data:'menu_utama' }]] }});
    }
    return;
  }

  // ── SETTINGS: SET MODAL ──────────────────────────────────────────
  if (data === 'set_modal') {
    clearSession(uid);
    getSession(uid).step = 'set_modal';
    await edit(chat, mid, `
💼 <b>UBAH MODAL AWAL</b>
Modal saat ini: ${rp(Number(db.startBalance)||0)}

Ketik <b>modal awal baru</b>:
`, { reply_markup:{ inline_keyboard:[[{ text:'❌ Batal', callback_data:'cancel' }]] } });
    return;
  }

  if (data === 'set_modal_confirm') {
    const sess = getSession(uid);
    try {
      db.startBalance = sess.newModal;
      await putData(db);
      clearSession(uid);
      await edit(chat, mid, `✅ Modal awal berhasil diubah ke <b>${rp(sess.newModal)}</b>`, { reply_markup:{ inline_keyboard:[[{ text:'🏠 Menu', callback_data:'menu_utama' }]] }});
    } catch (e) {
      await edit(chat, mid, '❌ Gagal menyimpan.', { reply_markup:{ inline_keyboard:[[{ text:'🏠 Menu', callback_data:'menu_utama' }]] }});
    }
    return;
  }

  // ── CARI STOK ────────────────────────────────────────────────────
  if (data === 'stok_cari') {
    clearSession(uid);
    getSession(uid).step = 'stok_cari';
    await edit(chat, mid, `
🔍 <b>CARI STOK</b>

Ketik <b>nama atau kata kunci</b> barang yang ingin dicari:
`, { reply_markup:{ inline_keyboard:[[{ text:'❌ Batal', callback_data:'cancel' }]] } });
    return;
  }

  // ── CANCEL ───────────────────────────────────────────────────────
  if (data === 'cancel') {
    clearSession(uid);
    const m = menuUtama();
    await edit(chat, mid, m.text, { reply_markup:{ inline_keyboard: m.kb } });
    return;
  }

  // Fallback
  await answer(cb.id, 'Aksi tidak dikenal.', true);
}

// ══════════════════════════════════════════════════════════════════════
//  COMMAND HANDLER
// ══════════════════════════════════════════════════════════════════════
async function handleCommand(msg) {
  const chat = msg.chat.id;
  const uid  = msg.from.id;
  const text = (msg.text||'').trim();

  if (!isAdmin(uid)) {
    await send(chat, '⛔ Kamu tidak punya akses ke bot ini.');
    return;
  }

  if (text === '/start' || text === '/menu' || text === '/m') {
    clearSession(uid);
    const m = menuUtama();
    await send(chat, m.text, { reply_markup:{ inline_keyboard: m.kb } });
    return;
  }

  if (text === '/dashboard' || text === '/d') {
    try {
      const db = await getData();
      const m  = await msgDashboard(db);
      await send(chat, m.text, { reply_markup:{ inline_keyboard: m.kb } });
    } catch (e) { await send(chat, '❌ Gagal ambil data.'); }
    return;
  }

  if (text === '/stok' || text === '/s') {
    try {
      const db = await getData();
      const m  = await msgStokMenu(db);
      await send(chat, m.text, { reply_markup:{ inline_keyboard: m.kb } });
    } catch (e) { await send(chat, '❌ Gagal ambil data.'); }
    return;
  }

  if (text === '/laporan' || text === '/l') {
    try {
      const db = await getData();
      const m  = await msgLaporanFull(db);
      await send(chat, m.text, { reply_markup:{ inline_keyboard: m.kb } });
    } catch (e) { await send(chat, '❌ Gagal ambil data.'); }
    return;
  }

  if (text.startsWith('/masuk ')) {
    // Quick format: /masuk NamaBarang, Modal, HargaJual
    const parts = text.slice(7).split(',').map(s => s.trim());
    if (parts.length < 3) { await send(chat, '❌ Format: /masuk Nama, Modal, HargaJual'); return; }
    const [nama, modalStr, hargaStr] = parts;
    const modal = parseInt(modalStr.replace(/\D/g,''));
    const harga = parseInt(hargaStr.replace(/\D/g,''));
    if (!modal || !harga) { await send(chat, '❌ Format angka tidak valid.'); return; }
    try {
      const db = await getData();
      db.items = db.items || [];
      db.items.push({ id: Date.now(), name: nama, modal, price: harga, status:'stok', type:'new', addedAt: new Date().toISOString() });
      await putData(db);
      await send(chat, `✅ Barang dicatat!\n📦 ${nama}\n💰 Modal: ${rp(modal)}\n💵 Harga: ${rp(harga)}\n💛 Margin: ${rp(harga-modal)}`);
    } catch (e) { await send(chat, '❌ Gagal menyimpan.'); }
    return;
  }

  if (text === '/help' || text === '/h') {
    await send(chat, `
🤖 <b>FARID STORE BOT — BANTUAN</b>
━━━━━━━━━━━━━━━━━━━━━━━━━

<b>PERINTAH CEPAT:</b>
/menu  — Menu utama
/dashboard — Dashboard aset
/stok — Manajemen stok
/laporan — Laporan lengkap
/help — Bantuan ini

<b>PERINTAH CEPAT MASUK:</b>
<code>/masuk Nama, Modal, HargaJual</code>
Contoh: <code>/masuk iPhone 13, 4500000, 5200000</code>

<b>MENU INTERAKTIF:</b>
Gunakan tombol-tombol di bawah pesan untuk navigasi dan aksi.
`.trim());
    return;
  }

  // Jika ada sesi aktif, teruskan ke handler input
  const sess = getSession(uid);
  if (sess.step) {
    try {
      const db = await getData();
      await handleInput(chat, uid, text, db);
    } catch (e) { await send(chat, '❌ Terjadi error. Coba lagi dengan /menu.'); }
    return;
  }

  // Teks biasa tapi tidak ada sesi → tunjukkan menu
  const m = menuUtama();
  await send(chat, m.text, { reply_markup:{ inline_keyboard: m.kb } });
}

// ══════════════════════════════════════════════════════════════════════
//  MAIN VERCEL HANDLER
// ══════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send('Farid Store Bot V10 — Full Admin Edition');
  }
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  res.status(200).json({ ok: true }); // respond immediately to Telegram

  try {
    const body = req.body;

    if (body.callback_query) {
      await handleCallback(body.callback_query);
    } else if (body.message?.text) {
      await handleCommand(body.message);
    }
  } catch (e) {
    console.error('Handler error:', e);
  }
}
