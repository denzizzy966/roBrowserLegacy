// Katalog statis mode catur: nama, sprite, sinergi, lore, peluang, dan
// ekonomi yang dimuat sekali dari GET /catur/katalog.json.
//
// Kenapa katalog, bukan nama di tiap snapshot: EvtCaturState hanya membawa
// unit_id, dan menyisipkan nama/sprite ke setiap bidak di setiap denyut
// memboroskan wire untuk data yang tetap sepanjang hidup proses server.
// Modul ini murni (tanpa DOM) agar bisa diuji di Node.

/**
 * Mengambil katalog dari server.
 * @param {(url: string) => Promise<{ok: boolean, status: number, json: () => Promise<object>}>} fetchFn
 *   fungsi mirip fetch (disuntik agar bisa diuji).
 * @param {string} url alamat katalog.json.
 * @returns {Promise<object>} JSON katalog apa adanya.
 * @throws {Error} bila respons bukan 2xx.
 */
export async function muatKatalog(fetchFn, url) {
	const res = await fetchFn(url);
	if (!res.ok) {
		throw new Error(`gagal memuat katalog dari ${url}: status ${res.status}`);
	}
	return res.json();
}

/**
 * Membangun pengakses katalog. Bagian yang hilang dari json ditoleransi
 * (katalog kosong tetap sah) supaya UI tetap jalan bila katalog gagal dimuat.
 * @param {object} json keluaran muatKatalog (atau {}).
 * @param {(pesan: string) => void} [log] dipanggil SEKALI per id tak dikenal.
 */
export function buatKatalog(json, log = () => {}) {
	const units = json?.units ?? {};
	const sinergiMap = json?.sinergi ?? {};
	const loreOrigin = json?.lore?.origin ?? {};
	const loreKelasMap = json?.lore?.kelas ?? {};
	const peluangMap = json?.peluang ?? {};
	const ekonomi = json?.ekonomi ?? {};
	const sudahDilaporkan = new Set();
	// Nama EN -> id unit. EvtSpawn hanya membawa nama EN unit
	// (arena/pesan.go), jadi kartu bidak lawan mencari unitnya lewat nama EN
	// saja (nama ID tidak diindeks: bisa bertabrakan dengan nama EN unit
	// lain). Nama EN ganda dicatat SEKALI; id pertama menang.
	const idDariNama = new Map();
	for (const [id, u] of Object.entries(units)) {
		const n = u?.nama?.en;
		if (!n) {
			continue;
		}
		if (idDariNama.has(n)) {
			log(`katalog: nama unit ganda "${n}" (${idDariNama.get(n)}, ${id}); ${idDariNama.get(n)} dipakai`);
		} else {
			idDariNama.set(n, id);
		}
	}

	function laporkan(jenis, id) {
		const kunci = `${jenis}:${id}`;
		if (sudahDilaporkan.has(kunci)) return;
		sudahDilaporkan.add(kunci);
		log(`katalog: ${jenis} tidak dikenal "${id}"`);
	}

	// Cadangan untuk id asing: nama = id agar UI tetap menampilkan sesuatu
	// yang bisa dilacak, bukan teks kosong.
	const cadangan = (id) => ({ nama: { id, en: id } });
	const namaDari = (entri, id, bahasa) => entri.nama[bahasa] ?? entri.nama.id ?? id;

	function unit(id) {
		const u = units[id];
		if (u) return u;
		laporkan('unit', id);
		return cadangan(id);
	}
	function sinergi(id) {
		const s = sinergiMap[id];
		if (s) return s;
		laporkan('sinergi', id);
		return cadangan(id);
	}

	return {
		unit,
		namaUnit: (id, bahasa = 'id') => namaDari(unit(id), id, bahasa),
		/** @returns {string|null} id unit bernama EN persis `nama` (nama EvtSpawn), tanpa log */
		idUnitDariNama: (nama) => (nama && idDariNama.get(nama)) || null,
		spriteUnit: (id) => units[id]?.sprite ?? (laporkan('unit', id), null),
		/** @returns {object|null} stat unit pada bintang 1..3 (StatKatalog); null bila id/bintang tak sah */
		statBintang: (id, bintang) => {
			if (!Number.isInteger(bintang) || bintang < 1 || bintang > 3) return null;
			return units[id]?.stat_bintang?.[bintang - 1] ?? null;
		},
		/**
		 * Skill aktif unit apa adanya (AC7 K17): {id, lv, nama{id,en}, ringkasan{id,en},
		 * jenis, target, rasio, status?: {nama, peluang, durasi_ms}, jangkauan, splash,
		 * cast_ms, sp_maks}; null bila tak ada.
		 * @returns {object|null}
		 */
		skillUnit: (id) => units[id]?.skill ?? null,
		/** @returns {{id:string, en:string}|null} lore unit (AC7 K18; id bisa kosong) */
		loreUnit: (id) => units[id]?.lore ?? null,
		/** @returns {string[]} id unit anggota sinergi (tier menaik lalu id); [] bila tak dikenal */
		unitSinergi: (id) => sinergiMap[id]?.units ?? [],
		sinergi,
		namaSinergi: (id, bahasa = 'id') => namaDari(sinergi(id), id, bahasa),
		/** @returns {string[]} semua id sinergi katalog (origin dan kelas) */
		semuaSinergi: () => Object.keys(sinergiMap),
		loreOrigin: (id) => loreOrigin[id] ?? null,
		loreKelas: (id) => loreKelasMap[id] ?? null,
		peluang: (level) => peluangMap[level] ?? null,
		ekonomi
	};
}
