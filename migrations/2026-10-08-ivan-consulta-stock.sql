-- Solo nuestra tabla de funciones; no cambia stock, mayoristas ni reglas RLS.
BEGIN;
ALTER TABLE public.ivan_funciones_config
  ADD COLUMN IF NOT EXISTS stock_consulta_habilitada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_mostrar_cantidad boolean NOT NULL DEFAULT false;
COMMIT;
