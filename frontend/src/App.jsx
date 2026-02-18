import { useState, useRef, useCallback, useEffect } from 'react';

const SCAN_COOLDOWN_MS = 2000;

export default function App() {
    const [scanning, setScanning] = useState(false);
    const [lastScan, setLastScan] = useState(null);
    const [saveStatus, setSaveStatus] = useState('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [cameraError, setCameraError] = useState('');
    const [scanCount, setScanCount] = useState(0);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [zoomRange, setZoomRange] = useState({ min: 1, max: 1 });
    const [focusTap, setFocusTap] = useState(false);

    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const scanIntervalRef = useRef(null);
    const cooldownRef = useRef(false);
    const detectorRef = useRef(null);
    const trackRef = useRef(null);

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

    const changeZoom = useCallback(async (newZoom) => {
        const z = parseFloat(newZoom);
        setZoomLevel(z);
        if (trackRef.current) {
            try {
                await trackRef.current.applyConstraints({ advanced: [{ zoom: z }] });
            } catch (e) { }
        }
    }, []);

    // Tap to refocus
    const handleTapFocus = useCallback(async () => {
        if (!trackRef.current) return;
        setFocusTap(true);
        setTimeout(() => setFocusTap(false), 600);

        try {
            const caps = trackRef.current.getCapabilities ? trackRef.current.getCapabilities() : {};
            if (caps.focusMode) {
                // Switch to single-shot to trigger refocus, then back to continuous
                if (caps.focusMode.includes('single-shot')) {
                    await trackRef.current.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] });
                    setTimeout(async () => {
                        try {
                            if (trackRef.current && caps.focusMode.includes('continuous')) {
                                await trackRef.current.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
                            }
                        } catch (e) { }
                    }, 500);
                }
            }
        } catch (e) {
            console.log('Focus tap error:', e);
        }
    }, []);

    const startScanner = useCallback(async () => {
        setCameraError('');

        if (!('BarcodeDetector' in window)) {
            setCameraError('Twoja przeglądarka nie obsługuje skanowania QR. Użyj Chrome lub Safari.');
            return;
        }

        try {
            detectorRef.current = new BarcodeDetector({ formats: ['qr_code'] });

            // Request camera with autofocus from the start
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

            const track = stream.getVideoTracks()[0];
            trackRef.current = track;

            if (track) {
                const caps = track.getCapabilities ? track.getCapabilities() : {};

                // Setup zoom slider
                if (caps.zoom) {
                    setZoomRange({ min: caps.zoom.min, max: caps.zoom.max });
                    const initialZoom = Math.min(3.0, caps.zoom.max);
                    setZoomLevel(initialZoom);

                    try {
                        await track.applyConstraints({
                            advanced: [{ zoom: Math.min(3.0, caps.zoom.max) }]
                        });
                    } catch (e) {
                        console.log('Zoom error:', e);
                    }
                }
                // NOTE: do NOT set focusMode — let the phone handle autofocus natively
            }

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
        trackRef.current = null;
        detectorRef.current = null;
        setScanning(false);
        setZoomRange({ min: 1, max: 1 });
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

                    <div className="scanner-video-wrapper" style={{ display: scanning ? 'block' : 'none' }}>
                        <video
                            ref={videoRef}
                            className="scanner-video"
                            playsInline
                            muted
                            onClick={handleTapFocus}
                        />
                        {focusTap && <div className="focus-indicator" />}
                        {scanning && (
                            <div className="tap-hint">Dotknij ekran aby wyostrzyć</div>
                        )}
                    </div>

                    {scanning && zoomRange.max > 1 && (
                        <div className="zoom-control">
                            <span className="zoom-label">🔍</span>
                            <input
                                type="range"
                                className="zoom-slider"
                                min={zoomRange.min}
                                max={zoomRange.max}
                                step="0.1"
                                value={zoomLevel}
                                onChange={(e) => changeZoom(e.target.value)}
                            />
                            <span className="zoom-value">{zoomLevel.toFixed(1)}x</span>
                        </div>
                    )}

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
