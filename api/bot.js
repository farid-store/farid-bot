export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Farid Store Digital Ledger Bot - Full Bottom Menu V6');

  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  const BIN_ID = process.env.BIN_ID;
  const API_KEY = process.env.API_KEY;

  const message = req.body.message;
  if (!message || !message.text) return res.status(200).send('OK');

  const text = message.text.trim();
  const chatId = message.chat.id;

  // ---------------------------------------------------------
  // FUNGSI HELPER & WAKTU (SINKRON WEB)
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

  // KEYBOARD UTAMA
  const menuKeyboard = {
    keyboard: [
      [{ text: '📊 Dashboard' }, { text: '📦 Cek Stok' }],
      [{ text: '📈 Analisa Bisnis' }, { text: '📑 Laporan WA' }],
      [{ text: '↩️ Batal Terakhir' }, { text: '❓ Bantuan Format' }]
    ],
    resize_keyboard: true,
    is_persistent: true
  };

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
    
    const wibNow = new Date(timestampId + (7 * 60 * 60 * 1000));
    const currM = wibNow.getMonth(); const currY = wibNow.getFullYear();
    const lastM = currM === 0 ? 11 : currM - 1;
    const lastY = currM === 0 ? currY - 1 : currY;

    // ==========================================
    // LOGIKA PERHITUNGAN WEB (KAS, ASET, LABA)
    // ==========================================
    const startBal = Number(dbData.startBalance) || 0;
    let belanjaBaru = 0, uangMasuk = 0, profitMain = 0, floatPrice = 0, floatModal = 0;
    let stockCount = 0, soldCount = 0;
    let unitBulanIni = 0, unitBulanLalu = 0, profitBulanIni = 0;
    let brands = {};
    
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
      extraProfitTotal += p.profit; soldCount++;
      const brand = getBrandCategory(p.name);
      brands[brand] = (brands[brand] || 0) + 1;
      const d = new Date(p.id);
      if (d.getMonth() === currM && d.getFullYear() === currY) profitBulanIni += p.profit;
    });

    const totalProfitReal = profitMain + extraProfitTotal;
    const cash = startBal - belanjaBaru + uangMasuk;
    const totalAsetReal = cash + floatPrice;

    // ==========================================
    // ROUTING PERINTAH BERDASARKAN TEXT
    // ==========================================

    // KEMBALI KE MENU UTAMA
    if (text === '🔙 Menu Utama' || text === '❌ KEMBALI') {
      replyMsg = `✅ Kembali ke Menu Utama. Pilih aksi Anda:`;
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'Markdown', reply_markup: menuKeyboard });
      return res.status(200).send('OK');
    }

    // DASHBOARD
    else if (text === '/start' || text.includes('Dashboard')) {
      replyMsg = `📊 *DIGITAL LEDGER - FARID STORE*\n` +
                 `------------------------------\n` +
                 `💵 *Kas Tunai:* Rp ${cash.toLocaleString('id-ID')}\n` +
                 `📦 *Stok Gudang:* Rp ${floatModal.toLocaleString('id-ID')} (${stockCount} Unit)\n` +
                 `🎯 *Potensi Untung:* Rp ${(floatPrice - floatModal).toLocaleString('id-ID')}\n` +
                 `📈 *Akumulasi Laba:* Rp ${totalProfitReal.toLocaleString('id-ID')}\n` +
                 `------------------------------\n` +
                 `💎 *TOTAL ASET:* Rp ${totalAsetReal.toLocaleString('id-ID')}\n\n` +
                 `_Pilih menu di bawah 👇 atau input transaksi manual._`;
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'Markdown', reply_markup: menuKeyboard });
      return res.status(200).send('OK');
    }

    // BANTUAN FORMAT (FIXED)
    else if (text.includes('Bantuan Format') || text === '/help') {
      replyMsg = `🛠️ *FORMAT TRANSAKSI MANUAL:*\n_Pisahkan dg spasi, ganti spasi nama barang dg garis bawah (_)_\n\n` +
                 `1. Beli Stok: \`/stok Poco_M3 500000 700000\`\n` +
                 `2. Jual Cepat (Tanpa Gudang): \`/jual Vivo_Y20 1000000 1300000\`\n` +
                 `3. Jasa Servis: \`/jasa Ganti_LCD_Oppo 250000\`\n` +
                 `4. Biaya Toko: \`/out Token_Listrik 100000\`\n\n` +
                 `💡 _Tips: Untuk Stok Laku atau Edit Data, gunakan tombol 📦 Cek Stok agar lebih mudah._`;
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'Markdown', reply_markup: menuKeyboard });
      return res.status(200).send('OK');
    }

    // ANALISA BISNIS
    else if (text.includes('Analisa Bisnis')) {
      const pPengelola = profitBulanIni * 0.50; const pInvestor = profitBulanIni * 0.40;
      const pOps = profitBulanIni * 0.07; const pZakat = profitBulanIni * 0.03;
      const sortedBrands = Object.keys(brands).sort((a,b) => brands[b] - brands[a]).slice(0, 3);
      let topBrandsText = '';
      sortedBrands.forEach((b, i) => { topBrandsText += `  ${i+1}. ${b} (${brands[b]} Unit)\n`; });
      if(topBrandsText === '') topBrandsText = "  Belum ada data\n";

      replyMsg = `📈 *ANALISA BISNIS REAL-TIME*\n\n` +
                 `*STATISTIK UNIT*\n` +
                 `▫️ Unit Ready di Gudang : *${stockCount}*\n` +
                 `▫️ Terjual Bulan Ini    : *${unitBulanIni}*\n` +
                 `▫️ Terjual Bulan Lalu   : *${unitBulanLalu}*\n` +
                 `▫️ Total Unit All Time  : *${soldCount}*\n\n` +
                 `🏆 *TOP 3 MEREK DOMINAN*\n${topBrandsText}\n` +
                 `🤝 *BAGI HASIL (BULAN INI)*\n` +
                 `_Laba Kotor Bln Ini: Rp ${profitBulanIni.toLocaleString('id-ID')}_\n` +
                 `👨‍💼 Pengelola (50%) : Rp ${pPengelola.toLocaleString('id-ID')}\n` +
                 `📈 Investor (40%)  : Rp ${pInvestor.toLocaleString('id-ID')}\n` +
                 `⚙️ Operasional (7%): Rp ${pOps.toLocaleString('id-ID')}\n` +
                 `🤲 Zakat (3%)      : Rp ${pZakat.toLocaleString('id-ID')}`;
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'Markdown', reply_markup: menuKeyboard });
      return res.status(200).send('OK');
    }

    // LAPORAN WA
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

    // FITUR UNDO (TOMBOL KONFIRMASI BAWAH)
    else if (text === '↩️ Batal Terakhir') {
      let allEntries = [];
      dbData.items.forEach((item) => allEntries.push({ id: item.id, name: item.name, price: item.price }));
      dbData.extraProfits.forEach((item) => allEntries.push({ id: item.id, name: item.name, price: item.profit }));

      if (allEntries.length === 0) {
        await callTelegramAPI('sendMessage', { chat_id: chatId, text: "⚠️ Tidak ada data untuk dibatalkan.", parse_mode: 'Markdown', reply_markup: menuKeyboard });
      } else {
        allEntries.sort((a, b) => b.id - a.id);
        const newest = allEntries[0];
        
        replyMsg = `⚠️ *KONFIRMASI PEMBATALAN*\n\nYakin membatalkan transaksi terakhir ini?\n\n📝 *Item:* ${newest.name}\n💵 *Nilai:* Rp ${Math.abs(newest.price).toLocaleString('id-ID')}`;
        
        const confirmKeyboard = {
          keyboard: [
            [{ text: '✅ YAKIN BATALKAN' }],
            [{ text: '❌ KEMBALI' }]
          ], resize_keyboard: true, is_persistent: true
        };
        await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'Markdown', reply_markup: confirmKeyboard });
      }
      return res.status(200).send('OK');
    }

    // EKSEKUSI UNDO
    else if (text === '✅ YAKIN BATALKAN') {
      let allEntries = [];
      dbData.items.forEach((item, index) => allEntries.push({ type: 'item', index: index, id: item.id, name: item.name }));
      dbData.extraProfits.forEach((item, index) => allEntries.push({ type: 'extra', index: index, id: item.id, name: item.name }));

      if (allEntries.length > 0) {
        allEntries.sort((a, b) => b.id - a.id);
        const newest = allEntries[0];
        
        if (newest.type === 'item') dbData.items.splice(newest.index, 1);
        else dbData.extraProfits.splice(newest.index, 1);

        isUpdated = true;
        replyMsg = `🗑️ *TRANSAKSI DIHAPUS*\nData *${newest.name}* telah dihapus permanen. Kas dan Laba otomatis disesuaikan.`;
      } else {
        replyMsg = `⚠️ Gagal menghapus, data tidak ditemukan.`;
      }
    }

    // CEK STOK DENGAN PAGINATION (HALAMAN) & TOMBOL BAWAH
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
        await callTelegramAPI('sendMessage', { chat_id: chatId, text: "📦 *GUDANG KOSONG*\nPutaran kas lancar!", parse_mode: 'Markdown', reply_markup: menuKeyboard });
        return res.status(200).send('OK');
      }

      const startIndex = (page - 1) * itemsPerPage;
      const currentItems = stokBarang.slice(startIndex, startIndex + itemsPerPage);

      let listText = `📋 *DAFTAR STOK (Hal ${page}/${totalPages})*\nTotal Unit: *${stokBarang.length} HP*\n──────────────\n`;
      let keyboardRows = [];

      currentItems.forEach((item, idx) => {
        const globalIndex = startIndex + idx + 1;
        const itemDate = parseDateToWIB(item.entryDate);
        const selisihHari = Math.floor((wibNow - itemDate) / (1000 * 60 * 60 * 24));
        const warning = selisihHari > 14 ? " ⚠️" : "";
        
        listText += `\n*${globalIndex}. ${item.name}*${warning}\n└ M: ${item.modal/1000}k | J: ${item.price/1000}k | ⏳ ${selisihHari} Hari\n`;
        
        // Buat Tombol Bawah (1 Baris untuk 1 Barang)
        keyboardRows.push([
          { text: `✏️ Edit ${globalIndex}` },
          { text: `💸 Laku ${globalIndex}` }
        ]);
      });

      // Tombol Navigasi Halaman
      let navRow = [];
      if (page > 1) navRow.push({ text: `⬅️ Hal ${page - 1}` });
      navRow.push({ text: '🔙 Menu Utama' });
      if (page < totalPages) navRow.push({ text: `➡️ Hal ${page + 1}` });
      keyboardRows.push(navRow);

      const pagedKeyboard = { keyboard: keyboardRows, resize_keyboard: true, is_persistent: true };
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: listText + `\n\n👇 *Gunakan tombol di bawah untuk Edit / Laku:*`, parse_mode: 'Markdown', reply_markup: pagedKeyboard });
      return res.status(200).send('OK');
    }

    // KLIK TOMBOL EDIT DARI BAWAH
    else if (text.startsWith('✏️ Edit ')) {
      const idx = parseInt(text.replace('✏️ Edit ', '')) - 1;
      const stokBarang = dbData.items.filter(item => item.status === 'stok');
      const item = stokBarang[idx];
      
      if (item) {
        const safeName = item.name.replace(/ /g, '_');
        replyMsg = `✏️ *EDIT BARANG (No. ${idx + 1})*\n\nAnda memilih: *${item.name}*\n\n👇 *Copy teks di bawah ini*, ubah Modal/Jual, lalu kirim kembali:\n\n\`/edit ${item.id} ${safeName} ${item.modal} ${item.price}\``;
      } else {
        replyMsg = `❌ *Error:* Barang tidak ditemukan.`;
      }
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'Markdown' });
      return res.status(200).send('OK');
    }

    // KLIK TOMBOL LAKU DARI BAWAH
    else if (text.startsWith('💸 Laku ')) {
      const idx = parseInt(text.replace('💸 Laku ', '')) - 1;
      const stokBarang = dbData.items.filter(item => item.status === 'stok');
      const item = stokBarang[idx];
      
      if (item) {
        replyMsg = `💸 *PROSES LAKU (No. ${idx + 1})*\n\nBarang: *${item.name}*\nTarget: Rp ${item.price.toLocaleString('id-ID')}\n\n👇 *Copy teks di bawah*, ubah angka ujung sesuai harga deal asli, lalu kirim:\n\n\`/lakuid ${item.id} ${item.price}\``;
      } else {
        replyMsg = `❌ *Error:* Barang tidak ditemukan.`;
      }
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'Markdown' });
      return res.status(200).send('OK');
    }

    // PROSES BALASAN DARI /EDIT
    else if (command === '/edit') {
      const idToEdit = parseInt(parts[1]);
      const newName = parts[2] ? parts[2].replace(/_/g, ' ') : '';
      const newModal = parseInt(parts[3]);
      const newPrice = parseInt(parts[4]);

      const idx = dbData.items.findIndex(i => i.id === idToEdit);
      if (idx !== -1 && newName && !isNaN(newModal) && !isNaN(newPrice)) {
        dbData.items[idx].name = newName; dbData.items[idx].modal = newModal; dbData.items[idx].price = newPrice;
        isUpdated = true;
        replyMsg = `✅ *PERUBAHAN DISIMPAN!*\n\nData menjadi:\n📱 ${newName}\n💸 M: Rp ${newModal.toLocaleString('id-ID')}\n🎯 J: Rp ${newPrice.toLocaleString('id-ID')}`;
      } else {
        replyMsg = `❌ Format salah atau ID tidak ditemukan.`;
      }
    }

    // PROSES BALASAN DARI /LAKUID
    else if (command === '/lakuid') {
      const idToLaku = parseInt(parts[1]);
      const finalPrice = parseInt(parts[2]);

      const idx = dbData.items.findIndex(i => i.id === idToLaku);
      if (idx !== -1 && !isNaN(finalPrice)) {
        let item = dbData.items[idx];
        item.status = 'sold'; item.price = finalPrice; item.soldAt = nowStr;
        isUpdated = true;
        replyMsg = `🎉 *UNIT GUDANG CAIR!*\n📱 ${item.name}\n💰 Deal: Rp ${finalPrice.toLocaleString('id-ID')}\n📈 Laba: Rp ${(finalPrice - item.modal).toLocaleString('id-ID')}`;
      } else {
        replyMsg = `❌ Gagal Proses Laku.`;
      }
    }

    // TRANSAKSI MANUAL (/jual, /stok, /jasa, /out)
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
      // Abaikan teks selain perintah
      return res.status(200).send('OK');
    }

    // ==========================================
    // SIMPAN DATABASE & KEMBALIKAN KEYBOARD UTAMA
    // ==========================================
    if (isUpdated) {
      await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
        body: JSON.stringify(dbData)
      });
      // Setelah sukses update data (apapun itu), paksa munculkan menu utama lagi
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg + '\n\n🔄 _Web Ledger otomatis terupdate._', parse_mode: 'Markdown', reply_markup: menuKeyboard });
    } else if (replyMsg !== '') {
      // Jika hanya balas pesan biasa, pastikan menu utama tidak hilang
      await callTelegramAPI('sendMessage', { chat_id: chatId, text: replyMsg, parse_mode: 'Markdown', reply_markup: menuKeyboard });
    }

  } catch (error) {
    console.error("System Error:", error);
    await callTelegramAPI('sendMessage', { chat_id: chatId, text: `❌ *Error Sistem:* Gagal memproses data.`, parse_mode: 'Markdown' });
  }

  return res.status(200).send('OK');
}
