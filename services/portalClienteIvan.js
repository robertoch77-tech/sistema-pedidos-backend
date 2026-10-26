'use strict';

// Solo configuracion central; nunca abre la base del proveedor ni crea columnas.
const CAMPOS = `COALESCE(to_jsonb(m)->>'inicio_cliente', 'panel') AS inicio_cliente,
  COALESCE((to_jsonb(m)->>'bienvenida_cliente')::boolean, true) AS bienvenida_cliente,
  COALESCE((to_jsonb(m)->>'portal_cliente_revision')::bigint, 0)::text AS revision,
  (to_jsonb(m) ?& ARRAY['inicio_cliente','bienvenida_cliente','portal_cliente_revision']) AS disponible`;

async function leer(db, id, bloquear = false) {
  const r = await db.query(`SELECT ${CAMPOS} FROM mayoristas m
    WHERE m.id=$1 AND m.tipo_fuente IS DISTINCT FROM 'roberto' ${bloquear ? 'FOR UPDATE' : ''}`, [id]);
  return r.rows[0] || null;
}

module.exports = { leer };
