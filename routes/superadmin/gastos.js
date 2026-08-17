const express = require('express');
const router  = express.Router();
const pool    = require('../../db');
const { verificarCualquierToken, verificarClienteId } = require('./authMiddleware');

router.use(verificarCualquierToken);

function n(v) { return parseFloat(v) || 0; }

// ═══════════════════════════════════════════════════════
// GASTOS FIJOS
// ═══════════════════════════════════════════════════════

// GET /fijos/:cliente_id
router.get('/fijos/:cliente_id', verificarClienteId, async (req, res) => {
  const { cliente_id } = req.params;
  const { mes, anio, categoria, activo } = req.query;

  try {
    const params = [cliente_id];
    let filtros = '';

    if (mes)       { params.push(parseInt(mes));   filtros += ` AND mes = $${params.length}`; }
    if (anio)      { params.push(parseInt(anio));  filtros += ` AND anio = $${params.length}`; }
    if (categoria) { params.push(categoria);       filtros += ` AND categoria = $${params.length}`; }
    if (activo !== undefined) {
      params.push(activo === 'false' ? false : true);
      filtros += ` AND activo = $${params.length}`;
    } else {
      filtros += ` AND activo = true`;
    }

    const q = await pool.query(`
      SELECT * FROM gastos_fijos
      WHERE cliente_id = $1 ${filtros}
      ORDER BY creado_en DESC
    `, params);

    const total_mes = q.rows.reduce((s, r) => s + n(r.monto), 0);

    res.json({ gastos: q.rows, total_mes });
  } catch (err) {
    console.error('GET fijos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /fijos/:cliente_id
router.post('/fijos/:cliente_id', verificarClienteId, async (req, res) => {
  const { cliente_id } = req.params;
  const { descripcion, monto, categoria, periodicidad, mes, anio, observaciones } = req.body;

  try {
    const q = await pool.query(`
      INSERT INTO gastos_fijos
        (cliente_id, descripcion, monto, categoria, periodicidad, mes, anio, observaciones)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id
    `, [cliente_id, descripcion, monto, categoria || 'otro', periodicidad || 'mensual', mes || null, anio || null, observaciones || null]);

    res.json({ ok: true, id: q.rows[0].id });
  } catch (err) {
    console.error('POST fijo:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /fijos/:cliente_id/:id
router.put('/fijos/:cliente_id/:id', verificarClienteId, async (req, res) => {
  const { cliente_id, id } = req.params;
  const { descripcion, monto, categoria, periodicidad, mes, anio, observaciones, activo } = req.body;

  try {
    await pool.query(`
      UPDATE gastos_fijos SET
        descripcion = COALESCE($3, descripcion),
        monto       = COALESCE($4, monto),
        categoria   = COALESCE($5, categoria),
        periodicidad= COALESCE($6, periodicidad),
        mes         = $7,
        anio        = $8,
        observaciones = $9,
        activo      = COALESCE($10, activo),
        modificado_en = now()
      WHERE id = $1 AND cliente_id = $2
    `, [id, cliente_id, descripcion, monto, categoria, periodicidad, mes || null, anio || null, observaciones || null, activo]);

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT fijo:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /fijos/:cliente_id/:id — soft delete
router.delete('/fijos/:cliente_id/:id', verificarClienteId, async (req, res) => {
  const { cliente_id, id } = req.params;

  try {
    await pool.query(`
      UPDATE gastos_fijos SET activo = false, modificado_en = now()
      WHERE id = $1 AND cliente_id = $2
    `, [id, cliente_id]);

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE fijo:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// GASTOS VARIABLES
// ═══════════════════════════════════════════════════════

// GET /variables/:cliente_id
router.get('/variables/:cliente_id', verificarClienteId, async (req, res) => {
  const { cliente_id } = req.params;
  const {
    fecha_desde,
    fecha_hasta,
    categoria,
    buscar,
    page  = '1',
    limit = '25',
  } = req.query;

  try {
    const params = [cliente_id];
    let filtros = '';

    if (fecha_desde) { params.push(fecha_desde); filtros += ` AND fecha >= $${params.length}`; }
    if (fecha_hasta) { params.push(fecha_hasta); filtros += ` AND fecha <= $${params.length}`; }
    if (categoria)   { params.push(categoria);   filtros += ` AND gv.categoria = $${params.length}`; }
    if (buscar)      { params.push(`%${buscar}%`); filtros += ` AND gv.descripcion ILIKE $${params.length}`; }

    const lim  = Math.min(parseInt(limit) || 25, 100);
    const pag  = Math.max(parseInt(page)  || 1,  1);
    const offset = (pag - 1) * lim;

    const countQ = await pool.query(`
      SELECT COUNT(*) AS total FROM gastos_variables gv
      WHERE gv.cliente_id = $1 ${filtros}
    `, params);

    params.push(lim, offset);
    const q = await pool.query(`
      SELECT gv.*, pr.nombre AS proveedor_nombre
      FROM gastos_variables gv
      LEFT JOIN proveedores pr ON pr.id = gv.proveedor_id
      WHERE gv.cliente_id = $1 ${filtros}
      ORDER BY gv.fecha DESC, gv.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({
      gastos: q.rows,
      total:  parseInt(countQ.rows[0].total),
      pagina: pag,
    });
  } catch (err) {
    console.error('GET variables:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /variables/:cliente_id
router.post('/variables/:cliente_id', verificarClienteId, async (req, res) => {
  const { cliente_id } = req.params;
  const { descripcion, monto, categoria, fecha, comprobante, proveedor_id, observaciones } = req.body;

  try {
    const q = await pool.query(`
      INSERT INTO gastos_variables
        (cliente_id, descripcion, monto, categoria, fecha, comprobante, proveedor_id, observaciones)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id
    `, [cliente_id, descripcion, monto, categoria || 'otro', fecha, comprobante || null, proveedor_id || null, observaciones || null]);

    res.json({ ok: true, id: q.rows[0].id });
  } catch (err) {
    console.error('POST variable:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /variables/:cliente_id/:id
router.put('/variables/:cliente_id/:id', verificarClienteId, async (req, res) => {
  const { cliente_id, id } = req.params;
  const { descripcion, monto, categoria, fecha, comprobante, proveedor_id, observaciones } = req.body;

  try {
    await pool.query(`
      UPDATE gastos_variables SET
        descripcion   = COALESCE($3, descripcion),
        monto         = COALESCE($4, monto),
        categoria     = COALESCE($5, categoria),
        fecha         = COALESCE($6, fecha),
        comprobante   = $7,
        proveedor_id  = $8,
        observaciones = $9,
        modificado_en = now()
      WHERE id = $1 AND cliente_id = $2
    `, [id, cliente_id, descripcion, monto, categoria, fecha, comprobante || null, proveedor_id || null, observaciones || null]);

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT variable:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /variables/:cliente_id/:id — hard delete
router.delete('/variables/:cliente_id/:id', verificarClienteId, async (req, res) => {
  const { cliente_id, id } = req.params;

  try {
    await pool.query(`
      DELETE FROM gastos_variables WHERE id = $1 AND cliente_id = $2
    `, [id, cliente_id]);

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE variable:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// RESUMEN
// ═══════════════════════════════════════════════════════

// GET /resumen/:cliente_id
router.get('/resumen/:cliente_id', verificarClienteId, async (req, res) => {
  const { cliente_id } = req.params;
  const now = new Date();
  const {
    fecha_desde = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    fecha_hasta = now.toISOString().slice(0, 10),
  } = req.query;

  const mes  = new Date(fecha_desde).getMonth() + 1;
  const anio = new Date(fecha_desde).getFullYear();

  try {
    const [fijosQ, varQ, catFijosQ, catVarQ] = await Promise.all([
      pool.query(`
        SELECT COALESCE(SUM(monto), 0) AS total
        FROM gastos_fijos
        WHERE cliente_id = $1 AND activo = true
          AND (mes IS NULL OR mes = $2)
          AND (anio IS NULL OR anio = $3)
      `, [cliente_id, mes, anio]),

      pool.query(`
        SELECT COALESCE(SUM(monto), 0) AS total
        FROM gastos_variables
        WHERE cliente_id = $1 AND fecha BETWEEN $2 AND $3
      `, [cliente_id, fecha_desde, fecha_hasta]),

      pool.query(`
        SELECT categoria, COALESCE(SUM(monto), 0) AS monto
        FROM gastos_fijos
        WHERE cliente_id = $1 AND activo = true
          AND (mes IS NULL OR mes = $2)
          AND (anio IS NULL OR anio = $3)
        GROUP BY categoria ORDER BY monto DESC
      `, [cliente_id, mes, anio]),

      pool.query(`
        SELECT categoria, COALESCE(SUM(monto), 0) AS monto
        FROM gastos_variables
        WHERE cliente_id = $1 AND fecha BETWEEN $2 AND $3
        GROUP BY categoria ORDER BY monto DESC
      `, [cliente_id, fecha_desde, fecha_hasta]),
    ]);

    const fijos_mes         = n(fijosQ.rows[0].total);
    const variables_periodo = n(varQ.rows[0].total);

    // Merge categorías
    const catMap = {};
    for (const r of catFijosQ.rows)  catMap[r.categoria] = (catMap[r.categoria] || 0) + n(r.monto);
    for (const r of catVarQ.rows)    catMap[r.categoria] = (catMap[r.categoria] || 0) + n(r.monto);
    const por_categoria = Object.entries(catMap)
      .map(([categoria, monto]) => ({ categoria, monto }))
      .sort((a, b) => b.monto - a.monto);

    res.json({
      fijos_mes,
      variables_periodo,
      total_egresos: fijos_mes + variables_periodo,
      por_categoria,
    });
  } catch (err) {
    console.error('GET resumen gastos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
