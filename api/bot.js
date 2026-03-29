// ═══════════════════════════════════════════════════════════════════
//  FARID STORE BOT V11.2 — Full Dynamic Inline + Reply Keyboard
//  Vercel Serverless Webhook Handler
//  
//  PERBAIKAN & FITUR BARU:
//  - FIX FATAL BUG: Scope block /promo dan /tanya dimasukkan ke dalam fungsi
//  - UX: Auto-cancel session jika user mengetik command baru (cegah stuck)
//  - UX: Penambahan perintah /cancel untuk membatalkan aksi kapan saja
//  - UI: Layout tombol inline lebih proporsional dan ramah jari
// ═══════════════════════════════════════════════════════════════════

// ── CONFIG ──────────────────────────────────────────────────────────
const GEMINI_KEY = process.env.GEMINI_KEY;
const BOT_TOKEN  = process.env.BOT_TOKEN;
const ADMIN_IDS  = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const BIN_ID     = process.env.BIN_ID      || '699644fdae596e708f3582af';
const JSONBIN_KEY = process.env.JSONBIN_KEY  || '$2a$10$tcKHEWwuz2sqRoMCKJfga.1xxTFW0RxpXUPnP.NI4YbivtlK1xxau';

const TG  = `https://api.telegram.org/bot${BOT_TOKEN}`;
const BIN = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

const GOAL       = 100_000_000;
const MILESTONES = [10, 20, 30, 40, 50, 60, 75, 90].map(v => v * 1_000_000);

const BRAND_ICONS = {
  Apple: '🍎', Samsung: '🌌', Xiaomi: '🟠', Oppo: '🟢', Vivo: '🔵',
  Realme: '🟡', Infinix: '⚡', Tecno: '🔷', iTel: '⬛', Other: '📦'
};

// Keyboard persisten di area mengetik bawah
const kbBawah = {
  keyboard: [
    [{ text: '/menu' }, { text: '/dashboard' }],
    [{ text: '/stok' }, { text: '/laporan' }]
  ],
  resize_keyboard: true,
  is_persistent: true
};

// ── UTILS ────────────────────────────────────────────────────────────
const esc        = str => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rp         = n => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);
const rpShort    = n => {
  if (!n) return 'Rp 0';
  if (n >= 1e9) return `Rp ${(n / 1e9).toFixed(1)}M`;
  if (n >= 1e6) return `Rp ${(n / 1e6).toFixed(1)}Jt`;
  if (n >= 1e3) return `Rp ${(n / 1e3).toFixed(0)}Rb`;
  return `Rp ${n}`;
};
const pct  = (n, d) => d > 0 ? Math.min(100, (n / d * 100)).toFixed(1) : '0.0';
const bar  = (val, max, len = 10) => { const f = Math.round(Math.min(val / max, 1) * len); return '█'.repeat(f) + '░'.repeat(len - f); };
const mkStr      = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = mk => { const [y, m] = mk.split('-'); return `${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][+m - 1]} ${y}`; };
const longMonth  = mk => { const [y, m] = mk.split('-'); return `${['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][+m - 1]} ${y}`; };

function getBrand(name) {
  const n = String(name || '').toUpperCase();
  if (n.includes('IPHONE') || n.includes('APPLE') || n.includes('IPAD')) return 'Apple';
  if (n.includes('SAMSUNG') || n.includes('GALAXY') || n.includes('SEIN')) return 'Samsung';
  if (n.includes('XIAOMI') || n.includes('REDMI') || n.includes('NOTE') || n.includes('POCO') || n.includes('MI ')) return 'Xiaomi';
  if (n.includes('OPPO') || n.includes('RENO')) return 'Oppo';
  if (n.includes('VIVO') || n.includes('IQOO')) return 'Vivo';
  if (n.includes('REALME') || n.includes('NARZO')) return 'Realme';
  if (n.includes('INFINIX')) return 'Infinix';
  if (n.includes('TECNO')) return 'Tecno';
  if (n.includes('ITEL')) return 'iTel';
  return 'Other';
}

function parseDate(s) {
  if (!s || s === 'Imported') return new Date();
  if (s.includes('-') && s.length >= 10) return new Date(s.slice(0, 10) + 'T00:00:00');
  const p = s.split(' ')[0].split('/');
  if (p.length === 3) return new Date(+p[2], +p[1] - 1, +p[0]);
  return new Date();
}

// ── AI INTEGRATION ────────────────────────────────────────────────────
async function askGemini(promptText) {
  if (!GEMINI_KEY) return "⚠️ GEMINI_KEY belum diatur di Vercel!";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
  
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });
    const data = await r.json();
    return data.candidates[0].content.parts[0].text;
  } catch (e) {
    return "❌ Gagal menghubungi AI: " + e.message;
  }
}

// ── JSONBIN API ──────────────────────────────────────────────────────
async function getData() {
  const r = await fetch(`${BIN}/latest`, { headers: { 'X-Master-Key': JSONBIN_KEY } });
  if (!r.ok) throw new Error(`JSONBin GET failed: ${r.status}`);
  const db = (await r.json()).record;
  
  if (db.items) {
    db.items.forEach((item, idx) => {
      if (!item.id) item.id = Date.now() + idx; 
    });
  }
  return db;
}

