BEGIN;
ALTER TABLE public.ivan_funciones_config
  ADD COLUMN IF NOT EXISTS catalogo_bultos_habilitados boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bultos_campo text
    CHECK (bultos_campo IS NULL OR octet_length(bultos_campo) BETWEEN 1 AND 63),
  ADD COLUMN IF NOT EXISTS bultos_revision bigint NOT NULL DEFAULT 0;
COMMIT;
