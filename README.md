# 📷 Skaner QR – Krawcowa App

Prosta aplikacja webowa do skanowania kodów QR z etykiet za pomocą kamery telefonu.  
Wyniki zapisywane są do pliku tekstowego na serwerze.

## 📁 Struktura projektu

```
/
├── frontend/              React + Vite (źródła frontendu)
│   ├── src/
│   │   ├── App.jsx        Główny komponent
│   │   ├── main.jsx       Entry point
│   │   └── styles.css     Style aplikacji
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── public_api/            Pliki PHP do wrzucenia na serwer
│   ├── api/
│   │   └── save.php       Endpoint zapisu skanów
│   ├── data/
│   │   └── scans.txt      Plik z zapisanymi skanami (tworzony automatycznie)
│   └── .htaccess          Blokada dostępu do /data
└── README.md
```

## 🚀 Build i Deploy – krok po kroku

### 1. Zbuduj frontend

```bash
cd frontend
npm install
npm run build
```

Po zbudowaniu pojawi się katalog `frontend/dist/` z gotowymi plikami.

### 2. Wgraj pliki na serwer

Załóżmy, że Twoja subdomena wskazuje na katalog `/home/user/public_html/skaner/`  
(lub inny katalog publiczny na serwerze).

```
public_html/skaner/           ← root subdomeny
├── index.html                ← z frontend/dist/
├── assets/                   ← z frontend/dist/assets/
│   ├── index-XXXXX.js
│   └── index-XXXXX.css
├── api/
│   └── save.php              ← z public_api/api/
├── data/                     ← z public_api/ (lub zostanie utworzony automatycznie)
│   └── scans.txt
└── .htaccess                 ← z public_api/
```

**Kopiowanie:**

1. Skopiuj **całą zawartość** `frontend/dist/*` do katalogu subdomeny
2. Skopiuj `public_api/api/` do katalogu subdomeny (tak aby ścieżka była `/api/save.php`)
3. Skopiuj `public_api/.htaccess` do katalogu subdomeny
4. (Opcjonalnie) skopiuj `public_api/data/` – jeśli nie skopiujesz, skrypt PHP utworzy go automatycznie

### 3. Ustaw uprawnienia

```bash
# Na serwerze (SSH):
chmod 775 /home/user/public_html/skaner/data
chmod 664 /home/user/public_html/skaner/data/scans.txt
```

Jeśli hosting nie pozwala na 775, użyj `777`:

```bash
chmod 777 /home/user/public_html/skaner/data
```

### 4. Gotowe! 🎉

Otwórz subdomenę na telefonie → kliknij "Uruchom skaner" → skanuj QR kody.

## 📄 Format pliku scans.txt

Każdy skan to jedna linia:

```
2026-02-18 20:45:12 | ZAWARTOSC-QR-KODU
2026-02-18 20:45:18 | INNY-KOD-123
2026-02-18 20:46:01 | ABC-456-XYZ
```

## ⚙️ Rozwój lokalny

Jeśli chcesz testować lokalnie:

```bash
cd frontend
npm install
npm run dev
```

Vite uruchomi dev server na `http://localhost:5173`.  
Proxy w `vite.config.js` przekieruje `/api/*` na `http://localhost:8080` – możesz uruchomić PHP tam z `php -S localhost:8080 -t ../public_api`.

## 📝 Uwagi

- Aplikacja **nie wymaga logowania** ani autoryzacji
- Skanowanie działa tylko przez **HTTPS** (lub localhost) – przeglądarka wymaga tego do dostępu do kamery
- Cooldown 2 sekundy zapobiega wielokrotnemu zapisaniu tego samego kodu
- Plik `.htaccess` blokuje dostęp do katalogu `/data` z przeglądarki