async function putData(db) {
  const r = await fetch(BIN, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_KEY },
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

const send   = (chat, text, kb = null, extra = {}) => tg('sendMessage', {
  chat_id: chat, text, parse_mode: 'HTML',
  ...(kb ? { reply_markup: { inline_keyboard: kb } } : {}),
  ...extra
});

const edit   = (chat, mid, text, kb = null, extra = {}) => tg('editMessageText', {
  chat_id: chat, message_id: mid, text, parse_mode: 'HTML',
  ...(kb ? { reply_markup: { inline_keyboard: kb } } : {}),
  ...extra
});

const answer    = (id, text = '', alert = false) => tg('answerCallbackQuery', { callback_query_id: id, text, show_alert: alert });

const prompt = (chat, text) => tg('sendMessage', {
  chat_id: chat, text, parse_mode: 'HTML',
  reply_markup: { force_reply: true, input_field_placeholder: 'Ketik di sini...' }
});

// ── AUTH ─────────────────────────────────────────────────────────────
const isAdmin = uid => ADMIN_IDS.includes(String(uid)) || ADMIN_IDS.length === 0;

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

// ── DATA COMPUTATION ─────────────────────────────────────────────────
function compute(db) {
  const nowDate = new Date();
  const nowMk   = mkStr();

  let monthly = {}, brands = {}, allTx = [];
  let startBal = Number(db.startBalance) || 0;
  let belanja = 0, income = 0, profitMain = 0, profitExtra = 0;
  let floatModal = 0, floatPrice = 0, totalUnit = 0;
  let agingStocks = [];

  for (const i of (db.items || [])) {
    const ts = i.id ? Math.floor(Number(i.id)) : Date.now();
    if (i.status === 'sold') {
      totalUnit++;
      if (i.type === 'new') { belanja += i.modal; allTx.push({ id: ts, name: i.name, type: 'buy', amount: i.modal }); }
      income += i.price;
      const p     = i.price - i.modal;
      profitMain += p;
      const brand = getBrand(i.name);
      if (!brands[brand]) brands[brand] = { profit: 0, count: 0, revenue: 0 };
      brands[brand].profit  += p;
      brands[brand].count++;
      brands[brand].revenue += i.price;
      const soldD = parseDate(i.soldAt);
      const mk    = mkStr(soldD);
      allTx.push({ id: soldD.getTime(), name: i.name, type: 'sold', amount: i.price, profit: p, mk });
      if (!monthly[mk]) monthly[mk] = { units: 0, profit: 0, income: 0, expense: 0 };
      monthly[mk].units++;
      monthly[mk].profit  += p;
      monthly[mk].income  += i.price;
      monthly[mk].expense += i.modal;
    } else if (i.status === 'stok') {
      if (i.type === 'new') { belanja += i.modal; allTx.push({ id: ts, name: i.name, type: 'buy', amount: i.modal }); }
      floatPrice += i.price;
      floatModal += i.modal;
      const ageDays = ts ? Math.floor((nowDate - new Date(ts)) / 86400000) : 0;
      agingStocks.push({ name: i.name, modal: i.modal, price: i.price, days: ageDays, id: i.id, brand: getBrand(i.name) });
    }
  }

  for (const p of (db.extraProfits || [])) {
    profitExtra += p.profit;
    totalUnit++;
    const d  = new Date(Math.floor(Number(p.id)));
    const mk = mkStr(d);
    allTx.push({ id: Math.floor(Number(p.id)), name: p.name || 'Laba Jasa', type: 'extra', amount: p.profit, mk });
    if (!monthly[mk]) monthly[mk] = { units: 0, profit: 0, income: 0, expense: 0 };
    monthly[mk].profit  += p.profit;
    monthly[mk].units++;
    monthly[mk].income  += p.profit;
  }

  const totalProfit = profitMain + profitExtra;
  const cashSisa    = startBal - belanja + income;
  const totalAset   = cashSisa + floatPrice;
  const avgMargin   = totalUnit > 0 ? totalProfit / totalUnit : 0;

  agingStocks.sort((a, b) => b.days - a.days);
  allTx.sort((a, b) => b.id - a.id);

  const curMonth = monthly[nowMk] || { units: 0, profit: 0, income: 0, expense: 0 };
  const prevMil  = MILESTONES.filter(m => m <= totalAset).at(-1) || 0;
  const nextMil  = MILESTONES.find(m => m > totalAset) || GOAL;

  return {
    monthly, brands, allTx,
    startBal, belanja, income, profitMain, profitExtra, totalProfit,
    floatModal, floatPrice, cashSisa, totalAset, totalUnit, avgMargin,
    agingStocks, curMonth, nowMk, prevMil, nextMil,
    stokCount: (db.items || []).filter(i => i.status === 'stok').length,
    soldCount: totalUnit,
  };
}

// ══════════════════════════════════════════════════════════════════════
//  KEYBOARD BUILDERS
// ══════════════════════════════════════════════════════════════════════

function kbMenuUtama() {
  return [
    [{ text: '📊 Dashboard', callback_data: 'menu_dashboard' }, { text: '📦 Stok Gudang', callback_data: 'menu_stok' }],
    [{ text: '💳 Transaksi', callback_data: 'menu_transaksi' }, { text: '📈 Analitik', callback_data: 'menu_analitik' }],
    [{ text: '➕ Catat Masuk', callback_data: 'aksi_masuk' },   { text: '✅ Tandai Terjual', callback_data: 'aksi_terjual' }],
    [{ text: '⭐ Laba Jasa', callback_data: 'aksi_ekstra' },    { text: '⚙️ Pengaturan', callback_data: 'menu_settings' }],
    [{ text: '🔄 Refresh Data', callback_data: 'menu_utama' }]
  ];
}

function kbStokItems(items, page, totalPages, LIMIT) {
  const slice   = items.slice((page - 1) * LIMIT, page * LIMIT);
  const rows    = [];

  let numRow = [];
  slice.forEach((item, idx) => {
    const no = (page - 1) * LIMIT + idx + 1;
    numRow.push({ text: `📦 ${no}`, callback_data: `item_detail_${item.id}` });
    if (numRow.length === 5) { rows.push(numRow); numRow = []; }
  });
  if (numRow.length > 0) rows.push(numRow);

  if (totalPages > 1) {
    const nav = [];
    if (page > 1) {
      nav.push({ text: '⏪', callback_data: 'stok_list_1' });
      nav.push({ text: `◀️ ${page - 1}`, callback_data: `stok_list_${page - 1}` });
    }
    nav.push({ text: `• ${page}/${totalPages} •`, callback_data: 'noop' });
    if (page < totalPages) {
      nav.push({ text: `${page + 1} ▶️`, callback_data: `stok_list_${page + 1}` });
      nav.push({ text: '⏩', callback_data: `stok_list_${totalPages}` });
    }
    rows.push(nav);
  }

  rows.push([{ text: '🔍 Cari Barang', callback_data: 'stok_cari' }, { text: '⏳ Stok Lama', callback_data: 'stok_aging' }]);
  rows.push([{ text: '➕ Tambah Stok', callback_data: 'aksi_masuk' }, { text: '🏠 Menu Utama', callback_data: 'menu_utama' }]);
  return rows;
}

function kbItemDetail(itemId, page = 1) {
  return [
    [{ text: '✅ Tandai Terjual', callback_data: `item_jual_${itemId}` }],
    [{ text: '✏️ Edit Nama', callback_data: `item_edit_nama_${itemId}` }, { text: '💰 Edit Harga', callback_data: `item_edit_harga_${itemId}` }],
    [{ text: '🗑️ Hapus Barang', callback_data: `item_hapus_konfirm_${itemId}` }],
    [{ text: `◀️ Kembali ke Daftar (Hal. ${page})`, callback_data: `stok_list_${page}` }],
    [{ text: '🏠 Menu Utama', callback_data: 'menu_utama' }]
  ];
}

function kbHapusKonfirm(itemId, page = 1) {
  return [
    [{ text: '✅ Ya, Hapus Permanen', callback_data: `item_hapus_eksekusi_${itemId}` }],
    [{ text: '❌ Batal', callback_data: `item_detail_${itemId}` }]
  ];
}

function kbTransaksi() {
  return [
    [{ text: '📋 10 Transaksi Terakhir', callback_data: 'tx_list_10' }, { text: '📅 Bulan Ini', callback_data: 'tx_bulan_ini' }],
    [{ text: '💰 Arus Kas Bulanan', callback_data: 'tx_cashflow' }],
    [{ text: '➕ Catat Masuk', callback_data: 'aksi_masuk' }, { text: '✅ Terjual', callback_data: 'aksi_terjual' }],
    [{ text: '⭐ Laba Jasa', callback_data: 'aksi_ekstra' }],
    [{ text: '🏠 Menu Utama', callback_data: 'menu_utama' }]
  ];
}

function kbAnalitik() {
  return [
    [{ text: '🔥 Top Brand Detail', callback_data: 'analitik_brand' }, { text: '📊 Tren Bulanan', callback_data: 'analitik_tren' }],
    [{ text: '⏳ Stok Aging', callback_data: 'stok_aging' }, { text: '📋 Laporan Full', callback_data: 'laporan_full' }],
    [{ text: '🏠 Menu Utama', callback_data: 'menu_utama' }]
  ];
}

function kbDashboard() {
  return [
    [{ text: '📦 Lihat Stok', callback_data: 'stok_list_1' }, { text: '⏳ Stok Lama', callback_data: 'stok_aging' }],
    [{ text: '📈 Analitik', callback_data: 'menu_analitik' }, { text: '💳 Transaksi', callback_data: 'menu_transaksi' }],
    [{ text: '🔄 Refresh', callback_data: 'menu_dashboard' }, { text: '🏠 Menu Utama', callback_data: 'menu_utama' }]
  ];
}

function kbMenuStok() {
  return [
    [{ text: '📋 Daftar Semua Stok', callback_data: 'stok_list_1' }],
    [{ text: '⏳ Stok Mengendap (>14hr)', callback_data: 'stok_aging' }, { text: '🔍 Cari Stok', callback_data: 'stok_cari' }],
    [{ text: '➕ Catat Masuk', callback_data: 'aksi_masuk' }, { text: '✅ Tandai Terjual', callback_data: 'aksi_terjual' }],
    [{ text: '🔄 Refresh', callback_data: 'menu_stok' }, { text: '🏠 Menu Utama', callback_data: 'menu_utama' }]
  ];
}

function kbAksiSukses(opts = {}) {
  const rows = [];
  if (opts.tambahLagi) rows.push([{ text: opts.tambahLagi.text, callback_data: opts.tambahLagi.cb }]);
  rows.push([{ text: '📊 Dashboard', callback_data: 'menu_dashboard' }, { text: '📦 Menu Stok', callback_data: 'menu_stok' }]);
  rows.push([{ text: '🏠 Menu Utama', callback_data: 'menu_utama' }]);
  return rows;
}

function kbKonfirmasiTerjual() {
  return [[{ text: '✅ Ya, Konfirmasi', callback_data: 'terjual_confirm' }, { text: '❌ Batal', callback_data: 'cancel' }]];
}

function kbTipeMasuk() {
  return [
    [{ text: '🆕 Baru (modal keluar dari kas)', callback_data: 'masuk_tipe_new' }],
    [{ text: '♻️ Konsinyasi / Titipan', callback_data: 'masuk_tipe_konsinyasi' }],
    [{ text: '❌ Batal', callback_data: 'cancel' }]
  ];
}

function kbPilihBarangTerjual(items) {
  const kb = items.slice(0, 8).map((item, i) => [
    { text: `${i + 1}. ${item.name.slice(0, 25)} — ${rpShort(item.price)}`, callback_data: `terjual_item_${i}` }
  ]);
  kb.push([{ text: '❌ Batal', callback_data: 'cancel' }]);
  return kb;
}

function kbHargaJual(price) {
  return [
    [{ text: `💵 Pakai harga list: ${rpShort(price)}`, callback_data: 'terjual_harga_list' }],
    [{ text: '❌ Batal', callback_data: 'cancel' }]
  ];
}

function kbKonfirmasiYaTidak(cbYa, cbTidak) {
  return [[{ text: '✅ Ya', callback_data: cbYa }, { text: '❌ Batal', callback_data: cbTidak }]];
}

function kbSettings() {
  return [
    [{ text: '💼 Ubah Modal Awal', callback_data: 'set_modal' }],
    [{ text: '⭐ Catat Laba Jasa', callback_data: 'aksi_ekstra' }],
    [{ text: '🏠 Menu Utama', callback_data: 'menu_utama' }]
  ];
}

function kbKembali(cb, label = '◀️ Kembali') {
  return [[{ text: label, callback_data: cb }], [{ text: '🏠 Menu Utama', callback_data: 'menu_utama' }]];
}

// ══════════════════════════════════════════════════════════════════════
//  MESSAGE BUILDERS
// ══════════════════════════════════════════════════════════════════════

function txtMenuUtama() {
  return `🏪 <b>FARID STORE</b> — Admin Panel\n━━━━━━━━━━━━━━━━━━━━━\nPilih menu yang ingin kamu akses:`;
}

async function txtDashboard(db) {
  const c       = compute(db);
  const pctGoal = pct(c.totalAset, GOAL);
  const barGoal = bar(c.totalAset, GOAL, 12);
  const pctMil  = pct(c.totalAset - c.prevMil, c.nextMil - c.prevMil);
  const barMil  = bar(c.totalAset - c.prevMil, c.nextMil - c.prevMil, 12);

  const sortedMks = Object.keys(c.monthly).sort().slice(-3);
  const avg3      = sortedMks.reduce((s, k) => s + c.monthly[k].profit, 0) / (sortedMks.length || 1);
  let etaStr = '—';
  if (c.totalAset >= GOAL) etaStr = '✅ TERCAPAI!';
  else if (avg3 > 0) {
    const d = new Date(); d.setMonth(d.getMonth() + Math.ceil((GOAL - c.totalAset) / avg3));
    etaStr = longMonth(mkStr(d));
  }

  const cm = c.curMonth;
  return `🏪 <b>FARID STORE — DASHBOARD</b>
━━━━━━━━━━━━━━━━━━━━━━━━━

💰 <b>TOTAL ASET</b>
${rp(c.totalAset)}
<code>${barGoal}</code> ${pctGoal}% dari 100Jt

🏁 <b>MILESTONE BERIKUTNYA</b>
Target → ${rp(c.nextMil)}
<code>${barMil}</code> ${pctMil}%
📅 ETA: <b>${etaStr}</b>

📊 <b>BREAKDOWN ASET</b>
├ 💵 Kas Tunai: ${rp(c.cashSisa)}
└ 📦 Nilai Stok: ${rp(c.floatPrice)}

📈 <b>LABA AKUMULASI</b>
${rp(c.totalProfit)} dari ${c.totalUnit} unit
Rata-rata margin: ${rpShort(c.avgMargin)}/unit

📅 <b>BULAN INI</b> (${longMonth(c.nowMk)})
├ 💚 Omset: ${rp(cm.income)}
├ ❤️  HPP: ${rp(cm.expense)}
├ 💛 Laba: ${rp(cm.profit)}
└ 📦 Terjual: ${cm.units} unit

🗃️ <b>STOK GUDANG</b>
${c.stokCount} item • Modal: ${rp(c.floatModal)} • Harga: ${rp(c.floatPrice)}`;
}

async function txtMenuStok(db) {
  const c     = compute(db);
  const items = (db.items || []).filter(i => i.status === 'stok');
  const byBrand = {};
  items.forEach(i => {
    const b = getBrand(i.name);
    if (!byBrand[b]) byBrand[b] = { count: 0, modal: 0 };
    byBrand[b].count++;
    byBrand[b].modal += i.modal;
  });

  const brandRows = Object.entries(byBrand)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([b, v]) => `${BRAND_ICONS[b] || '📦'} ${b}: ${v.count} unit • ${rpShort(v.modal)}`)
    .join('\n');

  return `📦 <b>MANAJEMEN STOK GUDANG</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
Total: <b>${items.length} item</b>
Modal: ${rp(c.floatModal)} | Harga Jual: ${rp(c.floatPrice)}
Potensi Laba: ${rp(c.floatPrice - c.floatModal)}

📊 <b>KOMPOSISI MEREK</b>
${brandRows || '— Stok kosong'}`;
}

