const { isDeepStrictEqual } = require('node:util');
const b2c = ['TIAL', 'REQ', 'LOGIC_PSB', 'LOGIC_MO'];
const originalSeed = [
  ['ambil-order', 'Mengambil order dengan PICK', 'pick ambil mengambil order antrean tial req logic solver', 'Buka antrean TIAL / REQ atau LOGIC / SOLVER sesuai modul Anda. Di ORDER MASUK, gunakan PICK pada order menunggu yang menampilkan tombol itu. Order yang berhasil diambil muncul di PROSES CEK.', ['HD'], b2c],
  ['ambil-alih', 'Mengambil alih order yang sedang diperiksa', 'takeover ambil alih proses cek petugas order', 'Di PROSES CEK, ubah cakupan ke SEMUA ORDER untuk mencari order petugas lain di modul yang diizinkan. Jika AMBIL ALIH tersedia, buka konfirmasi dan periksa nama petugas sebelum melanjutkan.', ['HD'], b2c],
  ['selesai-order', 'Menyelesaikan atau mengeskalasi order', 'done gagal failed selesai eskalasi escalate order catatan', 'Pada detail order PROSES CEK milik Anda, DONE meminta konfirmasi dengan pesan opsional. GAGAL membutuhkan alasan. ESKALASI tersedia bila layanan mendukungnya, meminta pesan, dan mempertahankan order di PROSES CEK.', ['HD'], b2c],
  ['duplikat-order', 'Memeriksa order duplikat', 'duplikat duplicate menunggu tolak lanjut cek', 'Buka DUPLIKAT MENUNGGU. Gunakan LANJUT CEK untuk meneruskan pemeriksaan atau TOLAK DUPLIKAT jika order memang duplikat dan tindakan tersedia.', ['HD'], b2c],
  ['catatan-hd', 'Menyunting Catatan HD', 'catatan hd note tambah edit simpan', 'Buka CATATAN HD dalam detail order. Pada order PROSES CEK yang Anda tangani, gunakan Tambah catatan atau Edit catatan, kemudian Simpan Catatan.', ['HD'], b2c],
  ['live-chat', 'Menjawab chat Telegram dari order', 'telegram live chat balasan foto gambar antre terkirim', 'Masukkan teks di Balasan dalam detail order yang sedang Anda tangani pada modul yang diizinkan. Rute Telegram harus aktif. ANTRE berarti balasan menunggu Courier. TERKIRIM ditampilkan setelah konfirmasi. Jika lampiran tersedia, gunakan Pilih foto atau tempel tangkapan layar.', ['HD', 'ADMIN', 'SUPER_ADMIN'], b2c],
  ['rekap', 'Membuka Dashboard Rekap', 'dashboard rekap grafik excel statistik performansi bobot', 'Dashboard Rekap menyediakan Rekap Order, Grafik, dan Performansi HD. Rekap Order dan Grafik menyediakan ekspor Excel sesuai filter masing-masing. Performansi HD menampilkan penyelesaian dan poin sesuai filter.', ['HD', 'ADMIN', 'SUPER_ADMIN'], []],
  ['bobot', 'Mengelola bobot Performansi HD', 'performa performansi bobot poin done gagal simpan', 'Admin dan Super Admin dapat membuka Pengaturan Bobot di tab Performansi HD. Sesuaikan bobot DONE/GAGAL dan pilih Simpan Bobot. Bobot aktif dipakai untuk menghitung poin.', ['ADMIN', 'SUPER_ADMIN'], []],
  ['status', 'Mengubah status kerja', 'status online sibuk offline profil check in tema', 'Buka menu profil dan pilih ONLINE, SIBUK, atau OFFLINE pada Status kerja. Indikator di header mencerminkan pilihan lokal pada tab itu.', ['HD', 'ADMIN', 'SUPER_ADMIN'], []]
].map(([id, title, tags, text, roles, modules]) => ({ id, title, tags, text, roles, modules, published: true }));

const operatorGuides = new Set(['ambil-order', 'ambil-alih', 'selesai-order', 'duplikat-order', 'catatan-hd']);
const seed = originalSeed.map(article => operatorGuides.has(article.id) ? {
  ...article,
  roles: ['HD', 'SUPER_ADMIN'],
  text: 'Prosedur untuk petugas HD dengan akses modul terkait. ' + article.text
} : article);

function upgradeDefaultGuides(articles) {
  return articles.map(article => {
    const index = originalSeed.findIndex(item => item.id === article.id && isDeepStrictEqual(item, article));
    return index < 0 ? article : structuredClone(seed[index]);
  });
}

function selectKnowledge(articles, user, question) {
  const tokenize = (value = '') => value.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) || [];
  const words = new Set(tokenize(question).map(word => word === 'orderan' || word === 'orderannya' ? 'order' : word).filter(word => !['yang','cara','apa','bagaimana','untuk','saya','dengan','dan','tolong','bisa','dari'].includes(word)));
  return articles.filter(article => article.published && article.roles.includes(user.role) &&
    (!article.modules.length || article.modules.some(module => user.modules?.includes(module)) ||
      (user.role === 'SUPER_ADMIN' && operatorGuides.has(article.id) && seed.some(item => isDeepStrictEqual(item, article)))))
    .map(article => ({ article, score: [...new Set(tokenize(article.title + ' ' + article.tags))].filter(word => words.has(word)).length }))
    .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, 4)
    .map(({ article: { title, text } }) => ({ title, text }));
}
module.exports = { seed, selectKnowledge, upgradeDefaultGuides };
