-- Solo en nuestra base propia; nunca en la base externa de Iván.
-- Opción apagada por defecto. No cambia RLS, políticas ni otras tablas.
BEGIN;
ALTER TABLE public.ivan_funciones_config
  ADD COLUMN IF NOT EXISTS catalogo_codigos_destacados boolean NOT NULL DEFAULT false;
COMMIT;
