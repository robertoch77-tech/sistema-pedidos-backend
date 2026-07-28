const express  = require('express');
const router   = express.Router();
const pool     = require('../../db');
const { verificarCualquierToken } = require('./authMiddleware');
const multer   = require('multer');
const xlsx     = require('xlsx');

const upload = multer({ storage: multer.memoryStorage() });

// ── Asegurar tablas ───────────────────────────────────────────
async function asegurarTablas() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vehiculos (
        id                        BIGSERIAL PRIMARY KEY,
        cliente_id                BIGINT NOT NULL,
        marca                     TEXT DEFAULT '',
        modelo                    TEXT DEFAULT '',
        anio                      INT,
        version                   TEXT DEFAULT '',
        color                     TEXT DEFAULT '',
        patente                   TEXT DEFAULT '',
        vin                       TEXT DEFAULT '',
        km                        INT DEFAULT 0,
        tipo                      TEXT DEFAULT 'propio',
        estado                    TEXT DEFAULT 'disponible',
        precio_compra             NUMERIC DEFAULT 0,
        precio_venta              NUMERIC DEFAULT 0,
        precio_minimo_consignacion NUMERIC DEFAULT 0,
        valor_permuta             NUMERIC DEFAULT 0,
        consignante_nombre        TEXT DEFAULT '',
        consignante_cuit          TEXT DEFAULT '',
        consignante_telefono      TEXT DEFAULT '',
        fotos                     JSONB DEFAULT '[]',
        observaciones             TEXT DEFAULT '',
        publicar_catalogo         BOOLEAN DEFAULT false,
        creado_en                 TIMESTAMPTZ DEFAULT now(),
        modificado_en             TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ventas_autos (
        id                BIGSERIAL PRIMARY KEY,
        cliente_id        BIGINT NOT NULL,
        vehiculo_id       BIGINT NOT NULL,
        comprador_nombre  TEXT DEFAULT '',
        comprador_cuit    TEXT DEFAULT '',
        comprador_telefono TEXT DEFAULT '',
        precio_venta      NUMERIC DEFAULT 0,
        precio_costo      NUMERIC DEFAULT 0,
        ganancia          NUMERIC DEFAULT 0,
        dinero_transito   NUMERIC DEFAULT 0,
        forma_pago        TEXT DEFAULT 'efectivo',
        estado            TEXT DEFAULT 'completada',
        socio_id          BIGINT,
        comision_socio    NUMERIC DEFAULT 0,
        tipo_comision     TEXT DEFAULT 'porcentaje',
        observaciones     TEXT DEFAULT '',
        fecha             DATE DEFAULT CURRENT_DATE,
        creado_en         TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS socios_autos (
        id                BIGSERIAL PRIMARY KEY,
        cliente_id        BIGINT NOT NULL,
        nombre            TEXT NOT NULL,
        telefono          TEXT DEFAULT '',
        comision_default  NUMERIC DEFAULT 0,
        tipo_comision     TEXT DEFAULT 'porcentaje',
        activo            BOOLEAN DEFAULT true,
        creado_en         TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS liquidaciones_consignacion (
        id                  BIGSERIAL PRIMARY KEY,
        cliente_id          BIGINT NOT NULL,
        vehiculo_id         BIGINT NOT NULL,
        venta_auto_id       BIGINT,
        consignante_nombre  TEXT DEFAULT '',
        precio_venta        NUMERIC DEFAULT 0,
        precio_consignante  NUMERIC DEFAULT 0,
        comision            NUMERIC DEFAULT 0,
        estado              TEXT DEFAULT 'pendiente',
        fecha               DATE DEFAULT CURRENT_DATE,
        creado_en           TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    await pool.query(`ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS publicar_catalogo BOOLEAN DEFAULT false`).catch(() => {});

  } catch (err) {
    console.error('autos: error asegurando tablas:', err.message);
  }
}
asegurarTablas();

router.use(verificarCualquierToken);

function n(v) { return parseFloat(v) || 0; }

// ═══════════════════════════════════════════════════════════════
// GET /:cid/dashboard
// ═══════════════════════════════════════════════════════════════
router.get('/:cid/dashboard', async (req, res) => {
  try {
    const { cid } = req.params;
    const mesInicio = new Date();
    mesInicio.setDate(1);
    mesInicio.setHours(0, 0, 0, 0);

    const [estadosRes, ventasMesRes, transitoRes] = await Promise.all([
      pool.query(
        `SELECT estado, COUNT(*) AS total
         FROM vehiculos
         WHERE cliente_id = $1
         GROUP BY estado`,
        [cid]
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(ganancia), 0) AS ganancia_mes,
           COALESCE(SUM(comision_socio), 0) AS comisiones_socios_mes,
           COUNT(*) AS vendidos_mes
         FROM ventas_autos
         WHERE cliente_id = $1 AND creado_en >= $2`,
        [cid, mesInicio]
      ),
      pool.query(
        `SELECT COALESCE(SUM(precio_consignante), 0) AS dinero_transito
         FROM liquidaciones_consignacion
         WHERE cliente_id = $1 AND estado = 'pendiente'`,
        [cid]
      ),
    ]);

    const conteo = {};
    for (const row of estadosRes.rows) conteo[row.estado] = parseInt(row.total, 10);

    res.json({
      disponibles:    conteo.disponible  || 0,
      reservados:     conteo.reservado   || 0,
      vendidos_mes:   parseInt(ventasMesRes.rows[0].vendidos_mes, 10) || 0,
      ganancia_mes: n(ventasMesRes.rows[0].ganancia_mes),
      comisiones_socios_mes: n(ventasMesRes.rows[0].comisiones_socios_mes),
      dinero_transito: n(transitoRes.rows[0].dinero_transito),
    });
  } catch (err) {
    console.error('GET /autos/dashboard error:', err.message);
    res.status(500).json({ mensaje: 'Error al cargar dashboard', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /:cid/vehiculos — lista paginada con filtros
// ═══════════════════════════════════════════════════════════════
router.get('/:cid/vehiculos', async (req, res) => {
  try {
    const { cid } = req.params;
    const {
      buscar = '',
      estado,
      tipo,
      page  = '1',
      limit = '25',
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 25));
    const offset   = (pageNum - 1) * limitNum;

    const values = [cid];
    const where  = ['cliente_id = $1'];

    if (buscar.trim()) {
      values.push(`%${buscar.trim()}%`);
      const idx = values.length;
      where.push(`(marca ILIKE $${idx} OR modelo ILIKE $${idx} OR patente ILIKE $${idx})`);
    }
    if (estado) {
      values.push(estado);
      where.push(`estado = $${values.length}`);
    }
    if (tipo) {
      values.push(tipo);
      where.push(`tipo = $${values.length}`);
    }

    const whereStr = where.join(' AND ');

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT *
         FROM vehiculos
         WHERE ${whereStr}
         ORDER BY creado_en DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limitNum, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM vehiculos WHERE ${whereStr}`, values),
    ]);

    const total   = parseInt(countRes.rows[0].count, 10);
    const paginas = Math.max(1, Math.ceil(total / limitNum));

    res.json({
      vehiculos: dataRes.rows,
      total, pagina: pageNum, paginas, por_pagina: limitNum,
    });
  } catch (err) {
    console.error('GET /autos/vehiculos error:', err.message);
    res.status(500).json({ mensaje: 'Error al listar vehículos', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /:cid/vehiculos — crear vehículo
// ═══════════════════════════════════════════════════════════════
router.post('/:cid/vehiculos', async (req, res) => {
  try {
    const { cid } = req.params;
    const {
      marca = '', modelo = '', anio = null, version = '',
      color = '', patente = '', vin = '', km = 0,
      tipo = 'propio', estado = 'disponible',
      precio_compra = 0, precio_venta = 0,
      precio_minimo_consignacion = 0, valor_permuta = 0,
      consignante_nombre = '', consignante_cuit = '',
      consignante_telefono = '', fotos = [], observaciones = '',
    } = req.body;

    if (!marca.trim() || !modelo.trim()) {
      return res.status(400).json({ mensaje: 'Marca y modelo son requeridos' });
    }
    if (tipo === 'consignacion' && !consignante_nombre.trim()) {
      return res.status(400).json({ mensaje: 'El nombre del consignante es requerido' });
    }

    const result = await pool.query(
      `INSERT INTO vehiculos
         (cliente_id, marca, modelo, anio, version, color, patente, vin, km,
          tipo, estado, precio_compra, precio_venta,
          precio_minimo_consignacion, valor_permuta,
          consignante_nombre, consignante_cuit, consignante_telefono,
          fotos, observaciones, creado_en, modificado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,now(),now())
       RETURNING *`,
      [
        cid, marca, modelo, anio || null, version, color, patente, vin, n(km),
        tipo, estado, n(precio_compra), n(precio_venta),
        n(precio_minimo_consignacion), n(valor_permuta),
        consignante_nombre, consignante_cuit, consignante_telefono,
        JSON.stringify(fotos), observaciones,
      ]
    );

    res.json({ ok: true, vehiculo: result.rows[0] });
  } catch (err) {
    console.error('POST /autos/vehiculos error:', err.message);
    res.status(500).json({ mensaje: 'Error al crear vehículo', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PUT /:cid/vehiculos/:id — editar vehículo
// ═══════════════════════════════════════════════════════════════
router.put('/:cid/vehiculos/:id', async (req, res) => {
  try {
    const { cid, id } = req.params;
    const {
      marca, modelo, anio, version, color, patente, vin, km,
      tipo, precio_compra, precio_venta,
      precio_minimo_consignacion, valor_permuta,
      consignante_nombre, consignante_cuit, consignante_telefono,
      fotos, observaciones, publicar_catalogo,
    } = req.body;

    const result = await pool.query(
      `UPDATE vehiculos SET
         marca = COALESCE($3, marca),
         modelo = COALESCE($4, modelo),
         anio = COALESCE($5, anio),
         version = COALESCE($6, version),
         color = COALESCE($7, color),
         patente = COALESCE($8, patente),
         vin = COALESCE($9, vin),
         km = COALESCE($10, km),
         tipo = COALESCE($11, tipo),
         precio_compra = COALESCE($12, precio_compra),
         precio_venta = COALESCE($13, precio_venta),
         precio_minimo_consignacion = COALESCE($14, precio_minimo_consignacion),
         valor_permuta = COALESCE($15, valor_permuta),
         consignante_nombre = COALESCE($16, consignante_nombre),
         consignante_cuit = COALESCE($17, consignante_cuit),
         consignante_telefono = COALESCE($18, consignante_telefono),
         fotos = COALESCE($19::jsonb, fotos),
         observaciones = COALESCE($20, observaciones),
         publicar_catalogo = COALESCE($21, publicar_catalogo),
         modificado_en = now()
       WHERE id = $1 AND cliente_id = $2
       RETURNING *`,
      [
        id, cid,
        marca || null, modelo || null, anio || null, version || null,
        color || null, patente || null, vin || null,
        km != null ? n(km) : null, tipo || null,
        precio_compra != null ? n(precio_compra) : null,
        precio_venta  != null ? n(precio_venta)  : null,
        precio_minimo_consignacion != null ? n(precio_minimo_consignacion) : null,
        valor_permuta != null ? n(valor_permuta) : null,
        consignante_nombre || null, consignante_cuit || null,
        consignante_telefono || null,
        fotos ? JSON.stringify(fotos) : null,
        observaciones || null,
        publicar_catalogo != null ? publicar_catalogo : null,
      ]
    );

    if (!result.rows[0]) return res.status(404).json({ mensaje: 'Vehículo no encontrado' });
    res.json({ ok: true, vehiculo: result.rows[0] });
  } catch (err) {
    console.error('PUT /autos/vehiculos/:id error:', err.message);
    res.status(500).json({ mensaje: 'Error al actualizar vehículo', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PUT /:cid/vehiculos/:id/estado
// ═══════════════════════════════════════════════════════════════
router.put('/:cid/vehiculos/:id/estado', async (req, res) => {
  try {
    const { cid, id } = req.params;
    const { estado } = req.body;

    const ESTADOS = ['disponible', 'reservado', 'vendido'];
    if (!ESTADOS.includes(estado)) {
      return res.status(400).json({ mensaje: 'Estado inválido' });
    }

    const result = await pool.query(
      `UPDATE vehiculos SET estado = $1, modificado_en = now()
       WHERE id = $2 AND cliente_id = $3 RETURNING id`,
      [estado, id, cid]
    );

    if (!result.rows[0]) return res.status(404).json({ mensaje: 'Vehículo no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /autos/vehiculos/:id/estado error:', err.message);
    res.status(500).json({ mensaje: 'Error al cambiar estado', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /:cid/ventas — registrar venta
// ═══════════════════════════════════════════════════════════════
router.post('/:cid/ventas', async (req, res) => {
  const { cid } = req.params;
  const {
    vehiculo_id,
    comprador_nombre = '', comprador_cuit = '', comprador_telefono = '',
    precio_venta,
    forma_pago = 'efectivo',
    socio_id = null,
    comision_socio_manual = null,
    tipo_comision = 'porcentaje',
    observaciones = '',
    fecha,
  } = req.body;

  if (!vehiculo_id) return res.status(400).json({ mensaje: 'vehiculo_id requerido' });
  if (!n(precio_venta)) return res.status(400).json({ mensaje: 'precio_venta requerido' });

  try {
    // 1. Obtener datos del vehículo
    const vRes = await pool.query(
      `SELECT * FROM vehiculos WHERE id = $1 AND cliente_id = $2`,
      [vehiculo_id, cid]
    );
    if (!vRes.rows[0]) throw new Error('Vehículo no encontrado');
    const v = vRes.rows[0];

    const pv = n(precio_venta);

    // 2. Calcular ganancia y dinero en tránsito según tipo
    let precio_costo = 0;
    let ganancia     = 0;
    let dinero_transito = 0;

    if (v.tipo === 'propio') {
      precio_costo    = n(v.precio_compra);
      ganancia        = pv - precio_costo;
      dinero_transito = 0;
    } else if (v.tipo === 'consignacion') {
      precio_costo    = n(v.precio_minimo_consignacion);
      ganancia        = pv - precio_costo;
      dinero_transito = precio_costo;
    } else if (v.tipo === 'permuta') {
      precio_costo    = n(v.valor_permuta);
      ganancia        = pv - precio_costo;
      dinero_transito = 0;
    }

    // 3. Calcular comisión socio
    let comision_calc = 0;
    if (socio_id && comision_socio_manual != null) {
      if (tipo_comision === 'porcentaje') {
        comision_calc = ganancia * (n(comision_socio_manual) / 100);
      } else {
        comision_calc = n(comision_socio_manual);
      }
    }

    // 4. INSERT venta
    const ventaRes = await pool.query(
      `INSERT INTO ventas_autos
         (cliente_id, vehiculo_id, comprador_nombre, comprador_cuit,
          comprador_telefono, precio_venta, precio_costo, ganancia,
          dinero_transito, forma_pago, estado, socio_id,
          comision_socio, tipo_comision, observaciones, fecha, creado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'completada',$11,$12,$13,$14,$15,now())
       RETURNING id`,
      [
        cid, vehiculo_id,
        comprador_nombre, comprador_cuit, comprador_telefono,
        pv.toFixed(4), precio_costo.toFixed(4),
        ganancia.toFixed(4), dinero_transito.toFixed(4),
        forma_pago,
        socio_id || null,
        comision_calc.toFixed(4),
        tipo_comision,
        observaciones,
        fecha || new Date().toISOString().slice(0, 10),
      ]
    );
    const venta_id = ventaRes.rows[0].id;

    // 5. Marcar vehículo como vendido
    await pool.query(
      `UPDATE vehiculos SET estado = 'vendido', modificado_en = now() WHERE id = $1`,
      [vehiculo_id]
    );

    // 6. Si consignacion: crear liquidacion pendiente
    if (v.tipo === 'consignacion') {
      await pool.query(
        `INSERT INTO liquidaciones_consignacion
           (cliente_id, vehiculo_id, venta_auto_id, consignante_nombre,
            precio_venta, precio_consignante, comision, estado, fecha, creado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pendiente',$8,now())`,
        [
          cid, vehiculo_id, venta_id,
          v.consignante_nombre,
          pv.toFixed(4),
          dinero_transito.toFixed(4),
          ganancia.toFixed(4),
          fecha || new Date().toISOString().slice(0, 10),
        ]
      );
    }

    // 7. Bloque caja
    try {
      const cajaRes = await pool.query(
        `SELECT id FROM cajas WHERE cliente_id = $1 AND estado = 'abierta' LIMIT 1`,
        [cid]
      );
      if (cajaRes.rows.length > 0) {
        const caja_id = cajaRes.rows[0].id;
        const descAuto = `${v.marca} ${v.modelo}`.trim() || 'vehículo';

        await pool.query(
          `INSERT INTO caja_movimientos
             (caja_id, cliente_id, tipo, tipo_operacion, monto, descripcion)
           VALUES ($1,$2,'venta','ingreso',$3,$4)`,
          [caja_id, cid, pv, `Venta auto ${descAuto}`]
        );
        await pool.query(
          `UPDATE cajas
           SET total_ingresos = total_ingresos + $1,
               saldo_actual   = saldo_actual   + $1
           WHERE id = $2`,
          [pv, caja_id]
        );

        if (v.tipo === 'consignacion' && dinero_transito > 0) {
          await pool.query(
            `INSERT INTO caja_movimientos
               (caja_id, cliente_id, tipo, tipo_operacion, monto, descripcion)
             VALUES ($1,$2,'gasto','egreso',$3,$4)`,
            [caja_id, cid, dinero_transito,
              `Pendiente consignante ${v.consignante_nombre}`]
          );
          await pool.query(
            `UPDATE cajas
             SET total_egresos = total_egresos + $1,
                 saldo_actual  = saldo_actual  - $1
             WHERE id = $2`,
            [dinero_transito, caja_id]
          );
        }

        if (socio_id && comision_calc > 0 && cajaRes.rows.length > 0) {
          await pool.query(
            `INSERT INTO caja_movimientos
               (caja_id, cliente_id, tipo,
                tipo_operacion, monto, medio_pago,
                descripcion, venta_id)
             VALUES ($1,$2,'comision_socio',
                     'egreso_pendiente',$3,
                     'pendiente',$4,$5)`,
            [
              caja_id,
              cid,
              comision_calc,
              `Comisión socio - venta ${v.marca} ${v.modelo} ${v.anio}`,
              venta_id
            ]
          );
        }
      }
    } catch (err) {
      console.error('Error registrando venta auto en caja:', err.message);
    }

    // ── Bloque CC clientes — fuera de la transacción ─────────
    try {
      const { medios_pago } = req.body;
      const total_pagado = Array.isArray(medios_pago)
        ? medios_pago.reduce((s, m) => s + (parseFloat(m.monto) || 0), 0)
        : pv;
      const saldo_pendiente = Math.max(0, pv - total_pagado);

      // 1. Buscar o crear CC del comprador
      let cc_id;
      const ccExiste = await pool.query(
        `SELECT id FROM cuentas_corrientes_clientes
         WHERE cliente_id = $1 AND comprador_nombre = $2 LIMIT 1`,
        [cid, comprador_nombre]
      );
      if (ccExiste.rows.length > 0) {
        cc_id = ccExiste.rows[0].id;
      } else {
        const ccNueva = await pool.query(
          `INSERT INTO cuentas_corrientes_clientes
             (cliente_id, comprador_nombre, comprador_cuit, saldo, activo)
           VALUES ($1, $2, $3, 0, true)
           RETURNING id`,
          [cid, comprador_nombre, comprador_cuit || '']
        );
        cc_id = ccNueva.rows[0].id;
      }

      // 2. Calcular saldo acumulado actual
      const saldoRes = await pool.query(
        `SELECT COALESCE(saldo, 0) AS saldo FROM cuentas_corrientes_clientes WHERE id = $1`,
        [cc_id]
      );
      const saldo_anterior = parseFloat(saldoRes.rows[0].saldo) || 0;
      const saldo_acumulado = saldo_anterior + saldo_pendiente;

      // 3. Registrar movimiento
      const descAuto = `${v.marca} ${v.modelo} ${v.anio || ''}`.trim();
      await pool.query(
        `INSERT INTO movimientos_cuentas_corrientes
           (cuenta_corriente_id, cliente_id, tipo, descripcion,
            debe, haber, saldo_acumulado, numero_comprobante, venta_id,
            estado, creado_en)
         VALUES ($1,$2,'venta_auto',$3, $4,$5,$6,$7,$8,
                 $9, now())`,
        [
          cc_id, cid,
          `Venta auto ${descAuto}`,
          pv,
          total_pagado,
          saldo_acumulado,
          `VAUT-${venta_id}`,
          venta_id,
          saldo_pendiente > 0 ? 'pendiente' : 'pagado',
        ]
      );

      // 4. Actualizar saldo CC
      await pool.query(
        `UPDATE cuentas_corrientes_clientes
         SET saldo = saldo + $1, modificado_en = now()
         WHERE id = $2`,
        [saldo_pendiente, cc_id]
      );
    } catch (err) {
      console.error('Error registrando venta auto en CC:', err.message);
    }

    res.json({ ok: true, venta_id });

  } catch (err) {
    console.error('POST /autos/ventas error:', err.message);
    res.status(500).json({ mensaje: 'Error al registrar venta', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /:cid/ventas — historial de ventas
// ═══════════════════════════════════════════════════════════════
router.get('/:cid/ventas', async (req, res) => {
  try {
    const { cid } = req.params;
    const {
      page = '1', limit = '25',
      fecha_desde, fecha_hasta,
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 25));
    const offset   = (pageNum - 1) * limitNum;

    const values = [cid];
    const where  = ['va.cliente_id = $1'];

    if (fecha_desde) { values.push(fecha_desde); where.push(`va.fecha >= $${values.length}`); }
    if (fecha_hasta) { values.push(fecha_hasta); where.push(`va.fecha <= $${values.length}`); }

    const whereStr = where.join(' AND ');

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT va.*,
                v.marca, v.modelo, v.anio, v.patente, v.tipo AS vehiculo_tipo,
                v.version, v.color, v.vin, v.km,
                sa.nombre AS socio_nombre
         FROM ventas_autos va
         LEFT JOIN vehiculos v ON v.id = va.vehiculo_id
         LEFT JOIN socios_autos sa ON sa.id = va.socio_id
         WHERE ${whereStr}
         ORDER BY va.creado_en DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limitNum, offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM ventas_autos va WHERE ${whereStr}`, values
      ),
    ]);

    const total   = parseInt(countRes.rows[0].count, 10);
    const paginas = Math.max(1, Math.ceil(total / limitNum));

    res.json({ ventas: dataRes.rows, total, pagina: pageNum, paginas, por_pagina: limitNum });
  } catch (err) {
    console.error('GET /autos/ventas error:', err.message);
    res.status(500).json({ mensaje: 'Error al listar ventas', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /:cid/socios
// ═══════════════════════════════════════════════════════════════
router.get('/:cid/socios', async (req, res) => {
  try {
    const { cid } = req.params;
    const result = await pool.query(
      `SELECT sa.*,
              COALESCE(
                (SELECT SUM(comision_socio) FROM ventas_autos
                 WHERE socio_id = sa.id AND cliente_id = $1),
                0
              ) AS total_comisiones
       FROM socios_autos sa
       WHERE sa.cliente_id = $1 AND sa.activo = true
       ORDER BY sa.nombre ASC`,
      [cid]
    );
    res.json({ socios: result.rows });
  } catch (err) {
    console.error('GET /autos/socios error:', err.message);
    res.status(500).json({ mensaje: 'Error al listar socios', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /:cid/socios
// ═══════════════════════════════════════════════════════════════
router.post('/:cid/socios', async (req, res) => {
  try {
    const { cid } = req.params;
    const {
      nombre, telefono = '',
      comision_default = 0, tipo_comision = 'porcentaje',
    } = req.body;

    if (!nombre?.trim()) return res.status(400).json({ mensaje: 'Nombre requerido' });

    const result = await pool.query(
      `INSERT INTO socios_autos
         (cliente_id, nombre, telefono, comision_default, tipo_comision, activo, creado_en)
       VALUES ($1,$2,$3,$4,$5,true,now())
       RETURNING *`,
      [cid, nombre.trim(), telefono, n(comision_default), tipo_comision]
    );
    res.json({ ok: true, socio: result.rows[0] });
  } catch (err) {
    console.error('POST /autos/socios error:', err.message);
    res.status(500).json({ mensaje: 'Error al crear socio', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PUT /:cid/socios/:id
// ═══════════════════════════════════════════════════════════════
router.put('/:cid/socios/:id', async (req, res) => {
  try {
    const { cid, id } = req.params;
    const { nombre, telefono, comision_default, tipo_comision, activo } = req.body;

    const result = await pool.query(
      `UPDATE socios_autos SET
         nombre           = COALESCE($3, nombre),
         telefono         = COALESCE($4, telefono),
         comision_default = COALESCE($5, comision_default),
         tipo_comision    = COALESCE($6, tipo_comision),
         activo           = COALESCE($7, activo)
       WHERE id = $1 AND cliente_id = $2
       RETURNING *`,
      [id, cid,
       nombre || null, telefono || null,
       comision_default != null ? n(comision_default) : null,
       tipo_comision || null,
       activo != null ? activo : null]
    );

    if (!result.rows[0]) return res.status(404).json({ mensaje: 'Socio no encontrado' });
    res.json({ ok: true, socio: result.rows[0] });
  } catch (err) {
    console.error('PUT /autos/socios/:id error:', err.message);
    res.status(500).json({ mensaje: 'Error al actualizar socio', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /:cid/liquidaciones
// ═══════════════════════════════════════════════════════════════
router.get('/:cid/liquidaciones', async (req, res) => {
  try {
    const { cid } = req.params;
    const result = await pool.query(
      `SELECT lc.*,
              v.marca, v.modelo, v.anio, v.patente
       FROM liquidaciones_consignacion lc
       LEFT JOIN vehiculos v ON v.id = lc.vehiculo_id
       WHERE lc.cliente_id = $1
       ORDER BY lc.creado_en DESC`,
      [cid]
    );
    res.json({ liquidaciones: result.rows });
  } catch (err) {
    console.error('GET /autos/liquidaciones error:', err.message);
    res.status(500).json({ mensaje: 'Error al listar liquidaciones', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PUT /:cid/liquidaciones/:id/pagar
// ═══════════════════════════════════════════════════════════════
router.put('/:cid/liquidaciones/:id/pagar', async (req, res) => {
  const { cid, id } = req.params;
  try {
    const liqRes = await pool.query(
      `UPDATE liquidaciones_consignacion
       SET estado = 'pagada'
       WHERE id = $1 AND cliente_id = $2 AND estado = 'pendiente'
       RETURNING *`,
      [id, cid]
    );

    if (!liqRes.rows[0]) {
      return res.status(404).json({ mensaje: 'Liquidación no encontrada o ya pagada' });
    }

    const liq = liqRes.rows[0];

    // Bloque caja
    try {
      const cajaRes = await pool.query(
        `SELECT id FROM cajas WHERE cliente_id = $1 AND estado = 'abierta' LIMIT 1`,
        [cid]
      );
      if (cajaRes.rows.length > 0) {
        const caja_id = cajaRes.rows[0].id;
        const monto   = n(liq.precio_consignante);

        await pool.query(
          `INSERT INTO caja_movimientos
             (caja_id, cliente_id, tipo, tipo_operacion, monto, descripcion)
           VALUES ($1,$2,'gasto','egreso',$3,$4)`,
          [caja_id, cid, monto, `Liquidación consignante ${liq.consignante_nombre}`]
        );
        await pool.query(
          `UPDATE cajas
           SET total_egresos = total_egresos + $1,
               saldo_actual  = saldo_actual  - $1
           WHERE id = $2`,
          [monto, caja_id]
        );
      }
    } catch (err) {
      console.error('Error registrando liquidación en caja:', err.message);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /autos/liquidaciones/:id/pagar error:', err.message);
    res.status(500).json({ mensaje: 'Error al pagar liquidación', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /:cid/vehiculos/importar — importar desde Excel
// ═══════════════════════════════════════════════════════════════
router.post('/:cid/vehiculos/importar', upload.single('archivo'), async (req, res) => {
  const { cid } = req.params;

  if (!req.file) return res.status(400).json({ mensaje: 'Archivo requerido' });

  try {
    const wb    = xlsx.read(req.file.buffer, { type: 'buffer' });
    const ws    = wb.Sheets[wb.SheetNames[0]];
    const filas = xlsx.utils.sheet_to_json(ws, { defval: '' });

    if (filas.length === 0) return res.status(400).json({ mensaje: 'El archivo está vacío' });

    let importados = 0;
    const errores  = [];

    for (let i = 0; i < filas.length; i++) {
      const f = filas[i];
      const fila = i + 2;

      const marca  = String(f.marca  || f.Marca  || '').trim();
      const modelo = String(f.modelo || f.Modelo || '').trim();

      if (!marca || !modelo) {
        errores.push(`Fila ${fila}: marca y modelo son requeridos`);
        continue;
      }

      try {
        await pool.query(
          `INSERT INTO vehiculos
             (cliente_id, marca, modelo, anio, version, color, patente,
              km, tipo, estado, precio_venta, precio_compra, observaciones,
              creado_en, modificado_en)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'disponible',$10,$11,$12,now(),now())`,
          [
            cid, marca, modelo,
            parseInt(f.anio || f.Año || f.año || '') || null,
            String(f.version || f.Version || f.Versión || '').trim(),
            String(f.color   || f.Color   || '').trim(),
            String(f.patente || f.Patente || '').trim(),
            parseInt(f.km    || f.KM      || '') || 0,
            String(f.tipo    || f.Tipo    || 'propio').toLowerCase().trim(),
            parseFloat(f.precio_venta  || f['Precio Venta']  || '') || 0,
            parseFloat(f.precio_compra || f['Precio Compra'] || '') || 0,
            String(f.observaciones || f.Observaciones || '').trim(),
          ]
        );
        importados++;
      } catch (e) {
        errores.push(`Fila ${fila}: ${e.message}`);
      }
    }

    res.json({ ok: true, importados, errores });
  } catch (err) {
    console.error('POST /autos/vehiculos/importar error:', err.message);
    res.status(500).json({ mensaje: 'Error al importar Excel', detalle: err.message });
  }
});

module.exports = router;
