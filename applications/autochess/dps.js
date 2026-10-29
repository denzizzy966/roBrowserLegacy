/**
 * Pengumpul damage per entity (Q10): murni, tanpa DOM. Diumpan dari
 * EvtDamage (satu korban) dan EvtSkillKena (banyak korban); pemulihan HP
 * dan jumlah <= 0 (MISS) tidak dihitung. main.js memanggil reset() tiap
 * fase TEMPUR dimulai.
 */

import { JENIS_DAMAGE_HEAL } from './pesan.js';

/** @returns {{reset, damage, skill, ambil}} */
export function buatDPS() {
	const total = new Map();

	function tambah(src, amount, jenis) {
		if (!(src > 0) || !(amount > 0) || jenis === JENIS_DAMAGE_HEAL) {
			return;
		}
		total.set(src, (total.get(src) ?? 0) + amount);
	}

	return {
		/** Mengosongkan semua total. */
		reset() {
			total.clear();
		},
		/** Satu EvtDamage: src menyerang dengan amount. */
		damage(src, amount, jenis = 0) {
			tambah(src, amount, jenis);
		},
		/** Satu EvtSkillKena: kenaList = [{amount, jenis}], semua milik src. */
		skill(src, kenaList) {
			for (const k of kenaList ?? []) {
				tambah(src, k.amount, k.jenis);
			}
		},
		/** @returns {{entityId:number, total:number}[]} urut turun */
		ambil() {
			return [...total].map(([entityId, jml]) => ({ entityId, total: jml }))
				.sort((a, b) => b.total - a.total || a.entityId - b.entityId);
		}
	};
}
