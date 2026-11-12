BEGIN;

ALTER TABLE public.ivan_funciones_config
  ADD COLUMN IF NOT EXISTS lector_ean_lumac_habilitado boolean NOT NULL DEFAULT false;

COMMIT;
