BEGIN;
CREATE TABLE IF NOT EXISTS public.ivan_pedido_iva_snapshot (
  pedido_item_id bigint PRIMARY KEY REFERENCES public.pedidos_web_items(id) ON DELETE CASCADE,
  pedido_id bigint NOT NULL REFERENCES public.pedidos_web(id),
  producto_id bigint NOT NULL,
  datos jsonb NOT NULL CHECK (jsonb_typeof(datos) = 'object')
);
CREATE INDEX IF NOT EXISTS ivan_pedido_iva_snapshot_pedido ON public.ivan_pedido_iva_snapshot(pedido_id);
ALTER TABLE public.ivan_pedido_iva_snapshot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ivan_pedido_iva_snapshot FROM anon, authenticated;
COMMIT;
