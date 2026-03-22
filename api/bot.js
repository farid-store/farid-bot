// ═══════════════════════════════════════════════════════════════════
//  FARID STORE BOT V10 — Full Admin Edition (100% Bottom Keyboard)
//  Vercel Serverless Webhook Handler
// ═══════════════════════════════════════════════════════════════════

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

// ── DYNAMIC BOTTOM KEYBOARDS ─────────────────────────────────────────
function makeKb(layout) {
  return { keyboard: layout, resize_keyboard: true, is_persistent: true };
}

const KB_MAIN = {
  keyboard: [
    [{ text: '📊 Dashboard' }, { text: '📦 Menu Stok' }],
    [{ text: '💳 Transaksi' }, { text: '📈 Analitik' }],
    [{ text: '➕ Catat Masuk' }, { text: '✅ Tandai Terjual' }],
    [{ text: '⭐ Laba Jasa' }, { text: '⚙️ Pengaturan' }]
  ],
  resize_keyboard: true,
  is_persistent: true
};

const BOTTOM_COMMANDS = [
  '📊 Dashboard', '📦 Menu Stok', '💳 Transaksi', '📈 Analitik', 
  '➕ Catat Masuk', '✅ Tandai Terjual', '⭐ Laba Jasa', '⚙️ Pengaturan',
  '✏️ Kelola Stok', '❌ Batal'
];

// ── SESSION MANAGEMENT ───────────────────────────────────────────────
function getSession(db, uid) {
  if (!db.sessions) db.sessions = {};
  if (!db.sessions[uid]) db.sessions[uid] = {};
  return db.sessions[uid];
}

function clearSession(db, uid) {
  if (!db.sessions) db.sessions = {};
  db.sessions[uid] = {};
}

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
  if (n.includes('SAMSUNG')||n.includes('GALAXY')||n.includes('SEIN')||n.startsWith('SAM ')) return 'Samsung';
  if (n.includes('XIAOMI')||n.includes('Note')||n.includes('REDMI')||n.includes('POCO')||n.includes('MI ')) return 'Xiaomi';
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
  const r = await fetch(`${BIN}/latest`, { headers: { 'X-Master-Key': JSONBIN_KEY } });
  if (!r.ok) throw new Error(`JSONBin GET failed`);
  const j = await r.json(); return j.record;
}

