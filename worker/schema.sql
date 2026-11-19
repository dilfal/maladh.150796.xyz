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
