// Kamus UI dua bahasa (ID/EN) mode catur, keputusan Q5 rencana AC4.
//
// Client roBrowserLegacy tidak punya saklar bahasa UI (DB.getMessage hanya
// membaca msgstringtable.csv), jadi autochess membawa kamusnya sendiri.
// Modul ini murni: preferensi bahasa DISUNTIKKAN (bentuk {bahasa, save()},
// sama dengan keluaran Preferences.get di main.js), sehingga test cukup
// memberi objek polos.

/** Bahasa yang didukung; yang pertama adalah bawaan. */
export const BAHASA = ['id', 'en'];

/**
 * Kamus {kunci: {id, en}}. Placeholder {0}, {1}, ... diganti argumen t().
 *
 * Kelompok kunci:
 * - fase.*     nama fase pertandingan
 * - jendela.*  judul jendela (nama komponen spec 10 + Lore)
 * - tombol.*   label tombol
 * - label.*    label pendek di dalam jendela
 * - efek.*, sasaran.*  kata untuk teks efek sinergi yang dibangkitkan
 * - kalimat server   alasan penolakan dari server/internal/catur/galat.go,
 *   kuncinya PERSIS teks server agar pesan galat bisa dicocokkan langsung.
 */
export const KAMUS = {
	// Fase
	'fase.menunggu':  { id: 'Menunggu', en: 'Waiting' },
	'fase.persiapan': { id: 'Persiapan', en: 'Preparation' },
	'fase.tempur':    { id: 'Pertempuran', en: 'Combat' },
	'fase.hasil':     { id: 'Hasil', en: 'Result' },
	'fase.selesai':   { id: 'Selesai', en: 'Finished' },

	// Judul jendela
	'jendela.timer':        { id: 'Waktu', en: 'Timer' },
	'jendela.daftarPemain': { id: 'Daftar Pemain', en: 'Player List' },
	'jendela.kapasitas':    { id: 'Kapasitas', en: 'Capacity' },
	'jendela.zeny':         { id: 'Zeny', en: 'Zeny' },
	'jendela.sinergi':      { id: 'Sinergi', en: 'Synergy' },
	'jendela.dps':          { id: 'DPS', en: 'DPS' },
	'jendela.infoPemain':   { id: 'Info Pemain', en: 'Player Info' },
	'jendela.exp':          { id: 'EXP', en: 'EXP' },
	'jendela.bangku':       { id: 'Bangku', en: 'Bench' },
	'jendela.toko':         { id: 'Toko', en: 'Shop' },
	'jendela.lore':         { id: 'Lore', en: 'Lore' },
	'jendela.log':          { id: 'Log', en: 'Log' },

	// Tombol
	'tombol.beli':     { id: 'Beli', en: 'Buy' },
	'tombol.jual':     { id: 'Jual', en: 'Sell' },
	'tombol.refresh':  { id: 'Segarkan', en: 'Refresh' },
	'tombol.kunci':    { id: 'Kunci', en: 'Lock' },
	'tombol.buka':     { id: 'Buka', en: 'Unlock' },
	'tombol.beliExp':  { id: 'Beli EXP', en: 'Buy EXP' },
	'tombol.lewati':   { id: 'Lewati', en: 'Skip' },
	'tombol.tutup':    { id: 'Tutup', en: 'Close' },
	'tombol.keBangku': { id: 'Ke Bangku', en: 'To Bench' },
	'tombol.bahasa':   { id: 'EN', en: 'ID' },
	'tombol.toko':     { id: 'Toko', en: 'Shop' },
	'tombol.keluar':   { id: 'Keluar', en: 'Leave' },
	'tombol.log':      { id: 'Log', en: 'Log' },
	'tombol.bgm':      { id: 'Musik', en: 'Music' },

	// Label
	'label.ronde':      { id: 'Ronde {0}', en: 'Round {0}' },
	'label.level':      { id: 'Lv. {0}', en: 'Lv. {0}' },
	'label.zeny':       { id: 'Zeny', en: 'Zeny' },
	'label.hp':         { id: 'HP', en: 'HP' },
	'label.sp':         { id: 'SP', en: 'SP' },

	// Status pada kartu bidak (kunci = 'status.' + EFEK_STATUS di pesan.js)
	'status.1': { id: 'Beku', en: 'Frozen' },
	'status.2': { id: 'Pingsan', en: 'Stunned' },
	'status.3': { id: 'Tidur', en: 'Asleep' },
	'status.4': { id: 'Racun', en: 'Poisoned' },
	'status.5': { id: 'Buta', en: 'Blind' },
	'status.6': { id: 'Bisu', en: 'Silenced' },

	'label.streak':     { id: 'Beruntun', en: 'Streak' },
	'label.kapasitas':  { id: '{0}/{1} bidak', en: '{0}/{1} units' },
	'label.peluang':    { id: 'Peluang', en: 'Odds' },
	'label.tier':       { id: 'Tier {0}', en: 'Tier {0}' },
	'label.bintang':    { id: 'Bintang {0}', en: '{0} Star' },
	'label.tersingkir': { id: 'Tersingkir', en: 'Eliminated' },
	'label.menang':     { id: 'MENANG', en: 'VICTORY' },
	'label.kalah':      { id: 'KALAH', en: 'DEFEAT' },
	'label.seri':       { id: 'SERI', en: 'DRAW' },
	'label.peringkat':  { id: 'Peringkat #{0}', en: 'Rank #{0}' },
	'label.selesai':    { id: 'Pertandingan selesai', en: 'Match over' },
	'label.lawan':      { id: 'Lawan: {0}', en: 'Opponent: {0}' },
	'label.salinan':    { id: '{0}/{1} salinan', en: '{0}/{1} copies' },
	'label.creep':      { id: 'Monster liar', en: 'Creeps' },
	'label.anda':       { id: 'Anda', en: 'You' },
	'label.bot':        { id: 'Bot {0}', en: 'Bot {0}' },
	'label.exp':        { id: 'EXP {0}/{1}', en: 'EXP {0}/{1}' },
	'label.harga':      { id: '{0} Zeny', en: '{0} Zeny' },
	'label.terkunci':   { id: 'Terkunci', en: 'Locked' },
	'label.kosong':     { id: 'Kosong', en: 'Empty' },
	'label.bahasa':     { id: 'Bahasa', en: 'Language' },
	'label.bgmNonaktif': { id: 'Tidak ada berkas mp3 yang dipilih', en: 'No mp3 file was selected' },
	'label.fase':       { id: 'Fase', en: 'Phase' },
	'label.namaLevel':  { id: 'Level', en: 'Level' },
	'label.namaRonde':  { id: 'Ronde', en: 'Round' },

	// Petunjuk (tooltip)
	'petunjuk.seret': {
		id: 'Seret ke papan untuk menaruh, ke tombol Toko (K) untuk menjual',
		en: 'Drag onto the board to place, onto the Shop button (K) to sell'
	},

	// Efek sinergi (teks dibangkitkan, mis. "+150 HP maks (semua)")
	'efek.hp_max':      { id: '+{0} HP maks', en: '+{0} Max HP' },
	'efek.atk':         { id: '+{0} ATK', en: '+{0} ATK' },
	'efek.matk':        { id: '+{0} MATK', en: '+{0} MATK' },
	'efek.def':         { id: '+{0} DEF', en: '+{0} DEF' },
	'efek.mdef':        { id: '+{0} MDEF', en: '+{0} MDEF' },
	'efek.aspd_persen': { id: '+{0}% kecepatan serang', en: '+{0}% attack speed' },
	'efek.jangkauan':   { id: '+{0} jangkauan', en: '+{0} range' },
	'efek.sp_awal':     { id: '+{0} SP awal', en: '+{0} starting SP' },
	'sasaran.semua':    { id: '(semua)', en: '(all)' },
	'sasaran.anggota':  { id: '(anggota)', en: '(members)' },

	// Alasan penolakan server (galat.go); kunci = teks server apa adanya.
	'zeny tidak cukup':             { id: 'Zeny tidak cukup', en: 'Not enough Zeny' },
	'slot kosong':                  { id: 'Slot kosong', en: 'Slot is empty' },
	'bangku penuh':                 { id: 'Bangku penuh', en: 'Bench is full' },
	'bidak bukan milik kursi':      { id: 'Bidak itu bukan milikmu', en: 'That unit is not yours' },
	'kursi sudah tersingkir':       { id: 'Kamu sudah tersingkir', en: 'You have been eliminated' },
	'perintah tidak dikenal':       { id: 'Perintah tidak dikenal', en: 'Unknown command' },
	'belum didukung':               { id: 'Belum didukung', en: 'Not supported yet' },
	'kursi tidak dikenal':          { id: 'Kursi tidak dikenal', en: 'Unknown seat' },
	'kapasitas papan penuh':        { id: 'Kapasitas papan penuh', en: 'Board capacity is full' },
	'cell terisi':                  { id: 'Petak sudah terisi', en: 'Tile is occupied' },
	'cell di luar separuh sendiri': { id: 'Petak di luar separuh papanmu', en: 'Tile is outside your half' },
	'level maksimum':               { id: 'Level sudah maksimum', en: 'Already at max level' },

	// Alasan penolakan aktor pertandingan (server/internal/pertandingan/
	// aktor.go) dan roserver (server/cmd/roserver/main.go, registry.go).
	'bukan fase persiapan': {
		id: 'Hanya bisa saat fase persiapan', en: 'Only allowed during the preparation phase'
	},
	'perintah gagal karena galat internal': {
		id: 'Perintah gagal karena galat internal server', en: 'Command failed due to an internal server error'
	},
	'pertandingan berhenti karena galat internal': {
		id: 'Pertandingan berhenti karena galat internal server', en: 'The match stopped due to an internal server error'
	},
	'pertandingan gagal dimulai':   { id: 'Pertandingan gagal dimulai', en: 'The match failed to start' },
	'server sibuk, coba lagi':      { id: 'Server sibuk, coba lagi', en: 'Server is busy, please try again' },
	'mode catur tidak aktif':       { id: 'Mode catur tidak aktif di server', en: 'Chess mode is not enabled on the server' },
	'server sedang berhenti, pertandingan tidak dimulai': {
		id: 'Server sedang berhenti, pertandingan tidak dimulai', en: 'The server is shutting down; the match was not started'
	}
};

