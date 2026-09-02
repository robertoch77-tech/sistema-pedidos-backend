CREATE TABLE IF NOT EXISTS productos_equivalencias (
  id               BIGSERIAL PRIMARY KEY,
  cliente_id       BIGINT NOT NULL,
  producto_a_id    BIGINT NOT NULL,
  producto_b_id    BIGINT NOT NULL,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_equiv_cliente FOREIGN KEY (cliente_id) REFERENCES clientes_roberto(id),
  CONSTRAINT fk_equiv_producto_a FOREIGN KEY (producto_a_id) REFERENCES productos_propios(id) ON DELETE CASCADE,
  CONSTRAINT fk_equiv_producto_b FOREIGN KEY (producto_b_id) REFERENCES productos_propios(id) ON DELETE CASCADE,
  CONSTRAINT chk_no_auto_equivalencia CHECK (producto_a_id <> producto_b_id),
  CONSTRAINT chk_orden_canonico CHECK (producto_a_id < producto_b_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_equiv_par_cliente
  ON productos_equivalencias (cliente_id, producto_a_id, producto_b_id);
CREATE INDEX IF NOT EXISTS idx_equiv_cliente
  ON productos_equivalencias (cliente_id);
CREATE INDEX IF NOT EXISTS idx_equiv_producto_a
  ON productos_equivalencias (cliente_id, producto_a_id);
CREATE INDEX IF NOT EXISTS idx_equiv_producto_b
  ON productos_equivalencias (cliente_id, producto_b_id);
