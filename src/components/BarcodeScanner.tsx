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
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<string | null>(null);
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
            const code = decodedText.trim();
            setScanned(code); // úspešná obrazovka
            setScanning(false);
            // krátka spätná väzba + vibrácia, potom pokračuj
            try {
              (navigator as any).vibrate?.(60);
            } catch {
              /* ignore */
            }
            stop();
            setTimeout(() => onResult(code), 850);
          },
          () => {
            /* per-frame "not found" – ignoruj */
          }
        );
        if (!cancelled) setScanning(true);
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
    setScanned(manual);
    setScanning(false);
    stop();
    setTimeout(() => onResult(manual), 600);
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

        {/* skenovacia čiara počas hľadania */}
        {scanning && !scanned && (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-center">
            <div className="scanline mt-6 h-0.5 w-4/5 rounded bg-brand-400 shadow-[0_0_12px_2px_rgba(34,197,94,0.7)]" />
          </div>
        )}

        {/* úspešná obrazovka */}
        {scanned && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-brand-600/95 text-white">
            <div className="popcheck flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-4xl">✓</div>
            <p className="mt-3 font-semibold">Kód načítaný</p>
            <p className="text-sm text-white/80">{scanned}</p>
            <p className="mt-1 text-xs text-white/60">hľadám produkt…</p>
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-sm text-white/70">
        {error ? "" : scanned ? "" : status}
        {!error && !scanned && (
          <span className="mt-1 block text-xs text-white/40">Drž telefón rovno, kód celý v ráme, ~10–20 cm.</span>
        )}
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