function txtStokList(items, page, totalPages, LIMIT) {
  const slice   = items.slice((page - 1) * LIMIT, page * LIMIT);
  const nowDate = new Date();

  const ringkasan = slice.map((item, idx) => {
    const no      = (page - 1) * LIMIT + idx + 1;
    const ageDays = item.id ? Math.floor((nowDate - new Date(Math.floor(Number(item.id)))) / 86400000) : 0;
    const ageIcon = ageDays > 30 ? '🔴' : ageDays > 14 ? '🟡' : '🟢';
    return `${ageIcon} <b>${no}.</b> ${esc(item.name)} — ${rpShort(item.price)} <i>(${ageDays}hr)</i>`;
  }).join('\n');

  return `📦 <b>DAFTAR STOK</b> — Hal. ${page}/${totalPages}
━━━━━━━━━━━━━━━━━━━━━━━━━
${ringkasan || 'Stok kosong!'}
━━━━━━━━━━━━━━━━━━━━━━━━━
🟢 &lt;14hr  🟡 14–30hr  🔴 &gt;30hr
<i>Ketuk tombol nomor di bawah untuk detail & aksi</i>`;
}

function txtItemDetail(item) {
  const ageDays = item.id ? Math.floor((new Date() - new Date(Math.floor(Number(item.id)))) / 86400000) : 0;
  const ageIcon = ageDays > 30 ? '🔴' : ageDays > 14 ? '🟡' : '🟢';
  const brand   = getBrand(item.name);
  const margin  = item.price - item.modal;
  const pctMargin = item.price > 0 ? ((margin / item.price) * 100).toFixed(1) : '0';
  const addedDate = item.addedAt ? new Date(item.addedAt).toLocaleDateString('id-ID') : '—';

  return `🗃️ <b>DETAIL BARANG</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📦 <b>${esc(item.name)}</b>
${BRAND_ICONS[brand] || '📦'} Merek: ${brand}
━━━━━━━━━━━━━━━━━━━━━━━━━
💰 Modal: ${rp(item.modal)}
💵 Harga Jual: ${rp(item.price)}
💛 Potensi Laba: ${rp(margin)} (${pctMargin}%)
🏷️ Tipe: ${item.type === 'new' ? '🆕 Baru' : '♻️ Konsinyasi'}
📅 Masuk: ${addedDate}
${ageIcon} Di gudang: <b>${ageDays} hari</b>`;
}