/**
 * Mengganti {0}, {1}, ... dengan argumen; placeholder tanpa argumen dibiarkan.
 * @param {string} pola
 * @param {Array<*>} args
 * @returns {string}
 */
function isi(pola, args) {
	return pola.replace(/\{(\d+)\}/g, (utuh, i) => (i < args.length ? String(args[i]) : utuh));
}

/**
 * Membuat penerjemah yang terikat pada preferensi bahasa.
 *
 * @param {object} [opsi]
 * @param {{bahasa: string, save?: function}} [opsi.pref] preferensi tersimpan
 *   (main.js: Preferences.get('AutochessBahasa', {bahasa:'id'}, 1.0)); tanpa
 *   pref, bahasa hanya hidup di memori.
 * @param {(pesan: string) => void} [opsi.log] dipanggil SEKALI per kunci tak dikenal.
 * @returns {{t: function, bahasa: function, setBahasa: function, padaUbah: function}}
 */
export function buatTeks({ pref = { bahasa: BAHASA[0] }, log = null } = {}) {
	let aktif = BAHASA.includes(pref.bahasa) ? pref.bahasa : BAHASA[0];
	const pendengar = new Set();
	const sudahDilaporkan = new Set();

	/**
	 * Menerjemahkan kunci ke bahasa aktif. Kunci tak dikenal dikembalikan
	 * apa adanya supaya UI tetap menampilkan sesuatu yang bisa dilacak.
	 * @param {string} kunci
	 * @param {...*} args pengganti {0}, {1}, ...
	 * @returns {string}
	 */
	function t(kunci, ...args) {
		const entri = KAMUS[kunci];
		if (!entri) {
			if (log && !sudahDilaporkan.has(kunci)) {
				sudahDilaporkan.add(kunci);
				log(`teks: kunci tidak dikenal "${kunci}"`);
			}
			return kunci;
		}
		return isi(entri[aktif] ?? entri.id, args);
	}

	/**
	 * Mengganti bahasa, menyimpannya ke pref, lalu memberi tahu pendengar
	 * (hanya bila bahasanya benar-benar berubah).
	 * @param {string} kode 'id' atau 'en'
	 * @returns {boolean} false bila kode tidak didukung
	 */
	function setBahasa(kode) {
		if (!BAHASA.includes(kode)) {
			return false;
		}
		if (kode === aktif) {
			return true;
		}
		aktif = kode;
		pref.bahasa = kode;
		if (typeof pref.save === 'function') {
			pref.save();
		}
		for (const fn of [...pendengar]) {
			fn(kode);
		}
		return true;
	}

	/**
	 * Mendaftarkan fn(kode) yang dipanggil setiap bahasa berubah.
	 * @param {(kode: string) => void} fn
	 * @returns {() => void} pelepas pendaftaran
	 */
	function padaUbah(fn) {
		pendengar.add(fn);
		return () => pendengar.delete(fn);
	}

	return { t, bahasa: () => aktif, setBahasa, padaUbah };
}

/**
 * Format Zeny gaya RO: bilangan bulat dengan koma pemisah ribuan ("1,234").
 * Pecahan dibuang; nilai bukan angka menjadi "0".
 * @param {number} n
 * @returns {string}
 */
export function formatZeny(n) {
	const bulat = Number.isFinite(n) ? Math.trunc(n) : 0;
	const tanda = bulat < 0 ? '-' : '';
	return tanda + String(Math.abs(bulat)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
