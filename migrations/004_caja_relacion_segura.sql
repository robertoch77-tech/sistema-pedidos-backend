-- Autorizado: corregir referencia legacy únicamente sin datos que reasignar.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.caja_movimientos, public.caja, public.cajas IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE destino oid;
BEGIN
  SELECT confrelid INTO destino FROM pg_constraint
  WHERE conrelid='public.caja_movimientos'::regclass
    AND conname='caja_movimientos_caja_id_fkey' AND contype='f';
  IF destino='public.cajas'::regclass THEN RETURN; END IF;
  IF destino IS DISTINCT FROM 'public.caja'::regclass::oid THEN
    RAISE EXCEPTION 'Referencia de caja inesperada. No se modificó nada.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.caja_movimientos) OR EXISTS(SELECT 1 FROM public.caja) THEN
    RAISE EXCEPTION 'Hay datos históricos de caja. No se reasignaron registros.';
  END IF;
  ALTER TABLE public.caja_movimientos DROP CONSTRAINT caja_movimientos_caja_id_fkey;
  ALTER TABLE public.caja_movimientos ADD CONSTRAINT caja_movimientos_caja_id_fkey
    FOREIGN KEY(caja_id) REFERENCES public.cajas(id);
END $$;
COMMIT;
