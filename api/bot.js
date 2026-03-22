export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Farid Store Bot V9 - HTML Stable Edition');

  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  const BIN_ID = process.env.BIN_ID;
  const API_KEY = process.env.API_KEY;

  // ---------------------------------------------------------
  // FUNGSI API TELEGRAM (ANTI-ERROR)
  // ---------------------------------------------------------
  const callTelegramAPI = async (method, payload) => {
    try {
      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!result.ok) console.error("Telegram API Error:", result);
      return result;
    } catch (e) {
      console.error("Fetch Error:", e);
    }
  };

  const getWebDate = () => {
    const d = new Date(new Date().getTime() + (7 * 60 * 60 * 1000)); // WIB
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
  // 1. PENANGANAN KLIK TOMBOL BUBBLE (INLINE KEYBOARD)
  // ---------------------------------------------------------
  if (req.body.callback_query) {
    const cb = req.body.callback_query;
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;

    // Jawab callback agar tombol tidak muter-muter/freeze
    await callTelegramAPI('answerCallbackQuery', { callback_query_id: cb.id });

    try {
      const getRes = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, { headers: { 'X-Master-Key': API_KEY } });
      const parsed = await getRes.json();
      let dbData = parsed.record || {};
      if (!dbData.items) dbData.items = [];
      if (!dbData.extraProfits) dbData.extraProfits = [];

      // A. BATALKAN PROSES UNDO
      if (data === 'cancel_undo') {
        await callTelegramAPI('editMessageText', { 
          chat_id: chatId, message_id: messageId, 
          text: `✅ <b>Proses Dibatalkan.</b>\nData Anda aman dan tidak ada yang dihapus.`, 
          parse_mode: 'HTML' 
        });
        return res.status(200).send('OK');
      }

      // B. PROSES UNDO PERMANEN
      if (data.startsWith('undo_')) {
        const parts = data.split('_'); 
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
          await callTelegramAPI('editMessageText', { 
            chat_id: chatId, message_id: messageId, 
            text: `🗑️ <b>TRANSAKSI DIHAPUS</b>\nData <b>${deletedName}</b> telah dihapus permanen.`, 
            parse_mode: 'HTML' 
          });
        }
        return res.status(200).send('OK');
      }

      // C. KLIK TOMBOL: EDIT BARANG
      if (data.startsWith('edit_')) {
        const idStr = data.replace('edit_', '');
        const item = dbData.items.find(i => String(i.id) === idStr);
        if (item) {
          const safeName = item.name.replace(/ /g, '_');
          const msg = `✏️ <b>EDIT BARANG</b>\n\nBarang: <b>${item.name}</b>\n\n👇 <b>Salin teks di bawah ini</b>, ubah Nominal Modal / Jual, lalu kirim kembali:\n\n<code>/edit ${item.id} ${safeName} ${item.modal} ${item.price}</code>`;
          await callTelegramAPI('sendMessage', { chat_id: chatId, text: msg, parse_mode: 'HTML' });
        } else {
          await callTelegramAPI('sendMessage', { chat_id: chatId, text: `❌ Data barang sudah tidak ditemukan.`, parse_mode: 'HTML' });
        }
        return res.status(200).send('OK');
      }

      // D. KLIK TOMBOL: TANDAI TERJUAL
      if (data.startsWith('laku_')) {
        const idStr = data.replace('laku_', '');
        const item = dbData.items.find(i => String(i.id) === idStr);
        if (item) {
          const msg = `💸 <b>PROSES TERJUAL</b>\n\nBarang: <b>${item.name}</b>\nTarget Jual: Rp ${item.price.toLocaleString('id-ID')}\n\n👇 <b>Salin teks di bawah</b>, ubah angka ujung sesuai harga deal sebenarnya, lalu kirim:\n\n<code>/lakuid ${item.id} ${item.price}</code>`;
          await callTelegramAPI('sendMessage', { chat_id: chatId, text: msg, parse_mode: 'HTML' });
        } else {
          await callTelegramAPI('sendMessage', { chat_id: chatId, text: `❌ Data barang sudah tidak ditemukan.`, parse_mode: 'HTML' });
        }
        return res.status(200).send('OK');
      }

    } catch (e) {
      console.error("Callback Error:", e);
    }
    return res.status(200).send('OK');
  }

  // ---------------------------------------------------------
  // 2. PENANGANAN PESAN TEKS (PERINTAH & MENU BAWAH)
  // ---------------------------------------------------------
  const message = req.body.message;
  if (!message || !message.text) return res.status(200).send('OK');

  const text = message.text.trim();
  const normalizedText = text.toLowerCase();
  const chatId = message.chat.id;
  const parts = text.split(' ');
  const command = parts[0].toLowerCase();

  // ==========================================
  // JALUR PRIORITAS: BANTUAN & MENU KEMBALI
  // ==========================================
  if (normalizedText.includes('bantuan format') || command === '/help') {
    const helpMsg = `🛠️ <b>FORMAT TRANSAKSI MANUAL:</b>\n` +
               `<i>Pisahkan dengan spasi, ganti spasi di nama barang dengan garis bawah (_)</i>\n\n` +
               `<b>1. Beli Stok (Masuk Gudang):</b>\n<code>/stok Poco_M3 500000 700000</code>\n\n` +
               `<b>2. Jual Cepat (Tanpa Gudang):</b>\n<code>/jual Vivo_Y20 1000000 1300000</code>\n\n` +
               `<b>3. Jasa Servis:</b>\n<code>/jasa Ganti_LCD_Oppo 250000</code>\n\n` +
               `<b>4. Biaya Toko:</b>\n<code>/out Token_Listrik 100000</code>\n\n` +
               `💡 <i>Tips: Untuk mengedit atau menandai barang laku dari gudang, cukup klik menu 📦 Cek Stok di bawah.</i>`;
    await callTelegramAPI('sendMessage', { chat_id: chatId, text: helpMsg, parse_mode: 'HTML', reply_markup: menuKeyboard });
    return res.status(200).send('OK');
  }

  if (normalizedText === '🔙 menu utama' || normalizedText === '❌ kembali') {
    await callTelegramAPI('sendMessage', { chat_id: chatId, text: `✅ Kembali ke Menu Utama.`, parse_mode: 'HTML', reply_markup: menuKeyboard });
    return res.status(200).send('OK');
  }

  // ==========================================
  // TARIK DATABASE UNTUK FITUR LAINNYA
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
    
    const wibNow = new Date(timestampId + (7 * 60 * 60 * 1000));
    const currM = wibNow.getMonth(); const currY = wibNow.getFullYear();
    const lastM = currM === 0 ? 11 : currM - 1; const lastY = currM === 0 ? currY - 1 : currY;

    // KALKULASI LEDGER
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
    if (command === '/start' || normalizedText.includes('dashboard')) {
      replyMsg = `📊 <b>DIGITAL LEDGER - FARID STORE</b>\n` +
                 `------------------------------\n` +
                 `💵 <b>Kas Tunai:</b> Rp ${cash.toLocaleString('id-ID')}\n` +
                 `📦 <b>Stok Gudang:</b> Rp ${floatModal.toLocaleString('id-ID')} (${stockCount} Unit)\n` +
                 `🎯 <b>Potensi Untung:</b> Rp ${(floatPrice - floatModal).toLocaleString('id-ID')}\n` +
                 `📈 <b>Akumulasi Laba:</b> Rp ${totalProfitReal.toLocaleString('id-ID')}\n` +
                 `------------------------------\n` +
                 `💎 <b>TOTAL ASET:</b> Rp ${totalAsetReal.toLocaleString('id-ID')}\n\n` +
                 `<i>Pilih menu di bawah 👇</i>`;
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'HTML', reply_markup: menuKeyboard });
      return res.status(200).send('OK');
    }

    // --------------------------------------------------------
    // PERINTAH: ANALISA BISNIS
    else if (normalizedText.includes('analisa bisnis')) {
      const pPengelola = profitBulanIni * 0.50; const pInvestor = profitBulanIni * 0.40;
      const pOps = profitBulanIni * 0.07; const pZakat = profitBulanIni * 0.03;
      const sortedBrands = Object.keys(brands).sort((a,b) => brands[b] - brands[a]).slice(0, 3);
      let topBrandsText = '';
      sortedBrands.forEach((b, i) => { topBrandsText += `  ${i+1}. ${b} (${brands[b]} Unit)\n`; });
      if(topBrandsText === '') topBrandsText = "  Belum ada data\n";

      replyMsg = `📈 <b>ANALISA BISNIS REAL-TIME</b>\n\n` +
                 `<b>STATISTIK UNIT</b>\n` +
                 `▫️ Ready di Gudang : <b>${stockCount}</b>\n` +
                 `▫️ Terjual Bulan Ini  : <b>${unitBulanIni}</b>\n` +
                 `▫️ Terjual Bulan Lalu : <b>${unitBulanLalu}</b>\n` +
                 `▫️ Total Unit All Time: <b>${soldCount}</b>\n\n` +
                 `🏆 <b>TOP 3 MEREK</b>\n${topBrandsText}\n` +
                 `🤝 <b>BAGI HASIL (BULAN INI)</b>\n` +
                 `<i>Laba Kotor Bln Ini: Rp ${profitBulanIni.toLocaleString('id-ID')}</i>\n` +
                 `👨‍💼 Pengelola (50%) : Rp ${pPengelola.toLocaleString('id-ID')}\n` +
                 `📈 Investor (40%)  : Rp ${pInvestor.toLocaleString('id-ID')}\n` +
                 `⚙️ Operasional (7%): Rp ${pOps.toLocaleString('id-ID')}\n` +
                 `🤲 Zakat (3%)      : Rp ${pZakat.toLocaleString('id-ID')}`;
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'HTML', reply_markup: menuKeyboard });
      return res.status(200).send('OK');
    }

    // --------------------------------------------------------
    // PERINTAH: LAPORAN WA
    else if (normalizedText.includes('laporan wa')) {
      const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
      replyMsg = `📊 <b>LAPORAN KEUANGAN FARID STORE</b>\n` +
                 `🗓️ Periode: ${monthNames[currM]} ${currY}\n` +
                 `------------------------------\n\n` +
                 `💵 <b>Sisa Tunai: Rp ${cash.toLocaleString('id-ID')}</b>\n` +
                 `📦 Nilai Stok Gudang: Rp ${floatModal.toLocaleString('id-ID')}\n` +
                 `🎯 Potensi Untung: Rp ${(floatPrice - floatModal).toLocaleString('id-ID')}\n` +
                 `------------------------------\n` +
                 `📈 <b>TOTAL ASET: Rp ${totalAsetReal.toLocaleString('id-ID')}</b>\n\n` +
                 `🔥 <b>PROFIT KESELURUHAN</b>\n` +
                 `✨ <b>Total Bersih: Rp ${totalProfitReal.toLocaleString('id-ID')}</b>\n` +
                 `------------------------------\n` +
                 `<i>Digital Ledger - Farid Store</i>`;
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'HTML', reply_markup: menuKeyboard });
      return res.status(200).send('OK');
    }

    // --------------------------------------------------------
    // PERINTAH: BATAL TERAKHIR (KONFIRMASI)
    else if (normalizedText.includes('batal terakhir')) {
      let allEntries = [];
      dbData.items.forEach((item) => allEntries.push({ id: item.id, name: item.name, price: item.price, type: 'item' }));
      dbData.extraProfits.forEach((item) => allEntries.push({ id: item.id, name: item.name, price: item.profit, type: 'extra' }));

      if (allEntries.length === 0) {
        await callTelegramAPI('sendMessage', { chat_id: chatId, text: "⚠️ Tidak ada data untuk dibatalkan.", parse_mode: 'HTML', reply_markup: menuKeyboard });
      } else {
        allEntries.sort((a, b) => b.id - a.id);
        const newest = allEntries[0];
        
        replyMsg = `⚠️ <b>KONFIRMASI PEMBATALAN</b>\n\nYakin membatalkan transaksi terakhir ini?\n\n📝 <b>Item:</b> ${newest.name}\n💵 <b>Nilai:</b> Rp ${Math.abs(newest.price).toLocaleString('id-ID')}`;
        const inlineKeyboard = {
          inline_keyboard: [
            [{ text: '❌ BATALKAN', callback_data: 'cancel_undo' }],
            [{ text: '🗑️ YA, HAPUS PERMANEN', callback_data: `undo_${newest.type}_${newest.id}` }]
          ]
        };
        await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'HTML', reply_markup: inlineKeyboard });
      }
      return res.status(200).send('OK');
    }

    // --------------------------------------------------------
    // PERINTAH: CEK STOK (PAGINATION)
    else if (normalizedText.includes('cek stok') || text.startsWith('➡️ Hal') || text.startsWith('⬅️ Hal')) {
      let page = 1;
      if (text.startsWith('➡️ Hal')) page = parseInt(text.replace('➡️ Hal ', ''));
      else if (text.startsWith('⬅️ Hal')) page = parseInt(text.replace('⬅️ Hal ', ''));

      const stokBarang = dbData.items.filter(item => item.status === 'stok');
      const itemsPerPage = 15;
      const totalPages = Math.ceil(stokBarang.length / itemsPerPage) || 1;

      if (page > totalPages) page = totalPages;
      if (page < 1) page = 1;

      if (stokBarang.length === 0) {
        await callTelegramAPI('sendMessage', { chat_id: chatId, text: "📦 <b>GUDANG KOSONG</b>\nPutaran kas mantap!", parse_mode: 'HTML', reply_markup: menuKeyboard });
        return res.status(200).send('OK');
      }

      const startIndex = (page - 1) * itemsPerPage;
      const currentItems = stokBarang.slice(startIndex, startIndex + itemsPerPage);

      let listText = `📋 <b>DAFTAR STOK (Hal ${page}/${totalPages})</b>\nTotal Unit: <b>${stokBarang.length} HP</b>\n──────────────\n`;
      let keyboardRows = [];
      let currentRow = [];

      currentItems.forEach((item, idx) => {
        const globalIndex = startIndex + idx + 1;
        const itemDate = parseDateToWIB(item.entryDate);
        const selisihHari = Math.floor((wibNow - itemDate) / (1000 * 60 * 60 * 24));
        const warning = selisihHari > 14 ? " ⚠️" : "";
        
        listText += `\n<b>${globalIndex}. ${item.name}</b>${warning}\n└ M: ${item.modal/1000}k | J: ${item.price/1000}k | ⏳ ${selisihHari} Hari\n`;
        currentRow.push({ text: `📦 ${globalIndex}` });
        if (currentRow.length === 5) { keyboardRows.push(currentRow); currentRow = []; }
      });
      if (currentRow.length > 0) keyboardRows.push(currentRow);

      let navRow = [];
      if (page > 1) navRow.push({ text: `⬅️ Hal ${page - 1}` });
      navRow.push({ text: '🔙 Menu Utama' });
      if (page < totalPages) navRow.push({ text: `➡️ Hal ${page + 1}` });
      keyboardRows.push(navRow);

      const pagedKeyboard = { keyboard: keyboardRows, resize_keyboard: true, is_persistent: true };
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: listText + `\n\n👇 <i>Pilih tombol nomor di bawah untuk Edit/Laku:</i>`, parse_mode: 'HTML', reply_markup: pagedKeyboard });
      return res.status(200).send('OK');
    }

    // --------------------------------------------------------
    // KLIK TOMBOL NOMOR BARANG (MUNCULKAN BUBBLE)
    else if (text.match(/^📦 \d+$/)) {
      const idx = parseInt(text.replace('📦 ', '')) - 1;
      const stokBarang = dbData.items.filter(item => item.status === 'stok');
      const item = stokBarang[idx];
      
      if (item) {
        const itemDate = parseDateToWIB(item.entryDate);
        const selisihHari = Math.floor((wibNow - itemDate) / (1000 * 60 * 60 * 24));
        
        const detailMsg = `🔍 <b>DETAIL BARANG (No. ${idx + 1})</b>\n\n` +
                          `📱 <b>Nama:</b> ${item.name}\n` +
                          `💸 <b>Modal:</b> Rp ${item.modal.toLocaleString('id-ID')}\n` +
                          `🎯 <b>Target Jual:</b> Rp ${item.price.toLocaleString('id-ID')}\n` +
                          `⏳ <b>Mengendap:</b> ${selisihHari} Hari\n\n` +
                          `<i>Pilih aksi untuk item ini:</i> 👇`;

        const inlineActionKeyboard = {
          inline_keyboard: [
            [
              { text: '✏️ Edit Barang', callback_data: `edit_${item.id}` },
              { text: '💸 Tandai Terjual', callback_data: `laku_${item.id}` }
            ]
          ]
        };
        await callTelegramAPI('sendMessage', { chat_id: chatId, text: detailMsg, parse_mode: 'HTML', reply_markup: inlineActionKeyboard });
      } else {
        await callTelegramAPI('sendMessage', { chat_id: chatId, text: `❌ <b>Error:</b> Barang tidak ditemukan.`, parse_mode: 'HTML' });
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
        replyMsg = `✅ <b>PERUBAHAN DISIMPAN!</b>\n\nData menjadi:\n📱 ${newName}\n💸 M: Rp ${newModal.toLocaleString('id-ID')}\n🎯 J: Rp ${newPrice.toLocaleString('id-ID')}`;
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
        replyMsg = `🎉 <b>UNIT GUDANG CAIR!</b>\n📱 ${item.name}\n💰 Deal: Rp ${finalPrice.toLocaleString('id-ID')}\n📈 Laba: Rp ${(finalPrice - item.modal).toLocaleString('id-ID')}`;
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
      replyMsg = `⚡ <b>JUAL CEPAT BERHASIL!</b>\n📱 ${name}\n💰 Deal: Rp ${price.toLocaleString('id-ID')}\n📈 Laba: Rp ${(price - modal).toLocaleString('id-ID')}`;
    }
    else if (command === '/stok') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Stok Baru';
      const modal = parseInt(parts[2]) || 0; const price = parseInt(parts[3]) || 0;
      dbData.items.push({ id: timestampId, name: name, status: "stok", type: "new", modal: modal, price: price, entryDate: nowStr, soldAt: '' });
      isUpdated = true;
      replyMsg = `📦 <b>MASUK GUDANG</b>\n📱 ${name}\n💸 Kas Keluar: Rp ${modal.toLocaleString('id-ID')}`;
    }
    else if (command === '/jasa' || command === '/servis') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Laba Jasa';
      const profit = parseInt(parts[2]) || 0;
      dbData.extraProfits.push({ id: timestampId, name: name, modal: 0, price: profit, profit: profit });
      isUpdated = true;
      replyMsg = `🛠️ <b>SERVIS SELESAI!</b>\n📝 ${name}\n💵 Pemasukan: Rp ${profit.toLocaleString('id-ID')}`;
    }
    else if (command === '/out' || command === '/pengeluaran') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Pengeluaran';
      const nominal = parseInt(parts[2]) || 0;
      dbData.extraProfits.push({ id: timestampId, name: `[OUT] ${name}`, modal: 0, price: -Math.abs(nominal), profit: -Math.abs(nominal) });
      isUpdated = true;
      replyMsg = `🔻 <b>PENGELUARAN TERCATAT</b>\n📝 ${name}\n💸 Kas Keluar: Rp ${nominal.toLocaleString('id-ID')}`;
    }
    else {
      // Abaikan chat ngasal
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
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg + '\n\n🔄 <i>Sistem berhasil diupdate.</i>', parse_mode: 'HTML', reply_markup: menuKeyboard });
    } else if (replyMsg !== '') {
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'HTML', reply_markup: menuKeyboard });
    }

  } catch (error) {
    console.error("System Error:", error);
    await callTelegramAPI('sendMessage', { chat_id: chatId, text: `❌ <b>Error:</b> Gagal memproses data.`, parse_mode: 'HTML' });
  }

  return res.status(200).send('OK');
}
