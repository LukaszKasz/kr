import { useState, useRef, useCallback, useEffect } from 'react';

const OPERATORS = ['Gosia', 'Ksenia', 'Natalia', 'Łukasz'];
const SCAN_COOLDOWN_MS = 2000;

export default function App() {
    const [operator, setOperator] = useState(() => localStorage.getItem('qr_operator') || null);
    const [scanning, setScanning] = useState(false);
    const [lastScan, setLastScan] = useState(null);
    const [saveStatus, setSaveStatus] = useState('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [cameraError, setCameraError] = useState('');
    const [scanCount, setScanCount] = useState(0);
    const [focusTap, setFocusTap] = useState(false);
    const [scanFlash, setScanFlash] = useState(false);

    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const scanIntervalRef = useRef(null);
    const cooldownRef = useRef(false);
    const detectorRef = useRef(null);
    const trackRef = useRef(null);
    const stopRef = useRef(null);

    useEffect(() => {
        return () => stopScanner();
    }, []);

    const selectOperator = useCallback((name) => {
        localStorage.setItem('qr_operator', name);
        setOperator(name);
    }, []);

    const changeOperator = useCallback(() => {
        setOperator(null);
        localStorage.removeItem('qr_operator');
    }, []);

    const saveScan = useCallback(async (text) => {
        setSaveStatus('saving');
        setErrorMsg('');
        try {
            const res = await fetch('./api/save.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ qr_text: text, operator: operator }),
            });
            const data = await res.json();
            if (data.success) {
                setSaveStatus('saved');
                setScanCount((c) => c + 1);
                // Reset status and clear last scan after 1 second
                setTimeout(() => {
                    setSaveStatus((current) => current === 'saved' ? 'idle' : current);
                    setLastScan(null);
                }, 1000);
            } else {
                setSaveStatus('error');
                setErrorMsg(data.error || 'Nieznany błąd serwera');
            }
        } catch (err) {
            setSaveStatus('error');
            console.error('Server response error:', err);
            setErrorMsg('Błąd: ' + (err.message || 'Brak połączenia'));
        }
    }, [operator]);

    const handleDetection = useCallback((decodedText) => {
        if (cooldownRef.current) return;

        // Visual flash effect (longer)
        setScanFlash(true);
        setTimeout(() => setScanFlash(false), 400);

        cooldownRef.current = true;
        setLastScan(decodedText);
        saveScan(decodedText);

        // Reset cooldown after 2 seconds to allow next scan without closing camera
        setTimeout(() => {
            cooldownRef.current = false;
        }, SCAN_COOLDOWN_MS);
    }, [saveScan]);

    // Tap to refocus
    const handleTapFocus = useCallback(async () => {
        if (!trackRef.current) return;
        setFocusTap(true);
        setTimeout(() => setFocusTap(false), 600);

        try {
            const caps = trackRef.current.getCapabilities ? trackRef.current.getCapabilities() : {};
            if (caps.focusMode) {
                if (caps.focusMode.includes('continuous')) {
                    await trackRef.current.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
                } else if (caps.focusMode.includes('single-shot')) {
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
        setSaveStatus('idle');
        setLastScan(null);
        if (!('BarcodeDetector' in window)) {
            setCameraError('Twoja przeglądarka nie obsługuje skanowania QR. Użyj Chrome lub Safari.');
            return;
        }

        try {
            detectorRef.current = new BarcodeDetector({ formats: ['qr_code'] });

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    frameRate: { ideal: 30, max: 60 },
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

                if (caps.zoom) {
                    const initialZoom = Math.max(caps.zoom.min, 1);
                    try {
                        await track.applyConstraints({ advanced: [{ zoom: initialZoom }] });
                    } catch (e) { }
                }

                if (caps.focusMode?.includes('continuous')) {
                    try {
                        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
                    } catch (e) { }
                }
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
        cooldownRef.current = false; // reset so next scan works
        setScanning(false);
    }, []);

    stopRef.current = stopScanner;

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

    // --- Operator selection screen ---
    if (!operator) {
        return (
            <div className="app">
                <main className="main operator-screen">
                    <div className="operator-header">
                        <span className="operator-header-icon">👤</span>
                        <h1 className="operator-title">Kto skanuje?</h1>
                        <p className="operator-subtitle">Wybierz swoje imię</p>
                    </div>
                    <div className="operator-grid">
                        {OPERATORS.map((name) => (
                            <button
                                key={name}
                                className="btn-operator"
                                onClick={() => selectOperator(name)}
                            >
                                {name}
                            </button>
                        ))}
                    </div>
                </main>
            </div>
        );
    }

    // --- Main scanner screen ---
    return (
        <div className="app">
            <main className="main">

                {/* Camera view */}
                <div className="camera-area">
                    <div className="scanner-topbar">
                        <h2 className="scanner-title">Skanuj kod QR</h2>
                        <button className="operator-badge" onClick={changeOperator} title="Zmień operatora">
                            👤 {operator}
                        </button>
                    </div>

                    {!scanning && !cameraError && (
                        <div className="scanner-placeholder-wrapper">
                            <span className="scanner-placeholder-icon">📸</span>
                            <span>Naciśnij przycisk poniżej,<br />aby uruchomić kamerę</span>
                        </div>
                    )}

                    <div className={`scanner-video-wrapper ${scanFlash ? 'scan-flash' : ''}`} style={{ display: scanning ? 'flex' : 'none' }}>
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

                    {cameraError && (
                        <div className="camera-error">
                            <span className="camera-error-icon">⚠️</span>
                            <span>{cameraError}</span>
                        </div>
                    )}
                </div>

                {/* Status */}
                <section className={`card status-card status-${saveStatus}`}>
                    <h2 className="card-label">Status zapisu</h2>
                    <div className="status-row">
                        <span className="status-icon">{getStatusIcon()}</span>
                        <span className="status-text">{getStatusText()}</span>
                    </div>
                </section>

                {/* Last scan */}
                <section className="card result-card">
                    <h2 className="card-label">Ostatni skan</h2>
                    <div className={`scan-result ${lastScan ? 'has-value' : ''}`}>
                        {lastScan || 'Brak skanów'}
                    </div>
                </section>

                {/* Button at bottom */}
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

            </main>
        </div>
    );
}