async function txtTransaksi(db) {
  const c   = compute(db);
  const tx5 = c.allTx.slice(0, 5);
  const rows = tx5.map(tx => {
    const icon  = tx.type === 'sold' ? '📤' : tx.type === 'buy' ? '📥' : '⭐';
    const sign  = tx.type === 'buy' ? '−' : '+';
    const d     = new Date(tx.id);
    const ds    = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const extra = tx.type === 'sold' ? ` <i>(laba: ${rpShort(tx.profit)})</i>` : '';
    return `${icon} ${ds} <b>${esc(tx.name)}</b>\n    ${sign}${rpShort(tx.amount)}${extra}`;
  }).join('\n\n');

  return `💳 <b>MUTASI TRANSAKSI</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📥 Total Belanja: ${rp(c.belanja)}
📤 Total Penjualan: ${rp(c.income)}
⭐ Laba Ekstra: ${rp(c.profitExtra)}

<b>5 TRANSAKSI TERAKHIR</b>
${rows || '—'}`;
}

async function txtTxList(db, limit = 10) {
  const c  = compute(db);
  const tx = c.allTx.slice(0, limit);
  const rows = tx.map((tx, idx) => {
    const icon  = tx.type === 'sold' ? '📤' : tx.type === 'buy' ? '📥' : '⭐';
    const sign  = tx.type === 'buy' ? '−' : '+';
    const d     = new Date(tx.id);
    const ds    = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const extra = tx.type === 'sold' ? `\n    💛 Laba: ${rpShort(tx.profit)}` : '';
    return `${idx + 1}. ${icon} <b>${esc(tx.name)}</b>\n    📅 ${ds} | ${sign}${rp(tx.amount)}${extra}`;
  }).join('\n\n');
  return `💳 <b>${limit} TRANSAKSI TERAKHIR</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n${rows || '—'}`;
}

async function txtCashflow(db) {
  const c   = compute(db);
  const mks = Object.keys(c.monthly).sort().reverse().slice(0, 6);
  const rows = mks.map(mk => {
    const m    = c.monthly[mk];
    const icon = m.profit > 0 ? '✅' : '❌';
    return `${icon} <b>${longMonth(mk)}</b>\n  💚 ${rpShort(m.income)} | ❤️ ${rpShort(m.expense)} | 💛 ${rpShort(m.profit)} | 📦 ${m.units}`;
  }).join('\n\n');
  return `💰 <b>ARUS KAS PER BULAN</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n${rows || '—'}`;
}

async function txtAnalitik(db) {
  const c    = compute(db);
  const bArr = Object.entries(c.brands).sort((a, b) => b[1].profit - a[1].profit).slice(0, 5);
  const brandRows = bArr.map(([b, v], i) => {
    const medal = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i];
    const icon  = BRAND_ICONS[b] || '📦';
    return `${medal} ${icon} <b>${b}</b>\n   Laba: ${rp(v.profit)} | ${v.count} unit`;
  }).join('\n\n');

  const sortedMks = Object.keys(c.monthly).sort().slice(-4);
  const maxP      = Math.max(...sortedMks.map(k => c.monthly[k].profit || 0), 1);
  const trendRows = sortedMks.reverse().map(mk => {
    const m    = c.monthly[mk];
    const bLen = bar(m.profit, maxP, 8);
    return `📅 <b>${monthLabel(mk)}</b>: ${rpShort(m.profit)}\n  <code>${bLen}</code> ${m.units} unit`;
  }).join('\n\n');

  const over30 = c.agingStocks.filter(i => i.days > 30).length;
  const over14 = c.agingStocks.filter(i => i.days > 14 && i.days <= 30).length;

  return `📈 <b>ANALITIK LENGKAP</b>
━━━━━━━━━━━━━━━━━━━━━━━━━

🔥 <b>TOP MEREK (ALL TIME)</b>
${brandRows || '—'}

📊 <b>TREN LABA 4 BULAN</b>
${trendRows || '—'}

⚠️ <b>PERINGATAN STOK</b>
🔴 Mengendap &gt;30hr: ${over30} item
🟡 Mengendap 14–30hr: ${over14} item
Total stok: ${c.stokCount} item`;
}

async function txtBrandDetail(db) {
  const c    = compute(db);
  const bArr = Object.entries(c.brands).sort((a, b) => b[1].profit - a[1].profit);
  const maxP = bArr[0]?.[1].profit || 1;
  const rows = bArr.map(([b, v]) => {
    const icon   = BRAND_ICONS[b] || '📦';
    const margin = v.count > 0 ? v.profit / v.count : 0;
    const bLen   = bar(v.profit, maxP, 10);
    return `${icon} <b>${b}</b>\n<code>${bLen}</code>\nLaba: ${rp(v.profit)} | ${v.count} unit | Margin/unit: ${rpShort(margin)}`;
  }).join('\n\n');
  return `🔥 <b>DETAIL TOP MEREK</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n${rows || '—'}`;
}

async function txtTren(db) {
  const c    = compute(db);
  const mks  = Object.keys(c.monthly).sort();
  const maxP = Math.max(...mks.map(k => c.monthly[k].profit || 0), 1);
  const rows = mks.reverse().map(mk => {
    const m    = c.monthly[mk];
    const b    = bar(m.profit, maxP, 10);
    const icon = m.profit > 0 ? '✅' : '❌';
    return `${icon} <b>${longMonth(mk)}</b>\n<code>${b}</code> ${rpShort(m.profit)}\n💚 ${rpShort(m.income)} | ❤️ ${rpShort(m.expense)} | 📦 ${m.units} unit`;
  }).join('\n\n');
  return `📊 <b>TREN BULANAN (SEMUA)</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n${rows || '—'}`;
}

async function txtLaporanFull(db) {
  const c        = compute(db);
  const pctGoal  = pct(c.totalAset, GOAL);
  const bArr     = Object.entries(c.brands).sort((a, b) => b[1].profit - a[1].profit).slice(0, 3);
  const tanggal  = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

  return `📋 <b>LAPORAN LENGKAP FARID STORE</b>
📅 Per ${tanggal}
━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 <b>PROGRES TARGET 100 JT</b>
Total Aset: ${rp(c.totalAset)}
<code>${bar(c.totalAset, GOAL, 14)}</code> ${pctGoal}%

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
${bArr.map(([b, v], i) => `${['🥇','🥈','🥉'][i]} ${b}: ${rp(v.profit)} (${v.count} unit)`).join('\n')}`;
}

async function txtTxBulanIni(db) {
  const c   = compute(db);
  const mk  = c.nowMk;
  const tx  = c.allTx.filter(t => t.mk === mk || (t.id && mkStr(new Date(t.id)) === mk)).slice(0, 15);
  const cm  = c.curMonth;
  const rows = tx.map((t, i) => {
    const icon = t.type === 'sold' ? '📤' : t.type === 'buy' ? '📥' : '⭐';
    const d    = new Date(t.id);
    const ds   = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `${i + 1}. ${icon} <b>${esc(t.name)}</b>\n    ${ds} | ${rpShort(t.amount)}`;
  }).join('\n\n');

  return `📅 <b>TRANSAKSI ${longMonth(mk).toUpperCase()}</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
💚 Omset: ${rp(cm.income)}
❤️  HPP: ${rp(cm.expense)}
💛 Laba: ${rp(cm.profit)}
📦 Terjual: ${cm.units} unit

<b>DETAIL:</b>
${rows || '—'}`;
}

async function txtStokAging(db) {
  const c    = compute(db);
  const aging = c.agingStocks;
  if (aging.length === 0) return `⏳ <b>STOK MENGENDAP</b>\n\nTidak ada stok mengendap. Perputaran lancar! ✅`;
  const rows  = aging.slice(0, 12).map((i, idx) => {
    const icon = i.days > 30 ? '🔴' : i.days > 14 ? '🟡' : '🟢';
    return `${idx + 1}. ${icon} <b>${esc(i.name)}</b>\n    Modal: ${rpShort(i.modal)} | <b>${i.days} hari</b>`;
  }).join('\n\n');
  const over30 = aging.filter(i => i.days > 30).length;
  const over14 = aging.filter(i => i.days > 14 && i.days <= 30).length;
  return `⏳ <b>STOK MENGENDAP</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 &gt;30 hari: ${over30} item
🟡 14–30 hari: ${over14} item

${rows}`;
}

