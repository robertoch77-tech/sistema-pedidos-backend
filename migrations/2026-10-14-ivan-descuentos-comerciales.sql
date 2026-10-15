-- Solo tablas nuevas de nuestra base. No modifica tablas o conexiones de Iván/Roberto.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ivan_descuentos_config (
  mayorista_id bigint PRIMARY KEY REFERENCES public.mayoristas(id),
  habilitado boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT false,
  dto_general numeric(7,4) NOT NULL DEFAULT 0 CHECK(dto_general BETWEEN 0 AND 100),
  origen_precio text NOT NULL DEFAULT '' CHECK(origen_precio IN ('','lista','general_incluido')),
  perfil_default text NOT NULL DEFAULT '',
  datos jsonb NOT NULL DEFAULT '{"perfiles":[],"asignaciones":[]}'::jsonb,
  version bigint NOT NULL DEFAULT 0,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ivan_descuentos_historial (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mayorista_id bigint NOT NULL REFERENCES public.mayoristas(id),
  version bigint NOT NULL,
  actor text NOT NULL,
  configuracion jsonb NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mayorista_id,version)
);
ALTER TABLE public.ivan_descuentos_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ivan_descuentos_historial ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ivan_descuentos_config,public.ivan_descuentos_historial FROM anon,authenticated;
COMMIT;