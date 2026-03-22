export default async function handler(req, res) {
  // Hanya proses metode POST dari Telegram
  if (req.method !== 'POST') {
    return res.status(200).send('Farid Store Bot API Active V3');
  }

  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  const BIN_ID = process.env.BIN_ID;
  const API_KEY = process.env.API_KEY;

  const message = req.body.message;
  if (!message || !message.text) return res.status(200).send('OK');

  const text = message.text.trim();
  const chatId = message.chat.id;

  // Fungsi Kirim Pesan Telegram dengan Markdown
  const sendTelegram = async (msgText) => {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: chatId, 
        text: msgText, 
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    });
  };

  try {
    // 1. Ambil database dari JSONBin
    const getResponse = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
      headers: { 'X-Master-Key': API_KEY }
    });
    const parsedData = await getResponse.json();
    let dbData = parsedData.record;

    let isUpdated = false;
    let replyMsg = '';
    
    // Setup Waktu WIB
    const utcDate = new Date();
    const wibDate = new Date(utcDate.getTime() + (7 * 60 * 60 * 1000));
    const timestampId = wibDate.getTime();
    const todayStr = `${wibDate.getUTCFullYear()}-${String(wibDate.getUTCMonth() + 1).padStart(2, '0')}-${String(wibDate.getUTCDate()).padStart(2, '0')} 12:00:00`;

    if (!dbData.items) dbData.items = [];
    if (!dbData.extraProfits) dbData.extraProfits = [];

    // ==========================================
    // LOGIKA PERINTAH BOT
    // ==========================================

    const parts = text.split(' ');
    const command = parts[0].toLowerCase();

    // 0. MENU UTAMA & DASHBOARD (/start atau /help)
    if (command === '/start' || command === '/help') {
      let totalStockValue = 0;
      let stockCount = 0;
      let totalSold = 0;
      let totalProfit = 0;

      // Kalkulasi Mini Dashboard
      dbData.items.forEach(i => {
        if (i.status === 'stok') {
          totalStockValue += i.modal;
          stockCount++;
        } else if (i.status === 'sold') {
          totalSold++;
          totalProfit += (i.price - i.modal);
        }
      });
      dbData.extraProfits.forEach(p => {
        totalProfit += p.profit;
      });

      replyMsg = `🤖 *PUSAT KENDALI FARID STORE* 📱\n` +
                 `Sistem Digital Ledger Aktif.\n\n` +
                 `📊 *MINI DASHBOARD*\n` +
                 `├ 📦 Stok Gudang: *${stockCount} Unit*\n` +
                 `├ 💸 Modal Mengendap: *Rp ${totalStockValue.toLocaleString('id-ID')}*\n` +
                 `├ 🤝 Total Terjual: *${totalSold} Unit*\n` +
                 `└ 📈 Akumulasi Laba: *Rp ${totalProfit.toLocaleString('id-ID')}*\n\n` +
                 `🛠️ *PANDUAN PERINTAH BOT:*\n\n` +
                 `*1. Masuk Stok (Kulakan)*\n` +
                 `👉 \`/stok [Nama] [Modal] [Target_Jual]\`\n` +
                 `_Cth: /stok iPhone_11 3500000 4500000_\n\n` +
                 `*2. Stok Gudang Laku*\n` +
                 `👉 \`/laku [Nama] [Harga_Deal]\`\n` +
                 `_Cth: /laku iPhone_11 4200000_\n\n` +
                 `*3. Jual Cepat (Tanpa Masuk Gudang)*\n` +
                 `👉 \`/jual [Nama] [Modal] [Harga_Deal]\`\n` +
                 `_Cth: /jual Vivo_Y20 1000000 1350000_\n\n` +
                 `*4. Pemasukan Servis/Jasa*\n` +
                 `👉 \`/jasa [Nama_Servis] [Laba_Bersih]\`\n` +
                 `_Cth: /jasa Ganti_LCD_Oppo 250000_\n\n` +
                 `*5. Pengeluaran Operasional*\n` +
                 `👉 \`/out [Keterangan] [Nominal]\`\n` +
                 `_Cth: /out Token_Listrik 100000_\n\n` +
                 `*6. Cek Isi Gudang Lengkap*\n` +
                 `👉 \`/cekstok\``;
      
      await sendTelegram(replyMsg);
      return res.status(200).send('OK');
    }

    // 1. CEK STOK GUDANG
    else if (command === '/cekstok') {
      const stokBarang = dbData.items.filter(item => item.status === 'stok');
      
      if (stokBarang.length === 0) {
        replyMsg = "📦 *GUDANG KOSONG*\nTidak ada barang mengendap. Putaran kas sangat lancar!";
      } else {
        let totalModal = 0;
        let listText = "";

        stokBarang.forEach((item, index) => {
          totalModal += item.modal;
          const itemDate = new Date(item.id);
          const selisihHari = Math.floor((wibDate - itemDate) / (1000 * 60 * 60 * 24));
          const warning = selisihHari > 14 ? " ⚠️ _(Warning)_" : "";
          
          listText += `\n*${index + 1}. ${item.name}*${warning}\n` +
                      `└ Modal: Rp${(item.modal/1000)}k | Jual: Rp${(item.price/1000)}k | ⏳ ${selisihHari} Hari\n`;
        });

        replyMsg = `📋 *DAFTAR STOK GUDANG*\n` +
                   `Total Unit: *${stokBarang.length} HP*\n` +
                   `Modal Mengendap: *Rp ${totalModal.toLocaleString('id-ID')}*\n` +
                   `──────────────${listText}`;
      }
      await sendTelegram(replyMsg);
      return res.status(200).send('OK');
    }

    // 2. STOK GUDANG LAKU TERJUAL
    else if (command === '/laku') {
      const searchKeyword = parts[1] ? parts[1].replace(/_/g, ' ').toLowerCase() : '';
      const finalPrice = parseInt(parts[2]) || 0;

      let foundIndex = dbData.items.findIndex(i => i.status === 'stok' && i.name.toLowerCase().includes(searchKeyword));
      
      if (foundIndex !== -1) {
        let item = dbData.items[foundIndex];
        item.status = 'sold';
        item.price = finalPrice; 
        item.soldAt = todayStr;
        
        const profit = finalPrice - item.modal;
        replyMsg = `🎉 *BARANG LAKU TERJUAL!*\n\n` +
                   `📱 *Item:* ${item.name}\n` +
                   `💰 *Harga Deal:* Rp ${finalPrice.toLocaleString('id-ID')}\n` +
                   `📈 *Profit Bersih:* Rp ${profit.toLocaleString('id-ID')}`;
        isUpdated = true;
      } else {
        replyMsg = `❌ *GAGAL:* \nHP dengan nama *"${searchKeyword}"* tidak ditemukan di gudang. Silakan ketik /cekstok untuk melihat nama yang tepat.`;
        await sendTelegram(replyMsg);
        return res.status(200).send('OK');
      }
    }

    // 3. JUAL CEPAT (Langsung Laku)
    else if (command === '/jual') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Item Terjual';
      const modal = parseInt(parts[2]) || 0;
      const price = parseInt(parts[3]) || 0;

      dbData.items.push({ id: timestampId, name: name, status: "sold", type: "new", modal: modal, price: price, soldAt: todayStr });
      isUpdated = true;
      replyMsg = `⚡ *JUAL CEPAT BERHASIL!*\n\n` +
                 `📱 *Item:* ${name}\n` +
                 `💰 *Harga Deal:* Rp ${price.toLocaleString('id-ID')}\n` +
                 `📈 *Profit Bersih:* Rp ${(price - modal).toLocaleString('id-ID')}`;
    }

    // 4. MASUK STOK GUDANG
    else if (command === '/stok') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Stok Baru';
      const modal = parseInt(parts[2]) || 0;
      const price = parseInt(parts[3]) || 0;

      dbData.items.push({ id: timestampId, name: name, status: "stok", type: "new", modal: modal, price: price, soldAt: null });
      isUpdated = true;
      replyMsg = `📦 *MASUK GUDANG*\n\n` +
                 `📱 *Item:* ${name}\n` +
                 `💸 *Modal Kas Keluar:* Rp ${modal.toLocaleString('id-ID')}\n` +
                 `🎯 *Target Jual:* Rp ${price.toLocaleString('id-ID')}`;
    }

    // 5. LABA JASA & SERVIS
    else if (command === '/jasa' || command === '/servis') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Laba Jasa';
      const profit = parseInt(parts[2]) || 0;

      dbData.extraProfits.push({ id: timestampId, name: name, profit: profit });
      isUpdated = true;
      replyMsg = `🛠️ *SERVIS SELESAI!*\n\n` +
                 `📝 *Keterangan:* ${name}\n` +
                 `💵 *Pemasukan Kas:* Rp ${profit.toLocaleString('id-ID')}`;
    }

    // 6. PENGELUARAN TOKO
    else if (command === '/out' || command === '/pengeluaran') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Pengeluaran';
      const nominal = parseInt(parts[2]) || 0;

      dbData.extraProfits.push({ id: timestampId, name: `[OUT] ${name}`, profit: -Math.abs(nominal) });
      isUpdated = true;
      replyMsg = `🔻 *PENGELUARAN TERCATAT*\n\n` +
                 `📝 *Keterangan:* ${name}\n` +
                 `💸 *Kas Keluar:* Rp ${nominal.toLocaleString('id-ID')}`;
    }
    
    // Jika ada ketikan yang tidak dikenali
    else {
      replyMsg = `🤔 *Perintah tidak dikenali.*\nKetik /start untuk melihat daftar perintah yang tersedia.`;
      await sendTelegram(replyMsg);
      return res.status(200).send('OK');
    }

    // ==========================================
    // SIMPAN KE DATABASE JIKA ADA PERUBAHAN
    // ==========================================
    if (isUpdated) {
      await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': API_KEY
        },
        body: JSON.stringify(dbData)
      });
      // Beri notifikasi sukses ke Telegram
      await sendTelegram(replyMsg + '\n\n✅ _Data tersimpan di Web Tracker._');
    }

  } catch (error) {
    console.error("System Error:", error);
    await sendTelegram(`❌ *Error Sistem:* Gagal memproses perintah. Coba lagi.`);
  }

  return res.status(200).send('OK');
}
