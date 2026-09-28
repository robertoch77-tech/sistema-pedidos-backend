-- Local preparation only. Do not execute without separate authorization.
BEGIN;
CREATE TABLE IF NOT EXISTS ivan_imagen_producto_procesos (
  id BIGSERIAL PRIMARY KEY,
  mayorista_id INTEGER NOT NULL REFERENCES mayoristas(id),
  producto_id BIGINT NOT NULL,
  solicitud_id UUID NOT NULL,
  codigo_producto TEXT,
  descripcion TEXT,
  imagen_original_url TEXT,
  imagen_mejorada_url TEXT,
  cloudinary_public_id TEXT,
  estado TEXT NOT NULL CHECK (estado IN ('procesando','pendiente','aprobada','eliminando','eliminada','error','revisar')),
  error_codigo TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mayorista_id, solicitud_id),
  CHECK (estado NOT IN ('pendiente','aprobada') OR
    (imagen_original_url IS NOT NULL AND imagen_mejorada_url IS NOT NULL AND cloudinary_public_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_ivan_imagen_procesos_mayorista_fecha
  ON ivan_imagen_producto_procesos (mayorista_id, creado_en DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ivan_imagen_producto_copia
  ON ivan_imagen_producto_procesos (mayorista_id, producto_id)
  WHERE estado IN ('procesando','pendiente','aprobada','eliminando','revisar');
COMMIT;