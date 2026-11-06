BEGIN;
CREATE TABLE IF NOT EXISTS public.ivan_cliente_consultas_config (
  mayorista_id bigint PRIMARY KEY REFERENCES public.mayoristas(id) ON DELETE CASCADE,
  descuentos boolean NOT NULL DEFAULT false,
  pdf boolean NOT NULL DEFAULT false,
  excel boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ivan_cliente_consultas_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ivan_cliente_consultas_config FROM anon, authenticated;
COMMIT;
-- Sin INSERT de activación. Solo el backend/Admin administra esta tabla.
-- No modifica mayoristas, descuentos, precios ni tablas/vistas del proveedor.
