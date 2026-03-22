export default async function handler(req, res) {
  // 1. Abaikan jika bukan dari Telegram
  if (req.method !== 'POST') {
    return res.status(200).send('Farid Store Bot API Active');
  }

  // 2. Kredensial (Aman menggunakan Environment Variables Vercel)
  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  const BIN_ID = process.env.BIN_ID;
  const API_KEY = process.env.API_KEY;

  const message = req.body.message;
  if (!message || !message.text) return res.status(200).send('OK');

  const text = message.text;
  const chatId = message.chat.id;

  // Fungsi untuk membalas chat Telegram
  const sendTelegram = async (msgText) => {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msgText, parse_mode: 'Markdown' })
    });
  };

  try {
    // 3. Tarik data lama dari JSONBin
    const getResponse = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
      headers: { 'X-Master-Key': API_KEY }
    });
    const parsedData = await getResponse.json();
    let dbData = parsedData.record;

    let isUpdated = false;
    let replyMsg = '';
    
    // Set Waktu ke WIB (GMT+7)
    const utcDate = new Date();
    const wibDate = new Date(utcDate.getTime() + (7 * 60 * 60 * 1000));
    const timestampId = wibDate.getTime();
    const todayStr = `${wibDate.getUTCFullYear()}-${String(wibDate.getUTCMonth() + 1).padStart(2, '0')}-${String(wibDate.getUTCDate()).padStart(2, '0')} 12:00:00`;

    // 4. Proses Perintah Telegram
    
    // PERINTAH: /jual iPhone_11 3500000 4500000
    if (text.startsWith('/jual')) {
      const parts = text.split(' ');
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Item Terjual';
      const modal = parseInt(parts[2]) || 0;
      const price = parseInt(parts[3]) || 0;

      const newItem = {
        id: timestampId,
        name: name,
        status: "sold",
        type: "new",
        modal: modal,
        price: price,
        soldAt: todayStr
      };

      if (!dbData.items) dbData.items = [];
      dbData.items.push(newItem);
      isUpdated = true;
      replyMsg = `✅ *Laku Terjual!*\n📱 ${name}\n💰 Jual: Rp ${price.toLocaleString('id-ID')}\n📈 Profit: Rp ${(price - modal).toLocaleString('id-ID')}`;
    }

    // PERINTAH: /stok Vivo_Y20 1000000 1350000
    else if (text.startsWith('/stok')) {
      const parts = text.split(' ');
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Stok Baru';
      const modal = parseInt(parts[2]) || 0;
      const price = parseInt(parts[3]) || 0;

      const newItem = {
        id: timestampId,
        name: name,
        status: "stok",
        type: "new",
        modal: modal,
        price: price,
        soldAt: null
      };

      if (!dbData.items) dbData.items = [];
      dbData.items.push(newItem);
      isUpdated = true;
      replyMsg = `📦 *Stok Masuk Gudang*\n📱 ${name}\n💸 Modal: Rp ${modal.toLocaleString('id-ID')}`;
    }

    // PERINTAH: /jasa Servis_LCD_Oppo 250000
    else if (text.startsWith('/jasa') || text.startsWith('/servis')) {
      const parts = text.split(' ');
      const name = parts[1] ? parts[1].replace(/_/g, ' ') : 'Laba Jasa';
      const profit = parseInt(parts[2]) || 0;

      const newExtra = {
        id: timestampId,
        name: name,
        profit: profit
      };

      if (!dbData.extraProfits) dbData.extraProfits = [];
      dbData.extraProfits.push(newExtra);
      isUpdated = true;
      replyMsg = `🛠️ *Laba Jasa/Servis Masuk*\n📝 ${name}\n💵 Profit: Rp ${profit.toLocaleString('id-ID')}`;
    }

    // 5. Simpan kembali ke JSONBin jika ada perubahan
    if (isUpdated) {
      await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': API_KEY
        },
        body: JSON.stringify(dbData)
      });
      await sendTelegram(replyMsg + '\n\n🔄 _Buka Web Tracker untuk melihat update._');
    }

  } catch (error) {
    console.error("System Error:", error);
    await sendTelegram(`❌ *Error Sistem:* Gagal memperbarui database.`);
  }

  return res.status(200).send('OK');
}
