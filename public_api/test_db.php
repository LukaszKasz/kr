<?php
header('Content-Type: text/plain; charset=utf-8');
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "--- TEST POŁĄCZENIA Z BAZĄ ---\n\n";

$configFile = __DIR__ . '/../../db_config.php';

echo "1. Sprawdzanie pliku konfiguracji: $configFile\n";
if (file_exists($configFile)) {
    echo "   [OK] Plik istnieje.\n";
} else {
    echo "   [ERROR] Plik NIE ISTNIEJE! Upewnij się, że db_config.php jest w odpowiednim katalogu.\n";
    exit;
}

echo "2. Próba ładowania konfiguracji...\n";
try {
    require $configFile;
    echo "   [OK] Konfiguracja załadowana.\n";
} catch (Exception $e) {
    echo "   [ERROR] Błąd przy ładowaniu pliku: " . $e->getMessage() . "\n";
    exit;
}

echo "3. Sprawdzanie obiektu PDO...\n";
if (isset($pdo) && $pdo instanceof PDO) {
    echo "   [OK] Obiekt PDO utworzony pomyślnie.\n";
} else {
    echo "   [ERROR] Brak obiektu PDO! Sprawdź db_config.php.\n";
    exit;
}

echo "4. Próba zapytania do tabeli a_scans...\n";
try {
    $stmt = $pdo->query("SELECT COUNT(*) FROM a_scans");
    $count = $stmt->fetchColumn();
    echo "   [OK] Tabela a_scans istnieje. Liczba rekordów: $count\n";
} catch (PDOException $e) {
    echo "   [ERROR] Błąd zapytania: " . $e->getMessage() . "\n";
    echo "   Wskazówka: Czy na pewno stworzyłeś tabelę a_scans?\n";
}

echo "\n--- TEST ZAKOŃCZONY ---";
?>