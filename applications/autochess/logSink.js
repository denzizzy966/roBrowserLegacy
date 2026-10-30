/**
 * Sink teks #log (index.html) yang dibatasi. Resep Playwright dan soak
 * membaca #log.textContent dan mencari baris awal ("map termuat"), jadi
 * pemangkasan membuang bagian TENGAH: `kepala` baris pertama tetap, ditambah
 * ekor terbaru; satu baris penanda menggantikan yang dibuang.
 *
 * Menambah satu baris = el.append(teks) (O(1), tanpa membaca ulang
 * textContent). Pemangkasan baru terjadi bila jumlah baris melewati
 * maks + batch, dan memangkas kembali ke maks, jadi biayanya O(n) hanya
 * sekali per `batch` baris.
 */

/**
 * @param {{append: function(string): void, textContent: string}} el
 * @param {{kepala?:number, maks?:number, batch?:number}} [opsi]
 * @returns {function(string): void} tambah(baris)
 */
export function buatSinkLog(el, { kepala = 300, maks = 2000, batch = 200 } = {}) {
	/** Semua baris yang sedang ada di el (tanpa newline penutup). */
	let baris = [];
	let terpangkas = 0;

	function pangkas() {
		const sisaEkor = maks - kepala - 1; // satu baris untuk penanda
		const buang = baris.length - kepala - sisaEkor;
		// Penanda lama ikut terbuang dari tengah dan bukan baris asli.
		terpangkas += terpangkas > 0 ? buang - 1 : buang;
		baris = [
			...baris.slice(0, kepala),
			`... ${terpangkas} baris dipangkas ...`,
			...baris.slice(baris.length - sisaEkor)
		];
		el.textContent = baris.join('\n') + '\n';
	}

	return function tambah(pesan) {
		baris.push(pesan);
		el.append(pesan + '\n');
		if (baris.length > maks + batch) {
			pangkas();
		}
	};
}
