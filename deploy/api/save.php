<?php
/**
 * Endpoint: POST /api/save.php
 * Odbiera JSON { "qr_text": "...", "operator": "..." } i zapisuje do bazy danych MySQL
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
$operator = isset($input['operator']) ? trim($input['operator']) : 'nieznany';

if ($qrText === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Pole qr_text nie może być puste']);
    exit;
}

// Załaduj konfigurację bazy (ścieżka absolutna do pliku poza public_html)
require_once __DIR__ . '/../../db_config.php';

try {
    // Zapisz do bazy przy użyciu Prepared Statements (bezpieczeństwo przed SQL Injection)
    $stmt = $pdo->prepare("INSERT INTO a_scans (operator, qr_text) VALUES (?, ?)");
    $stmt->execute([$operator, $qrText]);

    echo json_encode(['success' => true]);
} catch (\PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Błąd zapisu do bazy: ' . $e->getMessage()]);
}
