-- Crear SOLO las nuevas tablas de imágenes en la base propia.
-- No ejecutar en la base externa de Iván. No modifica mayoristas ni productos.
BEGIN;
CREATE TABLE IF NOT EXISTS ivan_imagenes_config (
  mayorista_id bigint PRIMARY KEY REFERENCES mayoristas(id),
  habilitada boolean NOT NULL DEFAULT false,
  limite_archivos integer NOT NULL DEFAULT 200 CHECK (limite_archivos BETWEEN 1 AND 10000),
  limite_cargas_mes integer NOT NULL DEFAULT 50 CHECK (limite_cargas_mes BETWEEN 1 AND 5000),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ivan_imagenes_archivos (
  id uuid PRIMARY KEY,
  mayorista_id bigint NOT NULL REFERENCES mayoristas(id),
  solicitud_id uuid NOT NULL,
  solicitud_hash text NOT NULL,
  sha256 text NOT NULL,
  public_id text NOT NULL UNIQUE,
  estado text NOT NULL CHECK (estado IN ('subiendo','lista','revisar','error')),
  url text,
  bytes bigint CHECK (bytes >= 0),
  formato text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mayorista_id, id),
  UNIQUE(mayorista_id, solicitud_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ivan_imagenes_hash_activo
 ON ivan_imagenes_archivos(mayorista_id, sha256) WHERE estado IN ('subiendo','lista','revisar');
CREATE INDEX IF NOT EXISTS ivan_imagenes_periodo
 ON ivan_imagenes_archivos(mayorista_id, creado_en);
CREATE TABLE IF NOT EXISTS ivan_imagenes_productos (
  mayorista_id bigint NOT NULL,
  producto_id bigint NOT NULL CHECK (producto_id > 0),
  codigo_producto text NOT NULL,
  archivo_id uuid NOT NULL,
  principal text NOT NULL CHECK (principal IN ('original','propia')),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(mayorista_id, producto_id),
  FOREIGN KEY(mayorista_id, archivo_id) REFERENCES ivan_imagenes_archivos(mayorista_id, id)
);
-- No hay filas habilitadas por defecto; cada mayorista debe ser habilitado por Admin.
ALTER TABLE ivan_imagenes_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ivan_imagenes_archivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ivan_imagenes_productos ENABLE ROW LEVEL SECURITY;
COMMIT;
