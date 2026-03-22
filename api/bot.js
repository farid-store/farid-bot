export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Farid Store Digital Ledger Bot Active');

  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  const BIN_ID = process.env.BIN_ID;
  const API_KEY = process.env.API_KEY;

  const message = req.body.message;
  if (!message || !message.text) return res.status(200).send('OK');

  const text = message.text.trim();
  const chatId = message.chat.id;

  // Menu Keyboard Baru
  const menuKeyboard = {
    keyboard: [
      [{ text: '📊 Dashboard' }, { text: '📦 Cek Stok' }],
      [{ text: '📑 Laporan WA' }, { text: '↩️ Batal Terakhir' }],
      [{ text: '❓ Bantuan Format' }]
    ],
    resize_keyboard: true,
    is_persistent: true
  };

  const sendTelegram = async (msgText) => {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msgText, parse_mode: 'Markdown', reply_markup: menuKeyboard })
    });
  };

  // Fungsi Waktu Sinkron Web (DD/MM/YYYY HH:MM) WIB
  const getWebDate = () => {
    const d = new Date(new Date().getTime() + (7 * 60 * 60 * 1000));
    return `${d.getUTCDate()}/${d.getUTCMonth()+1}/${d.getUTCFullYear()} ${d.getUTCHours().toString().padStart(2,'0')}:${d.getUTCMinutes().toString().padStart(2,'0')}`;
  };

  // Fungsi Parsing Tanggal dari Web
  const parseDateToWIB = (s) => {
    if(!s || s==='Imported' || s==='Bulan Lalu') return new Date();
    const p = s.split(' ');
    if (p[0].includes('-')) return new Date(p[0]);
    const d = p[0].split('/');
    return new Date(d[2], d[1]-1, d[0]);
  };

  try {
    const getResponse = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
      headers: { 'X-Master-Key': API_KEY }
    });
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
    // LOGIKA PERHITUNGAN (SINKRON DENGAN WEB)
    // ==========================================
    const startBal = Number(dbData.startBalance) || 0;
    let belanjaBaru = 0, uangMasuk = 0, profitMain = 0, floatPrice = 0, floatModal = 0;
    let stockCount = 0, soldCount = 0;
    
    dbData.items.forEach(i => {
      if (i.status === 'sold') {
        soldCount++;
        if (i.type === 'new') belanjaBaru += i.modal;
        uangMasuk += i.price;
        profitMain += (i.price - i.modal);
      } else {
        stockCount++;
        if (i.type === 'new') belanjaBaru += i.modal;
        floatPrice += i.price;
        floatModal += i.modal;
      }
    });

    let extraProfitTotal = 0;
    dbData.extraProfits.forEach(p => { extraProfitTotal += p.profit; });

    const totalProfitReal = profitMain + extraProfitTotal;
    const cash = startBal - belanjaBaru + uangMasuk;
    const totalAsetReal = cash + floatPrice;

    // ==========================================
    // ROUTING PERINTAH
    // ==========================================
    const parts = text.split(' ');
    const command = parts[0].toLowerCase();

    // 1. DASHBOARD UTAMA
    if (command === '/start' || text === '📊 Dashboard') {
      replyMsg = `📊 *DIGITAL LEDGER - FARID STORE*\n` +
                 `_Sistem Tersinkronisasi Real-time_\n` +
                 `------------------------------\n` +
                 `💵 *Sisa Kas Tunai:* Rp ${cash.toLocaleString('id-ID')}\n` +
                 `📦 *Nilai Stok Gudang:* Rp ${floatModal.toLocaleString('id-ID')} (${stockCount} Unit)\n` +
                 `🎯 *Potensi Untung:* Rp ${(floatPrice - floatModal).toLocaleString('id-ID')}\n` +
                 `📈 *Akumulasi Laba:* Rp ${totalProfitReal.toLocaleString('id-ID')}\n` +
                 `------------------------------\n` +
                 `💎 *TOTAL ASET:* Rp ${totalAsetReal.toLocaleString('id-ID')}\n\n` +
                 `_Pilih menu di bawah 👇 atau input transaksi baru._`;
      await sendTelegram(replyMsg);
      return res.status(200).send('OK');
    }

    // 2. LAPORAN WA (Export persis seperti Web)
    else if (text === '📑 Laporan WA') {
      const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
      const dNow = new Date();
      const currentMonthString = `${monthNames[dNow.getMonth()]} ${dNow.getFullYear()}`;

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
                 `  _\n` +
                 `> (Termasuk Profit Jasa/Lalu: Rp ${extraProfitTotal.toLocaleString('id-ID')})\n\n` +
                 `------------------------------\n` +
                 `_Digital Ledger - Farid Store_`;
      await sendTelegram(replyMsg);
      return res.status(200).send('OK');
    }

    // 3. CEK STOK GUDANG
    else if (command === '/cekstok' || text === '📦 Cek Stok') {
      const stokBarang = dbData.items.filter(item => item.status === 'stok');
      if (stokBarang.length === 0) {
        replyMsg = "📦 *GUDANG KOSONG*\nPutaran kas lancar! Tidak ada unit mengendap.";
      } else {
        let listText = "";
        const wibDate = new Date(new Date().getTime() + (7 * 60 * 60 * 1000));

        stokBarang.forEach((item, index) => {
          const itemDate = parseDateToWIB(item.entryDate);
          const selisihHari = Math.floor((wibDate - itemDate) / (1000 * 60 * 60 * 24));
          const warning = selisihHari > 14 ? " ⚠️" : "";
          listText += `\n*${index + 1}. ${item.name}*${warning}\n` +
                      `└ M: ${item.modal/1000}k | J: ${item.price/1000}k | ⏳ ${selisihHari} Hari\n`;
        });
        replyMsg = `📋 *DAFTAR STOK GUDANG*\nTotal Unit: *${stokBarang.length} HP*\nModal Mengendap: *Rp ${floatModal.toLocaleString('id-ID')}*\n──────────────${listText}`;
      }
      await sendTelegram(replyMsg);
      return res.status(200).send('OK');
    }

    // 4. BATAL TERAKHIR (UNDO)
    else if (text === '↩️ Batal Terakhir') {
      let allEntries = [];
      dbData.items.forEach((item, index) => allEntries.push({ type: 'item', index: index, id: item.id, name: item.name }));
      dbData.extraProfits.forEach((item, index) => allEntries.push({ type: 'extra', index: index, id: item.id, name: item.name }));

      if (allEntries.length === 0) {
        replyMsg = "⚠️ *Tidak ada data* yang bisa dibatalkan.";
      } else {
        allEntries.sort((a, b) => b.id - a.id);
        const newestEntry = allEntries[0];
        if (newestEntry.type === 'item') dbData.items.splice(newestEntry.index, 1);
        else dbData.extraProfits.splice(newestEntry.index, 1);

        isUpdated = true;
        replyMsg = `🗑️ *TRANSAKSI DIBATALKAN!*\nData *${newestEntry.name}* berhasil dihapus. Kas dan Laba otomatis kembali.`;
      }
    }

    // 5. STOK LAKU
    else if (command === '/laku') {
      const searchKeyword = parts[1] ? parts[1].replace(/_/g, ' ').toLowerCase() : '';
      const finalPrice = parseInt(parts[2]) || 0;
      let foundIndex = dbData.items.findIndex(i => i.status === 'stok' && i.name.toLowerCase().includes(searchKeyword));
      
      if (foundIndex !== -1) {
        let item = dbData.items[foundIndex];
        item.status = 'sold'; 
        item.price = finalPrice; 
        item.soldAt = nowStr;
        replyMsg = `🎉 *UNIT GUDANG CAIR!*\n📱 ${item.name}\n💰 Harga Deal: Rp ${finalPrice.toLocaleString('id-ID')}\n📈 Laba Bersih: Rp ${(finalPrice - item.modal).toLocaleString('id-ID')}`;
        isUpdated = true;
      } else {
        replyMsg = `❌ *GAGAL:* HP "${searchKeyword}" tidak ditemukan di gudang.`;
        await sendTelegram(replyMsg); return res.status(200).send('OK');
      }
    }

    // 6. JUAL CEPAT
    else if (command === '/jual') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Item Terjual';
      const modal = parseInt(parts[2]) || 0; const price = parseInt(parts[3]) || 0;
      dbData.items.push({ id: timestampId, name: name, status: "sold", type: "new", modal: modal, price: price, entryDate: nowStr, soldAt: nowStr });
      isUpdated = true;
      replyMsg = `⚡ *JUAL CEPAT BERHASIL!*\n📱 ${name}\n💰 Jual: Rp ${price.toLocaleString('id-ID')}\n📈 Laba Bersih: Rp ${(price - modal).toLocaleString('id-ID')}`;
    }

    // 7. MASUK STOK
    else if (command === '/stok') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Stok Baru';
      const modal = parseInt(parts[2]) || 0; const price = parseInt(parts[3]) || 0;
      dbData.items.push({ id: timestampId, name: name, status: "stok", type: "new", modal: modal, price: price, entryDate: nowStr, soldAt: '' });
      isUpdated = true;
      replyMsg = `📦 *MASUK GUDANG (STOK BARU)*\n📱 ${name}\n💸 Modal Keluar: Rp ${modal.toLocaleString('id-ID')}\n🎯 Target Jual: Rp ${price.toLocaleString('id-ID')}`;
    }

    // 8. LABA JASA
    else if (command === '/jasa' || command === '/servis') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Laba Jasa';
      const profit = parseInt(parts[2]) || 0;
      dbData.extraProfits.push({ id: timestampId, name: name, modal: 0, price: profit, profit: profit });
      isUpdated = true;
      replyMsg = `🛠️ *SERVIS SELESAI!*\n📝 ${name}\n💵 Pemasukan Kas: Rp ${profit.toLocaleString('id-ID')}`;
    }

    // 9. PENGELUARAN
    else if (command === '/out' || command === '/pengeluaran') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Pengeluaran';
      const nominal = parseInt(parts[2]) || 0;
      dbData.extraProfits.push({ id: timestampId, name: `[OUT] ${name}`, modal: 0, price: -Math.abs(nominal), profit: -Math.abs(nominal) });
      isUpdated = true;
      replyMsg = `🔻 *PENGELUARAN TERCATAT*\n📝 ${name}\n💸 Kas Keluar: Rp ${nominal.toLocaleString('id-ID')}`;
    }
    
    // 10. BANTUAN
    else if (text === '❓ Bantuan Format') {
      replyMsg = `🛠️ *FORMAT TRANSAKSI:*\n_Pisahkan dengan spasi, ganti spasi nama barang dengan garis bawah (_)_\n\n` +
                 `1. Beli Stok: \`/stok Poco_M3 500000 700000\`\n` +
                 `2. Stok Laku: \`/laku Poco_M3 650000\`\n` +
                 `3. Jual Cepat: \`/jual Vivo_Y20 1000000 1300000\`\n` +
                 `4. Jasa Servis: \`/jasa Ganti_LCD_Oppo 250000\`\n` +
                 `5. Biaya Toko: \`/out Token_Listrik 100000\``;
      await sendTelegram(replyMsg);
      return res.status(200).send('OK');
    }
    else {
      replyMsg = `🤔 *Perintah tidak dipahami.*\nGunakan format yang benar atau klik tombol di bawah.👇`;
      await sendTelegram(replyMsg);
      return res.status(200).send('OK');
    }

    // ==========================================
    // SIMPAN DATABASE
    // ==========================================
    if (isUpdated) {
      await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
        body: JSON.stringify(dbData)
      });
      await sendTelegram(replyMsg + '\n\n🔄 _Tarik refresh di Web Ledger untuk melihat perubahan._');
    }

  } catch (error) {
    console.error("System Error:", error);
    await sendTelegram(`❌ *Error Sistem:* Gagal memproses data.`);
  }

  return res.status(200).send('OK');
}
