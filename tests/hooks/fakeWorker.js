// useCsvAnalysis のテスト用 Worker 差し替え（テストファイルではない）
// 実装が worker.onmessage= / addEventListener('message') のどちらで受けても動くようにしてある。
// 応答は自動では返さず、テスト側が respond() / crash() で任意のタイミングに返す。
export function createFakeWorkerHarness() {
  const posted = []; // { worker, message, transfer }（どの Worker に送ったかを問わず送信順）
  const workers = [];

  class FakeWorker {
    constructor() {
      this.terminated = false;
      this.onmessage = null;
      this.onerror = null;
      this.listeners = { message: [], error: [], messageerror: [] };
      workers.push(this);
    }
    postMessage(message, transfer) {
      if (this.terminated) return;
      posted.push({ worker: this, message, transfer });
    }
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    }
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] || []).filter(
        (f) => f !== fn,
      );
    }
    terminate() {
      this.terminated = true;
    }
    emit(type, event) {
      if (this.terminated) return; // terminate 済みの Worker は何も届けない（実機と同じ）
      const prop = this["on" + type];
      if (typeof prop === "function") prop.call(this, event);
      for (const fn of this.listeners[type] || []) fn.call(this, event);
    }
  }

  return {
    posted,
    workers,
    createWorker: () => new FakeWorker(),
    // index 番目に送られたリクエストへ応答する。response は { ok, result } か { ok:false, error }（id は自動で付く）
    respond(index, response) {
      const { worker, message } = posted[index];
      worker.emit("message", { data: { id: message.id, ...response } });
    },
    crash(index, message = "worker crashed") {
      const { worker } = posted[index];
      worker.emit("error", { message, preventDefault() {} });
    },
  };
}
