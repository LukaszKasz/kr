import { useState, useRef, useCallback, useEffect } from 'react';

const SCAN_COOLDOWN_MS = 2000;

export default function App() {
    const [scanning, setScanning] = useState(false);
    const [lastScan, setLastScan] = useState(null);
    const [saveStatus, setSaveStatus] = useState('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [cameraError, setCameraError] = useState('');
    const [scanCount, setScanCount] = useState(0);

    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const scanIntervalRef = useRef(null);
    const cooldownRef = useRef(false);
    const detectorRef = useRef(null);

    useEffect(() => {
        return () => stopScanner();
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

    const handleDetection = useCallback((decodedText) => {
        if (cooldownRef.current) return;
        cooldownRef.current = true;
        setLastScan(decodedText);
        saveScan(decodedText);
        setTimeout(() => { cooldownRef.current = false; }, SCAN_COOLDOWN_MS);
    }, [saveScan]);

    const startScanner = useCallback(async () => {
        setCameraError('');

        if (!('BarcodeDetector' in window)) {
            setCameraError('Twoja przeglądarka nie obsługuje skanowania QR. Użyj Chrome na Androidzie.');
            return;
        }

        try {
            detectorRef.current = new BarcodeDetector({ formats: ['qr_code'] });

            // Open camera — NO focus/zoom constraints, let the phone handle it naturally
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                },
                audio: false,
            });

            streamRef.current = stream;

            const video = videoRef.current;
            video.srcObject = stream;
            video.setAttribute('playsinline', 'true');
            await video.play();

            // DO NOT touch focus or zoom — let the phone's native autofocus work
            setScanning(true);

            scanIntervalRef.current = setInterval(async () => {
                if (!videoRef.current || videoRef.current.readyState < 2) return;
                try {
                    const barcodes = await detectorRef.current.detect(videoRef.current);
                    if (barcodes.length > 0) {
                        handleDetection(barcodes[0].rawValue);
                    }
                } catch (e) { }
            }, 150);

        } catch (err) {
            const msg = err?.toString?.() || 'Nie udało się uruchomić kamery';
            if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
                setCameraError('Brak zgody na dostęp do kamery. Sprawdź ustawienia przeglądarki.');
            } else if (msg.includes('NotFoundError')) {
                setCameraError('Nie znaleziono kamery na tym urządzeniu.');
            } else {
                setCameraError(msg);
            }
        }
    }, [handleDetection]);

    const stopScanner = useCallback(() => {
        if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        detectorRef.current = null;
        setScanning(false);
    }, []);

    const getStatusIcon = () => {
        switch (saveStatus) {
            case 'saving': return '⏳';
            case 'saved': return '✅';
            case 'error': return '❌';
            default: return '—';
        }
    };

    const getStatusText = () => {
        switch (saveStatus) {
            case 'saving': return 'Zapisywanie…';
            case 'saved': return 'Zapisano pomyślnie';
            case 'error': return errorMsg || 'Wystąpił błąd';
            default: return 'Oczekiwanie na skan';
        }
    };

    return (
        <div className="app">
            <main className="main">
                <section className="card scanner-card">
                    <h2 className="scanner-title">Skanuj kod QR</h2>

                    {!scanning && !cameraError && (
                        <div className="scanner-placeholder-wrapper">
                            <span className="scanner-placeholder-icon">📸</span>
                            <span>Naciśnij przycisk poniżej,<br />aby uruchomić kamerę</span>
                        </div>
                    )}

                    <div
                        className="scanner-video-wrapper"
                        style={{ display: scanning ? 'block' : 'none' }}
                    >
                        <video
                            ref={videoRef}
                            className="scanner-video"
                            playsInline
                            muted
                        />
                    </div>

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

                <section className="card result-card">
                    <h2 className="card-label">Ostatni skan</h2>
                    <div className={`scan-result ${lastScan ? 'has-value' : ''}`}>
                        {lastScan || 'Brak skanów'}
                    </div>
                </section>

                <section className={`card status-card status-${saveStatus}`}>
                    <h2 className="card-label">Status zapisu</h2>
                    <div className="status-row">
                        <span className="status-icon">{getStatusIcon()}</span>
                        <span className="status-text">{getStatusText()}</span>
                    </div>
                </section>

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
