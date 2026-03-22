export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Farid Store Digital Ledger Bot - PRO Version');

  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  const BIN_ID = process.env.BIN_ID;
  const API_KEY = process.env.API_KEY;

  // ---------------------------------------------------------
  // FUNGSI HELPER & API TELEGRAM
  // ---------------------------------------------------------
  const callTelegramAPI = async (method, payload) => {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
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
    if (lower.includes('iphone') || lower.includes('apple') || lower.includes('ipad') || lower.includes('ip ')) return 'APPLE';
    if (lower.includes('samsung') || lower.includes('galaxy') || lower.includes('z flip')) return 'SAMSUNG';
    if (lower.includes('xiaomi') || lower.includes('note') || lower.includes('redmi') || lower.includes('poco')) return 'XIAOMI/POCO';
    if (lower.includes('oppo') || lower.includes('reno')) return 'OPPO';
    if (lower.includes('vivo') || lower.includes('iqoo')) return 'VIVO';
    if (lower.includes('realme')) return 'REALME';
    if (lower.includes('infinix')) return 'INFINIX';
    if (lower.includes('tecno')) return 'TECNO';
    if (lower.includes('itel')) return 'ITEL';
    return itemName.split(' ')[0].toUpperCase();
  };

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
  // 1. HANDLE CALLBACK QUERY (TOMBOL INLINE / KONFIRMASI)
  // ---------------------------------------------------------
  if (req.body.callback_query) {
    const cb = req.body.callback_query;
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;

    if (data === 'cancel_undo') {
      await callTelegramAPI('editMessageText', {
        chat_id: chatId, message_id: messageId,
        text: `✅ *Proses Dibatalkan.*\nData Anda aman dan tidak ada yang dihapus.`,
        parse_mode: 'Markdown'
      });
      return res.status(200).send('OK');
    }

    if (data.startsWith('undo_')) {
      try {
        const parts = data.split('_'); // undo_item_123456789
        const type = parts[1];
        const idToDelete = parseInt(parts[2]);

        const getResponse = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, { headers: { 'X-Master-Key': API_KEY } });
        const parsedData = await getResponse.json();
        let dbData = parsedData.record;

        let deletedName = '';
        if (type === 'item') {
          const idx = dbData.items.findIndex(i => i.id === idToDelete);
          if(idx > -1) { deletedName = dbData.items[idx].name; dbData.items.splice(idx, 1); }
        } else {
          const idx = dbData.extraProfits.findIndex(i => i.id === idToDelete);
          if(idx > -1) { deletedName = dbData.extraProfits[idx].name; dbData.extraProfits.splice(idx, 1); }
        }

        if (deletedName !== '') {
          await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
            body: JSON.stringify(dbData)
          });
          await callTelegramAPI('editMessageText', {
            chat_id: chatId, message_id: messageId,
            text: `🗑️ *TRANSAKSI BERHASIL DIHAPUS*\n\nData *${deletedName}* telah dihapus permanen dari sistem Digital Ledger. Kas dan Stok telah disesuaikan kembali.`,
            parse_mode: 'Markdown'
          });
        } else {
          await callTelegramAPI('editMessageText', { chat_id: chatId, message_id: messageId, text: `⚠️ *Gagal:* Data sudah tidak ditemukan di database.`, parse_mode: 'Markdown' });
        }
      } catch (e) {
        await callTelegramAPI('editMessageText', { chat_id: chatId, message_id: messageId, text: `❌ *Error:* Gagal menghubungi database.`, parse_mode: 'Markdown' });
      }
    }
    return res.status(200).send('OK');
  }

  // ---------------------------------------------------------
  // 2. HANDLE PESAN TEKS BIASA
  // ---------------------------------------------------------
  const message = req.body.message;
  if (!message || !message.text) return res.status(200).send('OK');

  const text = message.text.trim();
  const chatId = message.chat.id;

  try {
    const getResponse = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, { headers: { 'X-Master-Key': API_KEY } });
    const parsedData = await getResponse.json();
    let dbData = parsedData.record;

    if (!dbData.items) dbData.items = [];
    if (!dbData.extraProfits) dbData.extraProfits = [];
    if (!dbData.startBalance) dbData.startBalance = 0;

    let isUpdated = false;
    let replyMsg = '';
    const nowStr = getWebDate();
    const timestampId = new Date().getTime();

    // ==========================================
    // LOGIKA PERHITUNGAN WEB DIGITAL LEDGER
    // ==========================================
    const startBal = Number(dbData.startBalance) || 0;
    let belanjaBaru = 0, uangMasuk = 0, profitMain = 0, floatPrice = 0, floatModal = 0;
    let stockCount = 0, soldCount = 0;
    
    // Untuk Tab Analisa
    let unitBulanIni = 0, unitBulanLalu = 0, profitBulanIni = 0;
    let brands = {};
    const wibNow = new Date(new Date().getTime() + (7 * 60 * 60 * 1000));
    const currM = wibNow.getMonth(); const currY = wibNow.getFullYear();
    const lastM = currM === 0 ? 11 : currM - 1;
    const lastY = currM === 0 ? currY - 1 : currY;
    
    dbData.items.forEach(i => {
      if (i.status === 'sold') {
        soldCount++;
        if (i.type === 'new') belanjaBaru += i.modal;
        uangMasuk += i.price;
        const profit = (i.price - i.modal);
        profitMain += profit;
        
        const brand = getBrandCategory(i.name);
        brands[brand] = (brands[brand] || 0) + 1;

        if (i.soldAt) {
          const d = parseDateToWIB(i.soldAt);
          if (d.getMonth() === currM && d.getFullYear() === currY) { unitBulanIni++; profitBulanIni += profit; }
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
      extraProfitTotal += p.profit;
      soldCount++;
      const brand = getBrandCategory(p.name);
      brands[brand] = (brands[brand] || 0) + 1;
      
      const d = new Date(p.id);
      if (d.getMonth() === currM && d.getFullYear() === currY) { profitBulanIni += p.profit; }
    });

    const totalProfitReal = profitMain + extraProfitTotal;
    const cash = startBal - belanjaBaru + uangMasuk;
    const totalAsetReal = cash + floatPrice;

    // Sorting Brands untuk Top 3
    const sortedBrands = Object.keys(brands).sort((a,b) => brands[b] - brands[a]).slice(0, 3);

    // ==========================================
    // ROUTING PERINTAH
    // ==========================================
    const parts = text.split(' ');
    const command = parts[0].toLowerCase();

    // 1. DASHBOARD UTAMA
    if (command === '/start' || text === '📊 Dashboard') {
      replyMsg = `📊 *DIGITAL LEDGER - FARID STORE*\n` +
                 `------------------------------\n` +
                 `💵 *Kas Tunai:* Rp ${cash.toLocaleString('id-ID')}\n` +
                 `📦 *Stok Gudang:* Rp ${floatModal.toLocaleString('id-ID')} (${stockCount} Unit)\n` +
                 `🎯 *Potensi Untung:* Rp ${(floatPrice - floatModal).toLocaleString('id-ID')}\n` +
                 `📈 *Akumulasi Laba:* Rp ${totalProfitReal.toLocaleString('id-ID')}\n` +
                 `------------------------------\n` +
                 `💎 *TOTAL ASET:* Rp ${totalAsetReal.toLocaleString('id-ID')}\n\n` +
                 `_Pilih menu di bawah 👇 atau input transaksi._`;
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'Markdown', reply_markup: menuKeyboard });
      return res.status(200).send('OK');
    }

    // 2. ANALISA BISNIS (SINKRON WEB)
    else if (text === '📈 Analisa Bisnis') {
      const pPengelola = profitBulanIni * 0.50;
      const pInvestor = profitBulanIni * 0.40;
      const pOps = profitBulanIni * 0.07;
      const pZakat = profitBulanIni * 0.03;

      let topBrandsText = '';
      sortedBrands.forEach((b, i) => { topBrandsText += `  ${i+1}. ${b} (${brands[b]} Unit)\n`; });
      if(topBrandsText === '') topBrandsText = "  Belum ada data\n";

      replyMsg = `📈 *ANALISA BISNIS REAL-TIME*\n\n` +
                 `*STATISTIK UNIT*\n` +
                 `▫️ Unit Ready di Gudang : *${stockCount}*\n` +
                 `▫️ Terjual Bulan Ini    : *${unitBulanIni}*\n` +
                 `▫️ Terjual Bulan Lalu   : *${unitBulanLalu}*\n` +
                 `▫️ Total Unit All Time  : *${soldCount}*\n\n` +
                 `🏆 *TOP 3 MEREK DOMINAN*\n${topBrandsText}\n` +
                 `🤝 *BAGI HASIL (KHUSUS BULAN INI)*\n` +
                 `_Laba Kotor Bulan Ini: Rp ${profitBulanIni.toLocaleString('id-ID')}_\n` +
                 `👨‍💼 Pengelola (50%) : Rp ${pPengelola.toLocaleString('id-ID')}\n` +
                 `📈 Investor (40%)  : Rp ${pInvestor.toLocaleString('id-ID')}\n` +
                 `⚙️ Operasional (7%): Rp ${pOps.toLocaleString('id-ID')}\n` +
                 `🤲 Zakat (3%)      : Rp ${pZakat.toLocaleString('id-ID')}`;
      
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'Markdown', reply_markup: menuKeyboard });
      return res.status(200).send('OK');
    }

    // 3. BATAL TERAKHIR DENGAN KONFIRMASI INLINE KEYBOARD (Aman!)
    else if (text === '↩️ Batal Terakhir') {
      let allEntries = [];
      dbData.items.forEach((item, index) => allEntries.push({ type: 'item', index: index, id: item.id, name: item.name, price: item.price }));
      dbData.extraProfits.forEach((item, index) => allEntries.push({ type: 'extra', index: index, id: item.id, name: item.name, price: item.profit }));

      if (allEntries.length === 0) {
        await callTelegramAPI('sendMessage', { chat_id: chatId, text: "⚠️ *Gudang kosong.* Tidak ada data yang bisa dibatalkan.", parse_mode: 'Markdown', reply_markup: menuKeyboard });
      } else {
        allEntries.sort((a, b) => b.id - a.id);
        const newestEntry = allEntries[0];
        
        const confirmationMsg = `⚠️ *PERINGATAN KONFIRMASI*\n\nApakah Anda yakin ingin membatalkan transaksi terakhir ini?\n\n` +
                                `📝 *Item:* ${newestEntry.name}\n` +
                                `💵 *Nilai:* Rp ${Math.abs(newestEntry.price).toLocaleString('id-ID')}\n\n` +
                                `_Data yang dihapus akan mengembalikan saldo kas dan stok seperti semula._`;

        const inlineKeyboard = {
          inline_keyboard: [
            [{ text: '❌ BATALKAN', callback_data: 'cancel_undo' }],
            [{ text: '🗑️ YA, HAPUS PERMANEN', callback_data: `undo_${newestEntry.type}_${newestEntry.id}` }]
          ]
        };

        await callTelegramAPI('sendMessage', { chat_id: chatId, text: confirmationMsg, parse_mode: 'Markdown', reply_markup: inlineKeyboard });
      }
      return res.status(200).send('OK');
    }

    // 4. LAPORAN WA
    else if (text === '📑 Laporan WA') {
      const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
      const currentMonthString = `${monthNames[currM]} ${currY}`;

      replyMsg = `📊 *LAPORAN KEUANGAN FARID STORE*\n` +
                 `🗓️ Periode: ${currentMonthString}\n` +
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

    // 5. CEK STOK GUDANG
    else if (command === '/cekstok' || text === '📦 Cek Stok') {
      const stokBarang = dbData.items.filter(item => item.status === 'stok');
      if (stokBarang.length === 0) {
        replyMsg = "📦 *GUDANG KOSONG*\nPutaran kas lancar! Tidak ada unit mengendap.";
      } else {
        let listText = "";
        stokBarang.forEach((item, index) => {
          const itemDate = parseDateToWIB(item.entryDate);
          const selisihHari = Math.floor((wibNow - itemDate) / (1000 * 60 * 60 * 24));
          const warning = selisihHari > 14 ? " ⚠️" : "";
          listText += `\n*${index + 1}. ${item.name}*${warning}\n└ M: ${item.modal/1000}k | J: ${item.price/1000}k | ⏳ ${selisihHari} Hari\n`;
        });
        replyMsg = `📋 *DAFTAR STOK GUDANG*\nTotal Unit: *${stokBarang.length} HP*\nModal Mengendap: *Rp ${floatModal.toLocaleString('id-ID')}*\n──────────────${listText}`;
      }
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'Markdown', reply_markup: menuKeyboard });
      return res.status(200).send('OK');
    }

    // 6. STOK LAKU
    else if (command === '/laku') {
      const searchKeyword = parts[1] ? parts[1].replace(/_/g, ' ').toLowerCase() : '';
      const finalPrice = parseInt(parts[2]) || 0;
      let foundIndex = dbData.items.findIndex(i => i.status === 'stok' && i.name.toLowerCase().includes(searchKeyword));
      
      if (foundIndex !== -1) {
        let item = dbData.items[foundIndex];
        item.status = 'sold'; item.price = finalPrice; item.soldAt = nowStr;
        replyMsg = `🎉 *UNIT GUDANG CAIR!*\n📱 ${item.name}\n💰 Harga Deal: Rp ${finalPrice.toLocaleString('id-ID')}\n📈 Laba Bersih: Rp ${(finalPrice - item.modal).toLocaleString('id-ID')}`;
        isUpdated = true;
      } else {
        await callTelegramAPI('sendMessage', { chat_id: chatId, text: `❌ *GAGAL:* HP "${searchKeyword}" tidak ditemukan di gudang.`, parse_mode: 'Markdown', reply_markup: menuKeyboard });
        return res.status(200).send('OK');
      }
    }

    // 7. JUAL CEPAT
    else if (command === '/jual') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Item Terjual';
      const modal = parseInt(parts[2]) || 0; const price = parseInt(parts[3]) || 0;
      dbData.items.push({ id: timestampId, name: name, status: "sold", type: "new", modal: modal, price: price, entryDate: nowStr, soldAt: nowStr });
      isUpdated = true;
      replyMsg = `⚡ *JUAL CEPAT BERHASIL!*\n📱 ${name}\n💰 Deal: Rp ${price.toLocaleString('id-ID')}\n📈 Laba Bersih: Rp ${(price - modal).toLocaleString('id-ID')}`;
    }

    // 8. MASUK STOK
    else if (command === '/stok') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Stok Baru';
      const modal = parseInt(parts[2]) || 0; const price = parseInt(parts[3]) || 0;
      dbData.items.push({ id: timestampId, name: name, status: "stok", type: "new", modal: modal, price: price, entryDate: nowStr, soldAt: '' });
      isUpdated = true;
      replyMsg = `📦 *MASUK GUDANG*\n📱 ${name}\n💸 Keluar: Rp ${modal.toLocaleString('id-ID')}\n🎯 Target: Rp ${price.toLocaleString('id-ID')}`;
    }

    // 9. LABA JASA
    else if (command === '/jasa' || command === '/servis') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Laba Jasa';
      const profit = parseInt(parts[2]) || 0;
      dbData.extraProfits.push({ id: timestampId, name: name, modal: 0, price: profit, profit: profit });
      isUpdated = true;
      replyMsg = `🛠️ *SERVIS SELESAI!*\n📝 ${name}\n💵 Pemasukan: Rp ${profit.toLocaleString('id-ID')}`;
    }

    // 10. PENGELUARAN
    else if (command === '/out' || command === '/pengeluaran') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Pengeluaran';
      const nominal = parseInt(parts[2]) || 0;
      dbData.extraProfits.push({ id: timestampId, name: `[OUT] ${name}`, modal: 0, price: -Math.abs(nominal), profit: -Math.abs(nominal) });
      isUpdated = true;
      replyMsg = `🔻 *PENGELUARAN TERCATAT*\n📝 ${name}\n💸 Kas Keluar: Rp ${nominal.toLocaleString('id-ID')}`;
    }
    
    // 11. BANTUAN
    else if (text === '❓ Bantuan Format') {
      replyMsg = `🛠️ *FORMAT TRANSAKSI:*\n_Pisahkan dg spasi, ganti spasi nama barang dg garis bawah (_)_\n\n` +
                 `1. Beli Stok: \`/stok Poco_M3 500000 700000\`\n` +
                 `2. Stok Laku: \`/laku Poco_M3 650000\`\n` +
                 `3. Jual Cepat: \`/jual Vivo_Y20 1000000 1300000\`\n` +
                 `4. Jasa Servis: \`/jasa Ganti_LCD_Oppo 250000\`\n` +
                 `5. Biaya Toko: \`/out Token_Listrik 100000\``;
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'Markdown', reply_markup: menuKeyboard });
      return res.status(200).send('OK');
    }
    else {
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: `🤔 *Perintah tidak dipahami.*\nGunakan menu di bawah ini.👇`, parse_mode: 'Markdown', reply_markup: menuKeyboard });
      return res.status(200).send('OK');
    }

    // ==========================================
    // SIMPAN DATABASE & KIRIM NOTIF
    // ==========================================
    if (isUpdated) {
      await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
        body: JSON.stringify(dbData)
      });
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg + '\n\n🔄 _Database berhasil diupdate._', parse_mode: 'Markdown', reply_markup: menuKeyboard });
    }

  } catch (error) {
    console.error("System Error:", error);
    await callTelegramAPI('sendMessage', { chat_id: chatId, text: `❌ *Error Sistem:* Gagal memproses data.`, parse_mode: 'Markdown' });
  }

  return res.status(200).send('OK');
}
