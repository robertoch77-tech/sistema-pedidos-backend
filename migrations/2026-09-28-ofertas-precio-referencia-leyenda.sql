-- Datos opcionales que el mayorista define por oferta; no modifican calculos IVA.
ALTER TABLE ofertas
  ADD COLUMN IF NOT EXISTS precio_normal NUMERIC,
  ADD COLUMN IF NOT EXISTS leyenda_precio TEXT NOT NULL DEFAULT '';

ALTER TABLE ofertas_items
  ADD COLUMN IF NOT EXISTS precio_normal NUMERIC;
