-- Solo configuración en nuestra base. No cambia productos ni reglas RLS.
BEGIN;
ALTER TABLE public.ivan_funciones_config
  ADD COLUMN IF NOT EXISTS catalogo_observaciones_destacadas boolean NOT NULL DEFAULT false;
COMMIT;
