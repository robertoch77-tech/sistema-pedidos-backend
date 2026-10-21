BEGIN;
ALTER TABLE public.ivan_funciones_config
  ADD COLUMN IF NOT EXISTS equivalencias_modo text NOT NULL DEFAULT 'grupo'
    CHECK (equivalencias_modo IN ('grupo', 'codigos'));
COMMIT;
