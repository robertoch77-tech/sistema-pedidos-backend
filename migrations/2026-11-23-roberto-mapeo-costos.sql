BEGIN;
CREATE TABLE IF NOT EXISTS roberto_mapeos_costos_proveedor (
  cliente_id bigint NOT NULL,
  proveedor_id bigint NOT NULL,
  opciones jsonb NOT NULL,
  PRIMARY KEY (cliente_id, proveedor_id)
);
ALTER TABLE roberto_mapeos_costos_proveedor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON roberto_mapeos_costos_proveedor FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON roberto_mapeos_costos_proveedor FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON roberto_mapeos_costos_proveedor FROM authenticated;
  END IF;
END $$;
COMMIT;
