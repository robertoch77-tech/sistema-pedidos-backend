const express = require('express');
const router  = express.Router();
const pool    = require('../../db');

// ── Auth middleware ───────────────────────────────────────────
function autenticar(req, res, next) {
  const token = req.headers['x-pi-token'];
  if (!token || !token.startsWith('pi_')) return res.status(401).json({ error: 'No autorizado' });
  next();
}
router.use(autenticar);

// ── GET / — listado con filtros y paginación ─────────────────
router.get('/', async (req, res) => {
  try {
    const { buscar, cliente_id, estado, fecha_desde, fecha_hasta, page = 1, limit = 25 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const params = [];
    const where  = [];

    if (buscar) {
      params.push(`%${buscar}%`);
      where.push(`(p.numero_completo ILIKE $${params.length} OR p.cliente_nombre ILIKE $${params.length})`);
    }
    if (cliente_id) { params.push(cliente_id); where.push(`p.cliente_id = $${params.length}`); }
    if (estado)     { params.push(estado);      where.push(`p.estado = $${params.length}`); }
    if (fecha_desde){ params.push(fecha_desde); where.push(`p.fecha_pedido >= $${params.length}`); }
    if (fecha_hasta){ params.push(fecha_hasta); where.push(`p.fecha_pedido <= $${params.length}::date + 1`); }

    const wSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const rTotal = await pool.query(`SELECT COUNT(*) FROM pi_pedidos p ${wSql}`, params);
    const total  = parseInt(rTotal.rows[0].count, 10);

    params.push(Number(limit)); params.push(offset);
    const rRows = await pool.query(
      `SELECT p.id, p.numero_completo, p.fecha_pedido, p.cliente_nombre,
              p.cliente_id, p.total_items, p.estado,
              COALESCE(p.origen, 'manual') AS origen,
              p.creado_en
       FROM pi_pedidos p ${wSql}
       ORDER BY p.creado_en DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`, params
    );

    // Stats para cards
    const hoy = new Date().toISOString().slice(0, 10);
    const rStats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE fecha_pedido::date = $1)                          AS hoy,
        COUNT(*) FILTER (WHERE estado = 'confirmado')                            AS pendientes,
        COUNT(*) FILTER (WHERE estado = 'preparando')                            AS preparando,
        COUNT(*) FILTER (WHERE estado = 'facturado' AND fecha_pedido::date = $1) AS facturados_hoy
      FROM pi_pedidos`, [hoy]
    );

    res.json({
      ok: true,
      pedidos: rRows.rows,
      total,
      pagina: Number(page),
      paginas: Math.ceil(total / Number(limit)),
      stats: rStats.rows[0],
    });
  } catch (err) {
    console.error('GET /pedidos', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /:id/estado ──────────────────────────────────────────
router.put('/:id/estado', async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    const ESTADOS = ['confirmado', 'preparando', 'facturado', 'anulado'];
    if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
    await pool.query(`UPDATE pi_pedidos SET estado = $1 WHERE id = $2`, [estado, id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /pedidos/:id/estado', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /:id/item/:item_id/checklist ─────────────────────────
router.put('/:id/item/:item_id/checklist', async (req, res) => {
  try {
    const { item_id } = req.params;
    const { preparado, facturado } = req.body;
    await pool.query(
      `UPDATE pi_pedidos_items SET preparado = $1, facturado = $2 WHERE id = $3`,
      [!!preparado, !!facturado, item_id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /pedidos/item/checklist', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:id — pedido completo con items ─────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const rPed = await pool.query(
      `SELECT id, numero_completo, fecha_pedido, cliente_nombre, cliente_id,
              total_items, estado
       FROM pi_pedidos WHERE id = $1`, [id]
    );
    if (!rPed.rows.length) return res.status(404).json({ error: 'Pedido no encontrado' });

    const pedido = rPed.rows[0];
    // cliente_numero desde numero_completo u otro campo
    pedido.cliente_numero = null;

    const rItems = await pool.query(
      `SELECT codigo, descripcion, cantidad, rubro, orden,
              COALESCE(preparado, false) AS preparado,
              COALESCE(facturado, false) AS facturado
       FROM pi_pedidos_items
       WHERE pedido_id = $1
       ORDER BY rubro ASC NULLS LAST, descripcion ASC`, [id]
    );

    const ITEMS_POR_HOJA = 30;
    const totalHojas = Math.ceil((rItems.rows.length || 1) / ITEMS_POR_HOJA);

    res.json({
      ok: true,
      pedido: { ...pedido, total_hojas: totalHojas },
      items:  rItems.rows,
    });
  } catch (err) {
    console.error('GET /pedidos/:id', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:id/pdf — HTML listo para imprimir ──────────────────
router.get('/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const rPed = await pool.query(
      `SELECT id, numero_completo, fecha_pedido, cliente_nombre, total_items, estado FROM pi_pedidos WHERE id = $1`, [id]
    );
    if (!rPed.rows.length) return res.status(404).send('Pedido no encontrado');

    const pedido = rPed.rows[0];
    const rItems = await pool.query(
      `SELECT codigo, descripcion, cantidad, rubro FROM pi_pedidos_items
       WHERE pedido_id = $1 ORDER BY rubro ASC NULLS LAST, descripcion ASC`, [id]
    );

    // Config empresa
    let config = {};
    try {
      const rCfg = await pool.query(`SELECT * FROM pi_config LIMIT 1`);
      if (rCfg.rows.length) config = rCfg.rows[0];
    } catch { /* sin config extendida */ }

    const items = rItems.rows;
    const ITEMS_POR_HOJA = 30;
    const totalHojas = Math.ceil((items.length || 1) / ITEMS_POR_HOJA);
    const fecha = pedido.fecha_pedido
      ? new Date(pedido.fecha_pedido).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const membrete = `
      <div class="membrete">
        <div class="empresa-nombre">${config.empresa_nombre || 'DISTRIBUIDORA'}</div>
        <div class="empresa-datos">
          ${config.empresa_direccion ? config.empresa_direccion + ' · ' : ''}
          ${config.empresa_telefono  ? 'Tel: ' + config.empresa_telefono + ' · ' : ''}
          ${config.empresa_email     || ''}
        </div>
        <hr class="sep"/>
      </div>`;

    let hojas = '';
    for (let h = 0; h < totalHojas; h++) {
      const slice = items.slice(h * ITEMS_POR_HOJA, (h + 1) * ITEMS_POR_HOJA);
      let lastRubro = null; let altRow = false;
      let filas = '';
      for (const it of slice) {
        if (it.rubro !== lastRubro) {
          if (lastRubro !== null) filas += `</tbody></table>`;
          filas += `<div class="rubro-titulo">${it.rubro || 'SIN RUBRO'}</div>
            <table><thead><tr><th class="col-cod">Código</th><th class="col-p">P</th><th class="col-f">F</th><th class="col-cant">Cant.</th><th class="col-desc">Descripción</th></tr></thead><tbody>`;
          lastRubro = it.rubro; altRow = false;
        }
        const bg = altRow ? '#F0F0F0' : '#FFFFFF';
        filas += `<tr style="background:${bg}">
          <td class="col-cod">${it.codigo || ''}</td>
          <td class="col-p"><span class="checkbox"></span></td>
          <td class="col-f"><span class="checkbox"></span></td>
          <td class="col-cant">${it.cantidad}</td>
          <td class="col-desc">${it.descripcion}</td>
        </tr>`;
        altRow = !altRow;
      }
      if (lastRubro !== null) filas += `</tbody></table>`;

      hojas += `<div class="hoja${h < totalHojas - 1 ? ' page-break' : ''}">
        ${membrete}
        <div class="encabezado-row">
          <div>
            <span class="nro-pedido">NOTA DE PEDIDO</span>
            <span class="nro-numero">N° ${pedido.numero_completo}</span>
          </div>
          <div class="pag">Página ${h + 1} de ${totalHojas}</div>
        </div>
        <div class="fecha-cli">
          <span>Fecha: ${fecha}</span>
          <span>Cliente: ${pedido.cliente_nombre || '—'}</span>
        </div>
        ${filas}
        <div class="pie">
          <div class="linea-punt"></div>
          <div class="pie-campos">
            <span>Preparó: ________________________</span>
            <span>Observaciones: _______________________________</span>
          </div>
        </div>
      </div>`;
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${pedido.numero_completo}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; margin: 0; padding: 0; }
        @page { size: A4; margin: 1cm; }
        .hoja { padding: 0; }
        .page-break { page-break-after: always; }
        .membrete { margin-bottom: 6px; }
        .empresa-nombre { font-size: 13pt; font-weight: bold; }
        .empresa-datos { font-size: 8pt; color: #555; }
        .sep { border: none; border-top: 1px solid #999; margin: 4px 0; }
        .encabezado-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
        .nro-pedido { font-size: 11pt; font-weight: bold; }
        .nro-numero { font-size: 11pt; font-weight: bold; margin-left: 12px; color: #1B2A4A; }
        .pag { font-size: 8pt; color: #555; }
        .fecha-cli { display: flex; gap: 24px; font-size: 9pt; margin-bottom: 8px; }
        .rubro-titulo { font-weight: bold; font-size: 9pt; background: #1B2A4A; color: #fff; padding: 3px 6px; margin-top: 8px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
        th { background: #EEE; font-size: 8pt; padding: 3px 5px; border: 1px solid #CCC; text-align: left; }
        td { font-size: 9pt; padding: 2px 5px; border: 1px solid #DDD; }
        .col-cod  { width: 70px; }
        .col-p, .col-f { width: 20px; text-align: center; }
        .col-cant { width: 40px; text-align: center; }
        .col-desc { }
        .checkbox { display: inline-block; width: 12px; height: 12px; border: 1px solid #555; }
        .pie { margin-top: 16px; }
        .linea-punt { border-top: 1px dashed #999; margin-bottom: 8px; }
        .pie-campos { display: flex; justify-content: space-between; font-size: 9pt; }
      </style></head><body>${hojas}</body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('GET /pedidos/:id/pdf', err.message);
    res.status(500).send('Error: ' + err.message);
  }
});

module.exports = router;
