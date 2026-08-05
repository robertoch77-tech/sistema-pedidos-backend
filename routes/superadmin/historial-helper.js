const pool = require('../../db');

async function registrarCambios({ cliente_id, producto_id, codigo, descripcion, cambios, tipo_operacion, origen }) {
  try {
    const entries = Object.entries(cambios || {});
    if (!entries.length) return;
    const values = [];
    const placeholders = [];
    let idx = 1;
    for (const [campo, { anterior, nuevo }] of entries) {
      const a = anterior == null ? null : String(anterior);
      const n = nuevo == null ? null : String(nuevo);
      if (a === n) continue;
      placeholders.push(`($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5},$${idx+6},$${idx+7},$${idx+8})`);
      values.push(cliente_id, producto_id || null, codigo || null, descripcion || null, campo, a, n, tipo_operacion, origen);
      idx += 9;
    }
    if (!placeholders.length) return;
    await pool.query(
      `INSERT INTO historial_cambios_productos
         (cliente_id, producto_id, codigo, descripcion, campo, valor_anterior, valor_nuevo, tipo_operacion, origen)
       VALUES ${placeholders.join(',')}`,
      values
    );
  } catch (err) {
    console.error('historial-helper registrarCambios error (no-break):', err.message);
  }
}

async function registrarEvento({ cliente_id, producto_id, codigo, descripcion, campo, valor_anterior, valor_nuevo, tipo_operacion, origen }) {
  try {
    await pool.query(
      `INSERT INTO historial_cambios_productos
         (cliente_id, producto_id, codigo, descripcion, campo, valor_anterior, valor_nuevo, tipo_operacion, origen)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [cliente_id, producto_id || null, codigo || null, descripcion || null, campo, valor_anterior, valor_nuevo, tipo_operacion, origen]
    );
  } catch (err) {
    console.error('historial-helper registrarEvento error (no-break):', err.message);
  }
}

module.exports = { registrarCambios, registrarEvento };
