-- Preparada para revisión. NO ejecutar automáticamente.
-- Todos los mayoristas existentes conservan el precio recibido.
ALTER TABLE mayoristas
  ADD COLUMN IF NOT EXISTS modelo_precio_catalogo TEXT NOT NULL DEFAULT 'precio_recibido',
  ADD COLUMN IF NOT EXISTS margen_catalogo NUMERIC(8,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva_catalogo_default NUMERIC(5,2) NOT NULL DEFAULT 21,
  ADD COLUMN IF NOT EXISTS usar_iva_producto BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ivan_enviar_precio_sin_iva BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mayoristas_modelo_precio_catalogo_check'
  ) THEN
    ALTER TABLE mayoristas
      ADD CONSTRAINT mayoristas_modelo_precio_catalogo_check
      CHECK (modelo_precio_catalogo IN ('precio_recibido', 'costo_margen_iva'));
  END IF;
END $$;

ALTER TABLE mayoristas
  DROP CONSTRAINT IF EXISTS mayoristas_margen_catalogo_check,
  ADD CONSTRAINT mayoristas_margen_catalogo_check CHECK (margen_catalogo BETWEEN 0 AND 999),
  DROP CONSTRAINT IF EXISTS mayoristas_iva_catalogo_default_check,
  ADD CONSTRAINT mayoristas_iva_catalogo_default_check CHECK (iva_catalogo_default BETWEEN 0 AND 100);
