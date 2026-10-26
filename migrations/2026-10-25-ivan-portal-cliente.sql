-- Preparado para ejecucion autorizada. No modifica precios ni activa el portal.
BEGIN;
ALTER TABLE public.mayoristas
  ADD COLUMN IF NOT EXISTS inicio_cliente text NOT NULL DEFAULT 'panel'
    CHECK (inicio_cliente IN ('panel', 'catalogo')),
  ADD COLUMN IF NOT EXISTS bienvenida_cliente boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS portal_cliente_revision bigint NOT NULL DEFAULT 0;
COMMIT;
