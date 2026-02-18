import { useState, useRef, useCallback, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const SCAN_COOLDOWN_MS = 2000;
const SCANNER_ELEMENT_ID = 'qr-reader';

export default function App() {
    const [scanning, setScanning] = useState(false);
    const [lastScan, setLastScan] = useState(null);
    const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved | error
    const [errorMsg, setErrorMsg] = useState('');
    const [cameraError, setCameraError] = useState('');
    const [scanCount, setScanCount] = useState(0);

    const scannerRef = useRef(null);
    const cooldownRef = useRef(false);

    // Cleanup scanner on unmount
    useEffect(() => {
        return () => {
            if (scannerRef.current) {
                scannerRef.current.stop().catch(() => { });
                try { scannerRef.current.clear(); } catch (e) { }
                scannerRef.current = null;
            }
        };
    }, []);

    const saveScan = useCallback(async (text) => {
        setSaveStatus('saving');
        setErrorMsg('');
        try {
            const res = await fetch('./api/save.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ qr_text: text }),
            });
            const data = await res.json();
            if (data.success) {
                setSaveStatus('saved');
                setScanCount((c) => c + 1);
            } else {
                setSaveStatus('error');
                setErrorMsg(data.error || 'Nieznany błąd serwera');
            }
        } catch (err) {
            setSaveStatus('error');
            setErrorMsg('Brak połączenia z serwerem');
        }
    }, []);

    const onScanSuccess = useCallback(
        (decodedText) => {
            if (cooldownRef.current) return;

            cooldownRef.current = true;
            setLastScan(decodedText);
            saveScan(decodedText);

            setTimeout(() => {
                cooldownRef.current = false;
            }, SCAN_COOLDOWN_MS);
        },
        [saveScan]
    );

    const startScanner = useCallback(async () => {
        setCameraError('');

        // Make sure the container is clean before html5-qrcode takes over
        const container = document.getElementById(SCANNER_ELEMENT_ID);
        if (container) {
            container.innerHTML = '';
        }

        try {
            const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
            scannerRef.current = scanner;

            setScanning(true);

            // Small delay to let React update DOM (show the container)
            await new Promise((r) => setTimeout(r, 100));

            await scanner.start(
                { facingMode: 'environment' },
                {
                    fps: 10,
                    qrbox: (viewfinderWidth, viewfinderHeight) => {
                        const size = Math.min(viewfinderWidth, viewfinderHeight) * 0.7;
                        return { width: Math.floor(size), height: Math.floor(size) };
                    },
                    disableFlip: true,
                },
                onScanSuccess,
                () => { } // ignore scan failures (no QR in frame)
            );
        } catch (err) {
            setScanning(false);
            const msg =
                err?.toString?.() || 'Nie udało się uruchomić kamery';
            if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
                setCameraError('Brak zgody na dostęp do kamery. Sprawdź ustawienia przeglądarki.');
            } else if (msg.includes('NotFoundError')) {
                setCameraError('Nie znaleziono kamery na tym urządzeniu.');
            } else {
                setCameraError(msg);
            }
        }
    }, [onScanSuccess]);

    const stopScanner = useCallback(async () => {
        if (scannerRef.current) {
            try {
                await scannerRef.current.stop();
                scannerRef.current.clear();
            } catch {
                // ignore
            }
            scannerRef.current = null;
        }
        setScanning(false);
    }, []);

    const getStatusIcon = () => {
        switch (saveStatus) {
            case 'saving':
                return '⏳';
            case 'saved':
                return '✅';
            case 'error':
                return '❌';
            default:
                return '—';
        }
    };

    const getStatusText = () => {
        switch (saveStatus) {
            case 'saving':
                return 'Zapisywanie…';
            case 'saved':
                return 'Zapisano pomyślnie';
            case 'error':
                return errorMsg || 'Wystąpił błąd';
            default:
                return 'Oczekiwanie na skan';
        }
    };

    return (
        <div className="app">
            {/* Header */}
            <header className="header">
                <div className="header-icon">📷</div>
                <h1 className="header-title">Skaner QR</h1>
                <p className="header-subtitle">Skanuj etykiety i zapisuj kody</p>
            </header>

            <main className="main">
                {/* Scanner Card */}
                <section className="card scanner-card">
                    {/* Placeholder - OUTSIDE the scanner container */}
                    {!scanning && !cameraError && (
                        <div className="scanner-placeholder-wrapper">
                            <span className="scanner-placeholder-icon">📸</span>
                            <span>Naciśnij przycisk poniżej,<br />aby uruchomić kamerę</span>
                        </div>
                    )}

                    {/* Scanner container - always in DOM, html5-qrcode controls it */}
                    <div
                        id={SCANNER_ELEMENT_ID}
                        className="scanner-viewport"
                        style={{ display: scanning ? 'block' : 'none' }}
                    ></div>

                    {cameraError && (
                        <div className="camera-error">
                            <span className="camera-error-icon">⚠️</span>
                            <span>{cameraError}</span>
                        </div>
                    )}

                    <div className="scanner-controls">
                        {!scanning ? (
                            <button className="btn btn-start" onClick={startScanner}>
                                <span className="btn-icon">▶</span>
                                Uruchom skaner
                            </button>
                        ) : (
                            <button className="btn btn-stop" onClick={stopScanner}>
                                <span className="btn-icon">⏹</span>
                                Zatrzymaj
                            </button>
                        )}
                    </div>
                </section>

                {/* Last Scan */}
                <section className="card result-card">
                    <h2 className="card-label">Ostatni skan</h2>
                    <div className={`scan-result ${lastScan ? 'has-value' : ''}`}>
                        {lastScan || 'Brak skanów'}
                    </div>
                </section>

                {/* Save Status */}
                <section className={`card status-card status-${saveStatus}`}>
                    <h2 className="card-label">Status zapisu</h2>
                    <div className="status-row">
                        <span className="status-icon">{getStatusIcon()}</span>
                        <span className="status-text">{getStatusText()}</span>
                    </div>
                </section>

                {/* Counter */}
                {scanCount > 0 && (
                    <div className="counter">
                        Zapisano dzisiaj: <strong>{scanCount}</strong> {scanCount === 1 ? 'skan' : scanCount < 5 ? 'skany' : 'skanów'}
                    </div>
                )}
            </main>

            <footer className="footer">
                Krawcowa App &middot; Skaner etykiet
            </footer>
        </div>
    );
}
