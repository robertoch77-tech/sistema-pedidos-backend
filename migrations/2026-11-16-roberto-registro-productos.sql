BEGIN;
SET LOCAL lock_timeout = '1500ms';
SET LOCAL statement_timeout = '15s';

CREATE TABLE IF NOT EXISTS roberto_archivos_importacion (
  cliente_id bigint NOT NULL,
  huella text NOT NULL,
  contenido bytea NOT NULL,
  PRIMARY KEY (cliente_id, huella)
);

CREATE TABLE IF NOT EXISTS roberto_importacion_evidencia (
  cliente_id bigint NOT NULL,
  operacion_id uuid NOT NULL,
  huella text NOT NULL,
  nombre_archivo text NOT NULL,
  vista_previa jsonb,
  PRIMARY KEY (cliente_id, operacion_id),
  FOREIGN KEY (cliente_id, huella) REFERENCES roberto_archivos_importacion (cliente_id, huella)
);

CREATE TABLE IF NOT EXISTS roberto_cambios_productos (
  id bigserial PRIMARY KEY,
  cliente_id bigint NOT NULL,
  producto_id bigint NOT NULL,
  operacion_id uuid NOT NULL,
  codigo text,
  descripcion text,
  tipo_operacion text NOT NULL,
  origen text NOT NULL,
  campo text NOT NULL,
  valor_anterior text,
  valor_nuevo text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE roberto_archivos_importacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE roberto_importacion_evidencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE roberto_cambios_productos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE roberto_archivos_importacion, roberto_importacion_evidencia,
  roberto_cambios_productos FROM PUBLIC;
REVOKE ALL ON SEQUENCE roberto_cambios_productos_id_seq FROM PUBLIC;

DO $$
DECLARE rol text;
BEGIN
  FOR rol IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    EXECUTE format(
      'REVOKE ALL ON TABLE roberto_archivos_importacion, roberto_importacion_evidencia, roberto_cambios_productos FROM %I',
      rol
    );
    EXECUTE format('REVOKE ALL ON SEQUENCE roberto_cambios_productos_id_seq FROM %I', rol);
  END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS roberto_cambios_cliente_fecha_idx
  ON roberto_cambios_productos (cliente_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS roberto_cambios_cliente_operacion_idx
  ON roberto_cambios_productos (cliente_id, operacion_id, id);
CREATE INDEX IF NOT EXISTS roberto_operaciones_cliente_fecha_idx
  ON importaciones_v2_operaciones (cliente_id, creado_en DESC, id DESC) WHERE estado='completada';
ALTER TABLE historial_cambios_productos ADD COLUMN IF NOT EXISTS auditoria_id uuid;

CREATE OR REPLACE FUNCTION registrar_cambio_producto_roberto()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  contexto jsonb;
  anterior jsonb := '{}'::jsonb;
  nuevo jsonb := '{}'::jsonb;
  producto jsonb;
BEGIN
  contexto := NULLIF(current_setting('roberto.registro_producto', true), '')::jsonb;
  IF contexto IS NULL THEN RETURN NULL; END IF;
  IF TG_OP <> 'INSERT' THEN anterior := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN nuevo := to_jsonb(NEW); END IF;
  producto := CASE WHEN TG_OP = 'DELETE' THEN anterior ELSE nuevo END;

  INSERT INTO roberto_cambios_productos
    (cliente_id, producto_id, operacion_id, codigo, descripcion, tipo_operacion, origen,
     campo, valor_anterior, valor_nuevo)
  SELECT (producto->>'cliente_id')::bigint, (producto->>'id')::bigint,
    (contexto->>'id')::uuid, producto->>'codigo', producto->>'descripcion',
    contexto->>'tipo', contexto->>'origen', datos.campo, datos.antes, datos.despues
  FROM (
    SELECT COALESCE(a.key, n.key) AS campo,
           anterior->>a.key AS antes, nuevo->>n.key AS despues
    FROM jsonb_each(anterior) a FULL JOIN jsonb_each(nuevo) n USING (key)
    WHERE a.value IS DISTINCT FROM n.value
      AND COALESCE(a.key,n.key) NOT IN ('id','cliente_id','creado_en','modificado_en')
    UNION ALL
    SELECT 'producto',
           CASE WHEN TG_OP = 'DELETE' THEN 'Existente' END,
           CASE WHEN TG_OP = 'INSERT' THEN 'Agregado' END
    WHERE TG_OP IN ('INSERT','DELETE')
  ) datos
  WHERE datos.antes IS DISTINCT FROM datos.despues;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER registro_producto_roberto
AFTER INSERT OR UPDATE OR DELETE ON productos_propios
FOR EACH ROW EXECUTE FUNCTION registrar_cambio_producto_roberto();

COMMIT;
