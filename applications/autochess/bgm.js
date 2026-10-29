/**
 * Pemilihan BGM dari berkas yang dipilih pemain di dialog Intro (Q6).
 * BGM tidak ada di GRF, jadi mp3 diambil dari folder yang sama dan
 * dimainkan lewat BGM.load(URL.createObjectURL(file)).
 */

/** Nama jalur berkas dengan pemisah '/', huruf kecil. */
function jalur(file) {
	return String(file.webkitRelativePath || file.name || '').replaceAll(String.fromCharCode(92), '/').toLowerCase();
}

/**
 * `BGM/08.mp3` dulu; bila tidak ada, mp3 pertama menurut nama; tanpa mp3 -> null.
 *
 * @param {Iterable<File>|ArrayLike<File>|null} files
 * @returns {File|null}
 */
export function pilihBGM(files) {
	const daftar = Array.from(files ?? []);
	// Batas jalur: tepat "bgm/08.mp3" atau berakhiran "/bgm/08.mp3"
	// (bukan "xbgm/08.mp3").
	const utama = daftar.find((f) => {
		const j = jalur(f);
		return j === 'bgm/08.mp3' || j.endsWith('/bgm/08.mp3');
	});
	if (utama) {
		return utama;
	}
	const mp3 = daftar.filter((f) => /\.mp3$/i.test(f.name || ''));
	mp3.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	return mp3[0] ?? null;
}
