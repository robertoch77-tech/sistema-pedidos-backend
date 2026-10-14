-- Solo configuración de nuestra base. No cambia tablas de pedidos ni reglas RLS.
BEGIN;
ALTER TABLE public.ivan_funciones_config
  ADD COLUMN IF NOT EXISTS pedido_envio_parcial_habilitado boolean NOT NULL DEFAULT false;
COMMIT;
