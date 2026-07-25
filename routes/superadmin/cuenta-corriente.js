const express = require('express');
const router  = express.Router();
const pool    = require('../../db');
const { verificarTokenSuperAdmin } = require('./auth');

// ─── TABLAS ───────────────────────────────────────────────────
async function asegurarTablas() {
  try {
    // Cobranzas de clientes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cobranzas (
        id                  BIGSERIAL PRIMARY KEY,
        cliente_id          BIGINT NOT NULL,
        cuenta_corriente_id BIGINT NOT NULL,
        numero              TEXT DEFAULT '',
        fecha               DATE NOT NULL DEFAULT CURRENT_DATE,
        total_cobrado        NUMERIC NOT NULL DEFAULT 0,
        observaciones       TEXT DEFAULT '',
        usuario             TEXT DEFAULT '',
        creado_en           TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cobranzas_items (
        id            BIGSERIAL PRIMARY KEY,
        cobranza_id   BIGINT NOT NULL,
        tipo          TEXT NOT NULL,
        monto         NUMERIC NOT NULL DEFAULT 0,
        referencia    TEXT DEFAULT '',
        medio_pago_id BIGINT,
        cheque_datos  JSONB,
        creado_en     TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    // Cartas de pago a proveedores
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cartas_pago (
        id           BIGSERIAL PRIMARY KEY,
        cliente_id   BIGINT NOT NULL,
        proveedor_id BIGINT NOT NULL,
        numero       TEXT DEFAULT '',
        fecha        DATE NOT NULL DEFAULT CURRENT_DATE,
        total_pagado  NUMERIC NOT NULL DEFAULT 0,
        observaciones TEXT DEFAULT '',
        usuario      TEXT DEFAULT '',
        creado_en    TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cartas_pago_items (
        id             BIGSERIAL PRIMARY KEY,
        carta_pago_id  BIGINT NOT NULL,
        tipo           TEXT NOT NULL,
        monto          NUMERIC NOT NULL DEFAULT 0,
        referencia     TEXT DEFAULT '',
        medio_pago_id  BIGINT,
        cheque_datos   JSONB,
        creado_en      TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    // Cheques (cartera)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cheques (
        id                BIGSERIAL PRIMARY KEY,
        cliente_id        BIGINT NOT NULL,
        numero            TEXT DEFAULT '',
        banco             TEXT DEFAULT '',
        titular           TEXT DEFAULT '',
        cuit_titular      TEXT DEFAULT '',
        monto             NUMERIC NOT NULL DEFAULT 0,
        fecha_cobro       DATE,
        tipo              TEXT DEFAULT 'propio',
        estado            TEXT DEFAULT 'en_cartera',
        origen            TEXT DEFAULT '',
        origen_id         BIGINT,
        cliente_proveedor TEXT DEFAULT '',
        observaciones     TEXT DEFAULT '',
        creado_en         TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    const chequeCols = [
      ['cuit_titular',      "TEXT DEFAULT ''"],
      ['origen',            "TEXT DEFAULT ''"],
      ['origen_id',         'BIGINT'],
      ['cliente_proveedor', "TEXT DEFAULT ''"],
      ['observaciones',     "TEXT DEFAULT ''"],
    ];
    for (const [col, tipo] of chequeCols) {
      await pool.query(`ALTER TABLE cheques ADD COLUMN IF NOT EXISTS ${col} ${tipo}`).catch(() => {});
    }
  } catch (err) {
    console.error('cuenta-corriente: error asegurando tablas:', err.message);
  }
}
asegurarTablas();

router.use(verificarTokenSuperAdmin);

// ─── HELPER numérico ─────────────────────────────────────────
function n(v) { return parseFloat(v) || 0; }

// ─── GET /resumen/:cliente_id ─────────────────────────────────
router.get('/resumen/:cliente_id', async (req, res) => {
  try {
    const { cliente_id } = req.params;

    const [cliDeuda, cliVenc, cliCobros, provDeuda, provVenc, provPagos] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(saldo),0) AS total, COUNT(*) FILTER (WHERE saldo>0) AS con_deuda
                  FROM cuentas_corrientes_clientes WHERE cliente_id=$1 AND activo=true`, [cliente_id]),
      pool.query(`SELECT COALESCE(SUM(saldo_vencido),0) AS total FROM cuentas_corrientes_clientes
                  WHERE cliente_id=$1 AND activo=true`, [cliente_id]),
      pool.query(`SELECT COALESCE(SUM(haber),0) AS total FROM movimientos_cuentas_corrientes
                  WHERE cliente_id=$1 AND tipo='cobro'
                  AND DATE_TRUNC('month',creado_en)=DATE_TRUNC('month',NOW())`, [cliente_id]),
      pool.query(`SELECT COALESCE(SUM(saldo_actual),0) AS total, COUNT(*) FILTER (WHERE saldo_actual>0) AS con_deuda
                  FROM proveedores WHERE cliente_id=$1 AND activo=true`, [cliente_id]),
      pool.query(`SELECT COALESCE(SUM(saldo_vencido),0) AS total FROM proveedores
                  WHERE cliente_id=$1 AND activo=true`, [cliente_id]),
      pool.query(`SELECT COALESCE(SUM(haber),0) AS total FROM cuentas_corrientes_proveedores_movimientos
                  WHERE cliente_id=$1 AND tipo='pago'
                  AND DATE_TRUNC('month',creado_en)=DATE_TRUNC('month',NOW())`, [cliente_id]),
    ]);

    res.json({
      clientes: {
        total_deuda:         n(cliDeuda.rows[0].total),
        deuda_vencida:       n(cliVenc.rows[0].total),
        clientes_con_deuda:  parseInt(cliDeuda.rows[0].con_deuda, 10),
        cobros_mes:          n(cliCobros.rows[0].total),
      },
      proveedores: {
        total_deuda:            n(provDeuda.rows[0].total),
        deuda_vencida:          n(provVenc.rows[0].total),
        proveedores_con_deuda:  parseInt(provDeuda.rows[0].con_deuda, 10),
        pagos_mes:              n(provPagos.rows[0].total),
      },
    });
  } catch (err) {
    console.error('CC resumen:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /clientes/:cliente_id ────────────────────────────────
router.get('/clientes/:cliente_id', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const { buscar, con_deuda, vencida, fecha_desde, fecha_hasta,
            page = 1, limit = 25 } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conds  = ['c.cliente_id=$1', 'c.activo=true'];
    const params = [cliente_id];

    if (buscar) {
      params.push(`%${buscar}%`);
      conds.push(`(c.comprador_nombre ILIKE $${params.length} OR c.comprador_cuit ILIKE $${params.length} OR c.comprador_razon_social ILIKE $${params.length})`);
    }
    if (con_deuda === 'true')  conds.push('c.saldo > 0');
    if (con_deuda === 'false') conds.push('c.saldo <= 0');
    if (vencida   === 'true')  conds.push('c.saldo_vencido > 0');

    const where = conds.join(' AND ');

    const [rows, tot] = await Promise.all([
      pool.query(
        `SELECT c.id, c.comprador_nombre, c.comprador_cuit, c.comprador_razon_social,
                c.saldo AS saldo_actual, c.saldo_vencido,
                (SELECT MAX(creado_en) FROM movimientos_cuentas_corrientes
                 WHERE cuenta_corriente_id=c.id) AS ultimo_movimiento,
                (SELECT MIN(fecha_vencimiento) FROM movimientos_cuentas_corrientes
                 WHERE cuenta_corriente_id=c.id AND estado='pendiente'
                   AND fecha_vencimiento >= CURRENT_DATE) AS proximo_vencimiento,
                c.limite_credito, c.plazo_pago_dias, c.bloqueado,
                c.comprador_whatsapp, c.comprador_telefono, c.comprador_email
         FROM cuentas_corrientes_clientes c
         WHERE ${where}
         ORDER BY c.saldo DESC, c.comprador_nombre
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limit), offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM cuentas_corrientes_clientes c WHERE ${where}`,
        params
      ),
    ]);

    res.json({ data: rows.rows, total: parseInt(tot.rows[0].count, 10), pagina: parseInt(page) });
  } catch (err) {
    console.error('CC GET clientes:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /proveedores/:cliente_id ─────────────────────────────
router.get('/proveedores/:cliente_id', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const { buscar, con_deuda, vencida,
            page = 1, limit = 25 } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conds  = ['p.cliente_id=$1', 'p.activo=true'];
    const params = [cliente_id];

    if (buscar) {
      params.push(`%${buscar}%`);
      conds.push(`(p.nombre ILIKE $${params.length} OR p.cuit ILIKE $${params.length} OR p.nombre_corto ILIKE $${params.length})`);
    }
    if (con_deuda === 'true')  conds.push('p.saldo_actual > 0');
    if (vencida   === 'true')  conds.push('p.saldo_vencido > 0');

    const where = conds.join(' AND ');

    const [rows, tot] = await Promise.all([
      pool.query(
        `SELECT p.id, p.nombre, p.cuit, p.nombre_corto,
                p.saldo_actual AS saldo_actual, p.saldo_vencido, p.moneda,
                p.plazo_pago_dias, p.whatsapp, p.telefono, p.email,
                (SELECT MAX(creado_en) FROM cuentas_corrientes_proveedores_movimientos
                 WHERE proveedor_id=p.id) AS ultimo_movimiento
         FROM proveedores p
         WHERE ${where}
         ORDER BY p.saldo_actual DESC, p.nombre
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limit), offset]
      ),
      pool.query(`SELECT COUNT(*) FROM proveedores p WHERE ${where}`, params),
    ]);

    res.json({ data: rows.rows, total: parseInt(tot.rows[0].count, 10), pagina: parseInt(page) });
  } catch (err) {
    console.error('CC GET proveedores:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /clientes/:cliente_id/:cuenta_id/movimientos ─────────
router.get('/clientes/:cliente_id/:cuenta_id/movimientos', async (req, res) => {
  try {
    const { cliente_id, cuenta_id } = req.params;
    const { fecha_desde, fecha_hasta, tipo, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conds  = ['m.cuenta_corriente_id=$1', 'm.cliente_id=$2'];
    const params = [cuenta_id, cliente_id];

    if (tipo)        { params.push(tipo);           conds.push(`m.tipo=$${params.length}`); }
    if (fecha_desde) { params.push(fecha_desde);    conds.push(`m.creado_en::date >= $${params.length}`); }
    if (fecha_hasta) { params.push(fecha_hasta);    conds.push(`m.creado_en::date <= $${params.length}`); }

    const where = conds.join(' AND ');

    const [movs, tot, cc] = await Promise.all([
      pool.query(
        `SELECT m.id, m.creado_en AS fecha, m.tipo, m.descripcion,
                m.numero_comprobante, m.debe, m.haber, m.saldo_acumulado AS saldo,
                m.fecha_vencimiento, m.estado, m.medio_pago, m.referencia
         FROM movimientos_cuentas_corrientes m
         WHERE ${where}
         ORDER BY m.creado_en, m.id
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limit), offset]
      ),
      pool.query(`SELECT COUNT(*) FROM movimientos_cuentas_corrientes m WHERE ${where}`, params),
      pool.query(
        `SELECT saldo AS saldo_actual, saldo_vencido, comprador_nombre, comprador_cuit,
                comprador_razon_social, comprador_whatsapp, comprador_telefono,
                limite_credito, plazo_pago_dias, bloqueado
         FROM cuentas_corrientes_clientes WHERE id=$1`, [cuenta_id]
      ),
    ]);

    res.json({
      movimientos: movs.rows,
      saldo_actual:  n(cc.rows[0]?.saldo_actual ?? 0),
      saldo_vencido: n(cc.rows[0]?.saldo_vencido ?? 0),
      datos_cuenta:  cc.rows[0] ?? {},
      total:   parseInt(tot.rows[0].count, 10),
      pagina:  parseInt(page),
    });
  } catch (err) {
    console.error('CC movimientos cliente:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /proveedores/:cliente_id/:proveedor_id/movimientos ───
router.get('/proveedores/:cliente_id/:proveedor_id/movimientos', async (req, res) => {
  try {
    const { cliente_id, proveedor_id } = req.params;
    const { fecha_desde, fecha_hasta, tipo, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conds  = ['m.proveedor_id=$1', 'm.cliente_id=$2'];
    const params = [proveedor_id, cliente_id];

    if (tipo)        { params.push(tipo);        conds.push(`m.tipo=$${params.length}`); }
    if (fecha_desde) { params.push(fecha_desde); conds.push(`m.creado_en::date >= $${params.length}`); }
    if (fecha_hasta) { params.push(fecha_hasta); conds.push(`m.creado_en::date <= $${params.length}`); }

    const where = conds.join(' AND ');

    const [movs, tot, prov] = await Promise.all([
      pool.query(
        `SELECT m.id, m.creado_en AS fecha, m.tipo, m.descripcion,
                m.numero_comprobante, m.debe, m.haber, m.saldo_acumulado AS saldo,
                m.fecha_vencimiento, m.estado
         FROM cuentas_corrientes_proveedores_movimientos m
         WHERE ${where}
         ORDER BY m.creado_en, m.id
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limit), offset]
      ),
      pool.query(`SELECT COUNT(*) FROM cuentas_corrientes_proveedores_movimientos m WHERE ${where}`, params),
      pool.query(
        `SELECT saldo_actual, saldo_vencido, nombre, cuit,
                whatsapp, telefono, moneda, plazo_pago_dias
         FROM proveedores WHERE id=$1`, [proveedor_id]
      ),
    ]);

    res.json({
      movimientos: movs.rows,
      saldo_actual:  n(prov.rows[0]?.saldo_actual ?? 0),
      saldo_vencido: n(prov.rows[0]?.saldo_vencido ?? 0),
      datos_cuenta:  prov.rows[0] ?? {},
      total:   parseInt(tot.rows[0].count, 10),
      pagina:  parseInt(page),
    });
  } catch (err) {
    console.error('CC movimientos proveedor:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /clientes/:cliente_id/cobro ─────────────────────────
router.post('/clientes/:cliente_id/cobro', async (req, res) => {
  const client = await pool.connect();
  try {
    const { cliente_id } = req.params;
    const { cuenta_corriente_id, monto_total, fecha, medios_pago = [], cancela = [], observaciones } = req.body;

    if (!cuenta_corriente_id || !monto_total) return res.status(400).json({ error: 'Faltan datos requeridos' });

    await client.query('BEGIN');

    // Número de cobranza
    const numRes = await client.query(
      `SELECT COUNT(*)+1 AS num FROM cobranzas WHERE cliente_id=$1`, [cliente_id]
    );
    const numero = `COB-${String(numRes.rows[0].num).padStart(6, '0')}`;

    // INSERT cobranza
    const cobRes = await client.query(
      `INSERT INTO cobranzas (cliente_id, cuenta_corriente_id, numero, fecha, total_cobrado, observaciones)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [cliente_id, cuenta_corriente_id, numero, fecha || new Date().toISOString().slice(0,10), n(monto_total), observaciones || '']
    );
    const cobranza_id = cobRes.rows[0].id;

    // INSERT items
    for (const item of medios_pago) {
      await client.query(
        `INSERT INTO cobranzas_items (cobranza_id, tipo, monto, referencia, medio_pago_id, cheque_datos)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [cobranza_id, item.tipo, n(item.monto), item.referencia || '', item.medio_pago_id || null,
         item.cheque_datos ? JSON.stringify(item.cheque_datos) : null]
      );

      // Si es cheque → registrar en tabla cheques
      if ((item.tipo === 'cheque_propio' || item.tipo === 'cheque_tercero' || item.tipo === 'echeq') && item.cheque_datos) {
        const ch = item.cheque_datos;
        await client.query(
          `INSERT INTO cheques (cliente_id, numero, banco, titular_nombre, titular_cuit, monto, fecha_cobro,
            tipo, estado, origen, origen_id, cliente_proveedor)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'en_cartera','cobranza',$9,$10)`,
          [cliente_id, ch.numero || '', ch.banco || '', ch.titular || '', ch.cuit_titular || '',
           n(item.monto), ch.fecha_cobro || null,
           item.tipo === 'cheque_propio' ? 'propio' : item.tipo === 'echeq' ? 'echeq' : 'tercero',
           cobranza_id,
           (await client.query(`SELECT comprador_nombre FROM cuentas_corrientes_clientes WHERE id=$1`, [cuenta_corriente_id])).rows[0]?.comprador_nombre || '']
        );
      }
    }

    // Saldo actual antes del cobro
    const ccRes = await client.query(
      `SELECT saldo FROM cuentas_corrientes_clientes WHERE id=$1 FOR UPDATE`, [cuenta_corriente_id]
    );
    const saldoAnterior = n(ccRes.rows[0]?.saldo ?? 0);
    const saldoNuevo    = saldoAnterior - n(monto_total);

    // INSERT movimiento tipo=cobro
    await client.query(
      `INSERT INTO movimientos_cuentas_corrientes
         (cuenta_corriente_id, cliente_id, tipo, haber, saldo_acumulado, descripcion, numero_comprobante)
       VALUES ($1,$2,'cobro',$3,$4,$5,$6)`,
      [cuenta_corriente_id, cliente_id, n(monto_total), saldoNuevo,
       `Cobro ${numero}${observaciones ? ' - ' + observaciones : ''}`, numero]
    );

    // Recalcular saldo_vencido
    const vencRes = await client.query(
      `SELECT COALESCE(SUM(debe - haber), 0) AS sv
       FROM movimientos_cuentas_corrientes
       WHERE cuenta_corriente_id=$1 AND estado='pendiente'
         AND fecha_vencimiento IS NOT NULL AND fecha_vencimiento < CURRENT_DATE`,
      [cuenta_corriente_id]
    );
    const saldoVencido = Math.max(0, n(vencRes.rows[0].sv));

    // UPDATE saldo CC
    await client.query(
      `UPDATE cuentas_corrientes_clientes
       SET saldo=$1, saldo_vencido=$2, modificado_en=now()
       WHERE id=$3`,
      [saldoNuevo, saldoVencido, cuenta_corriente_id]
    );

    // Analytics (best-effort)
    await client.query(
      `INSERT INTO analytics_eventos (cliente_id, tipo, valor, metadata)
       VALUES ($1,'cobro',$2,$3)`,
      [cliente_id, n(monto_total), JSON.stringify({ cobranza_id, cuenta_corriente_id })]
    ).catch(() => {});

    await client.query('COMMIT');

    // Movimiento de caja (si hay caja abierta)
    try {
      const cajaRes = await pool.query(
        `SELECT id FROM cajas WHERE cliente_id=$1 AND estado='abierta' LIMIT 1`,
        [cliente_id]
      );
      if (cajaRes.rows.length > 0) {
        const caja_id = cajaRes.rows[0].id;
        const medio_pago_principal = medios_pago[0]?.tipo || 'efectivo';
        const compradorRes = await pool.query(
          `SELECT comprador_nombre FROM cuentas_corrientes_clientes WHERE id=$1`, [cuenta_corriente_id]
        );
        const comprador_nombre = compradorRes.rows[0]?.comprador_nombre || '';
        await pool.query(
          `INSERT INTO caja_movimientos
             (caja_id, cliente_id, tipo, tipo_operacion,
              monto, medio_pago, descripcion, numero_comprobante)
           VALUES ($1,$2,'cobro','ingreso',$3,$4,$5,$6)`,
          [caja_id, cliente_id, n(monto_total), medio_pago_principal,
           `Cobro cliente ${comprador_nombre}`, numero]
        );
        await pool.query(
          `UPDATE cajas
           SET total_ingresos = total_ingresos + $1,
               saldo_actual   = saldo_actual   + $1
           WHERE id=$2`,
          [n(monto_total), caja_id]
        );
      }
    } catch (err) {
      console.error('Error registrando cobro en caja:', err.message);
      // No hace rollback — el cobro se registra igual
    }

    res.json({ ok: true, cobranza_id, numero_completo: numero, saldo_nuevo: saldoNuevo });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('CC cobro:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── POST /proveedores/:cliente_id/pago ───────────────────────
router.post('/proveedores/:cliente_id/pago', async (req, res) => {
  const client = await pool.connect();
  try {
    const { cliente_id } = req.params;
    const { proveedor_id, monto_total, fecha, medios_pago = [], cancela = [], observaciones } = req.body;

    if (!proveedor_id || !monto_total) return res.status(400).json({ error: 'Faltan datos requeridos' });

    await client.query('BEGIN');

    const numRes = await client.query(
      `SELECT COUNT(*)+1 AS num FROM cartas_pago WHERE cliente_id=$1`, [cliente_id]
    );
    const numero = `CP-${String(numRes.rows[0].num).padStart(6, '0')}`;

    const cpRes = await client.query(
      `INSERT INTO cartas_pago (cliente_id, proveedor_id, numero, fecha, total_pagado, observaciones)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [cliente_id, proveedor_id, numero, fecha || new Date().toISOString().slice(0,10), n(monto_total), observaciones || '']
    );
    const carta_pago_id = cpRes.rows[0].id;

    const provNombreRes = await client.query(`SELECT nombre FROM proveedores WHERE id=$1`, [proveedor_id]);
    const provNombre = provNombreRes.rows[0]?.nombre || '';

    for (const item of medios_pago) {
      await client.query(
        `INSERT INTO cartas_pago_items (carta_pago_id, tipo, monto, referencia, medio_pago_id, cheque_datos)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [carta_pago_id, item.tipo, n(item.monto), item.referencia || '', item.medio_pago_id || null,
         item.cheque_datos ? JSON.stringify(item.cheque_datos) : null]
      );

      if ((item.tipo === 'cheque_propio' || item.tipo === 'cheque_tercero' || item.tipo === 'echeq') && item.cheque_datos) {
        const ch = item.cheque_datos;
        await client.query(
          `INSERT INTO cheques (cliente_id, numero, banco, titular_nombre, titular_cuit, monto, fecha_cobro,
            tipo, estado, origen, origen_id, cliente_proveedor)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'entregado','carta_pago',$9,$10)`,
          [cliente_id, ch.numero || '', ch.banco || '', ch.titular || '', ch.cuit_titular || '',
           n(item.monto), ch.fecha_cobro || null,
           item.tipo === 'cheque_propio' ? 'propio' : item.tipo === 'echeq' ? 'echeq' : 'tercero',
           carta_pago_id, provNombre]
        );
      }
    }

    // Saldo proveedor
    const provRes = await client.query(
      `SELECT saldo_actual FROM proveedores WHERE id=$1 FOR UPDATE`, [proveedor_id]
    );
    const saldoAnterior = n(provRes.rows[0]?.saldo_actual ?? 0);
    const saldoNuevo    = saldoAnterior - n(monto_total);

    // INSERT movimiento
    await client.query(
      `INSERT INTO cuentas_corrientes_proveedores_movimientos
         (proveedor_id, cliente_id, tipo, haber, saldo_acumulado, descripcion, numero_comprobante)
       VALUES ($1,$2,'pago',$3,$4,$5,$6)`,
      [proveedor_id, cliente_id, n(monto_total), saldoNuevo,
       `Pago ${numero}${observaciones ? ' - ' + observaciones : ''}`, numero]
    );

    // Recalc saldo_vencido
    const vencRes = await client.query(
      `SELECT COALESCE(SUM(debe - haber), 0) AS sv
       FROM cuentas_corrientes_proveedores_movimientos
       WHERE proveedor_id=$1 AND estado='pendiente'
         AND fecha_vencimiento IS NOT NULL AND fecha_vencimiento < CURRENT_DATE`,
      [proveedor_id]
    );
    const saldoVencido = Math.max(0, n(vencRes.rows[0].sv));

    await client.query(
      `UPDATE proveedores SET saldo_actual=$1, saldo_vencido=$2, modificado_en=now() WHERE id=$3`,
      [saldoNuevo, saldoVencido, proveedor_id]
    );

    await client.query(
      `INSERT INTO analytics_eventos (cliente_id, tipo, valor, metadata)
       VALUES ($1,'pago_proveedor',$2,$3)`,
      [cliente_id, n(monto_total), JSON.stringify({ carta_pago_id, proveedor_id })]
    ).catch(() => {});

    await client.query('COMMIT');
    res.json({ ok: true, carta_pago_id, numero_completo: numero, saldo_nuevo: saldoNuevo });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('CC pago:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── POST /clientes/:cliente_id/nota-credito ──────────────────
router.post('/clientes/:cliente_id/nota-credito', async (req, res) => {
  const client = await pool.connect();
  try {
    const { cliente_id } = req.params;
    const { cuenta_corriente_id, monto, descripcion, numero_comprobante } = req.body;
    if (!cuenta_corriente_id || !monto) return res.status(400).json({ error: 'Faltan datos' });

    await client.query('BEGIN');
    const ccRes = await client.query(
      `SELECT saldo FROM cuentas_corrientes_clientes WHERE id=$1 FOR UPDATE`, [cuenta_corriente_id]
    );
    const saldoNuevo = n(ccRes.rows[0]?.saldo ?? 0) - n(monto);

    await client.query(
      `INSERT INTO movimientos_cuentas_corrientes
         (cuenta_corriente_id, cliente_id, tipo, haber, saldo_acumulado, descripcion, numero_comprobante)
       VALUES ($1,$2,'nota_credito',$3,$4,$5,$6)`,
      [cuenta_corriente_id, cliente_id, n(monto), saldoNuevo, descripcion || 'Nota de crédito', numero_comprobante || '']
    );
    await client.query(
      `UPDATE cuentas_corrientes_clientes SET saldo=$1, modificado_en=now() WHERE id=$2`,
      [saldoNuevo, cuenta_corriente_id]
    );
    await client.query('COMMIT');
    res.json({ ok: true, saldo_nuevo: saldoNuevo });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('CC NC:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── POST /clientes/:cliente_id/nota-debito ───────────────────
router.post('/clientes/:cliente_id/nota-debito', async (req, res) => {
  const client = await pool.connect();
  try {
    const { cliente_id } = req.params;
    const { cuenta_corriente_id, monto, descripcion, numero_comprobante } = req.body;
    if (!cuenta_corriente_id || !monto) return res.status(400).json({ error: 'Faltan datos' });

    await client.query('BEGIN');
    const ccRes = await client.query(
      `SELECT saldo FROM cuentas_corrientes_clientes WHERE id=$1 FOR UPDATE`, [cuenta_corriente_id]
    );
    const saldoNuevo = n(ccRes.rows[0]?.saldo ?? 0) + n(monto);

    await client.query(
      `INSERT INTO movimientos_cuentas_corrientes
         (cuenta_corriente_id, cliente_id, tipo, debe, saldo_acumulado, descripcion, numero_comprobante)
       VALUES ($1,$2,'nota_debito',$3,$4,$5,$6)`,
      [cuenta_corriente_id, cliente_id, n(monto), saldoNuevo, descripcion || 'Nota de débito', numero_comprobante || '']
    );
    await client.query(
      `UPDATE cuentas_corrientes_clientes SET saldo=$1, modificado_en=now() WHERE id=$2`,
      [saldoNuevo, cuenta_corriente_id]
    );
    await client.query('COMMIT');
    res.json({ ok: true, saldo_nuevo: saldoNuevo });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('CC ND:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
