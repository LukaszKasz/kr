<?php
/**
 * Endpoint: POST /api/save.php
 * Odbiera JSON { "qr_text": "..." } i dopisuje do pliku data/scans.txt
 */

header('Content-Type: application/json; charset=utf-8');

// Tylko POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Dozwolona tylko metoda POST']);
    exit;
}

// Odczytaj body
$input = json_decode(file_get_contents('php://input'), true);

if (!$input || !isset($input['qr_text'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Brak pola qr_text w żądaniu']);
    exit;
}

$qrText = trim($input['qr_text']);

if ($qrText === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Pole qr_text nie może być puste']);
    exit;
}

// Ścieżka do pliku
$dataDir = __DIR__ . '/../data';
$filePath = $dataDir . '/scans.txt';

// Utwórz katalog data jeśli nie istnieje
if (!is_dir($dataDir)) {
    if (!mkdir($dataDir, 0775, true)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Nie udało się utworzyć katalogu data']);
        exit;
    }
}

// Przygotuj linię
$timestamp = date('Y-m-d H:i:s');
$line = $timestamp . ' | ' . $qrText . PHP_EOL;

// Zapisz z flock
$fp = fopen($filePath, 'a');
if (!$fp) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Nie udało się otworzyć pliku do zapisu']);
    exit;
}

if (flock($fp, LOCK_EX)) {
    fwrite($fp, $line);
    flock($fp, LOCK_UN);
    fclose($fp);
    echo json_encode(['success' => true]);
} else {
    fclose($fp);
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Nie udało się zablokować pliku']);
}
