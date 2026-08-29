-- Migracion demanda no satisfecha v2 — seguridad + deduplicacion + estados.
-- Idempotente, aditiva, no destructiva. NO ejecutar automaticamente.
--
-- Deduplicacion: usa bloques fijos de 30 minutos alineados al reloj.
--   date_trunc('hour', ts) + floor(extract(minute FROM ts) / 30) * interval '30 min'
-- Ejemplo: 14:59 → bloque 14:30,  15:00 → bloque 15:00.
-- Dos busquedas identicas a las 14:59 y 15:00 pertenecen a bloques distintos
-- y ambas se registran. Esto NO es una ventana movil exacta de 30 minutos.

-- 1. Columnas nuevas
ALTER TABLE demanda_no_satisfecha
  ADD COLUMN IF NOT EXISTS cliente_id        INTEGER,
  ADD COLUMN IF NOT EXISTS cliente_cuit      TEXT,
  ADD COLUMN IF NOT EXISTS clave_normalizada TEXT,
  ADD COLUMN IF NOT EXISTS estado            TEXT NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS motivo_descarte   TEXT,
  ADD COLUMN IF NOT EXISTS ventana_inicio    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS atendida_en       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS descartada_en     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS es_legado         BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Backfill legados: completar clave_normalizada compatible con normalizarClave() de JS.
--    Convierte a minusculas, colapsa espacios, y traduce vocales acentuadas y ñ.
--    ventana_inicio queda NULL (no se puede reconstruir el bloque original).
--    busqueda NULL o vacia recibe clave '_vacio' para que sea gestionable.
UPDATE demanda_no_satisfecha
  SET es_legado = TRUE,
      clave_normalizada = CASE
        WHEN busqueda IS NULL OR trim(busqueda) = '' THEN '_vacio'
        ELSE translate(
          lower(regexp_replace(trim(busqueda), '\s+', ' ', 'g')),
          'áéíóúüñàèìòùâêîôûãõäëïöü',
          'aeiouunaeiouaeiouaoaeiou'
        )
      END
  WHERE cliente_cuit IS NULL AND es_legado = FALSE;

-- 3. Constraint de estado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'demanda_estado_valido'
  ) THEN
    ALTER TABLE demanda_no_satisfecha
      ADD CONSTRAINT demanda_estado_valido
      CHECK (estado IN ('pendiente', 'atendida', 'descartada'));
  END IF;
END $$;

-- 4. Indice unico parcial para deduplicacion por bloques de 30 minutos.
--    El WHERE excluye filas historicas con ventana_inicio NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_demanda_dedup
  ON demanda_no_satisfecha (mayorista_id, cliente_cuit, tipo, clave_normalizada, ventana_inicio)
  WHERE cliente_cuit IS NOT NULL
    AND clave_normalizada IS NOT NULL
    AND ventana_inicio IS NOT NULL;

-- 5. Indices de consulta
CREATE INDEX IF NOT EXISTS idx_demanda_tenant_estado_fecha
  ON demanda_no_satisfecha (mayorista_id, estado, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_demanda_tenant_fecha
  ON demanda_no_satisfecha (mayorista_id, fecha DESC);
