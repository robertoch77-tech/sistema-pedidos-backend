const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { verificarCualquierToken } = require('./authMiddleware');

router.use(verificarCualquierToken);

// ─── GET /:cid/pedidos ────────────────────────────────────────
router.get('/:cid/pedidos', async (req, res) => {
  try {
    const { cid } = req.params;
    const { estado, page = 1, limit = 20 } = req.query;
    const params = [cid];
    const where  = ['cliente_id = $1'];
    let   i      = 2;

    if (estado) { where.push(`estado = $${i}`); params.push(estado); i++; }

    const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
    const sql = `
      SELECT id, numero, comprador_nombre, comprador_telefono,
             comprador_email, total, estado, creado_en
      FROM catalogo_pedidos
      WHERE ${where.join(' AND ')}
      ORDER BY creado_en DESC
      LIMIT ${Number(limit)} OFFSET ${offset}
    `;
    const countSql = `SELECT COUNT(*)::int AS total FROM catalogo_pedidos WHERE ${where.join(' AND ')}`;

    const [data, count] = await Promise.all([
      pool.query(sql, params),
      pool.query(countSql, params),
    ]);
    res.json({ pedidos: data.rows, total: count.rows[0].total });
  } catch (err) {
    console.error('superadmin/catalogo pedidos error:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ─── GET /:cid/pedidos/:id ────────────────────────────────────
router.get('/:cid/pedidos/:id', async (req, res) => {
  try {
    const { cid, id } = req.params;
    const r = await pool.query(
      `SELECT * FROM catalogo_pedidos WHERE id = $1 AND cliente_id = $2`,
      [id, cid]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('superadmin/catalogo pedido/:id error:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ─── PUT /:cid/pedidos/:id/estado ────────────────────────────
router.put('/:cid/pedidos/:id/estado', async (req, res) => {
  try {
    const { cid, id } = req.params;
    const { estado } = req.body;
    const ESTADOS = ['nuevo', 'visto', 'en_proceso', 'entregado', 'cancelado'];
    if (!ESTADOS.includes(estado)) {
      return res.status(400).json({ error: `Estado inválido. Opciones: ${ESTADOS.join(', ')}` });
    }
    const r = await pool.query(
      `UPDATE catalogo_pedidos SET estado = $1 WHERE id = $2 AND cliente_id = $3 RETURNING id`,
      [estado, id, cid]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json({ ok: true, estado });
  } catch (err) {
    console.error('superadmin/catalogo estado error:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ─── GET /:cid/config ─────────────────────────────────────────
router.get('/:cid/config', async (req, res) => {
  try {
    const { cid } = req.params;
    const r = await pool.query(
      `SELECT * FROM catalogo_config WHERE cliente_id = $1`,
      [cid]
    );
    if (!r.rows[0]) {
      return res.json({
        cliente_id:    Number(cid),
        tipo:          'productos',
        activo:        false,
        mostrar_stock: 'disponibilidad',
        whatsapp:      '',
        banners:       [],
        modo_catalogo: 'todos',
      });
    }
    res.json({ ...r.rows[0], modo_catalogo: r.rows[0].modo_catalogo || 'todos' });
  } catch (err) {
    console.error('superadmin/catalogo config GET error:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ─── PUT /:cid/config ─────────────────────────────────────────
router.put('/:cid/config', async (req, res) => {
  try {
    const { cid } = req.params;
    const { tipo, activo, mostrar_stock, whatsapp, banners,
            texto_bienvenida, mensaje_cierre, modo_catalogo } = req.body;

    await pool.query(`
      ALTER TABLE catalogo_config
        ADD COLUMN IF NOT EXISTS texto_bienvenida TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS mensaje_cierre   TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS modo_catalogo    TEXT DEFAULT 'todos'
    `);

    const r = await pool.query(
      `INSERT INTO catalogo_config
         (cliente_id, tipo, activo, mostrar_stock, whatsapp, banners,
          texto_bienvenida, mensaje_cierre, modo_catalogo, modificado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
       ON CONFLICT (cliente_id) DO UPDATE SET
         tipo              = EXCLUDED.tipo,
         activo            = EXCLUDED.activo,
         mostrar_stock     = EXCLUDED.mostrar_stock,
         whatsapp          = EXCLUDED.whatsapp,
         banners           = EXCLUDED.banners,
         texto_bienvenida  = EXCLUDED.texto_bienvenida,
         mensaje_cierre    = EXCLUDED.mensaje_cierre,
         modo_catalogo     = EXCLUDED.modo_catalogo,
         modificado_en     = now()
       RETURNING *`,
      [cid, tipo || 'productos', !!activo,
       mostrar_stock || 'disponibilidad',
       whatsapp || '',
       JSON.stringify(banners || []),
       texto_bienvenida || '',
       mensaje_cierre || '',
       modo_catalogo || 'todos']
    );
    res.json({ ok: true, config: r.rows[0] });
  } catch (err) {
    console.error('superadmin/catalogo config PUT error:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ─── PUT /:cid/productos/:prod_id/destacado ───────────────────
router.put('/:cid/productos/:prod_id/destacado', async (req, res) => {
  try {
    const { cid, prod_id } = req.params;
    const r = await pool.query(
      `UPDATE productos_propios
       SET destacado = NOT COALESCE(destacado, false)
       WHERE id = $1 AND cliente_id = $2
       RETURNING id, destacado`,
      [prod_id, cid]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ ok: true, id: r.rows[0].id, destacado: r.rows[0].destacado });
  } catch (err) {
    console.error('superadmin/catalogo destacado producto error:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ─── PUT /:cid/autos/:auto_id/destacado ──────────────────────
router.put('/:cid/autos/:auto_id/destacado', async (req, res) => {
  try {
    const { cid, auto_id } = req.params;
    const r = await pool.query(
      `UPDATE vehiculos
       SET destacado = NOT COALESCE(destacado, false)
       WHERE id = $1 AND cliente_id = $2
       RETURNING id, destacado`,
      [auto_id, cid]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Auto no encontrado' });
    res.json({ ok: true, id: r.rows[0].id, destacado: r.rows[0].destacado });
  } catch (err) {
    console.error('superadmin/catalogo destacado auto error:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
