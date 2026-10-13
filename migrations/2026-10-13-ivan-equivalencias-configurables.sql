-- Solo nuestra configuración; no modifica productos ni reglas RLS.
BEGIN;
ALTER TABLE public.ivan_funciones_config
  ADD COLUMN IF NOT EXISTS equivalencias_campo text NOT NULL DEFAULT 'obs_producto'
    CHECK (char_length(equivalencias_campo) BETWEEN 1 AND 63);
COMMIT;
