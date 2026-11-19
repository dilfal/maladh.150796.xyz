CREATE TABLE IF NOT EXISTS iscrizioni (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  aggiornato INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS avvisi (
  iscrizione TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (iscrizione, at)
);

CREATE INDEX IF NOT EXISTS avvisi_at ON avvisi (at);

-- Collegamento facoltativo con Marsa (v0.9). Solo un'impronta casuale e un bit: nessuna data, nessuno storico.
-- «toccato» è un giorno (giorni dall'epoca). Il cron cancella i legami non toccati da 60 giorni.
CREATE TABLE IF NOT EXISTS legami (
  impronta TEXT PRIMARY KEY,
  pausa INTEGER NOT NULL,
  toccato INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS collegamenti (
  iscrizione TEXT PRIMARY KEY,
  impronta TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS collegamenti_impronta ON collegamenti (impronta);
