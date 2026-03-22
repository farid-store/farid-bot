export default async function handler(req, res) {
  // Verifikasi POST
  if (req.method !== 'POST') return res.status(200).send('Farid Store Bot V8 - Fully Fixed & Interactive');

  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  const BIN_ID = process.env.BIN_ID;
  const API_KEY = process.env.API_KEY;

  // ---------------------------------------------------------
  // FUNGSI BANTUAN API & WAKTU
  // ---------------------------------------------------------
  const callTelegramAPI = async (method, payload) => {
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error("Telegram API Error:", e);
    }
  };

  const getWebDate = () => {
    const d = new Date(new Date().getTime() + (7 * 60 * 60 * 1000)); // Waktu WIB
    return `${d.getUTCDate()}/${d.getUTCMonth()+1}/${d.getUTCFullYear()} ${d.getUTCHours().toString().padStart(2,'0')}:${d.getUTCMinutes().toString().padStart(2,'0')}`;
  };

  const parseDateToWIB = (s) => {
    if(!s || s==='Imported' || s==='Bulan Lalu') return new Date(new Date().getTime() + (7 * 60 * 60 * 1000));
    const p = s.split(' ');
    if (p[0].includes('-')) return new Date(p[0]);
    const d = p[0].split('/');
    return new Date(d[2], d[1]-1, d[0]);
  };

  const getBrandCategory = (itemName) => {
    const lower = itemName.toLowerCase();
    if (lower.includes('iphone') || lower.includes('apple')) return 'APPLE';
    if (lower.includes('samsung') || lower.includes('galaxy')) return 'SAMSUNG';
    if (lower.includes('xiaomi') || lower.includes('poco') || lower.includes('redmi')) return 'XIAOMI/POCO';
    if (lower.includes('oppo') || lower.includes('reno')) return 'OPPO';
    if (lower.includes('vivo') || lower.includes('iqoo')) return 'VIVO';
    return itemName.split(' ')[0].toUpperCase();
  };

  // KEYBOARD UTAMA BAWAH
  const menuKeyboard = {
    keyboard: [
      [{ text: '📊 Dashboard' }, { text: '📦 Cek Stok' }],
      [{ text: '📈 Analisa Bisnis' }, { text: '📑 Laporan WA' }],
      [{ text: '↩️ Batal Terakhir' }, { text: '❓ Bantuan Format' }]
    ],
    resize_keyboard: true,
    is_persistent: true
  };

  // ---------------------------------------------------------
  // 1. PENANGANAN KLIK TOMBOL TRANSPARAN (INLINE KEYBOARD)
  // ---------------------------------------------------------
  if (req.body.callback_query) {
    const cb = req.body.callback_query;
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;

    // WAJIB: Menjawab callback agar tombol tidak loading/nge-freeze
    await callTelegramAPI('answerCallbackQuery', { callback_query_id: cb.id });

    try {
      const getRes = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, { headers: { 'X-Master-Key': API_KEY } });
      const parsed = await getRes.json();
      let dbData = parsed.record || {};
      if (!dbData.items) dbData.items = [];
      if (!dbData.extraProfits) dbData.extraProfits = [];

      // A. BATALKAN PROSES UNDO
      if (data === 'cancel_undo') {
        await callTelegramAPI('editMessageText', { chat_id: chatId, message_id: messageId, text: `✅ *Aksi Dibatalkan.*\nData Anda aman.`, parse_mode: 'Markdown' });
        return res.status(200).send('OK');
      }

      // B. PROSES UNDO PERMANEN
      if (data.startsWith('undo_')) {
        const parts = data.split('_'); // Format: undo_item_12345
        const type = parts[1];
        const idStr = parts[2];
        
        let deletedName = '';
        if (type === 'item') {
          const idx = dbData.items.findIndex(i => String(i.id) === idStr);
          if (idx > -1) { deletedName = dbData.items[idx].name; dbData.items.splice(idx, 1); }
        } else {
          const idx = dbData.extraProfits.findIndex(i => String(i.id) === idStr);
          if (idx > -1) { deletedName = dbData.extraProfits[idx].name; dbData.extraProfits.splice(idx, 1); }
        }

        if (deletedName !== '') {
          await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, body: JSON.stringify(dbData) });
          await callTelegramAPI('editMessageText', { chat_id: chatId, message_id: messageId, text: `🗑️ *TRANSAKSI DIHAPUS*\nData *${deletedName}* telah dihapus permanen.`, parse_mode: 'Markdown' });
        }
        return res.status(200).send('OK');
      }

      // C. KLIK TOMBOL: EDIT BARANG
      if (data.startsWith('edit_')) {
        const idStr = data.replace('edit_', '');
        const item = dbData.items.find(i => String(i.id) === idStr);
        if (item) {
          const safeName = item.name.replace(/ /g, '_');
          const msg = `✏️ *EDIT BARANG*\n\nBarang: *${item.name}*\n\n👇 *Salin teks di bawah ini*, ubah Nominal Modal / Jual, lalu kirim kembali:\n\n\`/edit ${item.id} ${safeName} ${item.modal} ${item.price}\``;
          await callTelegramAPI('sendMessage', { chat_id: chatId, text: msg, parse_mode: 'Markdown' });
        } else {
          await callTelegramAPI('sendMessage', { chat_id: chatId, text: `❌ Data barang sudah tidak ditemukan.`, parse_mode: 'Markdown' });
        }
        return res.status(200).send('OK');
      }

      // D. KLIK TOMBOL: TANDAI TERJUAL
      if (data.startsWith('laku_')) {
        const idStr = data.replace('laku_', '');
        const item = dbData.items.find(i => String(i.id) === idStr);
        if (item) {
          const msg = `💸 *PROSES TERJUAL*\n\nBarang: *${item.name}*\nTarget Jual: Rp ${item.price.toLocaleString('id-ID')}\n\n👇 *Salin teks di bawah*, ubah angka akhir sesuai harga deal sebenarnya, lalu kirim:\n\n\`/lakuid ${item.id} ${item.price}\``;
          await callTelegramAPI('sendMessage', { chat_id: chatId, text: msg, parse_mode: 'Markdown' });
        } else {
          await callTelegramAPI('sendMessage', { chat_id: chatId, text: `❌ Data barang sudah tidak ditemukan.`, parse_mode: 'Markdown' });
        }
        return res.status(200).send('OK');
      }

    } catch (e) {
      console.error(e);
    }
    return res.status(200).send('OK');
  }

  // ---------------------------------------------------------
  // 2. PENANGANAN PESAN TEKS (PERINTAH & MENU BAWAH)
  // ---------------------------------------------------------
  const message = req.body.message;
  if (!message || !message.text) return res.status(200).send('OK');

  const text = message.text.trim();
  const chatId = message.chat.id;
  const parts = text.split(' ');
  const command = parts[0].toLowerCase();

  // ==========================================
  // SHORTCUT PRIORITAS UTAMA (Tanpa perlu tarik Database)
  // ==========================================
  if (text.includes('Bantuan') || command === '/help') {
    const helpMsg = `🛠️ *FORMAT TRANSAKSI MANUAL:*\n_Pisahkan dg spasi, ganti spasi nama barang dg garis bawah (_)_\n\n` +
               `*1. Beli Stok (Masuk Gudang):*\n\`/stok Poco_M3 500000 700000\`\n\n` +
               `*2. Jual Cepat (Tanpa Gudang):*\n\`/jual Vivo_Y20 1000000 1300000\`\n\n` +
               `*3. Jasa Servis:*\n\`/jasa Ganti_LCD_Oppo 250000\`\n\n` +
               `*4. Biaya Toko:*\n\`/out Token_Listrik 100000\`\n\n` +
               `💡 _Tips: Untuk Edit/Tandai Laku, gunakan menu 📦 Cek Stok._`;
    await callTelegramAPI('sendMessage', { chat_id: chatId, text: helpMsg, parse_mode: 'Markdown', reply_markup: menuKeyboard });
    return res.status(200).send('OK');
  }

  if (text === '🔙 Menu Utama' || text === '❌ KEMBALI') {
    await callTelegramAPI('sendMessage', { chat_id: chatId, text: `✅ Kembali ke Menu Utama.`, parse_mode: 'Markdown', reply_markup: menuKeyboard });
    return res.status(200).send('OK');
  }

  // ==========================================
  // TARIK DATABASE UNTUK MENU LAINNYA
  // ==========================================
  try {
    const getResponse = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, { headers: { 'X-Master-Key': API_KEY } });
    const parsedData = await getResponse.json();
    let dbData = parsedData.record || {};

    if (!dbData.items) dbData.items = [];
    if (!dbData.extraProfits) dbData.extraProfits = [];
    if (!dbData.startBalance) dbData.startBalance = 0;

    let isUpdated = false;
    let replyMsg = '';
    const nowStr = getWebDate();
    const timestampId = new Date().getTime();
    
    // Logika Kalkulasi & Waktu
    const wibNow = new Date(timestampId + (7 * 60 * 60 * 1000));
    const currM = wibNow.getMonth(); const currY = wibNow.getFullYear();
    const lastM = currM === 0 ? 11 : currM - 1; const lastY = currM === 0 ? currY - 1 : currY;

    const startBal = Number(dbData.startBalance) || 0;
    let belanjaBaru = 0, uangMasuk = 0, profitMain = 0, floatPrice = 0, floatModal = 0;
    let stockCount = 0, soldCount = 0, unitBulanIni = 0, unitBulanLalu = 0, profitBulanIni = 0;
    let brands = {};
    
    dbData.items.forEach(i => {
      if (i.status === 'sold') {
        soldCount++;
        if (i.type === 'new') belanjaBaru += i.modal;
        uangMasuk += i.price;
        profitMain += (i.price - i.modal);
        const brand = getBrandCategory(i.name); brands[brand] = (brands[brand] || 0) + 1;
        if (i.soldAt) {
          const d = parseDateToWIB(i.soldAt);
          if (d.getMonth() === currM && d.getFullYear() === currY) { unitBulanIni++; profitBulanIni += (i.price - i.modal); }
          else if (d.getMonth() === lastM && d.getFullYear() === lastY) { unitBulanLalu++; }
        }
      } else {
        stockCount++;
        if (i.type === 'new') belanjaBaru += i.modal;
        floatPrice += i.price; floatModal += i.modal;
      }
    });

    let extraProfitTotal = 0;
    dbData.extraProfits.forEach(p => { 
      extraProfitTotal += p.profit; soldCount++;
      const brand = getBrandCategory(p.name); brands[brand] = (brands[brand] || 0) + 1;
      const d = new Date(p.id);
      if (d.getMonth() === currM && d.getFullYear() === currY) profitBulanIni += p.profit;
    });

    const totalProfitReal = profitMain + extraProfitTotal;
    const cash = startBal - belanjaBaru + uangMasuk;
    const totalAsetReal = cash + floatPrice;

    // --------------------------------------------------------
    // PERINTAH: DASHBOARD
    if (command === '/start' || text.includes('Dashboard')) {
      replyMsg = `📊 *DIGITAL LEDGER - FARID STORE*\n` +
                 `------------------------------\n` +
                 `💵 *Kas Tunai:* Rp ${cash.toLocaleString('id-ID')}\n` +
                 `📦 *Stok Gudang:* Rp ${floatModal.toLocaleString('id-ID')} (${stockCount} Unit)\n` +
                 `🎯 *Potensi Untung:* Rp ${(floatPrice - floatModal).toLocaleString('id-ID')}\n` +
                 `📈 *Akumulasi Laba:* Rp ${totalProfitReal.toLocaleString('id-ID')}\n` +
                 `------------------------------\n` +
                 `💎 *TOTAL ASET:* Rp ${totalAsetReal.toLocaleString('id-ID')}\n\n` +
                 `_Pilih menu di bawah 👇_`;
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'Markdown', reply_markup: menuKeyboard });
      return res.status(200).send('OK');
    }

    // --------------------------------------------------------
    // PERINTAH: ANALISA BISNIS
    else if (text.includes('Analisa Bisnis')) {
      const pPengelola = profitBulanIni * 0.50; const pInvestor = profitBulanIni * 0.40;
      const pOps = profitBulanIni * 0.07; const pZakat = profitBulanIni * 0.03;
      const sortedBrands = Object.keys(brands).sort((a,b) => brands[b] - brands[a]).slice(0, 3);
      let topBrandsText = '';
      sortedBrands.forEach((b, i) => { topBrandsText += `  ${i+1}. ${b} (${brands[b]} Unit)\n`; });
      if(topBrandsText === '') topBrandsText = "  Belum ada data\n";

      replyMsg = `📈 *ANALISA BISNIS REAL-TIME*\n\n` +
                 `*STATISTIK UNIT*\n` +
                 `▫️ Ready di Gudang    : *${stockCount}*\n` +
                 `▫️ Terjual Bulan Ini  : *${unitBulanIni}*\n` +
                 `▫️ Terjual Bulan Lalu : *${unitBulanLalu}*\n` +
                 `▫️ Terjual All Time   : *${soldCount}*\n\n` +
                 `🏆 *TOP 3 MEREK*\n${topBrandsText}\n` +
                 `🤝 *BAGI HASIL (BULAN INI)*\n` +
                 `_Laba Kotor Bln Ini: Rp ${profitBulanIni.toLocaleString('id-ID')}_\n` +
                 `👨‍💼 Pengelola (50%) : Rp ${pPengelola.toLocaleString('id-ID')}\n` +
                 `📈 Investor (40%)  : Rp ${pInvestor.toLocaleString('id-ID')}\n` +
                 `⚙️ Operasional (7%): Rp ${pOps.toLocaleString('id-ID')}\n` +
                 `🤲 Zakat (3%)      : Rp ${pZakat.toLocaleString('id-ID')}`;
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'Markdown', reply_markup: menuKeyboard });
      return res.status(200).send('OK');
    }

    // --------------------------------------------------------
    // PERINTAH: LAPORAN WA
    else if (text.includes('Laporan WA')) {
      const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
      replyMsg = `📊 *LAPORAN KEUANGAN FARID STORE*\n` +
                 `🗓️ Periode: ${monthNames[currM]} ${currY}\n` +
                 `------------------------------\n\n` +
                 `💵 *Sisa Tunai: Rp ${cash.toLocaleString('id-ID')}*\n` +
                 `📦 Nilai Stok Gudang: Rp ${floatModal.toLocaleString('id-ID')}\n` +
                 `🎯 Potensi Untung: Rp ${(floatPrice - floatModal).toLocaleString('id-ID')}\n` +
                 `------------------------------\n` +
                 `📈 *TOTAL ASET: Rp ${totalAsetReal.toLocaleString('id-ID')}*\n\n` +
                 `🔥 *PROFIT KESELURUHAN*\n` +
                 `✨ *Total Bersih: Rp ${totalProfitReal.toLocaleString('id-ID')}*\n` +
                 `------------------------------\n` +
                 `_Digital Ledger - Farid Store_`;
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'Markdown', reply_markup: menuKeyboard });
      return res.status(200).send('OK');
    }

    // --------------------------------------------------------
    // PERINTAH: BATAL TERAKHIR (KONFIRMASI)
    else if (text.includes('Batal Terakhir')) {
      let allEntries = [];
      dbData.items.forEach((item) => allEntries.push({ id: item.id, name: item.name, price: item.price, type: 'item' }));
      dbData.extraProfits.forEach((item) => allEntries.push({ id: item.id, name: item.name, price: item.profit, type: 'extra' }));

      if (allEntries.length === 0) {
        await callTelegramAPI('sendMessage', { chat_id: chatId, text: "⚠️ Tidak ada data untuk dibatalkan.", parse_mode: 'Markdown', reply_markup: menuKeyboard });
      } else {
        allEntries.sort((a, b) => b.id - a.id);
        const newest = allEntries[0];
        
        replyMsg = `⚠️ *KONFIRMASI PEMBATALAN*\n\nYakin membatalkan transaksi terakhir ini?\n\n📝 *Item:* ${newest.name}\n💵 *Nilai:* Rp ${Math.abs(newest.price).toLocaleString('id-ID')}`;
        
        // Memunculkan tombol transparan (inline) agar aman
        const inlineKeyboard = {
          inline_keyboard: [
            [{ text: '❌ BATALKAN', callback_data: 'cancel_undo' }],
            [{ text: '🗑️ YA, HAPUS PERMANEN', callback_data: `undo_${newest.type}_${newest.id}` }]
          ]
        };
        await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'Markdown', reply_markup: inlineKeyboard });
      }
      return res.status(200).send('OK');
    }

    // --------------------------------------------------------
    // PERINTAH: CEK STOK & PAGINATION BAWAH
    else if (text.includes('Cek Stok') || text.startsWith('➡️ Hal') || text.startsWith('⬅️ Hal')) {
      let page = 1;
      if (text.startsWith('➡️ Hal')) page = parseInt(text.replace('➡️ Hal ', ''));
      else if (text.startsWith('⬅️ Hal')) page = parseInt(text.replace('⬅️ Hal ', ''));

      const stokBarang = dbData.items.filter(item => item.status === 'stok');
      const itemsPerPage = 15;
      const totalPages = Math.ceil(stokBarang.length / itemsPerPage) || 1;

      if (page > totalPages) page = totalPages;
      if (page < 1) page = 1;

      if (stokBarang.length === 0) {
        await callTelegramAPI('sendMessage', { chat_id: chatId, text: "📦 *GUDANG KOSONG*\nPutaran kas mantap!", parse_mode: 'Markdown', reply_markup: menuKeyboard });
        return res.status(200).send('OK');
      }

      const startIndex = (page - 1) * itemsPerPage;
      const currentItems = stokBarang.slice(startIndex, startIndex + itemsPerPage);

      let listText = `📋 *DAFTAR STOK (Hal ${page}/${totalPages})*\nTotal Unit: *${stokBarang.length} HP*\n──────────────\n`;
      let keyboardRows = [];
      let currentRow = [];

      currentItems.forEach((item, idx) => {
        const globalIndex = startIndex + idx + 1;
        const itemDate = parseDateToWIB(item.entryDate);
        const selisihHari = Math.floor((wibNow - itemDate) / (1000 * 60 * 60 * 24));
        const warning = selisihHari > 14 ? " ⚠️" : "";
        
        listText += `\n*${globalIndex}. ${item.name}*${warning}\n└ M: ${item.modal/1000}k | J: ${item.price/1000}k | ⏳ ${selisihHari} Hari\n`;
        
        // Buat Tombol Angka di bawah (5 per baris)
        currentRow.push({ text: `📦 ${globalIndex}` });
        if (currentRow.length === 5) { keyboardRows.push(currentRow); currentRow = []; }
      });
      if (currentRow.length > 0) keyboardRows.push(currentRow);

      // Navigasi
      let navRow = [];
      if (page > 1) navRow.push({ text: `⬅️ Hal ${page - 1}` });
      navRow.push({ text: '🔙 Menu Utama' });
      if (page < totalPages) navRow.push({ text: `➡️ Hal ${page + 1}` });
      keyboardRows.push(navRow);

      const pagedKeyboard = { keyboard: keyboardRows, resize_keyboard: true, is_persistent: true };
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: listText + `\n\n👇 *Pilih tombol nomor di bawah untuk Edit/Laku:*`, parse_mode: 'Markdown', reply_markup: pagedKeyboard });
      return res.status(200).send('OK');
    }

    // --------------------------------------------------------
    // KLIK TOMBOL NOMOR BARANG (Munculkan Bubble Detail + Tombol Edit/Laku)
    else if (text.match(/^📦 \d+$/)) {
      const idx = parseInt(text.replace('📦 ', '')) - 1;
      const stokBarang = dbData.items.filter(item => item.status === 'stok');
      const item = stokBarang[idx];
      
      if (item) {
        const itemDate = parseDateToWIB(item.entryDate);
        const selisihHari = Math.floor((wibNow - itemDate) / (1000 * 60 * 60 * 24));
        
        const detailMsg = `🔍 *DETAIL BARANG (No. ${idx + 1})*\n\n` +
                          `📱 *Nama:* ${item.name}\n` +
                          `💸 *Modal:* Rp ${item.modal.toLocaleString('id-ID')}\n` +
                          `🎯 *Target Jual:* Rp ${item.price.toLocaleString('id-ID')}\n` +
                          `⏳ *Mengendap:* ${selisihHari} Hari\n\n` +
                          `_Pilih aksi untuk item ini:_ 👇`;

        const inlineActionKeyboard = {
          inline_keyboard: [
            [
              { text: '✏️ Edit Barang', callback_data: `edit_${item.id}` },
              { text: '💸 Tandai Terjual', callback_data: `laku_${item.id}` }
            ]
          ]
        };
        await callTelegramAPI('sendMessage', { chat_id: chatId, text: detailMsg, parse_mode: 'Markdown', reply_markup: inlineActionKeyboard });
      } else {
        await callTelegramAPI('sendMessage', { chat_id: chatId, text: `❌ *Error:* Barang tidak ditemukan.`, parse_mode: 'Markdown' });
      }
      return res.status(200).send('OK');
    }

    // --------------------------------------------------------
    // PROSES COPY-PASTE (EDIT & LAKU)
    else if (command === '/edit') {
      const idToEdit = parseInt(parts[1]);
      const newName = parts[2] ? parts[2].replace(/_/g, ' ') : '';
      const newModal = parseInt(parts[3]);
      const newPrice = parseInt(parts[4]);

      const idx = dbData.items.findIndex(i => String(i.id) === String(idToEdit));
      if (idx !== -1 && newName && !isNaN(newModal) && !isNaN(newPrice)) {
        dbData.items[idx].name = newName; dbData.items[idx].modal = newModal; dbData.items[idx].price = newPrice;
        isUpdated = true;
        replyMsg = `✅ *PERUBAHAN DISIMPAN!*\n\nData menjadi:\n📱 ${newName}\n💸 M: Rp ${newModal.toLocaleString('id-ID')}\n🎯 J: Rp ${newPrice.toLocaleString('id-ID')}`;
      } else {
        replyMsg = `❌ Format salah atau ID tidak ditemukan.`;
      }
    }
    else if (command === '/lakuid') {
      const idToLaku = parseInt(parts[1]);
      const finalPrice = parseInt(parts[2]);

      const idx = dbData.items.findIndex(i => String(i.id) === String(idToLaku));
      if (idx !== -1 && !isNaN(finalPrice)) {
        let item = dbData.items[idx];
        item.status = 'sold'; item.price = finalPrice; item.soldAt = nowStr;
        isUpdated = true;
        replyMsg = `🎉 *UNIT GUDANG CAIR!*\n📱 ${item.name}\n💰 Deal: Rp ${finalPrice.toLocaleString('id-ID')}\n📈 Laba: Rp ${(finalPrice - item.modal).toLocaleString('id-ID')}`;
      } else {
        replyMsg = `❌ Gagal Proses Laku. ID Tidak ditemukan.`;
      }
    }

    // --------------------------------------------------------
    // TRANSAKSI MANUAL (JUAL CEPAT, STOK, JASA, OUT)
    else if (command === '/jual') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Item Terjual';
      const modal = parseInt(parts[2]) || 0; const price = parseInt(parts[3]) || 0;
      dbData.items.push({ id: timestampId, name: name, status: "sold", type: "new", modal: modal, price: price, entryDate: nowStr, soldAt: nowStr });
      isUpdated = true;
      replyMsg = `⚡ *JUAL CEPAT BERHASIL!*\n📱 ${name}\n💰 Deal: Rp ${price.toLocaleString('id-ID')}\n📈 Laba: Rp ${(price - modal).toLocaleString('id-ID')}`;
    }
    else if (command === '/stok') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Stok Baru';
      const modal = parseInt(parts[2]) || 0; const price = parseInt(parts[3]) || 0;
      dbData.items.push({ id: timestampId, name: name, status: "stok", type: "new", modal: modal, price: price, entryDate: nowStr, soldAt: '' });
      isUpdated = true;
      replyMsg = `📦 *MASUK GUDANG*\n📱 ${name}\n💸 Kas Keluar: Rp ${modal.toLocaleString('id-ID')}`;
    }
    else if (command === '/jasa' || command === '/servis') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Laba Jasa';
      const profit = parseInt(parts[2]) || 0;
      dbData.extraProfits.push({ id: timestampId, name: name, modal: 0, price: profit, profit: profit });
      isUpdated = true;
      replyMsg = `🛠️ *SERVIS SELESAI!*\n📝 ${name}\n💵 Pemasukan: Rp ${profit.toLocaleString('id-ID')}`;
    }
    else if (command === '/out' || command === '/pengeluaran') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Pengeluaran';
      const nominal = parseInt(parts[2]) || 0;
      dbData.extraProfits.push({ id: timestampId, name: `[OUT] ${name}`, modal: 0, price: -Math.abs(nominal), profit: -Math.abs(nominal) });
      isUpdated = true;
      replyMsg = `🔻 *PENGELUARAN TERCATAT*\n📝 ${name}\n💸 Kas Keluar: Rp ${nominal.toLocaleString('id-ID')}`;
    }
    else {
      // Abaikan chat yang bukan perintah sistem
      return res.status(200).send('OK');
    }

    // ==========================================
    // SIMPAN DATABASE & MUNCULKAN MENU UTAMA
    // ==========================================
    if (isUpdated) {
      await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
        body: JSON.stringify(dbData)
      });
      // Memaksa menu utama muncul lagi di bawah agar bersih
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg + '\n\n🔄 _Sistem berhasil diupdate._', parse_mode: 'Markdown', reply_markup: menuKeyboard });
    } else if (replyMsg !== '') {
      // Jika pesan biasa, update keyboard tapi tidak update DB
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'Markdown', reply_markup: menuKeyboard });
    }

  } catch (error) {
    console.error("System Error:", error);
    await callTelegramAPI('sendMessage', { chat_id: chatId, text: `❌ *Error:* Gagal memproses data.`, parse_mode: 'Markdown' });
  }

  return res.status(200).send('OK');
}
