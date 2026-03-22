export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Farid Store Digital Ledger Bot - PRO Interactive V5');

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
  // 1. HANDLE CALLBACK QUERY (TOMBOL INLINE KLIK)
  // ---------------------------------------------------------
  if (req.body.callback_query) {
    const cb = req.body.callback_query;
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;

    try {
      const getResponse = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, { headers: { 'X-Master-Key': API_KEY } });
      const parsedData = await getResponse.json();
      let dbData = parsedData.record;

      // Fitur Batal Aksi Hapus
      if (data === 'cancel_undo') {
        await callTelegramAPI('editMessageText', { chat_id: chatId, message_id: messageId, text: `✅ *Proses Dibatalkan.*\nData Anda aman.`, parse_mode: 'Markdown' });
        return res.status(200).send('OK');
      }

      // Fitur Hapus Permanen (Undo Terakhir)
      if (data.startsWith('undo_')) {
        const parts = data.split('_'); const type = parts[1]; const idToDelete = parseInt(parts[2]);
        let deletedName = '';
        if (type === 'item') {
          const idx = dbData.items.findIndex(i => i.id === idToDelete);
          if(idx > -1) { deletedName = dbData.items[idx].name; dbData.items.splice(idx, 1); }
        } else {
          const idx = dbData.extraProfits.findIndex(i => i.id === idToDelete);
          if(idx > -1) { deletedName = dbData.extraProfits[idx].name; dbData.extraProfits.splice(idx, 1); }
        }

        if (deletedName !== '') {
          await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, body: JSON.stringify(dbData) });
          await callTelegramAPI('editMessageText', { chat_id: chatId, message_id: messageId, text: `🗑️ *TRANSAKSI DIHAPUS*\nData *${deletedName}* telah dihapus.`, parse_mode: 'Markdown' });
        } else {
          await callTelegramAPI('editMessageText', { chat_id: chatId, message_id: messageId, text: `⚠️ Data tidak ditemukan.`, parse_mode: 'Markdown' });
        }
      }

      // Fitur Tombol "✏️ Edit" dari List Stok
      if (data.startsWith('edit_req_')) {
        const id = parseInt(data.split('_')[2]);
        const item = dbData.items.find(i => i.id === id);
        if (item) {
          const safeName = item.name.replace(/ /g, '_');
          const msg = `✏️ *MINTA EDIT BARANG*\n\nAnda akan mengedit: *${item.name}*\n\n👇 *Copy teks di bawah ini*, ubah data yang salah, lalu kirim kembali ke bot:\n\n\`/edit ${item.id} ${safeName} ${item.modal} ${item.price}\``;
          await callTelegramAPI('sendMessage', { chat_id: chatId, text: msg, parse_mode: 'Markdown' });
        }
      }

      // Fitur Tombol "💸 Laku" dari List Stok
      if (data.startsWith('laku_req_')) {
        const id = parseInt(data.split('_')[2]);
        const item = dbData.items.find(i => i.id === id);
        if (item) {
          const msg = `💸 *PROSES LAKU GUDANG*\n\nBarang: *${item.name}*\nTarget Harga: Rp ${item.price.toLocaleString('id-ID')}\n\n👇 *Copy teks di bawah*, ubah angka ujungnya sesuai harga deal asli, lalu kirim:\n\n\`/lakuid ${item.id} ${item.price}\``;
          await callTelegramAPI('sendMessage', { chat_id: chatId, text: msg, parse_mode: 'Markdown' });
        }
      }

    } catch (e) {
      console.error(e);
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
    const sortedBrands = Object.keys(brands).sort((a,b) => brands[b] - brands[a]).slice(0, 3);

    // ==========================================
    // ROUTING PERINTAH TEKS
    // ==========================================
    const parts = text.split(' ');
    const command = parts[0].toLowerCase();

    // 1. DASHBOARD UTAMA
    if (command === '/start' || text.includes('Dashboard')) {
      replyMsg = `📊 *DIGITAL LEDGER - FARID STORE*\n` +
                 `------------------------------\n` +
                 `💵 *Kas Tunai:* Rp ${cash.toLocaleString('id-ID')}\n` +
                 `📦 *Stok Gudang:* Rp ${floatModal.toLocaleString('id-ID')} (${stockCount} Unit)\n` +
                 `🎯 *Potensi Untung:* Rp ${(floatPrice - floatModal).toLocaleString('id-ID')}\n` +
                 `📈 *Akumulasi Laba:* Rp ${totalProfitReal.toLocaleString('id-ID')}\n` +
                 `------------------------------\n` +
                 `💎 *TOTAL ASET:* Rp ${totalAsetReal.toLocaleString('id-ID')}\n\n` +
                 `_Pilih menu di bawah 👇 atau ketik perintah._`;
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'Markdown', reply_markup: menuKeyboard });
      return res.status(200).send('OK');
    }

    // 2. ANALISA BISNIS
    else if (text.includes('Analisa Bisnis')) {
      const pPengelola = profitBulanIni * 0.50; const pInvestor = profitBulanIni * 0.40;
      const pOps = profitBulanIni * 0.07; const pZakat = profitBulanIni * 0.03;

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
                 `🤝 *BAGI HASIL (BULAN INI)*\n` +
                 `_Laba Kotor Bln Ini: Rp ${profitBulanIni.toLocaleString('id-ID')}_\n` +
                 `👨‍💼 Pengelola (50%) : Rp ${pPengelola.toLocaleString('id-ID')}\n` +
                 `📈 Investor (40%)  : Rp ${pInvestor.toLocaleString('id-ID')}\n` +
                 `⚙️ Operasional (7%): Rp ${pOps.toLocaleString('id-ID')}\n` +
                 `🤲 Zakat (3%)      : Rp ${pZakat.toLocaleString('id-ID')}`;
      
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'Markdown', reply_markup: menuKeyboard });
      return res.status(200).send('OK');
    }

    // 3. CEK STOK & TOMBOL EDIT/LAKU PER NOMOR
    else if (command === '/cekstok' || text.includes('Cek Stok')) {
      const stokBarang = dbData.items.filter(item => item.status === 'stok');
      if (stokBarang.length === 0) {
        await callTelegramAPI('sendMessage', { chat_id: chatId, text: "📦 *GUDANG KOSONG*\nPutaran kas mantap! Tidak ada unit mengendap.", parse_mode: 'Markdown', reply_markup: menuKeyboard });
      } else {
        let listText = "";
        let inlineButtons = [];

        stokBarang.forEach((item, index) => {
          const itemDate = parseDateToWIB(item.entryDate);
          const selisihHari = Math.floor((wibNow - itemDate) / (1000 * 60 * 60 * 24));
          const warning = selisihHari > 14 ? " ⚠️" : "";
          
          listText += `\n*${index + 1}. ${item.name}*${warning}\n└ M: ${item.modal/1000}k | J: ${item.price/1000}k | ⏳ ${selisihHari} Hari\n`;
          
          // Membuat sepasang tombol (Edit & Laku) untuk setiap barang
          inlineButtons.push([
            { text: `✏️ Edit ${index + 1}`, callback_data: `edit_req_${item.id}` },
            { text: `💸 Laku ${index + 1}`, callback_data: `laku_req_${item.id}` }
          ]);
        });

        replyMsg = `📋 *DAFTAR STOK GUDANG*\nTotal Unit: *${stokBarang.length} HP*\nModal Mengendap: *Rp ${floatModal.toLocaleString('id-ID')}*\n──────────────${listText}\n\n👇 *Pilih Aksi Cepat:*`;
        await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'Markdown', reply_markup: { inline_keyboard: inlineButtons } });
      }
      return res.status(200).send('OK');
    }

    // 4. BATAL TERAKHIR DENGAN KONFIRMASI INLINE
    else if (text.includes('Batal Terakhir')) {
      let allEntries = [];
      dbData.items.forEach((item, index) => allEntries.push({ type: 'item', index: index, id: item.id, name: item.name, price: item.price }));
      dbData.extraProfits.forEach((item, index) => allEntries.push({ type: 'extra', index: index, id: item.id, name: item.name, price: item.profit }));

      if (allEntries.length === 0) {
        await callTelegramAPI('sendMessage', { chat_id: chatId, text: "⚠️ *Gudang kosong.* Tidak ada data yang bisa dibatalkan.", parse_mode: 'Markdown', reply_markup: menuKeyboard });
      } else {
        allEntries.sort((a, b) => b.id - a.id);
        const newestEntry = allEntries[0];
        
        const confirmationMsg = `⚠️ *KONFIRMASI PEMBATALAN*\n\nApakah Anda yakin membatalkan transaksi terakhir?\n\n📝 *Item:* ${newestEntry.name}\n💵 *Nilai:* Rp ${Math.abs(newestEntry.price).toLocaleString('id-ID')}\n\n_Saldo Kas dan Laba akan disesuaikan kembali._`;
        const inlineKeyboard = { inline_keyboard: [ [{ text: '❌ BATALKAN', callback_data: 'cancel_undo' }], [{ text: '🗑️ YA, HAPUS PERMANEN', callback_data: `undo_${newestEntry.type}_${newestEntry.id}` }] ] };
        await callTelegramAPI('sendMessage', { chat_id: chatId, text: confirmationMsg, parse_mode: 'Markdown', reply_markup: inlineKeyboard });
      }
      return res.status(200).send('OK');
    }

    // 5. UPDATE HASIL EDIT (Merespon copy-paste dari callback edit)
    else if (command === '/edit') {
      const idToEdit = parseInt(parts[1]);
      const newName = parts[2] ? parts[2].replace(/_/g, ' ') : '';
      const newModal = parseInt(parts[3]);
      const newPrice = parseInt(parts[4]);

      const idx = dbData.items.findIndex(i => i.id === idToEdit);
      if (idx !== -1 && newName && !isNaN(newModal) && !isNaN(newPrice)) {
        dbData.items[idx].name = newName;
        dbData.items[idx].modal = newModal;
        dbData.items[idx].price = newPrice;
        isUpdated = true;
        replyMsg = `✅ *PERUBAHAN DISIMPAN!*\n\nData telah diubah menjadi:\n📱 ${newName}\n💸 M: Rp ${newModal.toLocaleString('id-ID')}\n🎯 J: Rp ${newPrice.toLocaleString('id-ID')}`;
      } else {
        await callTelegramAPI('sendMessage', { chat_id: chatId, text: `❌ *Gagal Edit:* Format salah atau ID tidak ditemukan.`, parse_mode: 'Markdown', reply_markup: menuKeyboard });
        return res.status(200).send('OK');
      }
    }

    // 6. UPDATE LAKU PER ID (Merespon copy-paste dari callback laku)
    else if (command === '/lakuid') {
      const idToLaku = parseInt(parts[1]);
      const finalPrice = parseInt(parts[2]);

      const idx = dbData.items.findIndex(i => i.id === idToLaku);
      if (idx !== -1 && !isNaN(finalPrice)) {
        let item = dbData.items[idx];
        item.status = 'sold'; item.price = finalPrice; item.soldAt = nowStr;
        const profit = finalPrice - item.modal;
        isUpdated = true;
        replyMsg = `🎉 *UNIT GUDANG CAIR!*\n📱 ${item.name}\n💰 Harga Deal: Rp ${finalPrice.toLocaleString('id-ID')}\n📈 Laba Bersih: Rp ${profit.toLocaleString('id-ID')}`;
      } else {
        await callTelegramAPI('sendMessage', { chat_id: chatId, text: `❌ *Gagal Proses:* ID tidak ditemukan.`, parse_mode: 'Markdown', reply_markup: menuKeyboard });
        return res.status(200).send('OK');
      }
    }

    // 7. BANTUAN FORMAT (FIXED)
    else if (command === '/help' || text.includes('Bantuan Format')) {
      replyMsg = `🛠️ *FORMAT TRANSAKSI MANUAL:*\n_Pisahkan dg spasi, ganti spasi nama barang dg garis bawah (_)_\n\n` +
                 `1. Beli Stok: \`/stok Poco_M3 500000 700000\`\n` +
                 `2. Jual Cepat (Tanpa Gudang): \`/jual Vivo_Y20 1000000 1300000\`\n` +
                 `3. Jasa Servis: \`/jasa Ganti_LCD_Oppo 250000\`\n` +
                 `4. Biaya Toko: \`/out Token_Listrik 100000\`\n\n` +
                 `💡 _Tips: Untuk Stok Laku atau Edit Data, gunakan saja tombol di menu 📦 Cek Stok agar lebih mudah._`;
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'Markdown', reply_markup: menuKeyboard });
      return res.status(200).send('OK');
    }

    // 8. LAPORAN WA
    else if (text.includes('Laporan WA')) {
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

    // 9. LAKU PENCARIAN KATA KUNCI (Masih dipertahankan buat jaga-jaga)
    else if (command === '/laku') {
      const searchKeyword = parts[1] ? parts[1].replace(/_/g, ' ').toLowerCase() : '';
      const finalPrice = parseInt(parts[2]) || 0;
      let foundIndex = dbData.items.findIndex(i => i.status === 'stok' && i.name.toLowerCase().includes(searchKeyword));
      if (foundIndex !== -1) {
        let item = dbData.items[foundIndex];
        item.status = 'sold'; item.price = finalPrice; item.soldAt = nowStr;
        isUpdated = true;
        replyMsg = `🎉 *UNIT GUDANG CAIR!*\n📱 ${item.name}\n💰 Harga Deal: Rp ${finalPrice.toLocaleString('id-ID')}\n📈 Laba: Rp ${(finalPrice - item.modal).toLocaleString('id-ID')}`;
      }
    }

    // 10. JUAL CEPAT, STOK, JASA, OUT
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
      replyMsg = `📦 *MASUK GUDANG*\n📱 ${name}\n💸 Keluar: Rp ${modal.toLocaleString('id-ID')}\n🎯 Target: Rp ${price.toLocaleString('id-ID')}`;
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
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: `🤔 *Perintah tidak dikenali.*\nSilakan klik tombol Bantuan Format.`, parse_mode: 'Markdown', reply_markup: menuKeyboard });
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
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg + '\n\n🔄 _Data Web Ledger diupdate._', parse_mode: 'Markdown', reply_markup: menuKeyboard });
    }

  } catch (error) {
    console.error("System Error:", error);
    await callTelegramAPI('sendMessage', { chat_id: chatId, text: `❌ *Error Sistem:* Gagal memproses data.`, parse_mode: 'Markdown' });
  }

  return res.status(200).send('OK');
}
