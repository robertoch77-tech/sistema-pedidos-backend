-- Ejecutar manualmente solo en nuestra base, nunca en la base externa de Iván.
-- Agrega una opción apagada por defecto. No cambia RLS, políticas ni otras tablas.
BEGIN;
ALTER TABLE public.ivan_funciones_config
  ADD COLUMN IF NOT EXISTS catalogo_cantidad_directa boolean NOT NULL DEFAULT false;
COMMIT;
