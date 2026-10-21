BEGIN;
CREATE TABLE IF NOT EXISTS public.ivan_precio_origen_config (
  mayorista_id bigint PRIMARY KEY REFERENCES public.mayoristas(id),
  habilitado boolean NOT NULL DEFAULT false,
  origen jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(origen) = 'object'),
  presentacion text NOT NULL DEFAULT 'conservar'
    CHECK (presentacion IN ('conservar', 'agregar', 'desglosar')),
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ivan_precio_origen_historial (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mayorista_id bigint NOT NULL REFERENCES public.mayoristas(id),
  version bigint NOT NULL,
  actor text NOT NULL CHECK (actor IN ('admin', 'mayorista')),
  configuracion jsonb NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mayorista_id, version)
);
ALTER TABLE public.ivan_precio_origen_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ivan_precio_origen_historial ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ivan_precio_origen_config FROM anon, authenticated;
REVOKE ALL ON TABLE public.ivan_precio_origen_historial FROM anon, authenticated;
COMMIT;