async function putData(db) {
  const r = await fetch(BIN, {
    method: 'PUT',
    headers: { 'Content-Type':'application/json', 'X-Master-Key': JSONBIN_KEY },
    body: JSON.stringify(db)
  });
  if (!r.ok) throw new Error(`JSONBin PUT failed`);
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

const send = (chat, text, extra={}) => tg('sendMessage', { chat_id:chat, text, parse_mode:'HTML', ...extra });

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
//  MESSAGES BUILDER (Hanya mengembalikan Teks & Bottom Keyboard)
// ══════════════════════════════════════════════════════════════════════

function msgDashboard(db) {
  const c = compute(db);
  const pctGoal  = pct(c.totalAset, GOAL);
  const barGoal  = bar(c.totalAset, GOAL, 12);
  const pctMil   = pct(c.totalAset - c.prevMil, c.nextMil - c.prevMil, 12);
  const barMil   = bar(c.totalAset - c.prevMil, c.nextMil - c.prevMil, 12);

  const sortedMks = Object.keys(c.monthly).sort().slice(-3);
  const avg3 = sortedMks.reduce((s,k) => s + c.monthly[k].profit, 0) / (sortedMks.length || 1);
  let etaStr = '—';
  if (c.totalAset >= GOAL) etaStr = '✅ TERCAPAI!';
  else if (avg3 > 0) {
    const d = new Date(); d.setMonth(d.getMonth() + Math.ceil((GOAL - c.totalAset)/avg3));
    etaStr = longMonth(mkStr(d));
  }

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

📅 <b>BULAN INI</b> (${longMonth(c.nowMk)})
├ 💚 Omset: ${rp(c.curMonth.income)}
├ ❤️ HPP: ${rp(c.curMonth.expense)}
├ 💛 Laba: ${rp(c.curMonth.profit)}
└ 📦 Terjual: ${c.curMonth.units} unit

🗃️ <b>STOK GUDANG</b>
${c.stokCount} item • Modal: ${rp(c.floatModal)} • Harga: ${rp(c.floatPrice)}
`.trim();

  // Hanya memunculkan bottom keyboard, tanpa inline_keyboard
  const kb = makeKb([
    [{ text: '📈 Analitik Detail' }, { text: '💳 Menu Transaksi' }],
    [{ text: '📋 Daftar Semua Stok' }, { text: '⏳ Stok Mengendap' }],
    [{ text: '🔄 Refresh Data' }, { text: '🏠 Menu Utama' }]
  ]);

  return { text: txt, kb: kb };
}

function msgStokMenu(db) {
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

  const kb = makeKb([
    [{ text: '📋 Daftar Semua Stok' }, { text: '✏️ Kelola Stok' }],
    [{ text: '🔍 Cari Stok' }, { text: '⏳ Stok Mengendap' }],
    [{ text: '➕ Catat Barang Masuk' }, { text: '✅ Tandai Terjual' }],
    [{ text: '🏠 Menu Utama' }]
  ]);

  return { text: txt, kb: kb };
}

function msgStokList(db, page=1) {
  const LIMIT = 15;
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

  let navRow = [];
  if (p > 1)     navRow.push({ text: `⬅️ Daftar Hal ${p-1}` });
  if (p < pages) navRow.push({ text: `Daftar Hal ${p+1} ➡️` });

  let kbArray = [];
  if (navRow.length > 0) kbArray.push(navRow);
  kbArray.push([{ text: '📦 Menu Stok' }, { text: '🏠 Menu Utama' }]);

  return { text: txt, kb: makeKb(kbArray) };
}

function getKelolaStokView(db, page=1) {
  const LIMIT = 15;
  const items = (db.items||[]).filter(i => i.status === 'stok').sort((a,b) => (a.id||0) - (b.id||0));
  const total = items.length;
  const pages = Math.ceil(total/LIMIT) || 1;
  const p     = Math.min(Math.max(page,1), pages);
  const slice = items.slice((p-1)*LIMIT, p*LIMIT);

  let kb = [];
  // Susun 2 tombol barang per baris agar tidak terlalu panjang di keyboard
  for (let i = 0; i < slice.length; i += 2) {
    let row = [{ text: `${(p-1)*LIMIT + i + 1}. ${slice[i].name}` }];
    if (slice[i+1]) row.push({ text: `${(p-1)*LIMIT + i + 2}. ${slice[i+1].name}` });
    kb.push(row);
  }
  
  let navRow = [];
  if (p > 1)     navRow.push({ text: `⬅️ Edit Hal ${p-1}` });
  if (p < pages) navRow.push({ text: `Edit Hal ${p+1} ➡️` });
  if (navRow.length > 0) kb.push(navRow);
  
  kb.push([{ text: '📦 Menu Stok' }, { text: '❌ Batal' }]);

  const txt = `⚙️ <b>KELOLA STOK</b> (Hal. ${p}/${pages})\n\nPilih barang yang ingin <b>diedit</b> atau <b>dihapus</b> dari tombol di bawah:`;
  return { text: txt, kb: makeKb(kb) };
}

function msgStokAging(db) {
  const c     = compute(db);
  const aging = c.agingStocks;

  if (aging.length === 0) {
    return {
      text: `⏳ <b>STOK MENGENDAP</b>\n\nTidak ada stok yang mengendap. Perputaran barang lancar! ✅`,
      kb: makeKb([[{ text: '📦 Menu Stok' }, { text: '🏠 Menu Utama' }]])
    };
  }

  const rows = aging.slice(0,12).map((i,idx) => {
    const icon = i.days > 30 ? '🔴' : i.days > 14 ? '🟡' : '🟢';
    return `${idx+1}. ${icon} <b>${i.name}</b>\n    Modal: ${rpShort(i.modal)} | <b>${i.days} hari</b>`;
  }).join('\n\n');

  const over30 = aging.filter(i => i.days > 30).length;
  const over14 = aging.filter(i => i.days > 14 && i.days <= 30).length;

  const txt = `
⏳ <b>STOK MENGENDAP</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 > 30 hari: ${over30} item
🟡 14–30 hari: ${over14} item

${rows}
`.trim();

  return {
    text: txt,
    kb: makeKb([
      [{ text: '✅ Tandai Terjual' }],
      [{ text: '📦 Menu Stok' }, { text: '🏠 Menu Utama' }]
    ])
  };
}

function msgTransaksi(db) {
  const c   = compute(db);
  const tx5 = c.allTx.slice(0, 5).map(tx => {
    const icon  = tx.type==='sold' ? '📤' : tx.type==='buy' ? '📥' : '⭐';
    const sign  = tx.type==='buy' ? '-' : '+';
    const d     = new Date(tx.id);
    const ds    = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
    const extra = tx.type==='sold' ? ` (laba: ${rpShort(tx.profit)})` : '';
    return `${icon} ${ds} <b>${tx.name}</b>\n    ${sign}${rpShort(tx.amount)}${extra}`;
  }).join('\n\n');

  const txt = `
💳 <b>MUTASI TRANSAKSI</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📤 Keluar (pembelian): ${rp(c.belanja)}
📥 Masuk (penjualan): ${rp(c.income)}
⭐ Laba Ekstra: ${rp(c.profitExtra)}

<b>5 TRANSAKSI TERAKHIR</b>
${tx5 || '—'}
`.trim();

  return {
    text: txt,
    kb: makeKb([
      [{ text: '📋 10 Tx Terakhir' }, { text: '📅 Tx Bulan Ini' }],
      [{ text: '💰 Arus Kas Per Bulan' }, { text: '🏠 Menu Utama' }]
    ])
  };
}

function msgTxList(db, limit=10) {
  const c  = compute(db);
  const tx = c.allTx.slice(0, limit).map((tx, idx) => {
    const icon = tx.type==='sold' ? '📤' : tx.type==='buy' ? '📥' : '⭐';
    const sign = tx.type==='buy' ? '−' : '+';
    const d    = new Date(tx.id);
    const ds   = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    const extra = tx.type==='sold' ? `\n    💛 Laba: ${rpShort(tx.profit)}` : '';
    return `${idx+1}. ${icon} <b>${tx.name}</b>\n    📅 ${ds} | ${sign}${rp(tx.amount)}${extra}`;
  }).join('\n\n');

  return {
    text: `💳 <b>${limit} TRANSAKSI TERAKHIR</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n${tx || '—'}`,
    kb: makeKb([[{ text: '💳 Menu Transaksi' }, { text: '🏠 Menu Utama' }]])
  };
}

function msgCashflow(db) {
  const c   = compute(db);
  const rows = Object.keys(c.monthly).sort().reverse().slice(0, 6).map(mk => {
    const m   = c.monthly[mk];
    const icon = (m.income - m.expense) > 0 ? '✅' : '❌';
    return `${icon} <b>${longMonth(mk)}</b>\n  💚 Omset: ${rpShort(m.income)} | ❤️ HPP: ${rpShort(m.expense)}\n  💛 Laba: ${rpShort(m.profit)} | 📦 ${m.units} unit`;
  }).join('\n\n');

  return {
    text: `💰 <b>ARUS KAS PER BULAN</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n${rows || '—'}`,
    kb: makeKb([[{ text: '💳 Menu Transaksi' }, { text: '🏠 Menu Utama' }]])
  };
}

function msgAnalitik(db) {
  const c = compute(db);
  const bArr = Object.entries(c.brands).sort((a,b) => b[1].profit - a[1].profit).slice(0,5);
  const brandRows = bArr.map(([b,v], i) => `${['🥇','🥈','🥉','4️⃣','5️⃣'][i]} ${BRAND_ICONS[b]||'📦'} <b>${b}</b>\n   Laba: ${rp(v.profit)} | ${v.count} unit`).join('\n\n');

  const sortedMks = Object.keys(c.monthly).sort().slice(-4);
  const trendRows = sortedMks.reverse().map(mk => {
    const m   = c.monthly[mk];
    return `📅 <b>${monthLabel(mk)}</b>: ${rpShort(m.profit)}\n  <code>${bar(m.profit, Math.max(...sortedMks.map(k => c.monthly[k].profit||0)), 8)}</code> ${m.units}unit`;
  }).join('\n\n');

  const over30 = c.agingStocks.filter(i => i.days > 30).length;
  const over14 = c.agingStocks.filter(i => i.days > 14 && i.days <= 30).length;

  const txt = `
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
`.trim();

  return {
    text: txt,
    kb: makeKb([
      [{ text: '🔥 Top Brand Detail' }, { text: '📊 Tren Bulanan' }],
      [{ text: '⏳ Stok Mengendap' }, { text: '📋 Laporan Lengkap' }],
      [{ text: '🏠 Menu Utama' }]
    ])
  };
}

function msgBrandDetail(db) {
  const c    = compute(db);
  const bArr = Object.entries(c.brands).sort((a,b) => b[1].profit - a[1].profit);
  const rows = bArr.map(([b,v]) => {
    const margin = v.count > 0 ? v.profit/v.count : 0;
    return `${BRAND_ICONS[b]||'📦'} <b>${b}</b>\n<code>${bar(v.profit, bArr[0][1].profit, 10)}</code>\nLaba: ${rp(v.profit)} | ${v.count} unit\nMargin/unit: ${rpShort(margin)} | Omset: ${rpShort(v.revenue)}`;
  }).join('\n\n');

  return {
    text: `🔥 <b>DETAIL TOP MEREK</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n${rows || '—'}`,
    kb: makeKb([[{ text: '📈 Analitik' }, { text: '🏠 Menu Utama' }]])
  };
}

function msgTren(db) {
  const c    = compute(db);
  const mks  = Object.keys(c.monthly).sort();
  const maxP = Math.max(...mks.map(k => c.monthly[k].profit||0), 1);
  const rows = mks.reverse().map(mk => {
    const m = c.monthly[mk];
    const netIcon = m.profit > 0 ? '✅' : '❌';
    return `${netIcon} <b>${longMonth(mk)}</b>\n<code>${bar(m.profit, maxP, 10)}</code> ${rpShort(m.profit)}\n💚 ${rpShort(m.income)} | ❤️ ${rpShort(m.expense)} | 📦 ${m.units}unit`;
  }).join('\n\n');

  return {
    text: `📊 <b>TREN BULANAN (SEMUA)</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n${rows || '—'}`,
    kb: makeKb([[{ text: '📈 Analitik' }, { text: '🏠 Menu Utama' }]])
  };
}

function msgLaporanFull(db) {
  const c   = compute(db);
  const pctGoal = pct(c.totalAset, GOAL);
  const bArr = Object.entries(c.brands).sort((a,b) => b[1].profit - a[1].profit).slice(0,3);
  const d = new Date();
  const tanggal = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

  const txt = `
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
`.trim();

  return {
    text: txt,
    kb: makeKb([
      [{ text: '📈 Analitik' }, { text: '📊 Dashboard' }],
      [{ text: '🏠 Menu Utama' }]
    ])
  };
}

function msgTxBulanIni(db) {
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
  const txt = `
📅 <b>TRANSAKSI ${longMonth(mk).toUpperCase()}</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
💚 Omset: ${rp(cm.income)}
❤️ HPP: ${rp(cm.expense)}
💛 Laba: ${rp(cm.profit)}
📦 Terjual: ${cm.units} unit

<b>DETAIL TRANSAKSI:</b>
${rows || '—'}
`.trim();

  return {
    text: txt,
    kb: makeKb([[{ text: '💳 Menu Transaksi' }, { text: '🏠 Menu Utama' }]])
  };
}

function msgSettings(db) {
  const startBal = Number(db.startBalance)||0;
  const txt = `⚙️ <b>PENGATURAN</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\nModal Awal: ${rp(startBal)}\n\nKamu bisa mengubah konfigurasi data toko di sini.`;
  return {
    text: txt,
    kb: makeKb([
      [{ text: '💼 Ubah Modal Awal' }, { text: '⭐ Laba Jasa' }],
      [{ text: '🏠 Menu Utama' }]
    ])
  };
}

// ══════════════════════════════════════════════════════════════════════
//  AKSI — ALUR INPUT MULTI-STEP
// ══════════════════════════════════════════════════════════════════════

async function handleInput(chat, uid, text, db) {
  const sess = getSession(db, uid);

  // ── CATAT BARANG MASUK ──
  if (sess.step === 'masuk_nama') {
    sess.nama = text;
    sess.step = 'masuk_modal'; await putData(db);
    await send(chat, `✏️ Nama: <b>${text}</b>\n\nKetik <b>harga modal</b> (angka saja, contoh: 1500000):`, { reply_markup: makeKb(KB_CANCEL) });
    return;
  }
  if (sess.step === 'masuk_modal') {
    const val = parseInt(text.replace(/\D/g,''));
    if (!val || val <= 0) { await send(chat, '❌ Harga tidak valid. Coba lagi:'); return; }
    sess.modal = val;
    sess.step  = 'masuk_harga'; await putData(db);
    await send(chat, `✏️ Modal: <b>${rp(val)}</b>\n\nKetik <b>harga jual</b>:`, { reply_markup: makeKb(KB_CANCEL) });
    return;
  }
  if (sess.step === 'masuk_harga') {
    const val = parseInt(text.replace(/\D/g,''));
    if (!val || val <= 0) { await send(chat, '❌ Harga tidak valid. Coba lagi:'); return; }
    sess.harga = val;
    sess.step  = 'masuk_tipe'; await putData(db);
    const margin = val - sess.modal;
    await send(chat, `✏️ Harga Jual: <b>${rp(val)}</b>\nMargin: <b>${rp(margin)}</b> (${pct(margin, val)}%)\n\nPilih tipe barang di bawah layar:`, {
      reply_markup: makeKb([[{ text: '🆕 Baru' }, { text: '♻️ Konsinyasi' }], [{ text: '❌ Batal' }]])
    });
    return;
  }
  if (sess.step === 'masuk_tipe') {
    if (text === '🆕 Baru' || text === '♻️ Konsinyasi') {
      sess.tipe = text === '🆕 Baru' ? 'new' : 'konsinyasi';
      try {
        db.items = db.items || [];
        db.items.push({ id: Date.now(), name: sess.nama, modal: sess.modal, price: sess.harga, status: 'stok', type: sess.tipe, addedAt: new Date().toISOString() });
        clearSession(db, uid); await putData(db);
        const margin = sess.harga - sess.modal;
        await send(chat, `✅ <b>BARANG BERHASIL DICATAT!</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n📦 Nama: <b>${sess.nama}</b>\n💰 Modal: ${rp(sess.modal)}\n💵 Harga Jual: ${rp(sess.harga)}\n💛 Potensi Laba: ${rp(margin)}\n🏷️ Tipe: ${sess.tipe === 'new' ? '🆕 Baru' : '♻️ Konsinyasi'}\n📅 Dicatat: ${new Date().toLocaleDateString('id-ID')}`, { 
          reply_markup: makeKb([[{ text: '➕ Catat Masuk' }, { text: '📦 Menu Stok' }], [{ text: '🏠 Menu Utama' }]]) 
        });
      } catch (e) { await send(chat, '❌ Gagal menyimpan. Coba lagi.', { reply_markup: MAIN_KEYBOARD }); }
    } else {
      await send(chat, '❌ Silakan gunakan tombol di bawah layar (Baru/Konsinyasi).');
    }
    return;
  }

  // ── KELOLA STOK (EDIT / HAPUS) ──
  if (sess.step === 'kelola_stok_pilih') {
    let pageMatch = text.match(/Edit Hal (\d+)/);
    if (pageMatch) {
      const view = getKelolaStokView(db, parseInt(pageMatch[1]));
      await send(chat, view.text, { reply_markup: view.kb });
      return;
    }

    let itemMatch = text.match(/^(\d+)\./);
    if (itemMatch) {
      const idx = parseInt(itemMatch[1]) - 1;
      const items = (db.items||[]).filter(i => i.status === 'stok').sort((a,b) => (a.id||0) - (b.id||0));
      const item = items[idx];
      if (!item) { await send(chat, '❌ Item tidak ditemukan.'); return; }
      
      sess.selectedEditItem = item;
      sess.step = 'kelola_aksi'; await putData(db);

      const txt = `⚙️ <b>KELOLA BARANG</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n📦 Nama: <b>${item.name}</b>\n💰 Modal: ${rp(item.modal)}\n💵 Jual: ${rp(item.price)}\n\nPilih aksi di bawah layar:`;
      const kb = makeKb([[{ text: '✏️ Edit Nama' }, { text: '💰 Edit Harga' }], [{ text: '🗑️ Hapus Barang' }, { text: '❌ Batal' }]]);
      await send(chat, txt, { reply_markup: kb });
      return;
    }
    await send(chat, '❌ Silakan pilih barang dari tombol di bawah layar.');
    return;
  }

  if (sess.step === 'kelola_aksi') {
    if (text === '✏️ Edit Nama') {
      sess.step = 'edit_stok_nama'; await putData(db);
      await send(chat, `✏️ Masukkan <b>Nama Baru</b> untuk barang ini:`, { reply_markup: makeKb(KB_CANCEL) });
      return;
    }
    if (text === '💰 Edit Harga') {
      sess.step = 'edit_stok_modal'; await putData(db);
      await send(chat, `💰 Masukkan <b>Harga Modal Baru</b> (angka saja):`, { reply_markup: makeKb(KB_CANCEL) });
      return;
    }
    if (text === '🗑️ Hapus Barang') {
      sess.step = 'hapus_konfirmasi'; await putData(db);
      await send(chat, `⚠️ <b>YAKIN HAPUS BARANG INI?</b>\n📦 ${sess.selectedEditItem.name}\n\nTindakan ini tidak bisa dibatalkan!`, { reply_markup: makeKb([[{ text: '✅ Ya, Hapus' }, { text: '❌ Batal' }]]) });
      return;
    }
  }

  if (sess.step === 'edit_stok_nama') {
    const item = sess.selectedEditItem;
    const idx = db.items.findIndex(i => i.id === item.id);
    if (idx > -1) {
      db.items[idx].name = text;
      clearSession(db, uid); await putData(db);
      await send(chat, `✅ Nama barang berhasil diubah menjadi <b>${text}</b>!`, { reply_markup: MAIN_KEYBOARD });
    }
    return;
  }

  if (sess.step === 'edit_stok_modal') {
    const val = parseInt(text.replace(/\D/g,''));
    if (!val || val <= 0) { await send(chat, '❌ Harga tidak valid.'); return; }
    sess.newEditModal = val;
    sess.step = 'edit_stok_harga'; await putData(db);
    await send(chat, `💰 Modal baru: <b>${rp(val)}</b>\n\nSekarang masukkan <b>Harga Jual Baru</b>:`, { reply_markup: makeKb(KB_CANCEL) });
    return;
  }

  if (sess.step === 'edit_stok_harga') {
    const val = parseInt(text.replace(/\D/g,''));
    if (!val || val <= 0) { await send(chat, '❌ Harga tidak valid.'); return; }
    const item = sess.selectedEditItem;
    const idx = db.items.findIndex(i => i.id === item.id);
    if (idx > -1) {
      db.items[idx].modal = sess.newEditModal;
      db.items[idx].price = val;
      clearSession(db, uid); await putData(db);
      await send(chat, `✅ Harga barang berhasil diubah!\nModal: ${rp(sess.newEditModal)}\nJual: ${rp(val)}`, { reply_markup: MAIN_KEYBOARD });
    }
    return;
  }

  if (sess.step === 'hapus_konfirmasi') {
    if (text === '✅ Ya, Hapus') {
      const item = sess.selectedEditItem;
      const idx = db.items.findIndex(i => i.id === item.id);
      if (idx > -1) {
        db.items.splice(idx, 1);
        clearSession(db, uid); await putData(db);
        await send(chat, `🗑️ Barang <b>${item.name}</b> berhasil dihapus dari sistem.`, { reply_markup: MAIN_KEYBOARD });
      }
    } else {
      clearSession(db, uid); await putData(db);
      await send(chat, `❌ Penghapusan dibatalkan.`, { reply_markup: MAIN_KEYBOARD });
    }
    return;
  }

  // ── TANDAI TERJUAL ──
  if (sess.step === 'terjual_cari') {
    const keyword = text.toLowerCase();
    const items   = (db.items||[]).filter(i => i.status==='stok' && i.name.toLowerCase().includes(keyword));
    if (items.length === 0) {
      await send(chat, `❌ Tidak ada stok yang mengandung kata "<b>${text}</b>".\nCoba kata lain:`);
      return;
    }
    sess.step        = 'terjual_pilih';
    sess.cariResults = items.slice(0, 8); await putData(db);
    let kb = items.slice(0, 8).map((item, i) => [{ text: `${i+1}. ${item.name}` }]);
    kb.push([{ text: '❌ Batal' }]);
    await send(chat, `🔍 Ditemukan <b>${items.length}</b> item.\nSilakan pilih barang yang terjual dari tombol di bawah layar:`, { reply_markup: makeKb(kb) });
    return;
  }

  if (sess.step === 'terjual_pilih') {
    const match = text.match(/^(\d+)\./);
    if (!match) { await send(chat, '❌ Gunakan tombol yang muncul di bawah layar.'); return; }
    const idx = parseInt(match[1]) - 1;
    const item = sess.cariResults?.[idx];
    if (!item) { await send(chat, '❌ Item tidak ditemukan.'); return; }
    
    sess.selectedItem = item;
    sess.step = 'terjual_harga'; await putData(db);
    await send(chat, `✅ <b>KONFIRMASI BARANG</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n📦 Barang: <b>${item.name}</b>\n💰 Modal: ${rp(item.modal)}\n💵 Harga List: ${rp(item.price)}\n\nKetik <b>harga jual aktual</b> (atau pencet tombol list harga di bawah):`, { 
      reply_markup: makeKb([[{ text: `💵 Pakai harga list: ${rpShort(item.price)}` }], [{ text: '❌ Batal' }]]) 
    });
    return;
  }

  if (sess.step === 'terjual_harga') {
    let val;
    if (text.startsWith('💵 Pakai harga list')) val = sess.selectedItem.price;
    else val = parseInt(text.replace(/\D/g,''));

    if (!val || val <= 0) { await send(chat, '❌ Harga tidak valid. Coba lagi:'); return; }
    sess.hargaJual = val;
    sess.step = 'terjual_konfirmasi'; await putData(db);
    const item   = sess.selectedItem;
    const profit = val - item.modal;
    await send(chat, `✅ <b>KONFIRMASI PENJUALAN</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n📦 Barang: <b>${item.name}</b>\n💰 Modal: ${rp(item.modal)}\n💵 Harga Jual: ${rp(val)}\n💛 Laba: ${rp(profit)}\n📅 Tgl Jual: ${new Date().toLocaleDateString('id-ID')}\n\nKonfirmasi penjualan ini?`, {
      reply_markup: makeKb([[{ text: '✅ Ya, Konfirmasi' }, { text: '❌ Batal' }]])
    });
    return;
  }

  if (sess.step === 'terjual_konfirmasi') {
    if (text !== '✅ Ya, Konfirmasi') { await send(chat, 'Silakan pilih Ya atau Batal di bawah.'); return; }
    const item = sess.selectedItem;
    try {
      const idx = (db.items||[]).findIndex(i => i.id === item.id);
      db.items[idx].status = 'sold'; db.items[idx].price = sess.hargaJual; db.items[idx].soldAt = new Date().toISOString().slice(0,10);
      clearSession(db, uid); await putData(db);
      await send(chat, `🎉 <b>BARANG BERHASIL TERJUAL!</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n📦 Barang: <b>${item.name}</b>\n💵 Harga Jual: ${rp(sess.hargaJual)}\n💛 Laba: <b>${rp(sess.hargaJual - item.modal)}</b>\n📅 Tgl: ${new Date().toLocaleDateString('id-ID')}`, { 
        reply_markup: makeKb([[{ text: '✅ Tandai Terjual Lagi' }, { text: '📊 Dashboard' }], [{ text: '🏠 Menu Utama' }]]) 
      });
    } catch (e) { await send(chat, '❌ Gagal update.', { reply_markup: MAIN_KEYBOARD }); }
    return;
  }

  // ── LABA JASA ──
  if (sess.step === 'ekstra_nama') {
    sess.ekstraNama = text;
    sess.step = 'ekstra_nominal'; await putData(db);
    await send(chat, `✏️ Keterangan: <b>${text}</b>\n\nKetik <b>nominal laba</b>:`, { reply_markup: makeKb(KB_CANCEL) });
    return;
  }
  if (sess.step === 'ekstra_nominal') {
    const val = parseInt(text.replace(/\D/g,''));
    if (!val || val <= 0) { await send(chat, '❌ Nominal tidak valid. Coba lagi:'); return; }
    sess.ekstraNominal = val;
    sess.step = 'ekstra_konfirmasi'; await putData(db);
    await send(chat, `⭐ <b>KONFIRMASI LABA JASA</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n📋 Keterangan: <b>${sess.ekstraNama}</b>\n💰 Nominal: <b>${rp(val)}</b>\n\nCatat laba ini?`, {
      reply_markup: makeKb([[{ text: '✅ Ya, Catat' }, { text: '❌ Batal' }]])
    });
    return;
  }
  if (sess.step === 'ekstra_konfirmasi') {
    if (text !== '✅ Ya, Catat') { await send(chat, 'Pilih Ya atau Batal.'); return; }
    try {
      db.extraProfits = db.extraProfits || [];
      db.extraProfits.push({ id: Date.now(), name: sess.ekstraNama, profit: sess.ekstraNominal, date: new Date().toISOString().slice(0,10) });
      clearSession(db, uid); await putData(db);
      await send(chat, `✅ <b>LABA JASA DICATAT!</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n📋 Keterangan: <b>${sess.ekstraNama}</b>\n💰 Nominal: <b>${rp(sess.ekstraNominal)}</b>\n📅 Tanggal: ${new Date().toLocaleDateString('id-ID')}`, { 
        reply_markup: makeKb([[{ text: '⭐ Catat Lagi' }, { text: '📊 Dashboard' }], [{ text: '🏠 Menu Utama' }]]) 
      });
    } catch (e) { await send(chat, '❌ Gagal menyimpan.', { reply_markup: MAIN_KEYBOARD }); }
    return;
  }

  // ── SET MODAL ──
  if (sess.step === 'set_modal') {
    const val = parseInt(text.replace(/\D/g,''));
    if (!val || val <= 0) { await send(chat, '❌ Nominal tidak valid. Coba lagi:'); return; }
    sess.newModal = val;
    sess.step = 'set_modal_konfirmasi'; await putData(db);
    await send(chat, `💼 <b>KONFIRMASI UBAH MODAL</b>\nModal baru: <b>${rp(val)}</b>\n\nLanjutkan perubahan ini?`, {
      reply_markup: makeKb([[{ text: '✅ Ya, Ubah' }, { text: '❌ Batal' }]])
    });
    return;
  }
  if (sess.step === 'set_modal_konfirmasi') {
    if (text !== '✅ Ya, Ubah') return;
    try {
      db.startBalance = sess.newModal; clearSession(db, uid); await putData(db);
      const m = msgSettings(db);
      await send(chat, `✅ Modal awal berhasil diubah ke <b>${rp(sess.newModal)}</b>\n\n${m.text}`, { reply_markup: m.kb });
    } catch (e) { await send(chat, '❌ Gagal.', { reply_markup: MAIN_KEYBOARD }); }
    return;
  }

  // ── CARI STOK ──
  if (sess.step === 'stok_cari') {
    const keyword = text.toLowerCase();
    const items   = (db.items||[]).filter(i => i.name.toLowerCase().includes(keyword));
    const stok    = items.filter(i => i.status==='stok');
    
    if (items.length === 0) {
      await send(chat, `🔍 Tidak ada barang "<b>${text}</b>"\n\nKetik keyword lain atau /menu untuk kembali.`);
      return;
    }

    const rows = stok.slice(0,5).map((i) => `📦 <b>${i.name}</b>\nModal: ${rpShort(i.modal)} | Jual: ${rpShort(i.price)}`).join('\n\n');
    clearSession(db, uid); await putData(db);
    const m = await msgStokMenu(db);
    await send(chat, `🔍 <b>HASIL PENCARIAN: "${text}"</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n📦 Di Stok: ${stok.length} item\n✅ Sudah Terjual: ${items.filter(i=>i.status==='sold').length} item\n\n${rows || '—'}`, { 
      reply_markup: m.kb 
    });
    return;
  }

  await send(chat, `❓ Tidak ada aksi yang sesuai. Gunakan tombol di bawah layar.`);
}

// ══════════════════════════════════════════════════════════════════════
//  COMMAND HANDLER (MENANGANI SEMUA NAVIGASI UI)
// ══════════════════════════════════════════════════════════════════════
async function handleCommand(msg) {
  const chat = msg.chat.id;
  const uid  = msg.from.id;
  const text = (msg.text||'').trim();

  if (!isAdmin(uid)) { await send(chat, '⛔ Kamu tidak punya akses ke bot ini.'); return; }

  let db;
  try { db = await getData(); } catch (e) { await send(chat, '❌ Gagal ambil data.'); return; }

  // ── RESET SESI JIKA MENEKAN TOMBOL MENU UTAMA ATAU BATAL ──
  if (RESET_COMMANDS.includes(text) || text.startsWith('🏠')) {
    clearSession(db, uid);
    await putData(db);
  }

  // ── NAVIGASI MENU UTAMA ──
  if (text === '/start' || text === '/menu' || text === '/m' || text === '🏠 Menu Utama' || text === '❌ Batal') {
    const m = menuUtama();
    await send(chat, m.text, { reply_markup: m.kb });
    return;
  }
  if (text === '📊 Dashboard' || text === '🔄 Refresh Data' || text === '/dashboard' || text === '/d') {
    const m = await msgDashboard(db);
    await send(chat, m.text, { reply_markup: m.kb }); return;
  }
  if (text === '📦 Menu Stok' || text === '/stok' || text === '/s') {
    const m = await msgStokMenu(db);
    await send(chat, m.text, { reply_markup: m.kb }); return;
  }
  if (text === '💳 Transaksi' || text === '💳 Menu Transaksi') {
    const m = await msgTransaksi(db);
    await send(chat, m.text, { reply_markup: m.kb }); return;
  }
  if (text === '📈 Analitik' || text === '/laporan' || text === '/l') {
    const m = await msgAnalitik(db);
    await send(chat, m.text, { reply_markup: m.kb }); return;
  }
  if (text === '⚙️ Pengaturan') {
    const m = msgSettings(db);
    await send(chat, m.text, { reply_markup: m.kb }); return;
  }

  // ── SUB-MENU NAVIGASI ──
  if (text === '📈 Analitik Detail') {
    const m = await msgBrandDetail(db);
    await send(chat, m.text, { reply_markup: m.kb }); return;
  }
  if (text === '📋 Daftar Semua Stok' || text.match(/Daftar Hal \d+/)) {
    let page = 1;
    const matchNext = text.match(/Daftar Hal (\d+) ➡️/);
    const matchPrev = text.match(/⬅️ Daftar Hal (\d+)/);
    if (matchNext) page = parseInt(matchNext[1]);
    if (matchPrev) page = parseInt(matchPrev[1]);
    const m = await msgStokList(db, page);
    await send(chat, m.text, { reply_markup: m.kb }); return;
  }
  if (text === '⏳ Stok Mengendap') {
    const m = await msgStokAging(db);
    await send(chat, m.text, { reply_markup: m.kb }); return;
  }
  if (text === '📋 10 Tx Terakhir') {
    const m = await msgTxList(db, 10);
    await send(chat, m.text, { reply_markup: m.kb }); return;
  }
  if (text === '📅 Tx Bulan Ini') {
    const m = await msgTxBulanIni(db);
    await send(chat, m.text, { reply_markup: m.kb }); return;
  }
  if (text === '💰 Arus Kas Per Bulan') {
    const m = await msgCashflow(db);
    await send(chat, m.text, { reply_markup: m.kb }); return;
  }
  if (text === '🔥 Top Brand Detail') {
    const m = await msgBrandDetail(db);
    await send(chat, m.text, { reply_markup: m.kb }); return;
  }
  if (text === '📊 Tren Bulanan') {
    const m = await msgTren(db);
    await send(chat, m.text, { reply_markup: m.kb }); return;
  }
  if (text === '📋 Laporan Lengkap') {
    const m = await msgLaporanFull(db);
    await send(chat, m.text, { reply_markup: m.kb }); return;
  }

  // ── TRIGGER AKSI INPUT ──
  if (text === '✏️ Kelola Stok' || text.match(/Edit Hal \d+/)) {
    getSession(db, uid).step = 'kelola_stok_pilih'; await putData(db);
    let page = 1;
    const matchNext = text.match(/Edit Hal (\d+) ➡️/);
    const matchPrev = text.match(/⬅️ Edit Hal (\d+)/);
    if (matchNext) page = parseInt(matchNext[1]);
    if (matchPrev) page = parseInt(matchPrev[1]);
    const view = getKelolaStokView(db, page);
    await send(chat, view.text, { reply_markup: view.kb }); return;
  }
  if (text === '➕ Catat Masuk') {
    getSession(db, uid).step = 'masuk_nama'; await putData(db);
    await send(chat, `➕ <b>CATAT BARANG MASUK</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\nKetik <b>nama barang</b> lengkap:\n(contoh: iPhone 13 128GB Black)`, { reply_markup: makeKb(KB_CANCEL) }); return;
  }
  if (text === '✅ Tandai Terjual') {
    getSession(db, uid).step = 'terjual_cari'; await putData(db);
    await send(chat, `✅ <b>TANDAI BARANG TERJUAL</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\nKetik <b>nama barang</b> atau <b>kata kunci</b> untuk dicari:`, { reply_markup: makeKb(KB_CANCEL) }); return;
  }
  if (text === '⭐ Laba Jasa') {
    getSession(db, uid).step = 'ekstra_nama'; await putData(db);
    await send(chat, `⭐ <b>CATAT LABA JASA / EKSTRA</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\nKetik <b>keterangan / nama transaksi</b>:\n(contoh: Servis HP, Joki Unlock, dll)`, { reply_markup: makeKb(KB_CANCEL) }); return;
  }
  if (text === '🔍 Cari Stok') {
    getSession(db, uid).step = 'stok_cari'; await putData(db);
    await send(chat, `🔍 <b>CARI STOK</b>\n\nKetik <b>nama atau kata kunci</b> barang yang ingin dicari:`, { reply_markup: makeKb(KB_CANCEL) }); return;
  }
  if (text === '💼 Ubah Modal Awal') {
    getSession(db, uid).step = 'set_modal'; await putData(db);
    await send(chat, `💼 <b>UBAH MODAL AWAL</b>\nModal saat ini: ${rp(Number(db.startBalance)||0)}\n\nKetik <b>modal awal baru</b> (angka saja):`, { reply_markup: makeKb(KB_CANCEL) }); return;
  }

  // ── QUICK COMMAND ──
  if (text.startsWith('/masuk ')) {
    const parts = text.slice(7).split(',').map(s => s.trim());
    if (parts.length < 3) { await send(chat, '❌ Format: /masuk Nama, Modal, HargaJual'); return; }
    const [nama, modalStr, hargaStr] = parts;
    const modal = parseInt(modalStr.replace(/\D/g,''));
    const harga = parseInt(hargaStr.replace(/\D/g,''));
    if (!modal || !harga) { await send(chat, '❌ Format angka tidak valid.'); return; }
    try {
      db.items = db.items || [];
      db.items.push({ id: Date.now(), name: nama, modal, price: harga, status:'stok', type:'new', addedAt: new Date().toISOString() });
      await putData(db);
      await send(chat, `✅ Barang dicatat!\n📦 ${nama}\n💰 Modal: ${rp(modal)}\n💵 Harga: ${rp(harga)}\n💛 Margin: ${rp(harga-modal)}`);
    } catch (e) { await send(chat, '❌ Gagal menyimpan.'); } return;
  }

  if (text === '/help' || text === '/h') {
    await send(chat, `🤖 <b>BANTUAN</b>\nGunakan tombol-tombol di bawah layar untuk bernavigasi.\nJika tombol hilang, ketik /menu untuk memunculkannya kembali.`, { reply_markup: MAIN_KEYBOARD }); return;
  }

  // ── JIKA ADA SESI INPUT AKTIF ──
  if (getSession(db, uid).step) {
    try { await handleInput(chat, uid, text, db); } 
    catch (e) { await send(chat, '❌ Terjadi error.', { reply_markup: MAIN_KEYBOARD }); }
    return;
  }

  // Teks biasa tapi tidak ada sesi → tunjukkan menu
  await send(chat, `❓ Perintah tidak dikenali. Silakan gunakan menu di bawah layar:`, { reply_markup: MAIN_KEYBOARD });
}

// ══════════════════════════════════════════════════════════════════════
//  MAIN VERCEL HANDLER
// ══════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).send('Farid Store Bot V10 — Full Admin Bottom Keyboard Fixed');
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const body = req.body;
    if (body.message?.text) {
      await handleCommand(body.message);
    } else if (body.callback_query) {
      // Membersihkan inline keyboard yang tidak sengaja tertekan
      await tg('editMessageReplyMarkup', { chat_id: body.callback_query.message.chat.id, message_id: body.callback_query.message.message_id, reply_markup: { inline_keyboard: [] } });
      await tg('answerCallbackQuery', { callback_query_id: body.callback_query.id, text: '⛔ Tombol ini tidak valid, silakan gunakan keyboard di bawah.', show_alert: true });
    }
    return res.status(200).json({ ok: true }); 
  } catch (e) {
    console.error('Handler error:', e);
    return res.status(200).json({ ok: true, error: e.message });
  }
}
