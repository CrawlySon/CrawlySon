"use client";

import { useEffect, useRef, useState } from "react";

const ELEMENT_ID = "barcode-reader";

export default function BarcodeScanner({
  onResult,
  onClose,
}: {
  onResult: (code: string) => void;
  onClose: () => void;
}) {
  const scannerRef = useRef<any>(null);
  const doneRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode(ELEMENT_ID, {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
          ],
        });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 160 } },
          (decodedText: string) => {
            if (doneRef.current) return;
            doneRef.current = true;
            stop().then(() => onResult(decodedText.trim()));
          },
          () => {}
        );
      } catch (e: any) {
        setError("Nepodarilo sa spustiť kameru. Povoľ prístup ku kamere alebo zadaj kód ručne.");
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function stop() {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) {
      try {
        await s.stop();
        await s.clear();
      } catch {
        /* ignore */
      }
    }
  }

  function close() {
    stop().then(onClose);
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 p-4 safe-top safe-bottom">
      <div className="mb-3 flex items-center justify-between text-white">
        <span className="font-medium">📷 Naskenuj čiarový kód</span>
        <button onClick={close} className="rounded-lg bg-white/20 px-3 py-1.5 text-sm">
          Zavrieť
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl bg-black">
        <div id={ELEMENT_ID} className="w-full" />
      </div>

      {error && <p className="mt-3 rounded-xl bg-red-500/20 p-3 text-sm text-red-100">{error}</p>}

      <div className="mt-auto">
        <p className="mb-1 text-center text-xs text-white/60">…alebo zadaj kód ručne</p>
        <div className="flex gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="napr. 8586001234567"
            className="input flex-1"
          />
          <button
            onClick={() => manual.length >= 6 && (doneRef.current = true, stop().then(() => onResult(manual)))}
            disabled={manual.length < 6}
            className="btn-primary"
          >
            Hľadať
          </button>
        </div>
      </div>
    </div>
  );
}
