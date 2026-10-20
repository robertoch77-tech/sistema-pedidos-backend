BEGIN;

ALTER TABLE public.ivan_funciones_config
  ADD COLUMN IF NOT EXISTS catalogo_marca_producto_habilitada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marca_producto_campo text
    CHECK (marca_producto_campo IS NULL OR octet_length(marca_producto_campo) BETWEEN 1 AND 63),
  ADD COLUMN IF NOT EXISTS marca_producto_logos jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(marca_producto_logos) = 'array'),
  ADD COLUMN IF NOT EXISTS marca_producto_revision bigint NOT NULL DEFAULT 0;

COMMIT;
