BEGIN;

CREATE TABLE IF NOT EXISTS roberto_notas_obra (
  id SERIAL PRIMARY KEY,
  cliente_id BIGINT NOT NULL,
  cuenta_id BIGINT NOT NULL REFERENCES cuentas_corrientes_clientes(id),
  obra TEXT NOT NULL DEFAULT '',
  operacion_id UUID NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  venta_id BIGINT UNIQUE REFERENCES ventas(id),
  venta_huella TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cliente_id, operacion_id)
);
CREATE INDEX IF NOT EXISTS roberto_notas_obra_negocio ON roberto_notas_obra(cliente_id, actualizado_en DESC);

CREATE TABLE IF NOT EXISTS roberto_notas_obra_operaciones (
  nota_id INTEGER NOT NULL REFERENCES roberto_notas_obra(id),
  operacion_id UUID NOT NULL,
  huella TEXT NOT NULL,
  PRIMARY KEY(nota_id, operacion_id)
);

CREATE TABLE IF NOT EXISTS roberto_notas_obra_movimientos (
  id SERIAL PRIMARY KEY,
  nota_id INTEGER NOT NULL REFERENCES roberto_notas_obra(id),
  operacion_id UUID NOT NULL,
  producto_id BIGINT NOT NULL,
  codigo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  retira TEXT NOT NULL DEFAULT '',
  retiro_id INTEGER REFERENCES roberto_notas_obra_movimientos(id),
  cantidad NUMERIC NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC NOT NULL CHECK (precio_unitario >= 0),
  descuento_porcentaje NUMERIC NOT NULL CHECK (descuento_porcentaje BETWEEN 0 AND 100),
  alicuota_iva NUMERIC NOT NULL CHECK (alicuota_iva >= 0),
  lista_precio TEXT,
  modo_iva TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(nota_id, operacion_id) REFERENCES roberto_notas_obra_operaciones(nota_id, operacion_id)
);
CREATE INDEX IF NOT EXISTS roberto_notas_obra_mov_nota ON roberto_notas_obra_movimientos(nota_id, id);
CREATE INDEX IF NOT EXISTS roberto_notas_obra_mov_retiro ON roberto_notas_obra_movimientos(retiro_id) WHERE retiro_id IS NOT NULL;

ALTER TABLE roberto_notas_obra ENABLE ROW LEVEL SECURITY;
ALTER TABLE roberto_notas_obra_operaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE roberto_notas_obra_movimientos ENABLE ROW LEVEL SECURITY;
-- Las tres tablas se acceden desde el backend con su rol de base de datos.
REVOKE ALL ON roberto_notas_obra, roberto_notas_obra_operaciones, roberto_notas_obra_movimientos FROM PUBLIC;
REVOKE ALL ON SEQUENCE roberto_notas_obra_id_seq, roberto_notas_obra_movimientos_id_seq FROM PUBLIC;
DO $$
DECLARE rol TEXT;
BEGIN
  FOR rol IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON roberto_notas_obra, roberto_notas_obra_operaciones, roberto_notas_obra_movimientos FROM %I', rol);
    EXECUTE format('REVOKE ALL ON SEQUENCE roberto_notas_obra_id_seq, roberto_notas_obra_movimientos_id_seq FROM %I', rol);
  END LOOP;
END $$;
COMMIT;
