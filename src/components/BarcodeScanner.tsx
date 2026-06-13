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
  const [status, setStatus] = useState("Spúšťam kameru…");
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
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.ITF,
          ],
          // Natívny detektor na Androide/Chrome; na iOS sa použije interný ZXing
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        });
        scannerRef.current = scanner;
        setStatus("Namieruj na čiarový kód…");
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 12,
            // široký sken-box pre čiarové kódy
            qrbox: (vw: number, vh: number) => {
              const width = Math.floor(Math.min(vw, 360) * 0.92);
              const height = Math.floor(Math.min(vh * 0.5, width * 0.55));
              return { width, height };
            },
            videoConstraints: {
              facingMode: "environment",
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          },
          (decodedText: string) => {
            if (doneRef.current) return;
            doneRef.current = true;
            setStatus("Mám to ✓");
            stop().then(() => onResult(decodedText.trim()));
          },
          () => {
            /* per-frame "not found" – ignoruj */
          }
        );
      } catch (e: any) {
        setError("Nepodarilo sa spustiť kameru. Povoľ prístup ku kamere alebo zadaj kód ručne nižšie.");
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
        if (s.isScanning) await s.stop();
        await s.clear();
      } catch {
        /* ignore */
      }
    }
  }

  function close() {
    stop().then(onClose);
  }

  function submitManual() {
    if (manual.length < 6 || doneRef.current) return;
    doneRef.current = true;
    stop().then(() => onResult(manual));
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black p-4 safe-top safe-bottom"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between text-white">
        <span className="font-medium">📷 Naskenuj čiarový kód</span>
        <button onClick={close} className="rounded-lg bg-white/20 px-3 py-1.5 text-sm">
          Zavrieť
        </button>
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-black">
        <div id={ELEMENT_ID} className="w-full" />
      </div>

      <p className="mt-3 text-center text-sm text-white/70">
        {error ? "" : status}
        {!error && <span className="mt-1 block text-xs text-white/40">Drž telefón rovno, kód celý v ráme, ~10–20 cm.</span>}
      </p>
      {error && <p className="mt-2 rounded-xl bg-red-500/20 p-3 text-sm text-red-100">{error}</p>}

      <div className="mt-auto pt-4">
        <p className="mb-1 text-center text-xs text-white/60">…alebo zadaj kód ručne</p>
        <div className="flex gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="napr. 8586001234567"
            className="input flex-1"
          />
          <button onClick={submitManual} disabled={manual.length < 6} className="btn-primary">
            Hľadať
          </button>
        </div>
      </div>
    </div>
  );
}
