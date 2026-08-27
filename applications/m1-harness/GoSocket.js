/**
 * Adapter socket untuk server Go milik sendiri.
 *
 * Memenuhi kontrak yang sama dengan src/Network/SocketHelpers/WebSocket.js
 * bawaan roBrowserLegacy, sehingga dapat dipasang lewat
 * NetworkManager.setSocketFactory() tanpa mengubah satu baris pun kode
 * upstream.
 *
 * Kontrak:
 *   properti  connected            boolean
 *   metode    send(ArrayBuffer)    hanya mengirim bila connected
 *   metode    close()
 *   callback  onComplete(success)  diisi pemanggil
 *   callback  onMessage(data)      data berupa ArrayBuffer
 *   callback  onClose()
 */
export default class GoSocket {
	constructor(host, port, proxy) {
		this.connected  = false;
		this.onComplete = null;
		this.onMessage  = null;
		this.onClose    = null;

		const url = proxy ? proxy : `ws://${host}:${port}/ws`;

		const ws = new WebSocket(url);
		ws.binaryType = 'arraybuffer';
		this._ws = ws;

		ws.onopen = () => {
			this.connected = true;
			if (this.onComplete) {
				this.onComplete(true);
			}
		};

		ws.onerror = () => {
			// Setelah tersambung, galat ditangani lewat onclose.
			if (!this.connected && this.onComplete) {
				this.onComplete(false);
			}
		};

		ws.onmessage = (event) => {
			if (this.onMessage) {
				this.onMessage(event.data);
			}
		};

		ws.onclose = () => {
			this.connected = false;
			if (this.onClose) {
				this.onClose();
			}
		};
	}

	send(buffer) {
		if (this.connected) {
			this._ws.send(buffer);
		}
	}

	close() {
		this.connected = false;
		this._ws.close();
	}
}
