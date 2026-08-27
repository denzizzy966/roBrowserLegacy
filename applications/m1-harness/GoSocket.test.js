import { describe, it, expect, vi, beforeEach } from 'vitest';
import GoSocket from './GoSocket.js';

class FakeWebSocket {
	constructor(url) {
		this.url = url;
		this.sent = [];
		this.closed = false;
		FakeWebSocket.last = this;
	}
	send(data) { this.sent.push(data); }
	close() { this.closed = true; if (this.onclose) this.onclose(); }
}

beforeEach(() => {
	globalThis.WebSocket = FakeWebSocket;
	FakeWebSocket.last = null;
});

describe('GoSocket', () => {
	it('menyusun URL ws dari host dan port', () => {
		new GoSocket('localhost', 5121);
		expect(FakeWebSocket.last.url).toBe('ws://localhost:5121/ws');
	});

	it('meminta binaryType arraybuffer', () => {
		new GoSocket('localhost', 5121);
		expect(FakeWebSocket.last.binaryType).toBe('arraybuffer');
	});

	it('memanggil onComplete(true) dan menandai connected saat terbuka', () => {
		const s = new GoSocket('localhost', 5121);
		const cb = vi.fn();
		s.onComplete = cb;

		FakeWebSocket.last.onopen();

		expect(cb).toHaveBeenCalledWith(true);
		expect(s.connected).toBe(true);
	});

	it('memanggil onComplete(false) bila gagal sebelum tersambung', () => {
		const s = new GoSocket('localhost', 5121);
		const cb = vi.fn();
		s.onComplete = cb;

		FakeWebSocket.last.onerror(new Error('ditolak'));

		expect(cb).toHaveBeenCalledWith(false);
		expect(s.connected).toBe(false);
	});

	it('meneruskan ArrayBuffer masuk ke onMessage', () => {
		const s = new GoSocket('localhost', 5121);
		const cb = vi.fn();
		s.onMessage = cb;
		const buf = new Uint8Array([1, 2, 3]).buffer;

		FakeWebSocket.last.onopen();
		FakeWebSocket.last.onmessage({ data: buf });

		expect(cb).toHaveBeenCalledWith(buf);
	});

	it('tidak mengirim apa pun sebelum tersambung', () => {
		const s = new GoSocket('localhost', 5121);
		s.send(new Uint8Array([9]).buffer);

		expect(FakeWebSocket.last.sent).toHaveLength(0);
	});

	it('mengirim setelah tersambung', () => {
		const s = new GoSocket('localhost', 5121);
		const buf = new Uint8Array([9]).buffer;

		FakeWebSocket.last.onopen();
		s.send(buf);

		expect(FakeWebSocket.last.sent).toEqual([buf]);
	});

	it('menandai terputus dan memanggil onClose saat ditutup', () => {
		const s = new GoSocket('localhost', 5121);
		const cb = vi.fn();
		s.onClose = cb;

		FakeWebSocket.last.onopen();
		s.close();

		expect(s.connected).toBe(false);
		expect(cb).toHaveBeenCalled();
	});
});
