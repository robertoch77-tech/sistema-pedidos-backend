-- Ejecutar únicamente en nuestra base propia. No en la base externa de Iván.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ivan_funciones_config (
  mayorista_id bigint PRIMARY KEY REFERENCES public.mayoristas(id),
  catalogo_costo_habilitado boolean NOT NULL DEFAULT false,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ivan_funciones_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ivan_funciones_config FROM anon, authenticated;
COMMIT;