function txtSettings(db) {
  return `⚙️ <b>PENGATURAN</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
💼 Modal Awal: ${rp(Number(db.startBalance) || 0)}

Kamu bisa mengubah konfigurasi toko di sini.`;
}

// ══════════════════════════════════════════════════════════════════════
//  INPUT HANDLER — Multi-step flow
// ══════════════════════════════════════════════════════════════════════
async function handleInput(chat, uid, text, db) {
  const sess = getSession(db, uid);

  // ── CATAT BARANG MASUK ───────────────────────────────────────────
  if (sess.step === 'masuk_nama') {
    sess.nama  = text;
    sess.step  = 'masuk_modal';
    await putData(db);
    await prompt(chat, `✏️ Nama: <b>${esc(text)}</b>\n\nKetik <b>harga modal</b> (angka saja, contoh: 1500000):`);
    return;
  }
  if (sess.step === 'masuk_modal') {
    const val = parseInt(text.replace(/\D/g, ''));
    if (!val || val <= 0) { await prompt(chat, '❌ Harga tidak valid. Coba lagi:'); return; }
    sess.modal = val;
    sess.step  = 'masuk_harga';
    await putData(db);
    await prompt(chat, `✏️ Modal: <b>${rp(val)}</b>\n\nKetik <b>harga jual</b>:`);
    return;
  }
  if (sess.step === 'masuk_harga') {
    const val = parseInt(text.replace(/\D/g, ''));
    if (!val || val <= 0) { await prompt(chat, '❌ Harga tidak valid. Coba lagi:'); return; }
    sess.harga = val;
    sess.step  = 'masuk_tipe';
    await putData(db);
    const margin = val - sess.modal;
    const pctM   = pct(margin, val);
    await send(chat, `✏️ Harga Jual: <b>${rp(val)}</b>\nMargin: <b>${rp(margin)}</b> (${pctM}%)\n\nPilih tipe barang:`, kbTipeMasuk());
    return;
  }

  // ── TANDAI TERJUAL ───────────────────────────────────────────────
  if (sess.step === 'terjual_cari') {
    const keyword = text.toLowerCase();
    const items   = (db.items || []).filter(i => i.status === 'stok' && i.name.toLowerCase().includes(keyword));
    if (items.length === 0) {
      await prompt(chat, `❌ Tidak ada stok mengandung kata "<b>${esc(text)}</b>".\nCoba kata kunci lain:`);
      return;
    }
    sess.step        = 'terjual_pilih';
    sess.cariResults = items.slice(0, 8);
    await putData(db);
    await send(chat, `🔍 Ditemukan <b>${items.length}</b> item.\nPilih barang yang terjual:`, kbPilihBarangTerjual(items));
    return;
  }

  if (sess.step === 'terjual_harga') {
    const val = parseInt(text.replace(/\D/g, ''));
    if (!val || val <= 0) { await prompt(chat, '❌ Harga tidak valid. Coba lagi:'); return; }
    sess.hargaJual = val;
    sess.step      = 'terjual_konfirmasi';
    await putData(db);
    const item   = sess.selectedItem;
    const profit = val - item.modal;
    await send(chat, `✅ <b>KONFIRMASI PENJUALAN</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Barang: <b>${esc(item.name)}</b>
💰 Modal: ${rp(item.modal)}
💵 Harga Jual: ${rp(val)}
💛 Laba: ${rp(profit)}
📅 Tgl: ${new Date().toLocaleDateString('id-ID')}

Konfirmasi penjualan ini?`, kbKonfirmasiTerjual());
    return;
  }

  // ── EDIT NAMA STOK ────────────────────────────────────────────────
  if (sess.step === 'edit_stok_nama') {
    const item = sess.selectedEditItem;
    const idx  = (db.items || []).findIndex(i => String(i.id) === String(item.id));
    if (idx > -1) {
      const namaLama = db.items[idx].name;
      db.items[idx].name = text;
      clearSession(db, uid);
      await putData(db);
      await send(chat, `✅ Nama berhasil diubah!\n\n<b>${esc(namaLama)}</b> → <b>${esc(text)}</b>`,
        kbKembali(`item_detail_${item.id}`, '◀️ Kembali ke Detail Barang'));
    } else {
      await send(chat, `❌ Barang tidak ditemukan.`, kbKembali('menu_stok', '◀️ Kembali ke Stok'));
    }
    return;
  }

  // ── EDIT HARGA STOK ───────────────────────────────────────────────
  if (sess.step === 'edit_stok_modal') {
    const val = parseInt(text.replace(/\D/g, ''));
    if (!val || val <= 0) { await prompt(chat, '❌ Harga tidak valid. Coba lagi:'); return; }
    sess.newEditModal = val;
    sess.step         = 'edit_stok_harga';
    await putData(db);
    await prompt(chat, `💰 Modal baru: <b>${rp(val)}</b>\n\nKetik <b>Harga Jual Baru</b> (angka saja):`);
    return;
  }
  if (sess.step === 'edit_stok_harga') {
    const val  = parseInt(text.replace(/\D/g, ''));
    if (!val || val <= 0) { await prompt(chat, '❌ Harga tidak valid. Coba lagi:'); return; }
    const item = sess.selectedEditItem;
    const idx  = (db.items || []).findIndex(i => String(i.id) === String(item.id));
    if (idx > -1) {
      db.items[idx].modal = sess.newEditModal;
      db.items[idx].price = val;
      clearSession(db, uid);
      await putData(db);
      await send(chat, `✅ Harga berhasil diubah!\n💰 Modal: ${rp(sess.newEditModal)}\n💵 Jual: ${rp(val)}`,
        kbKembali(`item_detail_${item.id}`, '◀️ Kembali ke Detail Barang'));
    } else {
      await send(chat, `❌ Barang tidak ditemukan.`, kbKembali('menu_stok', '◀️ Kembali ke Stok'));
    }
    return;
  }

  // ── LABA JASA ────────────────────────────────────────────────────
  if (sess.step === 'ekstra_nama') {
    sess.ekstraNama = text;
    sess.step       = 'ekstra_nominal';
    await putData(db);
    await prompt(chat, `✏️ Keterangan: <b>${esc(text)}</b>\n\nKetik <b>nominal laba</b> (angka saja):`);
    return;
  }
  if (sess.step === 'ekstra_nominal') {
    const val = parseInt(text.replace(/\D/g, ''));
    if (!val || val <= 0) { await prompt(chat, '❌ Nominal tidak valid. Coba lagi:'); return; }
    sess.ekstraNominal = val;
    sess.step          = 'ekstra_konfirmasi';
    await putData(db);
    await send(chat, `⭐ <b>KONFIRMASI LABA JASA</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Keterangan: <b>${esc(sess.ekstraNama)}</b>
💰 Nominal: <b>${rp(val)}</b>

Catat laba ini?`, kbKonfirmasiYaTidak('ekstra_confirm', 'cancel'));
    return;
  }

  // ── SET MODAL ────────────────────────────────────────────────────
  if (sess.step === 'set_modal') {
    const val = parseInt(text.replace(/\D/g, ''));
    if (!val || val <= 0) { await prompt(chat, '❌ Nominal tidak valid. Coba lagi:'); return; }
    sess.newModal = val;
    sess.step     = 'set_modal_konfirmasi';
    await putData(db);
    await send(chat, `💼 <b>KONFIRMASI UBAH MODAL</b>\nModal baru: <b>${rp(val)}</b>\n\nLanjutkan?`,
      kbKonfirmasiYaTidak('set_modal_confirm', 'cancel'));
    return;
  }

  // ── CARI STOK ────────────────────────────────────────────────────
  if (sess.step === 'stok_cari') {
    const keyword = text.toLowerCase();
    const items   = (db.items || []).filter(i => i.name.toLowerCase().includes(keyword));
    const stok    = items.filter(i => i.status === 'stok');
    const sold    = items.filter(i => i.status === 'sold');

    if (items.length === 0) {
      await prompt(chat, `🔍 Tidak ada barang "<b>${esc(text)}</b>". Coba kata kunci lain:`);
      return;
    }

    const rows = stok.slice(0, 5).map((i) => {
      const d = i.id ? Math.floor((new Date() - new Date(Math.floor(Number(i.id)))) / 86400000) : 0;
      return `📦 <b>${esc(i.name)}</b>\nModal: ${rpShort(i.modal)} | Jual: ${rpShort(i.price)} | ${d} hari`;
    }).join('\n\n');

    clearSession(db, uid);
    await putData(db);

    await send(chat, `🔍 <b>HASIL PENCARIAN: "${esc(text)}"</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Di Stok: ${stok.length} item
✅ Sudah Terjual: ${sold.length} item

${rows || '—'}`, [
      [{ text: '📦 Kembali ke Stok', callback_data: 'menu_stok' }],
      [{ text: '🏠 Menu Utama', callback_data: 'menu_utama' }]
    ]);
    return;
  }

  // Fallback
  await send(chat, `❓ Tidak ada aksi aktif. Gunakan /menu untuk memulai.`, kbMenuUtama());
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

  if (data === 'noop') return;

  let db;
  try { db = await getData(); }
  catch (e) { await edit(chat, mid, '❌ Gagal ambil data. Coba lagi.', kbKembali('menu_utama')); return; }

  if (data === 'menu_utama') {
    await edit(chat, mid, txtMenuUtama(), kbMenuUtama());
    return;
  }

  if (data === 'menu_dashboard') {
    await edit(chat, mid, await txtDashboard(db), kbDashboard());
    return;
  }

  if (data === 'menu_stok') {
    await edit(chat, mid, await txtMenuStok(db), kbMenuStok());
    return;
  }

  if (data.startsWith('stok_list_')) {
    const LIMIT   = 10;
    const page    = parseInt(data.split('_')[2]) || 1;
    const items   = (db.items || []).filter(i => i.status === 'stok').sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
    const total   = items.length;
    const pages   = Math.ceil(total / LIMIT) || 1;
    const safePage = Math.min(Math.max(page, 1), pages);

    await edit(chat, mid,
      txtStokList(items, safePage, pages, LIMIT),
      kbStokItems(items, safePage, pages, LIMIT)
    );
    return;
  }

  if (data.startsWith('item_detail_')) {
    const itemId = data.split('_').pop();
    const item   = (db.items || []).find(i => String(i.id) === String(itemId));
    if (!item) { await answer(cb.id, '❌ Item tidak ditemukan.', true); return; }

    const LIMIT  = 10;
    const items  = (db.items || []).filter(i => i.status === 'stok').sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
    const idxAll = items.findIndex(i => String(i.id) === String(itemId));
    const page   = idxAll >= 0 ? Math.floor(idxAll / LIMIT) + 1 : 1;

    await edit(chat, mid, txtItemDetail(item), kbItemDetail(itemId, page));
    return;
  }

  if (data.startsWith('item_jual_')) {
    const itemId = data.split('_').pop();
    const item   = (db.items || []).find(i => String(i.id) === String(itemId) && i.status === 'stok');
    if (!item) { await answer(cb.id, '❌ Item tidak ditemukan.', true); return; }

    const sess        = getSession(db, uid);
    sess.selectedItem = item;
    sess.step         = 'terjual_harga';
    await putData(db);

    await edit(chat, mid, `✅ <b>${esc(item.name)}</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
💰 Modal: ${rp(item.modal)}
💵 Harga List: ${rp(item.price)}

Pilih harga jual atau ketik manual:`, kbHargaJual(item.price));
    return;
  }

  if (data.startsWith('item_edit_nama_')) {
    const itemId = data.split('_').pop();
    const item   = (db.items || []).find(i => String(i.id) === String(itemId));
    if (!item) { await answer(cb.id, '❌ Item tidak ditemukan.', true); return; }

    const sess              = getSession(db, uid);
    sess.selectedEditItem   = item;
    sess.step               = 'edit_stok_nama';
    await putData(db);
    await prompt(chat, `✏️ Ketik <b>nama baru</b> untuk:\n<b>${esc(item.name)}</b>`);
    return;
  }

  if (data.startsWith('item_edit_harga_')) {
    const itemId = data.split('_').pop();
    const item   = (db.items || []).find(i => String(i.id) === String(itemId));
    if (!item) { await answer(cb.id, '❌ Item tidak ditemukan.', true); return; }

    const sess              = getSession(db, uid);
    sess.selectedEditItem   = item;
    sess.step               = 'edit_stok_modal';
    await putData(db);
    await prompt(chat, `💰 Ketik <b>harga modal baru</b> untuk:\n<b>${esc(item.name)}</b>\nModal saat ini: ${rp(item.modal)}`);
    return;
  }

  if (data.startsWith('item_hapus_konfirm_')) {
    const itemId = data.split('_').pop();
    const item   = (db.items || []).find(i => String(i.id) === String(itemId));
    if (!item) { await answer(cb.id, '❌ Item tidak ditemukan.', true); return; }

    const sess              = getSession(db, uid);
    sess.selectedEditItem   = item;
    await putData(db);

    await edit(chat, mid, `⚠️ <b>YAKIN HAPUS BARANG INI?</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📦 <b>${esc(item.name)}</b>
💰 Modal: ${rp(item.modal)} | 💵 Jual: ${rp(item.price)}

⛔ Tindakan ini tidak bisa dibatalkan!`, kbHapusKonfirm(itemId));
    return;
  }

  if (data.startsWith('item_hapus_eksekusi_')) {
    const itemId = data.split('_').pop();
    const idx    = (db.items || []).findIndex(i => String(i.id) === String(itemId));
    const item   = idx > -1 ? db.items[idx] : null;
    if (idx === -1) { await answer(cb.id, '❌ Item tidak ditemukan.', true); return; }

    db.items.splice(idx, 1);
    clearSession(db, uid);
    await putData(db);

    await edit(chat, mid, `🗑️ <b>${esc(item.name)}</b> berhasil dihapus dari sistem.`,
      kbKembali('stok_list_1', '📦 Kembali ke Daftar Stok'));
    return;
  }

  if (data === 'stok_aging') {
    const kbAging = [
      [{ text: '✅ Tandai Terjual', callback_data: 'aksi_terjual' }],
      [{ text: '📦 Menu Stok', callback_data: 'menu_stok' }, { text: '🏠 Menu Utama', callback_data: 'menu_utama' }]
    ];
    await edit(chat, mid, await txtStokAging(db), kbAging);
    return;
  }

  if (data === 'menu_transaksi') {
    await edit(chat, mid, await txtTransaksi(db), kbTransaksi());
    return;
  }
  if (data === 'tx_list_10') {
    await edit(chat, mid, await txtTxList(db, 10), kbKembali('menu_transaksi', '◀️ Kembali ke Transaksi'));
    return;
  }
  if (data === 'tx_bulan_ini') {
    await edit(chat, mid, await txtTxBulanIni(db), kbKembali('menu_transaksi', '◀️ Kembali ke Transaksi'));
    return;
  }
  if (data === 'tx_cashflow') {
    await edit(chat, mid, await txtCashflow(db), kbKembali('menu_transaksi', '◀️ Kembali ke Transaksi'));
    return;
  }

  if (data === 'menu_analitik') {
    await edit(chat, mid, await txtAnalitik(db), kbAnalitik());
    return;
  }
  if (data === 'analitik_brand') {
    await edit(chat, mid, await txtBrandDetail(db), kbKembali('menu_analitik', '◀️ Kembali ke Analitik'));
    return;
  }
  if (data === 'analitik_tren') {
    await edit(chat, mid, await txtTren(db), kbKembali('menu_analitik', '◀️ Kembali ke Analitik'));
    return;
  }
  if (data === 'laporan_full') {
    await edit(chat, mid, await txtLaporanFull(db), [
      [{ text: '📊 Dashboard', callback_data: 'menu_dashboard' }, { text: '📈 Analitik', callback_data: 'menu_analitik' }],
      [{ text: '🏠 Menu Utama', callback_data: 'menu_utama' }]
    ]);
    return;
  }

  if (data === 'menu_settings') {
    await edit(chat, mid, txtSettings(db), kbSettings());
    return;
  }

  if (data === 'aksi_masuk') {
    clearSession(db, uid);
    getSession(db, uid).step = 'masuk_nama';
    await putData(db);
    await edit(chat, mid, `➕ <b>CATAT BARANG MASUK</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
Ketik <b>nama barang</b> lengkap:\n<i>Contoh: iPhone 13 128GB Black</i>

Atau ketuk batal untuk membatalkan:`, [[{ text: '❌ Batal', callback_data: 'cancel' }]]);
    await prompt(chat, '📝 Nama barang lengkap:');
    return;
  }

  if (data === 'masuk_tipe_new' || data === 'masuk_tipe_konsinyasi') {
    const sess = getSession(db, uid);
    sess.tipe  = data === 'masuk_tipe_new' ? 'new' : 'konsinyasi';
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
      clearSession(db, uid);
      await putData(db);
      const margin = sess.harga - sess.modal;
      await edit(chat, mid, `✅ <b>BARANG BERHASIL DICATAT!</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Nama: <b>${esc(sess.nama)}</b>
💰 Modal: ${rp(sess.modal)}
💵 Harga Jual: ${rp(sess.harga)}
💛 Potensi Laba: ${rp(margin)}
🏷️ Tipe: ${sess.tipe === 'new' ? '🆕 Baru' : '♻️ Konsinyasi'}
📅 Dicatat: ${new Date().toLocaleDateString('id-ID')}`,
        kbAksiSukses({ tambahLagi: { text: '➕ Catat Barang Lagi', cb: 'aksi_masuk' } })
      );
    } catch (e) {
      await edit(chat, mid, '❌ Gagal menyimpan. Coba lagi.', kbKembali('menu_utama'));
    }
    return;
  }

  if (data === 'aksi_terjual') {
    clearSession(db, uid);
    getSession(db, uid).step = 'terjual_cari';
    await putData(db);
    await edit(chat, mid, `✅ <b>TANDAI BARANG TERJUAL</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
Ketik nama barang atau kata kunci untuk dicari:`, [[{ text: '❌ Batal', callback_data: 'cancel' }]]);
    await prompt(chat, '🔍 Cari nama barang:');
    return;
  }

  if (data.startsWith('terjual_item_')) {
    const idx  = parseInt(data.split('_').pop());
    const sess = getSession(db, uid);
    const item = sess.cariResults?.[idx];
    if (!item) { await send(chat, '❌ Item tidak ditemukan.', kbKembali('aksi_terjual')); return; }
    sess.selectedItem = item;
    sess.step         = 'terjual_harga';
    await putData(db);
    await edit(chat, mid, `✅ <b>${esc(item.name)}</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
💰 Modal: ${rp(item.modal)}
💵 Harga List: ${rp(item.price)}

Pilih harga jual atau ketik manual:`, kbHargaJual(item.price));
    return;
  }

  if (data === 'terjual_harga_list') {
    const sess = getSession(db, uid);
    if (!sess.selectedItem) { await send(chat, '❌ Sesi tidak valid. Mulai lagi.', kbKembali('aksi_terjual')); return; }
    sess.hargaJual = sess.selectedItem.price;
    sess.step      = 'terjual_konfirmasi';
    await putData(db);
    const profit   = sess.hargaJual - sess.selectedItem.modal;
    await edit(chat, mid, `✅ <b>KONFIRMASI PENJUALAN</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Barang: <b>${esc(sess.selectedItem.name)}</b>
💰 Modal: ${rp(sess.selectedItem.modal)}
💵 Harga Jual: ${rp(sess.hargaJual)}
💛 Laba: ${rp(profit)}
📅 Tgl: ${new Date().toLocaleDateString('id-ID')}

Konfirmasi penjualan ini?`, kbKonfirmasiTerjual());
    return;
  }

  if (data === 'terjual_confirm') {
    const sess = getSession(db, uid);
    const item = sess.selectedItem;
    if (!item) { await send(chat, '❌ Sesi tidak valid.', kbKembali('aksi_terjual')); return; }
    try {
      const idx = (db.items || []).findIndex(i => String(i.id) === String(item.id));
      if (idx === -1) throw new Error('Item not found');
      db.items[idx].status = 'sold';
      db.items[idx].price  = sess.hargaJual;
      db.items[idx].soldAt = new Date().toISOString().slice(0, 10);
      clearSession(db, uid);
      await putData(db);
      const profit = sess.hargaJual - item.modal;
      await edit(chat, mid, `🎉 <b>BARANG BERHASIL TERJUAL!</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Barang: <b>${esc(item.name)}</b>
💵 Harga Jual: ${rp(sess.hargaJual)}
💛 Laba: <b>${rp(profit)}</b>
📅 Tgl: ${new Date().toLocaleDateString('id-ID')}`,
        kbAksiSukses({ tambahLagi: { text: '✅ Tandai Terjual Lagi', cb: 'aksi_terjual' } })
      );
    } catch (e) {
      await edit(chat, mid, '❌ Gagal update data. Coba lagi.', kbKembali('menu_utama'));
    }
    return;
  }

  if (data === 'aksi_ekstra') {
    clearSession(db, uid);
    getSession(db, uid).step = 'ekstra_nama';
    await putData(db);
    await edit(chat, mid, `⭐ <b>CATAT LABA JASA / EKSTRA</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
Ketik keterangan / nama transaksi:
<i>Contoh: Servis HP, Joki Unlock, dll</i>`, [[{ text: '❌ Batal', callback_data: 'cancel' }]]);
    await prompt(chat, '📝 Keterangan laba jasa:');
    return;
  }

  if (data === 'ekstra_confirm') {
    const sess = getSession(db, uid);
    try {
      db.extraProfits = db.extraProfits || [];
      db.extraProfits.push({
        id: Date.now(),
        name: sess.ekstraNama,
        profit: sess.ekstraNominal,
        date: new Date().toISOString().slice(0, 10)
      });
      clearSession(db, uid);
      await putData(db);
      await edit(chat, mid, `✅ <b>LABA JASA DICATAT!</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Keterangan: <b>${esc(sess.ekstraNama)}</b>
💰 Nominal: <b>${rp(sess.ekstraNominal)}</b>
📅 Tanggal: ${new Date().toLocaleDateString('id-ID')}`,
        kbAksiSukses({ tambahLagi: { text: '⭐ Catat Laba Jasa Lagi', cb: 'aksi_ekstra' } })
      );
    } catch (e) {
      await edit(chat, mid, '❌ Gagal menyimpan.', kbKembali('menu_utama'));
    }
    return;
  }

  if (data === 'set_modal') {
    clearSession(db, uid);
    getSession(db, uid).step = 'set_modal';
    await putData(db);
    await edit(chat, mid, `💼 <b>UBAH MODAL AWAL</b>
Modal saat ini: ${rp(Number(db.startBalance) || 0)}

Ketik nominal modal awal baru:`, [[{ text: '❌ Batal', callback_data: 'cancel' }]]);
    await prompt(chat, '💼 Modal awal baru (angka saja):');
    return;
  }

  if (data === 'set_modal_confirm') {
    const sess = getSession(db, uid);
    try {
      db.startBalance = sess.newModal;
      clearSession(db, uid);
      await putData(db);
      await edit(chat, mid, `✅ Modal awal berhasil diubah ke <b>${rp(sess.newModal)}</b>`,
        kbKembali('menu_settings', '◀️ Kembali ke Pengaturan'));
    } catch (e) {
      await edit(chat, mid, '❌ Gagal menyimpan.', kbKembali('menu_utama'));
    }
    return;
  }

  if (data === 'stok_cari') {
    clearSession(db, uid);
    getSession(db, uid).step = 'stok_cari';
    await putData(db);
    await edit(chat, mid, `🔍 <b>CARI STOK</b>
Ketik nama atau kata kunci barang:`, [[{ text: '❌ Batal', callback_data: 'cancel' }]]);
    await prompt(chat, '🔍 Kata kunci pencarian:');
    return;
  }

  if (data === 'cancel') {
    clearSession(db, uid);
    await putData(db);
    await edit(chat, mid, `✅ Aksi dibatalkan.\n\n${txtMenuUtama()}`, kbMenuUtama());
    return;
  }

  await answer(cb.id, 'Aksi tidak dikenal.', true);
}

