import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, QrCode } from "lucide-react";

export default function Scanner({ onScan }: { onScan: (value: string) => void }) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannedRef = useRef(false);

  useEffect(() => () => {
    const scanner = scannerRef.current;
    if (scanner?.isScanning) {
      void scanner.stop().catch((reason: unknown) => console.error("Could not stop the QR scanner during cleanup.", reason));
    }
  }, []);

  const stop = async () => {
    try {
      const scanner = scannerRef.current;
      if (scanner?.isScanning) await scanner.stop();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setActive(false);
    }
  };

  const start = async () => {
    setError("");
    scannedRef.current = false;
    try {
      const scanner = new Html5Qrcode("gather-checkin-reader", false);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          if (scannedRef.current) return;
          scannedRef.current = true;
          onScan(decodedText);
          void stop();
        },
        () => undefined,
      );
      setActive(true);
    } catch (reason) {
      setActive(false);
      setError(reason instanceof Error
        ? "Camera access isn't available. You can still check in guests by name or ticket code."
        : String(reason));
    }
  };

  return (
    <div className={`scanner-viewport ${active ? "scanner-active" : ""}`}>
      <div id="gather-checkin-reader" className={active ? "scanner-reader" : "scanner-reader scanner-reader-hidden"} />
      <span className="scanner-corner corner-tl" />
      <span className="scanner-corner corner-tr" />
      <span className="scanner-corner corner-bl" />
      <span className="scanner-corner corner-br" />
      {active ? (
        <div className="scanner-camera-message">
          <Camera size={24} />
          <b>Camera is ready</b>
          <small>Hold a ticket QR code inside the frame.</small>
          <button className="button button-outline button-sm" onClick={stop}>Close camera</button>
        </div>
      ) : (
        <div className="scanner-idle">
          <span className="scanner-qr-icon"><QrCode size={34} /></span>
          <span>PLACE QR CODE IN THE FRAME</span>
          <button className="button button-dark button-sm" onClick={start}><Camera size={15} /> Open camera</button>
          {error && <small className="camera-error">{error}</small>}
        </div>
      )}
    </div>
  );
}
