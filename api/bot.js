export default async function handler(req, res) {
  // Hanya proses metode POST dari Telegram
  if (req.method !== 'POST') {
    return res.status(200).send('Farid Store Bot API Active V2');
  }

  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  const BIN_ID = process.env.BIN_ID;
  const API_KEY = process.env.API_KEY;

  const message = req.body.message;
  if (!message || !message.text) return res.status(200).send('OK');

  const text = message.text.trim();
  const chatId = message.chat.id;

  const sendTelegram = async (msgText) => {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msgText, parse_mode: 'Markdown' })
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

    // Pastikan array tersedia
    if (!dbData.items) dbData.items = [];
    if (!dbData.extraProfits) dbData.extraProfits = [];

    // ==========================================
    // LOGIKA PERINTAH BOT
    // ==========================================

    const parts = text.split(' ');
    const command = parts[0].toLowerCase();

    // 1. CEK STOK GUDANG
    if (command === '/cekstok') {
      const stokBarang = dbData.items.filter(item => item.status === 'stok');
      
      if (stokBarang.length === 0) {
        replyMsg = "📦 *Gudang Kosong*\nTidak ada HP yang mengendap. Putaran kas lancar!";
      } else {
        let totalModal = 0;
        let listText = "";

        stokBarang.forEach((item, index) => {
          totalModal += item.modal;
          const itemDate = new Date(item.id);
          const selisihHari = Math.floor((wibDate - itemDate) / (1000 * 60 * 60 * 24));
          const warning = selisihHari > 14 ? " ⚠️" : "";
          listText += `\n${index + 1}. *${item.name}*\n   └ Modal: Rp${(item.modal/1000)}k | Jual: Rp${(item.price/1000)}k (${selisihHari} Hari)${warning}`;
        });

        replyMsg = `📦 *STOK GUDANG FARID STORE*\nTotal Unit: ${stokBarang.length} HP\nModal Mengendap: Rp ${totalModal.toLocaleString('id-ID')}\n${listText}`;
      }
      await sendTelegram(replyMsg);
      return res.status(200).send('OK'); // Berhenti di sini, tidak perlu update DB
    }

    // 2. STOK GUDANG LAKU TERJUAL
    else if (command === '/laku') {
      const searchKeyword = parts[1] ? parts[1].replace(/_/g, ' ').toLowerCase() : '';
      const finalPrice = parseInt(parts[2]) || 0;

      // Cari barang di gudang yang namanya mirip
      let foundIndex = dbData.items.findIndex(i => i.status === 'stok' && i.name.toLowerCase().includes(searchKeyword));
      
      if (foundIndex !== -1) {
        let item = dbData.items[foundIndex];
        item.status = 'sold';
        item.price = finalPrice; // Update harga deal akhir
        item.soldAt = todayStr;
        
        const profit = finalPrice - item.modal;
        replyMsg = `🎉 *Barang Gudang Cair!*\n📱 ${item.name}\n💰 Deal Akhir: Rp ${finalPrice.toLocaleString('id-ID')}\n📈 Profit: Rp ${profit.toLocaleString('id-ID')}`;
        isUpdated = true;
      } else {
        replyMsg = `❌ *Gagal:* Barang dengan kata kunci "${searchKeyword}" tidak ditemukan di gudang. Cek lagi pakai perintah /cekstok.`;
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
      replyMsg = `✅ *Laku Cepat!*\n📱 ${name}\n💰 Jual: Rp ${price.toLocaleString('id-ID')}\n📈 Profit: Rp ${(price - modal).toLocaleString('id-ID')}`;
    }

    // 4. MASUK STOK GUDANG
    else if (command === '/stok') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Stok Baru';
      const modal = parseInt(parts[2]) || 0;
      const price = parseInt(parts[3]) || 0;

      dbData.items.push({ id: timestampId, name: name, status: "stok", type: "new", modal: modal, price: price, soldAt: null });
      isUpdated = true;
      replyMsg = `📦 *Masuk Gudang*\n📱 ${name}\n💸 Modal: Rp ${modal.toLocaleString('id-ID')}`;
    }

    // 5. LABA JASA & SERVIS
    else if (command === '/jasa' || command === '/servis') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Laba Jasa';
      const profit = parseInt(parts[2]) || 0;

      dbData.extraProfits.push({ id: timestampId, name: name, profit: profit });
      isUpdated = true;
      replyMsg = `🛠️ *Servis Selesai!*\n📝 ${name}\n💵 Profit Bersih: Rp ${profit.toLocaleString('id-ID')}`;
    }

    // 6. PENGELUARAN TOKO
    else if (command === '/out' || command === '/pengeluaran') {
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Pengeluaran';
      const nominal = parseInt(parts[2]) || 0;

      // Disimpan sebagai profit negatif agar memotong laba di web Tracker
      dbData.extraProfits.push({ id: timestampId, name: `[OUT] ${name}`, profit: -Math.abs(nominal) });
      isUpdated = true;
      replyMsg = `💸 *Pengeluaran Tercatat*\n📝 ${name}\n🔻 Nominal: Rp ${nominal.toLocaleString('id-ID')}`;
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
      await sendTelegram(replyMsg + '\n\n🔄 _Buka Web Neo Tracker untuk melihat update._');
    }

  } catch (error) {
    console.error("System Error:", error);
    await sendTelegram(`❌ *Error Sistem:* Gagal merespon permintaan.`);
  }

  return res.status(200).send('OK');
}