// ══════════════════════════════════════════════════════════════════════
//  COMMAND HANDLER
// ══════════════════════════════════════════════════════════════════════
async function handleCommand(msg) {
  const chat = msg.chat.id;
  const uid  = msg.from.id;
  const text = (msg.text || '').trim();

  if (!isAdmin(uid)) {
    await send(chat, '⛔ Kamu tidak punya akses ke bot ini.');
    return;
  }

  let db;
  try { db = await getData(); }
  catch (e) { await send(chat, '❌ Gagal ambil data.'); return; }

  // ── AUTO CANCEL UX ──
  // Jika user mengetik perintah (dimulai dgn slash), otomatis bersihkan sesi yang menggantung
  if (text.startsWith('/')) {
    clearSession(db, uid);
    await putData(db);
  }

  if (text === '/start' || text === '/menu' || text === '/m') {
    // Kirim pesan pancingan agar Telegram me-load keyboard bawah
    if (text === '/start') {
      await tg('sendMessage', {
        chat_id: chat, 
        text: '🔄 Memuat sistem Farid Store...', 
        reply_markup: kbBawah 
      });
    }

    await send(chat, txtMenuUtama(), kbMenuUtama());
    return;
  }

  if (text === '/dashboard' || text === '/d') {
    await send(chat, await txtDashboard(db), kbDashboard());
    return;
  }

  if (text === '/stok' || text === '/s') {
    await send(chat, await txtMenuStok(db), kbMenuStok());
    return;
  }

  if (text === '/laporan' || text === '/l') {
    await send(chat, await txtAnalitik(db), kbAnalitik());
    return;
  }

  if (text === '/cancel' || text === '/c') {
    await send(chat, '✅ Semua sesi dan aksi aktif telah dibatalkan.', kbMenuUtama());
    return;
  }

  if (text.startsWith('/masuk ')) {
    const parts = text.slice(7).split(',').map(s => s.trim());
    if (parts.length < 3) { await send(chat, '❌ Format: /masuk Nama, Modal, HargaJual'); return; }
    const [nama, modalStr, hargaStr] = parts;
    const modal = parseInt(modalStr.replace(/\D/g, ''));
    const harga = parseInt(hargaStr.replace(/\D/g, ''));
    if (!modal || !harga) { await send(chat, '❌ Format angka tidak valid.'); return; }
    try {
      db.items = db.items || [];
      db.items.push({ id: Date.now(), name: nama, modal, price: harga, status: 'stok', type: 'new', addedAt: new Date().toISOString() });
      await putData(db);
      await send(chat, `✅ Barang dicatat!\n📦 ${esc(nama)}\n💰 Modal: ${rp(modal)}\n💵 Harga: ${rp(harga)}\n💛 Margin: ${rp(harga - modal)}`, [
        [{ text: '📦 Lihat Stok', callback_data: 'stok_list_1' }, { text: '🏠 Menu Utama', callback_data: 'menu_utama' }]
      ]);
    } catch (e) { await send(chat, '❌ Gagal menyimpan.'); }
    return;
  }

  if (text.startsWith('/promo ')) {
    const keyword = text.slice(7).trim();
    if (!keyword) { await send(chat, '❌ Format: /promo [nama barang]'); return; }

    await send(chat, '⏳ <i>AI sedang meracik kata-kata marketing...</i>');

    const item = (db.items || []).find(i => i.status === 'stok' && i.name.toLowerCase().includes(keyword.toLowerCase()));
    let hargaTeks = '';
    if (item) hargaTeks = `Harga jual di toko kita: ${rp(item.price)}.`;

    const promptText = `Buatkan caption promosi yang menarik, asik, dan kekinian untuk jualan gadget di WhatsApp/Instagram. Nama barang: ${keyword}. ${hargaTeks} Nama toko: Farid Store. Gunakan emoji yang pas, berikan kesan garansi aman, dan jangan terlalu panjang.`;

    const aiResponse = await askGemini(promptText);
    await send(chat, `🤖 <b>Hasil AI Copywriter:</b>\n\n${esc(aiResponse)}\n\n<i>Tinggal copas aja bos!</i>`, kbKembali('menu_utama'));
    return;
  }

  if (text.startsWith('/tanya ')) {
    const pertanyaan = text.slice(7).trim();
    if (!pertanyaan) { await send(chat, '❌ Format: /tanya [pertanyaan ke AI]'); return; }

    await send(chat, '⏳ <i>Bentar, AI lagi ngecek buku kas...</i>');

    const c = compute(db);
    const stokNganggur = c.agingStocks.filter(i => i.days > 30).length;
    
    const promptText = `Kamu adalah asisten keuangan dan bisnis pintar untuk Farid Store (toko ritel & servis gadget). 
    Data toko saat ini: Total Aset ${rp(c.totalAset)}, Kas ${rp(c.cashSisa)}, Omset bulan ini ${rp(c.curMonth.income)}, Laba bulan ini ${rp(c.curMonth.profit)}. Ada ${stokNganggur} barang mengendap lebih dari 30 hari. 
    Pertanyaan bos kamu: "${pertanyaan}". Jawab dengan singkat, padat, berikan saran bisnis yang realistis jika diminta.`;

    const aiResponse = await askGemini(promptText);
    const cleanResponse = esc(aiResponse).replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    
    await send(chat, `🤖 <b>Asisten Toko:</b>\n\n${cleanResponse}`, kbKembali('menu_utama'));
    return;
  }

  if (text === '/help' || text === '/h') {
    await send(chat, `🤖 <b>FARID STORE BOT V11.2 — BANTUAN</b>

━━━━━━━━━━━━━━━━━━━━━━━━━

<b>PERINTAH:</b>
/menu — Buka Menu Utama
/d    — Dashboard
/s    — Menu Stok Gudang
/l    — Laporan & Analitik
/c    — Batalkan sesi/input yang berjalan
/h    — Bantuan ini

<b>AI ASSISTANT:</b>
<code>/promo [Nama Barang]</code> → Bikin caption jualan otomatis
<code>/tanya [Pertanyaan]</code> → Analisis bisnis & data kas toko

<b>CARA MASUK CEPAT:</b>
<code>/masuk Nama, Modal, HargaJual</code>
Contoh: <code>/masuk iPhone 13, 4500000, 5200000</code>

<b>TIPS:</b>
Semua aksi bisa dilakukan lewat tombol *inline* di bawah pesan untuk pengalaman terbaik!`, kbKembali('menu_utama', '🏠 Menu Utama'));
    return;
  }

  const sess = getSession(db, uid);
  if (sess.step) {
    try {
      await handleInput(chat, uid, text, db);
    } catch (e) {
      await send(chat, '❌ Terjadi error saat memproses input. Ketik /menu untuk mengulang.', kbKembali('menu_utama'));
    }
    return;
  }

  await send(chat, `❓ Perintah tidak dikenal.\n\nGunakan /menu untuk memulai atau /help untuk panduan.`, kbMenuUtama());
}

// ══════════════════════════════════════════════════════════════════════
//  MAIN VERCEL HANDLER
// ══════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send('Farid Store Bot V11.2 — Full Dynamic Inline + Reply Keyboard');
  }
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const body = req.body;
    if (body.callback_query) {
      await handleCallback(body.callback_query);
    } else if (body.message?.text) {
      await handleCommand(body.message);
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Handler error:', e);
    return res.status(200).json({ ok: true, error: e.message });
  }
}
