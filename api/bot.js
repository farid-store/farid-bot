export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('Farid Store Bot API Active V4 - With Buttons & Undo');
  }

  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  const BIN_ID = process.env.BIN_ID;
  const API_KEY = process.env.API_KEY;

  const message = req.body.message;
  if (!message || !message.text) return res.status(200).send('OK');

  const text = message.text.trim();
  const chatId = message.chat.id;

  // 1. DESAIN TOMBOL MENU BAWAAN (REPLY KEYBOARD)
  const menuKeyboard = {
    keyboard: [
      [{ text: '📊 Dashboard' }, { text: '📦 Cek Stok' }],
      [{ text: '↩️ Batal Terakhir' }, { text: '❓ Bantuan Format' }]
    ],
    resize_keyboard: true,
    is_persistent: true // Menu akan terus nempel di bawah
  };

  const sendTelegram = async (msgText) => {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: chatId, 
        text: msgText, 
        parse_mode: 'Markdown',
        reply_markup: menuKeyboard // Memasukkan menu tombol ke setiap balasan
      })
    });
  };

  try {
    const getResponse = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
      headers: { 'X-Master-Key': API_KEY }
    });
    const parsedData = await getResponse.json();
    let dbData = parsedData.record;

    let isUpdated = false;
    let replyMsg = '';
    
    // Waktu WIB
    const utcDate = new Date();
    const wibDate = new Date(utcDate.getTime() + (7 * 60 * 60 * 1000));
    const timestampId = wibDate.getTime();
    const todayStr = `${wibDate.getUTCFullYear()}-${String(wibDate.getUTCMonth() + 1).padStart(2, '0')}-${String(wibDate.getUTCDate()).padStart(2, '0')} 12:00:00`;

    if (!dbData.items) dbData.items = [];
    if (!dbData.extraProfits) dbData.extraProfits = [];

    const parts = text.split(' ');
    const command = parts[0].toLowerCase();

    // ==========================================
    // LOGIKA TOMBOL & PERINTAH
    // ==========================================

    // A. MENU DASHBOARD (/start atau tombol '📊 Dashboard')
    if (command === '/start' || text === '📊 Dashboard') {
      let totalStockValue = 0, stockCount = 0, totalSold = 0, totalProfit = 0;

      dbData.items.forEach(i => {
        if (i.status === 'stok') { totalStockValue += i.modal; stockCount++; } 
        else if (i.status === 'sold') { totalSold++; totalProfit += (i.price - i.modal); }
      });
      dbData.extraProfits.forEach(p => { totalProfit += p.profit; });

      replyMsg = `🤖 *PUSAT KENDALI FARID STORE*\n\n` +
                 `📊 *MINI DASHBOARD*\n` +
                 `├ 📦 Stok Gudang: *${stockCount} Unit*\n` +
                 `├ 💸 Modal Mengendap: *Rp ${totalStockValue.toLocaleString('id-ID')}*\n` +
                 `├ 🤝 Total Terjual: *${totalSold} Unit*\n` +
                 `└ 📈 Akumulasi Laba: *Rp ${totalProfit.toLocaleString('id-ID')}*\n\n` +
                 `_Gunakan tombol di bawah untuk navigasi cepat._👇`;
      await sendTelegram(replyMsg);
      return res.status(200).send('OK');
    }

    // B. MENU BANTUAN (tombol '❓ Bantuan Format')
    else if (text === '❓ Bantuan Format') {
      replyMsg = `🛠️ *CARA INPUT TRANSAKSI BARU:*\n_Ketik manual format di bawah ini:_\n\n` +
                 `*1. Beli Stok HP (Masuk Gudang)*\n` +
                 `👉 \`/stok Nama_HP Modal Target_Jual\`\n\n` +
                 `*2. Stok Gudang Laku*\n` +
                 `👉 \`/laku Nama_HP Harga_Deal\`\n\n` +
                 `*3. Jual Cepat (Tanpa Gudang)*\n` +
                 `👉 \`/jual Nama_HP Modal Harga_Deal\`\n\n` +
                 `*4. Pemasukan Servis/Jasa*\n` +
                 `👉 \`/jasa Nama_Servis Laba_Bersih\`\n\n` +
                 `*5. Pengeluaran Toko*\n` +
                 `👉 \`/out Keterangan Nominal\``;
      await sendTelegram(replyMsg);
      return res.status(200).send('OK');
    }

    // C. MENU CEK STOK (/cekstok atau tombol '📦 Cek Stok')
    else if (command === '/cekstok' || text === '📦 Cek Stok') {
      const stokBarang = dbData.items.filter(item => item.status === 'stok');
      if (stokBarang.length === 0) {
        replyMsg = "📦 *GUDANG KOSONG*\nPutaran kas lancar!";
      } else {
        let totalModal = 0, listText = "";
        stokBarang.forEach((item, index) => {
          totalModal += item.modal;
          const itemDate = new Date(item.id);
          const selisihHari = Math.floor((wibDate - itemDate) / (1000 * 60 * 60 * 24));
          const warning = selisihHari > 14 ? " ⚠️ _(Warning)_" : "";
          listText += `\n*${index + 1}. ${item.name}*${warning}\n` +
                      `└ M: ${item.modal/1000}k | J: ${item.price/1000}k | ⏳ ${selisihHari} Hari\n`;
        });
        replyMsg = `📋 *DAFTAR STOK GUDANG*\nTotal Unit: *${stokBarang.length} HP*\nModal Mengendap: *Rp ${totalModal.toLocaleString('id-ID')}*\n──────────────${listText}`;
      }
      await sendTelegram(replyMsg);
      return res.status(200).send('OK');
    }

    // D. FITUR UNDO / BATAL (tombol '↩️ Batal Terakhir')
    else if (text === '↩️ Batal Terakhir') {
      let allEntries = [];
      
      // Kumpulkan semua transaksi beserta index aslinya
      dbData.items.forEach((item, index) => {
        allEntries.push({ type: 'item', index: index, id: item.id, name: item.name });
      });
      dbData.extraProfits.forEach((item, index) => {
        allEntries.push({ type: 'extra', index: index, id: item.id, name: item.name });
      });

      if (allEntries.length === 0) {
        replyMsg = "⚠️ *Tidak ada data* yang bisa dibatalkan.";
      } else {
        // Urutkan dari ID (Waktu) yang paling baru
        allEntries.sort((a, b) => b.id - a.id);
        const newestEntry = allEntries[0];

        // Hapus data yang paling baru dari array aslinya
        if (newestEntry.type === 'item') {
          dbData.items.splice(newestEntry.index, 1);
        } else {
          dbData.extraProfits.splice(newestEntry.index, 1);
        }

        isUpdated = true;
        replyMsg = `🗑️ *TRANSAKSI DIBATALKAN!*\n\nData *${newestEntry.name}* berhasil dihapus dari sistem. Angka di web akan kembali seperti semula.`;
      }
    }

    // E. STOK GUDANG LAKU TERJUAL
    else if (command === '/laku') {
      const searchKeyword = parts[1] ? parts[1].replace(/_/g, ' ').toLowerCase() : '';
      const finalPrice = parseInt(parts[2]) || 0;
      let foundIndex = dbData.items.findIndex(i => i.status === 'stok' && i.name.toLowerCase().includes(searchKeyword));
      
      if (foundIndex !== -1) {
        let item = dbData.items[foundIndex];
        item.status = 'sold'; item.price = finalPrice; item.soldAt = todayStr;
        replyMsg = `🎉 *BARANG LAKU TERJUAL!*\n📱 ${item.name}\n💰 Deal: Rp ${finalPrice.toLocaleString('id-ID')}\n📈 Profit: Rp ${(finalPrice - item.modal).toLocaleString('id-ID')}`;
        isUpdated = true;
      } else {
        replyMsg = `❌ *GAGAL:* HP "${searchKeyword}" tidak ditemukan di gudang. Cek nama di menu Stok.`;
        await sendTelegram(replyMsg); return res.status(200).send('OK');
      }
    }

    // F. JUAL CEPAT
    else if (command === '/jual') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Item Terjual';
      const modal = parseInt(parts[2]) || 0; const price = parseInt(parts[3]) || 0;
      dbData.items.push({ id: timestampId, name: name, status: "sold", type: "new", modal: modal, price: price, soldAt: todayStr });
      isUpdated = true;
      replyMsg = `⚡ *JUAL CEPAT BERHASIL!*\n📱 ${name}\n📈 Profit Bersih: Rp ${(price - modal).toLocaleString('id-ID')}`;
    }

    // G. MASUK STOK
    else if (command === '/stok') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Stok Baru';
      const modal = parseInt(parts[2]) || 0; const price = parseInt(parts[3]) || 0;
      dbData.items.push({ id: timestampId, name: name, status: "stok", type: "new", modal: modal, price: price, soldAt: null });
      isUpdated = true;
      replyMsg = `📦 *MASUK GUDANG*\n📱 ${name}\n💸 Kas Keluar: Rp ${modal.toLocaleString('id-ID')}`;
    }

    // H. LABA JASA
    else if (command === '/jasa' || command === '/servis') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Laba Jasa';
      const profit = parseInt(parts[2]) || 0;
      dbData.extraProfits.push({ id: timestampId, name: name, profit: profit });
      isUpdated = true;
      replyMsg = `🛠️ *SERVIS SELESAI!*\n📝 ${name}\n💵 Profit: Rp ${profit.toLocaleString('id-ID')}`;
    }

    // I. PENGELUARAN
    else if (command === '/out' || command === '/pengeluaran') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Pengeluaran';
      const nominal = parseInt(parts[2]) || 0;
      dbData.extraProfits.push({ id: timestampId, name: `[OUT] ${name}`, profit: -Math.abs(nominal) });
      isUpdated = true;
      replyMsg = `🔻 *PENGELUARAN TERCATAT*\n📝 ${name}\n💸 Nominal: Rp ${nominal.toLocaleString('id-ID')}`;
    }
    
    // JIKA SALAH KETIK
    else {
      replyMsg = `🤔 *Perintah tidak dipahami.*\nGunakan format yang benar atau klik tombol di bawah.👇`;
      await sendTelegram(replyMsg);
      return res.status(200).send('OK');
    }

    // ==========================================
    // SIMPAN PERUBAHAN & BALAS KE TELEGRAM
    // ==========================================
    if (isUpdated) {
      await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
        body: JSON.stringify(dbData)
      });
      await sendTelegram(replyMsg + '\n\n🔄 _Buka Web Tracker untuk melihat update._');
    }

  } catch (error) {
    console.error("System Error:", error);
    await sendTelegram(`❌ *Error Sistem:* Gagal merespon. Coba lagi.`);
  }

  return res.status(200).send('OK');
}
