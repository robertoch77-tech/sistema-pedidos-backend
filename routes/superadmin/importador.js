const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const XLSX     = require('xlsx');
const pool     = require('../../db');
const { verificarTokenSuperAdmin } = require('./auth');

// ── Multer en memoria ─────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    const ok = /\.(xls|xlsx)$/i.test(file.originalname);
    cb(ok ? null : new Error('Solo se aceptan archivos .xls y .xlsx'), ok);
  },
});

// ── Asegurar tablas ───────────────────────────────────────────
async function asegurarTablas() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS proveedores (
        id           BIGSERIAL PRIMARY KEY,
        cliente_id   BIGINT NOT NULL,
        nombre       TEXT   NOT NULL,
        activo       BOOLEAN DEFAULT true,
        creado_en    TIMESTAMPTZ DEFAULT now()
      )
    `);
    // Agregar constraint si no existe
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname='proveedores_cliente_nombre_uq'
        ) THEN
          ALTER TABLE proveedores ADD CONSTRAINT proveedores_cliente_nombre_uq UNIQUE(cliente_id, nombre);
        END IF;
      END $$
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS proveedores_mapeo_excel (
        id              BIGSERIAL PRIMARY KEY,
        cliente_id      BIGINT NOT NULL,
        proveedor_id    BIGINT NOT NULL,
        proveedor_nombre TEXT,
        mapeo           JSONB  NOT NULL,
        fila_encabezado INT    DEFAULT 0,
        actualizado_en  TIMESTAMPTZ DEFAULT now()
      )
    `);
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname='prov_mapeo_cli_prov_uq'
        ) THEN
          ALTER TABLE proveedores_mapeo_excel ADD CONSTRAINT prov_mapeo_cli_prov_uq UNIQUE(cliente_id, proveedor_id);
        END IF;
      END $$
    `).catch(() => {});
    // Columnas opcionales que pueden no existir en tablas ya creadas
    const colsExtra = [
      ['proveedores_mapeo_excel', 'mapeo',            "JSONB NOT NULL DEFAULT '{}'::jsonb"],
      ['proveedores_mapeo_excel', 'proveedor_nombre', 'TEXT'],
      ['proveedores_mapeo_excel', 'fila_encabezado',  'INT DEFAULT 0'],
      ['proveedores_mapeo_excel', 'actualizado_en',   'TIMESTAMPTZ DEFAULT now()'],
      ['productos_propios', 'precio_costo_anterior', 'NUMERIC DEFAULT 0'],
      ['productos_propios', 'unidad_medida',         'TEXT'],
      ['productos_propios', 'ean',                   'TEXT'],
      ['productos_propios', 'proveedor_id',           'BIGINT'],
      ['productos_propios', 'modificado_en',          'TIMESTAMPTZ DEFAULT now()'],
      ['productos_propios', 'descripcion_corta',     'TEXT'],
      ['productos_propios', 'rubro',                 'TEXT'],
      ['productos_propios', 'tipo',                  'TEXT'],
      ['productos_propios', 'precio_costo_final',    'NUMERIC DEFAULT 0'],
      ['productos_propios', 'precio_venta_1',        'NUMERIC DEFAULT 0'],
      ['productos_propios', 'precio_venta_2',        'NUMERIC DEFAULT 0'],
      ['productos_propios', 'precio_venta_final',    'NUMERIC DEFAULT 0'],
      ['productos_propios', 'alicuota_iva',          'NUMERIC DEFAULT 0'],
      ['productos_propios', 'imagen_url',            'TEXT'],
      ['productos_propios', 'stock_actual',          'NUMERIC DEFAULT 0'],
      ['productos_propios', 'dto_1',               'NUMERIC DEFAULT 0'],
      ['productos_propios', 'dto_2',               'NUMERIC DEFAULT 0'],
      ['productos_propios', 'dto_3',               'NUMERIC DEFAULT 0'],
      ['productos_propios', 'dto_4',               'NUMERIC DEFAULT 0'],
      ['productos_propios', 'imp_1',               'NUMERIC DEFAULT 0'],
      ['productos_propios', 'imp_2',               'NUMERIC DEFAULT 0'],
      ['productos_propios', 'utilidad_1',          'NUMERIC DEFAULT 0'],
      ['productos_propios', 'utilidad_2',          'NUMERIC DEFAULT 0'],
      ['productos_propios', 'utilidad_3',          'NUMERIC DEFAULT 0'],
      ['productos_propios', 'precio_venta_3',      'NUMERIC DEFAULT 0'],
      ['productos_propios', 'punto_reposicion',    'NUMERIC DEFAULT 0'],
      ['productos_propios', 'destacado',          'BOOLEAN DEFAULT false'],
      ['productos_propios', 'imagen_url',         'TEXT'],
      ['importaciones_historial', 'total_excel',  'INT DEFAULT 0'],
      ['importaciones_historial', 'nuevos',        'INT DEFAULT 0'],
      ['importaciones_historial', 'subieron',      'INT DEFAULT 0'],
      ['importaciones_historial', 'bajaron',       'INT DEFAULT 0'],
      ['importaciones_historial', 'sin_cambio',    'INT DEFAULT 0'],
      ['importaciones_historial', 'quitados',      'INT DEFAULT 0'],
      ['importaciones_historial', 'aplicados',     'INT DEFAULT 0'],
      ['importaciones_historial', 'errores',       'INT DEFAULT 0'],
      ['importaciones_historial', 'proveedor_id',  'BIGINT'],
      ['importaciones_detalle', 'importacion_id',       'BIGINT'],
      ['importaciones_detalle', 'proveedor_id',         'BIGINT'],
      ['importaciones_detalle', 'codigo',               'TEXT'],
      ['importaciones_detalle', 'descripcion',          'TEXT'],
      ['importaciones_detalle', 'precio_anterior',      'NUMERIC'],
      ['importaciones_detalle', 'precio_nuevo',         'NUMERIC'],
      ['importaciones_detalle', 'variacion_porcentaje', 'NUMERIC'],
      ['importaciones_detalle', 'tipo',                 'TEXT'],
    ];
    for (const [tabla, col, tipo] of colsExtra) {
      await pool.query(`ALTER TABLE ${tabla} ADD COLUMN IF NOT EXISTS ${col} ${tipo}`).catch(() => {});
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS productos_propios_precios (
        id                    BIGSERIAL PRIMARY KEY,
        producto_id           BIGINT NOT NULL,
        cliente_id            BIGINT NOT NULL,
        precio_costo_anterior NUMERIC DEFAULT 0,
        precio_venta_anterior NUMERIC DEFAULT 0,
        fecha                 TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});
    await pool.query(`
      CREATE TABLE IF NOT EXISTS importaciones_historial (
        id              BIGSERIAL PRIMARY KEY,
        cliente_id      BIGINT NOT NULL,
        proveedor_id    BIGINT NOT NULL,
        total_excel     INT DEFAULT 0,
        nuevos          INT DEFAULT 0,
        subieron        INT DEFAULT 0,
        bajaron         INT DEFAULT 0,
        sin_cambio      INT DEFAULT 0,
        quitados        INT DEFAULT 0,
        aplicados       INT DEFAULT 0,
        errores         INT DEFAULT 0,
        creado_en       TIMESTAMPTZ DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS importaciones_detalle (
        id                   BIGSERIAL PRIMARY KEY,
        importacion_id       BIGINT NOT NULL,
        cliente_id           BIGINT NOT NULL,
        proveedor_id         BIGINT NOT NULL,
        codigo               TEXT,
        descripcion          TEXT,
        precio_anterior      NUMERIC,
        precio_nuevo         NUMERIC,
        variacion_porcentaje NUMERIC,
        tipo                 TEXT,
        creado_en            TIMESTAMPTZ DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS productos_propios (
        id                    BIGSERIAL PRIMARY KEY,
        cliente_id            BIGINT NOT NULL,
        proveedor_id          BIGINT,
        codigo                TEXT,
        descripcion           TEXT   NOT NULL,
        marca                 TEXT,
        unidad_medida         TEXT,
        ean                   TEXT,
        precio_costo          NUMERIC DEFAULT 0,
        precio_costo_anterior NUMERIC DEFAULT 0,
        precio_venta          NUMERIC DEFAULT 0,
        stock_actual          NUMERIC DEFAULT 0,
        stock_minimo          NUMERIC DEFAULT 0,
        activo                BOOLEAN DEFAULT true,
        creado_en             TIMESTAMPTZ DEFAULT now(),
        modificado_en         TIMESTAMPTZ DEFAULT now()
      )
    `);
  } catch (err) {
    console.error('Importador: error al asegurar tablas:', err.message);
  }
}
asegurarTablas();

// ── Temp file cache (30 min TTL) ─────────────────────────────
const tempFiles = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, f] of tempFiles) if (f.expires < now) tempFiles.delete(id);
}, 5 * 60 * 1000);

function genTempId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
function calcPrefix(nombre) {
  return (nombre || '').trim().split(/\s+/).map(w => (w[0] || '').toUpperCase()).join('');
}

// ── Helpers ───────────────────────────────────────────────────

// Leer Excel y devolver array de filas (cada fila es array de valores)
function leerExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
}

// Detectar la fila con más celdas no vacías (probable encabezado)
function detectarEncabezado(filas) {
  let mejorFila = 0, maxNoVacias = 0;
  filas.forEach((fila, idx) => {
    const noVacias = fila.filter(c => c !== '' && c != null).length;
    if (noVacias > maxNoVacias) { maxNoVacias = noVacias; mejorFila = idx; }
  });
  return mejorFila;
}

function val(fila, columna, encabezados) {
  if (!columna) return '';
  const idx = encabezados.indexOf(columna);
  if (idx === -1) return '';
  const v = fila[idx];
  return v === undefined || v === null ? '' : String(v).trim();
}

function numVal(fila, columna, encabezados) {
  const s = val(fila, columna, encabezados);
  const n = parseFloat(s.replace(/[^0-9.,]/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

// ── Middleware de auth (aplica a todas las rutas) ─────────────
const verificarCualquierToken = async (req, res, next) => {
  const tokenSA = req.headers['x-superadmin-token'];
  const tokenPortal = req.headers['x-roberto-token'];

  if (tokenSA) {
    return verificarTokenSuperAdmin(req, res, next);
  }

  if (tokenPortal) {
    try {
      const sesion = await pool.query(
        'SELECT cliente_id, expira_en FROM sesiones_portal WHERE token = $1',
        [tokenPortal]
      );
      if (sesion.rows.length === 0) {
        return res.status(401).json({ error: 'Sesión inválida' });
      }
      if (sesion.rows[0].expira_en < Date.now()) {
        await pool.query(
          'DELETE FROM sesiones_portal WHERE token=$1', [tokenPortal]
        );
        return res.status(401).json({ error: 'Sesión expirada' });
      }
      next();
    } catch (err) {
      return res.status(500).json({ error: 'Error de autenticación' });
    }
  }

  return res.status(401).json({ error: 'Token requerido' });
};
router.use(verificarCualquierToken);

// ═══════════════════════════════════════════════════════════════
// ENDPOINT 1 — POST /analizar
// ═══════════════════════════════════════════════════════════════
router.post('/analizar', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ mensaje: 'Se requiere un archivo Excel' });

    const filas = leerExcel(req.file.buffer);
    if (!filas.length) return res.status(400).json({ mensaje: 'El archivo está vacío' });

    const filaEnc = detectarEncabezado(filas);
    const columnasConIdx = filas[filaEnc]
      .map((c, i) => ({ nombre: String(c ?? '').trim().replace('[object Object]', ''), idx: i }))
      .filter(({ nombre }) => nombre !== '');
    const columnas = columnasConIdx.map(c => c.nombre);

    const datos = filas.slice(filaEnc + 1).filter(f => f.some(c => c !== '' && c != null));
    const muestra = datos.slice(0, 5).map(fila =>
      Object.fromEntries(columnasConIdx.map(({ nombre, idx }) => [nombre, fila[idx] != null ? String(fila[idx]) : '']))
    );

    res.json({
      columnas,
      fila_encabezado: filaEnc,
      muestra,
      total_filas: datos.length,
    });
  } catch (err) {
    console.error('POST /analizar error:', err.message);
    res.status(500).json({ mensaje: 'Error al analizar el archivo', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINT 2 — POST /mapear
// ═══════════════════════════════════════════════════════════════
router.post('/mapear', async (req, res) => {
  try {
    const { cliente_id, proveedor_nombre, mapeo, fila_encabezado = 0 } = req.body;
    if (!cliente_id || !proveedor_nombre || !mapeo) {
      return res.status(400).json({ mensaje: 'Faltan campos obligatorios' });
    }

    // Crear o recuperar proveedor (sin ON CONFLICT para compatibilidad)
    let proveedor_id;
    const provExiste = await pool.query(
      'SELECT id FROM proveedores WHERE cliente_id=$1 AND LOWER(nombre)=LOWER($2) LIMIT 1',
      [cliente_id, proveedor_nombre.trim()]
    );
    if (provExiste.rows[0]) {
      proveedor_id = provExiste.rows[0].id;
      await pool.query('UPDATE proveedores SET activo=true WHERE id=$1', [proveedor_id]);
    } else {
      const ins = await pool.query(
        'INSERT INTO proveedores (cliente_id, nombre, activo) VALUES ($1,$2,true) RETURNING id',
        [cliente_id, proveedor_nombre.trim()]
      );
      proveedor_id = ins.rows[0].id;
    }

    // Guardar mapeo (upsert manual)
    const mapeoExiste = await pool.query(
      'SELECT id FROM proveedores_mapeo_excel WHERE cliente_id=$1 AND proveedor_id=$2 LIMIT 1',
      [cliente_id, proveedor_id]
    );
    if (mapeoExiste.rows[0]) {
      await pool.query(
        `UPDATE proveedores_mapeo_excel
         SET mapeo=$1, fila_encabezado=$2, proveedor_nombre=$3, actualizado_en=now()
         WHERE cliente_id=$4 AND proveedor_id=$5`,
        [JSON.stringify(mapeo), fila_encabezado, proveedor_nombre.trim(), cliente_id, proveedor_id]
      );
    } else {
      await pool.query(
        `INSERT INTO proveedores_mapeo_excel
           (cliente_id, proveedor_id, proveedor_nombre, mapeo, fila_encabezado)
         VALUES ($1,$2,$3,$4,$5)`,
        [cliente_id, proveedor_id, proveedor_nombre.trim(), JSON.stringify(mapeo), fila_encabezado]
      );
    }

    res.json({ ok: true, proveedor_id });
  } catch (err) {
    console.error('POST /mapear error:', err.message);
    res.status(500).json({ mensaje: 'Error al guardar mapeo', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINT 3 — POST /comparar
// ═══════════════════════════════════════════════════════════════
router.post('/comparar', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ mensaje: 'Se requiere un archivo Excel' });

    const { cliente_id, proveedor_id } = req.body;
    const mapeo = typeof req.body.mapeo === 'string' ? JSON.parse(req.body.mapeo) : req.body.mapeo;
    const fila_encabezado = parseInt(req.body.fila_encabezado || '0', 10);

    if (!cliente_id || !proveedor_id || !mapeo) {
      return res.status(400).json({ mensaje: 'Faltan campos obligatorios' });
    }

    // Leer Excel
    const filas = leerExcel(req.file.buffer);
    const encabezados = filas[fila_encabezado].map(c => String(c).trim());
    const datos = filas.slice(fila_encabezado + 1).filter(f => f.some(c => c !== '' && c != null));

    // Productos actuales en DB para este cliente+proveedor
    const dbRes = await pool.query(
      `SELECT id, codigo, precio_costo FROM productos_propios
       WHERE cliente_id=$1 AND proveedor_id=$2 AND activo=true`,
      [cliente_id, proveedor_id]
    );
    const dbMap = new Map(dbRes.rows.map(r => [String(r.codigo).trim().toUpperCase(), r]));
    const codigosExcel = new Set();

    const detalle = [];
    let subieron = 0, bajaron = 0, sin_cambio = 0, nuevos = 0;

    for (const fila of datos) {
      const codigo      = val(fila, mapeo.codigo, encabezados);
      const descripcion = val(fila, mapeo.descripcion, encabezados);
      if (!codigo && !descripcion) continue;

      const precio_nuevo  = numVal(fila, mapeo.precio_costo, encabezados);
      const codigoKey     = codigo.toUpperCase();
      codigosExcel.add(codigoKey);
      const existente     = dbMap.get(codigoKey);

      let tipo, precio_actual = null, variacion_porcentaje = null;

      if (!existente) {
        tipo = 'nuevo';
        nuevos++;
      } else {
        precio_actual = parseFloat(existente.precio_costo) || 0;
        if (precio_nuevo === null || precio_actual === precio_nuevo) {
          tipo = 'sin_cambio'; sin_cambio++;
        } else {
          variacion_porcentaje = precio_actual > 0
            ? Math.round(((precio_nuevo - precio_actual) / precio_actual) * 1000) / 10
            : null;
          tipo = precio_nuevo > precio_actual ? 'subio' : 'bajo';
          if (tipo === 'subio') subieron++; else bajaron++;
        }
      }

      detalle.push({
        codigo,
        descripcion,
        precio_actual,
        precio_nuevo,
        variacion_porcentaje,
        tipo,
        marca:          val(fila, mapeo.marca, encabezados),
        unidad_medida:  val(fila, mapeo.unidad_medida, encabezados),
        ean:            val(fila, mapeo.ean, encabezados),
      });
    }

    // Productos quitados (en DB pero no en Excel)
    let quitados = 0;
    for (const [codigo, row] of dbMap) {
      if (!codigosExcel.has(codigo)) {
        quitados++;
        detalle.push({
          codigo: row.codigo, descripcion: '', precio_actual: parseFloat(row.precio_costo),
          precio_nuevo: null, variacion_porcentaje: null, tipo: 'quitado',
        });
      }
    }

    const variaciones = detalle
      .filter(d => d.variacion_porcentaje !== null)
      .map(d => d.variacion_porcentaje);
    const variacion_promedio = variaciones.length
      ? Math.round((variaciones.reduce((a, b) => a + b, 0) / variaciones.length) * 10) / 10
      : 0;

    res.json({
      resumen: {
        total_excel: datos.filter(f => f.some(c => c !== '' && c != null)).length,
        nuevos, subieron, bajaron, sin_cambio, quitados, variacion_promedio,
      },
      detalle,
    });
  } catch (err) {
    console.error('POST /comparar error:', err.message);
    res.status(500).json({ mensaje: 'Error al comparar', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINT 4 — POST /aplicar
// ═══════════════════════════════════════════════════════════════
router.post('/aplicar', async (req, res) => {
  try {
    const { cliente_id, proveedor_id, productos_aprobados = [] } = req.body;
    if (!cliente_id || !proveedor_id) {
      return res.status(400).json({ mensaje: 'Faltan campos obligatorios' });
    }

    let aplicados = 0, errores = 0;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const prod of productos_aprobados) {
        try {
          if (prod.tipo === 'nuevo') {
            await client.query(
              `INSERT INTO productos_propios
                 (cliente_id, proveedor_id, codigo, descripcion, marca, unidad_medida, ean, precio_costo, activo)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
               ON CONFLICT DO NOTHING`,
              [cliente_id, proveedor_id,
               prod.codigo || null, prod.descripcion || '',
               prod.marca || null, prod.unidad_medida || null, prod.ean || null,
               prod.precio_nuevo ?? 0]
            );
          } else if (prod.tipo === 'subio' || prod.tipo === 'bajo') {
            await client.query(
              `UPDATE productos_propios
               SET precio_costo=$1, precio_costo_anterior=$2, modificado_en=now()
               WHERE cliente_id=$3 AND proveedor_id=$4 AND codigo=$5`,
              [prod.precio_nuevo, prod.precio_actual, cliente_id, proveedor_id, prod.codigo]
            );
          } else if (prod.tipo === 'quitado') {
            await client.query(
              `UPDATE productos_propios SET activo=false, modificado_en=now()
               WHERE cliente_id=$1 AND proveedor_id=$2 AND codigo=$3`,
              [cliente_id, proveedor_id, prod.codigo]
            );
          }
          aplicados++;
        } catch {
          errores++;
        }
      }

      // Guardar historial
      const histRes = await client.query(
        `INSERT INTO importaciones_historial
           (cliente_id, proveedor_id, total_excel, nuevos, subieron, bajaron,
            sin_cambio, quitados, aplicados, errores)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [
          cliente_id, proveedor_id,
          productos_aprobados.length,
          productos_aprobados.filter(p => p.tipo === 'nuevo').length,
          productos_aprobados.filter(p => p.tipo === 'subio').length,
          productos_aprobados.filter(p => p.tipo === 'bajo').length,
          productos_aprobados.filter(p => p.tipo === 'sin_cambio').length,
          productos_aprobados.filter(p => p.tipo === 'quitado').length,
          aplicados, errores,
        ]
      );
      const importacion_id = histRes.rows[0].id;

      // Guardar detalle
      for (const prod of productos_aprobados) {
        await client.query(
          `INSERT INTO importaciones_detalle
             (importacion_id, cliente_id, proveedor_id, codigo, descripcion,
              precio_anterior, precio_nuevo, variacion_porcentaje, tipo)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [importacion_id, cliente_id, proveedor_id,
           prod.codigo || null, prod.descripcion || null,
           prod.precio_actual ?? null, prod.precio_nuevo ?? null,
           prod.variacion_porcentaje ?? null, prod.tipo]
        );
      }

      await client.query('COMMIT');
      res.json({ ok: true, aplicados, errores, importacion_id });

    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('POST /aplicar error:', err.message);
    res.status(500).json({ mensaje: 'Error al aplicar importación', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINT 5 — GET /productos/:cliente_id
// ═══════════════════════════════════════════════════════════════
router.get('/productos/:cliente_id', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const {
      buscar      = '',
      proveedor_id,
      marca       = '',
      rubro       = '',
      activo,
      fecha_desde,
      fecha_hasta,
      fecha_tipo  = 'importacion',
      page        = '1',
      limit       = '25',
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(5000, Math.max(1, parseInt(limit, 10) || 25));
    const offset   = (pageNum - 1) * limitNum;

    const values  = [cliente_id];
    const where   = ['cliente_id = $1'];

    if (buscar.trim()) {
      values.push(`%${buscar.trim()}%`);
      const n = values.length;
      where.push(`(codigo ILIKE $${n} OR descripcion ILIKE $${n} OR marca ILIKE $${n})`);
    }
    if (proveedor_id) {
      values.push(proveedor_id);
      where.push(`proveedor_id = $${values.length}`);
    }
    if (marca.trim()) {
      values.push(marca.trim());
      where.push(`marca = $${values.length}`);
    }
    if (rubro && rubro.trim()) {
      values.push(rubro.trim());
      where.push(`rubro = $${values.length}`);
    }
    if (activo === 'true' || activo === 'false') {
      values.push(activo === 'true');
      where.push(`activo = $${values.length}`);
    }
    const campoFecha = fecha_tipo === 'actualizacion' ? 'modificado_en' : 'creado_en';
    if (fecha_desde) {
      values.push(fecha_desde);
      where.push(`${campoFecha} >= $${values.length}`);
    }
    if (fecha_hasta) {
      values.push(fecha_hasta);
      where.push(`${campoFecha} <= ($${values.length}::date + interval '1 day')`);
    }

    const whereStr = where.join(' AND ');

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT id, codigo, descripcion, marca,
                proveedor_id, rubro, unidad_medida, ean, imagen_url,
                COALESCE(precio_costo, 0)        AS precio_costo,
                dto_1, dto_2, dto_3, imp_1, imp_2,
                COALESCE(precio_venta_1, 0)      AS precio_venta_1,
                COALESCE(precio_venta_2, 0)      AS precio_venta_2,
                COALESCE(precio_venta_final, 0)  AS precio_venta_final,
                COALESCE(precio_venta_3, 0)      AS precio_venta_3,
                COALESCE(alicuota_iva, 21)       AS alicuota_iva,
                utilidad_1, utilidad_2, utilidad_3,
                COALESCE(stock_actual, 0) AS stock_actual,
                COALESCE(stock_minimo, 0) AS stock_minimo,
                activo, destacado, creado_en, modificado_en
         FROM productos_propios
         WHERE ${whereStr}
         ORDER BY descripcion ASC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limitNum, offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM productos_propios WHERE ${whereStr}`,
        values
      ),
    ]);

    const total   = parseInt(countRes.rows[0].count, 10);
    const paginas = Math.max(1, Math.ceil(total / limitNum));

    res.json({
      productos: dataRes.rows,
      total,
      pagina:    pageNum,
      paginas,
      por_pagina: limitNum,
    });
  } catch (err) {
    console.error('GET /productos error:', err.message);
    res.status(500).json({ mensaje: 'Error al listar productos', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINT 5b — GET /productos/:cliente_id/exportar
// ═══════════════════════════════════════════════════════════════
router.get('/productos/:cliente_id/exportar', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const {
      buscar = '', proveedor_id, marca = '', rubro = '', activo,
      fecha_desde, fecha_hasta, fecha_tipo = 'importacion',
    } = req.query;

    const values = [cliente_id];
    const where  = ['p.cliente_id = $1'];

    if (buscar.trim()) {
      values.push(`%${buscar.trim()}%`);
      const n = values.length;
      where.push(`(p.codigo ILIKE $${n} OR p.descripcion ILIKE $${n} OR p.marca ILIKE $${n})`);
    }
    if (proveedor_id) { values.push(proveedor_id); where.push(`p.proveedor_id = $${values.length}`); }
    if (marca.trim()) { values.push(marca.trim()); where.push(`p.marca = $${values.length}`); }
    if (rubro && rubro.trim()) { values.push(rubro.trim()); where.push(`p.rubro = $${values.length}`); }
    if (activo === 'true' || activo === 'false') { values.push(activo === 'true'); where.push(`p.activo = $${values.length}`); }
    const campoFecha = fecha_tipo === 'actualizacion' ? 'p.modificado_en' : 'p.creado_en';
    if (fecha_desde) { values.push(fecha_desde); where.push(`${campoFecha} >= $${values.length}`); }
    if (fecha_hasta) { values.push(fecha_hasta); where.push(`${campoFecha} <= ($${values.length}::date + interval '1 day')`); }

    const dataRes = await pool.query(
      `SELECT p.codigo, p.descripcion, p.marca,
              pv.nombre AS proveedor,
              p.rubro, p.precio_costo, p.precio_venta_1, p.precio_venta_2,
              p.precio_venta_final, p.alicuota_iva,
              COALESCE(p.stock_actual, 0) AS stock,
              COALESCE(p.stock_minimo, 0) AS stock_minimo,
              p.unidad_medida, p.ean,
              p.activo, p.creado_en AS fecha_importacion
       FROM productos_propios p
       LEFT JOIN proveedores pv ON pv.id = p.proveedor_id
       WHERE ${where.join(' AND ')}
       ORDER BY p.descripcion ASC`,
      values
    );

    res.json({ productos: dataRes.rows, total: dataRes.rows.length });
  } catch (err) {
    console.error('GET /exportar error:', err.message);
    res.status(500).json({ mensaje: 'Error al exportar', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINT 6 — GET /productos/:cliente_id/filtros
// ═══════════════════════════════════════════════════════════════
router.get('/productos/:cliente_id/filtros', async (req, res) => {
  try {
    const { cliente_id } = req.params;

    const [provRes, marcaRes, rubroRes] = await Promise.all([
      pool.query(
        `SELECT p.id, p.nombre
         FROM proveedores p
         WHERE p.cliente_id = $1 AND p.activo = true
         ORDER BY p.nombre ASC`,
        [cliente_id]
      ),
      pool.query(
        `SELECT DISTINCT marca
         FROM productos_propios
         WHERE cliente_id = $1 AND marca IS NOT NULL AND marca <> ''
         ORDER BY marca ASC`,
        [cliente_id]
      ),
      pool.query(
        `SELECT DISTINCT rubro
         FROM productos_propios
         WHERE cliente_id = $1 AND rubro IS NOT NULL AND rubro <> ''
         ORDER BY rubro ASC`,
        [cliente_id]
      ),
    ]);

    res.json({
      proveedores: provRes.rows,
      marcas:      marcaRes.rows.map(r => r.marca),
      rubros:      rubroRes.rows.map(r => r.rubro),
    });
  } catch (err) {
    console.error('GET /filtros error:', err.message);
    res.status(500).json({ mensaje: 'Error al obtener filtros', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINT 7 — POST /productos/:cliente_id  (crear producto)
// ═══════════════════════════════════════════════════════════════
router.post('/productos/:cliente_id', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const {
      codigo, descripcion, descripcion_corta, marca, proveedor_id, rubro, tipo,
      precio_costo = 0, dto_1 = 0, dto_2 = 0, dto_3 = 0, dto_4 = 0,
      precio_costo_final = 0, imp_1 = 0, imp_2 = 0, alicuota_iva = 0,
      utilidad_1 = 0, utilidad_2 = 0,
      precio_venta_1 = 0, precio_venta_2 = 0, precio_venta_final = 0,
      stock = 0, stock_minimo = 0, punto_reposicion = 0,
      unidad_medida, ean, imagen_url, activo = true,
    } = req.body;

    if (!descripcion || !descripcion.trim()) {
      return res.status(400).json({ mensaje: 'La descripción es obligatoria' });
    }

    const r = await pool.query(
      `INSERT INTO productos_propios
         (cliente_id, codigo, descripcion, descripcion_corta, marca, proveedor_id, rubro, tipo,
          precio_costo, dto_1, dto_2, dto_3, dto_4, precio_costo_final,
          imp_1, imp_2, alicuota_iva, utilidad_1, utilidad_2,
          precio_venta_1, precio_venta_2, precio_venta_final,
          stock_actual, stock_minimo, punto_reposicion,
          unidad_medida, ean, imagen_url, activo, creado_en, modificado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,now(),now())
       RETURNING id`,
      [
        cliente_id, codigo || null, descripcion.trim(), descripcion_corta || null,
        marca || null, proveedor_id || null, rubro || null, tipo || null,
        precio_costo, dto_1, dto_2, dto_3, dto_4, precio_costo_final,
        imp_1, imp_2, alicuota_iva, utilidad_1, utilidad_2,
        precio_venta_1, precio_venta_2, precio_venta_final,
        stock, stock_minimo, punto_reposicion,
        unidad_medida || null, ean || null, imagen_url || null, activo,
      ]
    );
    res.json({ ok: true, id: r.rows[0].id });
  } catch (err) {
    console.error('POST /productos/:cliente_id error:', err.message);
    res.status(500).json({ mensaje: 'Error al crear producto', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINT 8 — PUT /productos/:cliente_id/:id  (editar producto)
// ═══════════════════════════════════════════════════════════════
router.put('/productos/:cliente_id/:id', async (req, res) => {
  try {
    const { cliente_id, id } = req.params;
    const {
      codigo, descripcion, descripcion_corta, marca, proveedor_id, rubro, tipo,
      precio_costo = 0, dto_1 = 0, dto_2 = 0, dto_3 = 0, dto_4 = 0,
      precio_costo_final = 0, imp_1 = 0, imp_2 = 0, alicuota_iva = 0,
      utilidad_1 = 0, utilidad_2 = 0,
      precio_venta_1 = 0, precio_venta_2 = 0, precio_venta_final = 0,
      stock = 0, stock_minimo = 0, punto_reposicion = 0,
      unidad_medida, ean, imagen_url, activo = true,
    } = req.body;

    if (!descripcion || !descripcion.trim()) {
      return res.status(400).json({ mensaje: 'La descripción es obligatoria' });
    }

    const r = await pool.query(
      `UPDATE productos_propios SET
         codigo=$1, descripcion=$2, descripcion_corta=$3, marca=$4, proveedor_id=$5,
         rubro=$6, tipo=$7, precio_costo=$8, dto_1=$9, dto_2=$10, dto_3=$11, dto_4=$12,
         precio_costo_final=$13, imp_1=$14, imp_2=$15, alicuota_iva=$16,
         utilidad_1=$17, utilidad_2=$18,
         precio_venta_1=$19, precio_venta_2=$20, precio_venta_final=$21,
         stock_actual=$22, stock_minimo=$23, punto_reposicion=$24,
         unidad_medida=$25, ean=$26, imagen_url=$27, activo=$28,
         modificado_en=now()
       WHERE id=$29 AND cliente_id=$30`,
      [
        codigo || null, descripcion.trim(), descripcion_corta || null,
        marca || null, proveedor_id || null, rubro || null, tipo || null,
        precio_costo, dto_1, dto_2, dto_3, dto_4, precio_costo_final,
        imp_1, imp_2, alicuota_iva, utilidad_1, utilidad_2,
        precio_venta_1, precio_venta_2, precio_venta_final,
        stock, stock_minimo, punto_reposicion,
        unidad_medida || null, ean || null, imagen_url || null, activo,
        id, cliente_id,
      ]
    );
    if (r.rowCount === 0) return res.status(404).json({ mensaje: 'Producto no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /productos/:cliente_id/:id error:', err.message);
    res.status(500).json({ mensaje: 'Error al actualizar producto', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINT 9 — DELETE /productos/:cliente_id/:id  (desactivar)
// ═══════════════════════════════════════════════════════════════
router.delete('/productos/:cliente_id/:id', async (req, res) => {
  try {
    const { cliente_id, id } = req.params;
    const r = await pool.query(
      `UPDATE productos_propios SET activo=false, modificado_en=now()
       WHERE id=$1 AND cliente_id=$2`,
      [id, cliente_id]
    );
    if (r.rowCount === 0) return res.status(404).json({ mensaje: 'Producto no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /productos/:cliente_id/:id error:', err.message);
    res.status(500).json({ mensaje: 'Error al desactivar producto', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINT 10 — DELETE /productos  (eliminar masivo por IDs o filtros)
// ═══════════════════════════════════════════════════════════════
router.delete('/productos', async (req, res) => {
  try {
    const { cliente_id, ids, buscar, proveedor_id, marca, rubro, activo,
            fecha_desde, fecha_hasta, fecha_tipo } = req.body;
    if (!cliente_id) return res.status(400).json({ mensaje: 'cliente_id requerido' });

    let query, vals;

    if (ids && Array.isArray(ids) && ids.length > 0) {
      query = `DELETE FROM productos_propios WHERE cliente_id=$1 AND id = ANY($2::bigint[]) RETURNING id`;
      vals  = [cliente_id, ids];
    } else {
      const conds = ['cliente_id=$1'];
      vals = [cliente_id];
      let i = 2;
      if (buscar)       { conds.push(`(codigo ILIKE $${i} OR descripcion ILIKE $${i})`); vals.push(`%${buscar}%`); i++; }
      if (proveedor_id) { conds.push(`proveedor_id=$${i}`);  vals.push(proveedor_id); i++; }
      if (marca)        { conds.push(`marca=$${i}`);         vals.push(marca); i++; }
      if (rubro)        { conds.push(`rubro=$${i}`);         vals.push(rubro); i++; }
      if (activo !== undefined && activo !== null && activo !== '') {
        conds.push(`activo=$${i}`); vals.push(activo === 'true' || activo === true); i++;
      }
      const campoFecha = fecha_tipo === 'actualizacion' ? 'modificado_en' : 'creado_en';
      if (fecha_desde) { conds.push(`${campoFecha} >= $${i}::date`);                        vals.push(fecha_desde); i++; }
      if (fecha_hasta) { conds.push(`${campoFecha} < ($${i}::date + interval '1 day')`);    vals.push(fecha_hasta); i++; }
      if (conds.length === 1) return res.status(400).json({ mensaje: 'Se requieren ids o al menos un filtro' });
      query = `DELETE FROM productos_propios WHERE ${conds.join(' AND ')} RETURNING id`;
    }

    const r = await pool.query(query, vals);
    res.json({ ok: true, eliminados: r.rowCount });
  } catch (err) {
    console.error('DELETE /productos error:', err.message);
    res.status(500).json({ mensaje: 'Error al eliminar productos', detalle: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// HELPERS — IMPORTADOR LIBRE
// ════════════════════════════════════════════════════════════════

function leerExcelConMapeoLibre(buffer, mapeo) {
  const filas = leerExcel(buffer);
  if (!filas.length) return [];
  const headerIdx = detectarEncabezado(filas);
  const enc = filas[headerIdx].map(c => String(c).trim());
  const datos = filas.slice(headerIdx + 1).filter(f => f.some(c => c !== '' && c != null));
  return datos.map(fila => ({
    codigo:         val(fila, mapeo.codigo, enc),
    descripcion:    val(fila, mapeo.descripcion, enc),
    precio_costo:   val(fila, mapeo.precio_costo, enc),
    precio_venta_1: val(fila, mapeo.precio_venta_1, enc),
    precio_venta_2: val(fila, mapeo.precio_venta_2, enc),
    precio_venta_3: val(fila, mapeo.precio_venta_3, enc),
    marca:          val(fila, mapeo.marca, enc),
    rubro:          val(fila, mapeo.rubro, enc),
    unidad_medida:  val(fila, mapeo.unidad_medida, enc),
    ean:            val(fila, mapeo.ean, enc),
    descuento_1:    val(fila, mapeo.descuento_1, enc),
    descuento_2:    val(fila, mapeo.descuento_2, enc),
    descuento_3:    val(fila, mapeo.descuento_3, enc),
    iva:            val(fila, mapeo.iva, enc),
  }));
}

function toNum(str) {
  if (!str) return null;
  const n = parseFloat(String(str).replace(/[^0-9.,\-]/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

async function getOrCreateProveedor(cliente_id, nombre) {
  const row = await pool.query(
    'SELECT id FROM proveedores WHERE cliente_id=$1 AND LOWER(nombre)=LOWER($2) LIMIT 1',
    [cliente_id, nombre.trim()]
  );
  if (row.rows[0]) return row.rows[0].id;
  const ins = await pool.query(
    'INSERT INTO proveedores (cliente_id, nombre, activo) VALUES ($1,$2,true) RETURNING id',
    [cliente_id, nombre.trim()]
  );
  return ins.rows[0].id;
}

// ═══════════════════════════════════════════════════════════════
// ENDPOINT LIBRE 1 — POST /analizar-libre
// ═══════════════════════════════════════════════════════════════
router.post('/analizar-libre', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ mensaje: 'Se requiere un archivo Excel' });
    const filas = leerExcel(req.file.buffer);
    if (!filas.length) return res.status(400).json({ mensaje: 'El archivo está vacío' });
    const headerIdx = detectarEncabezado(filas);
    const columnasConIdx = filas[headerIdx]
      .map((c, i) => ({ nombre: String(c ?? '').trim().replace('[object Object]', ''), idx: i }))
      .filter(({ nombre }) => nombre !== '');
    const columnas = columnasConIdx.map(c => c.nombre);
    const datos = filas.slice(headerIdx + 1).filter(f => f.some(c => c !== '' && c != null));
    const muestra = datos.slice(0, 5).map(fila =>
      Object.fromEntries(columnasConIdx.map(({ nombre, idx }) => [nombre, fila[idx] != null ? String(fila[idx]) : '']))
    );
    res.json({ columnas, muestra, total_filas: datos.length, proveedor_sugerido: null });
  } catch (err) {
    console.error('POST /analizar-libre error:', err.message);
    res.status(500).json({ mensaje: 'Error al analizar', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINT LIBRE 2 — GET /mapeo-proveedor/:cliente_id/:proveedor
// ═══════════════════════════════════════════════════════════════
router.get('/mapeo-proveedor/:cliente_id/:proveedor', async (req, res) => {
  try {
    const { cliente_id, proveedor } = req.params;
    const r = await pool.query(
      `SELECT mapeo FROM proveedores_mapeo_excel
       WHERE cliente_id=$1 AND proveedor_nombre=$2
       ORDER BY actualizado_en DESC LIMIT 1`,
      [cliente_id, decodeURIComponent(proveedor)]
    );
    res.json({ mapeo: r.rows[0]?.mapeo || null });
  } catch (err) {
    console.error('GET /mapeo-proveedor error:', err.message);
    res.status(500).json({ mensaje: 'Error', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINT LIBRE 3 — POST /mapeo-proveedor/:cliente_id
// ═══════════════════════════════════════════════════════════════
router.post('/mapeo-proveedor/:cliente_id', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const { proveedor, mapeo } = req.body;
    if (!cliente_id || !proveedor || !mapeo) return res.status(400).json({ mensaje: 'Faltan campos' });
    const proveedor_id = await getOrCreateProveedor(cliente_id, proveedor);
    const existe = await pool.query(
      'SELECT id FROM proveedores_mapeo_excel WHERE cliente_id=$1 AND proveedor_id=$2 LIMIT 1',
      [cliente_id, proveedor_id]
    );
    if (existe.rows[0]) {
      await pool.query(
        `UPDATE proveedores_mapeo_excel
         SET mapeo=$1, proveedor_nombre=$2, actualizado_en=now()
         WHERE cliente_id=$3 AND proveedor_id=$4`,
        [JSON.stringify(mapeo), proveedor.trim(), cliente_id, proveedor_id]
      );
    } else {
      await pool.query(
        `INSERT INTO proveedores_mapeo_excel (cliente_id, proveedor_id, proveedor_nombre, mapeo, fila_encabezado)
         VALUES ($1,$2,$3,$4,0)`,
        [cliente_id, proveedor_id, proveedor.trim(), JSON.stringify(mapeo)]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /mapeo-proveedor error:', err.message);
    res.status(500).json({ mensaje: 'Error al guardar mapeo', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINT LIBRE 3b — DELETE /mapeo-proveedor/:cliente_id/:clave
// ═══════════════════════════════════════════════════════════════
router.delete('/mapeo-proveedor/:cliente_id/:clave', async (req, res) => {
  try {
    const { cliente_id, clave } = req.params;
    await pool.query(
      'DELETE FROM proveedores_mapeo_excel WHERE cliente_id=$1 AND proveedor_nombre=$2',
      [cliente_id, decodeURIComponent(clave)]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /mapeo-proveedor error:', err.message);
    res.status(500).json({ mensaje: 'Error al eliminar mapeo', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINT LIBRE 4 — POST /aplicar-libre
// ═══════════════════════════════════════════════════════════════
router.post('/aplicar-libre', (req, res, next) => { req.setTimeout(300000); next(); }, async (req, res) => {
  try {
    const { cliente_id, proveedor_nombre, archivo_base64, mapeo } = req.body;
    if (!cliente_id || !archivo_base64 || !mapeo) return res.status(400).json({ mensaje: 'Faltan datos obligatorios' });

    const buffer = Buffer.from(archivo_base64, 'base64');
    const filas = leerExcelConMapeoLibre(buffer, mapeo);
    const proveedor_id = proveedor_nombre ? await getOrCreateProveedor(cliente_id, proveedor_nombre) : null;

    const existRes = await pool.query(
      'SELECT id, codigo FROM productos_propios WHERE cliente_id=$1',
      [cliente_id]
    );
    const existMap = new Map(existRes.rows.map(r => [String(r.codigo || '').trim().toUpperCase(), r.id]));

    let nuevos = 0, actualizados = 0, errores = 0;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const BATCH = 100;
      for (let i = 0; i < filas.length; i += BATCH) {
        const lote = filas.slice(i, i + BATCH);
        for (const prod of lote) {
          const descripcion = prod.descripcion.trim();
          const codigo = prod.codigo.trim();
          if (!descripcion && !codigo) continue;
          const key = codigo.toUpperCase();
          try {
            if (existMap.has(key)) {
              await client.query(
                `UPDATE productos_propios SET
                   descripcion=$1,
                   precio_costo=COALESCE($2, precio_costo),
                   precio_venta_1=COALESCE($3, precio_venta_1),
                   precio_venta_2=COALESCE($4, precio_venta_2),
                   precio_venta_final=COALESCE($5, precio_venta_final),
                   marca=COALESCE(NULLIF($6,''), marca),
                   rubro=COALESCE(NULLIF($7,''), rubro),
                   unidad_medida=COALESCE(NULLIF($8,''), unidad_medida),
                   ean=COALESCE(NULLIF($9,''), ean),
                   dto_1=COALESCE($10, dto_1), dto_2=COALESCE($11, dto_2), dto_3=COALESCE($12, dto_3),
                   alicuota_iva=COALESCE($13, alicuota_iva),
                   proveedor_id=COALESCE($14, proveedor_id), modificado_en=now()
                 WHERE id=$15`,
                [
                  descripcion,
                  toNum(prod.precio_costo), toNum(prod.precio_venta_1), toNum(prod.precio_venta_2),
                  toNum(prod.precio_venta_3),
                  prod.marca, prod.rubro, prod.unidad_medida, prod.ean,
                  toNum(prod.descuento_1), toNum(prod.descuento_2), toNum(prod.descuento_3),
                  toNum(prod.iva), proveedor_id, existMap.get(key),
                ]
              );
              actualizados++;
            } else {
              await client.query(
                `INSERT INTO productos_propios
                   (cliente_id, proveedor_id, codigo, descripcion, precio_costo, precio_venta_1,
                    precio_venta_2, precio_venta_final, marca, rubro, unidad_medida, ean,
                    dto_1, dto_2, dto_3, alicuota_iva, activo)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true)`,
                [
                  cliente_id, proveedor_id, codigo || null, descripcion,
                  toNum(prod.precio_costo) ?? 0, toNum(prod.precio_venta_1) ?? 0,
                  toNum(prod.precio_venta_2) ?? 0, toNum(prod.precio_venta_3) ?? 0,
                  prod.marca || null, prod.rubro || null, prod.unidad_medida || null, prod.ean || null,
                  toNum(prod.descuento_1) ?? 0, toNum(prod.descuento_2) ?? 0,
                  toNum(prod.descuento_3) ?? 0, toNum(prod.iva) ?? 0,
                ]
              );
              if (key) existMap.set(key, -1);
              nuevos++;
            }
          } catch { errores++; }
        }
      }
      await client.query(
        `INSERT INTO importaciones_historial
           (cliente_id, proveedor_id, total_excel, nuevos, aplicados, errores)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [cliente_id, proveedor_id, filas.length, nuevos, nuevos + actualizados, errores]
      );
      await client.query('COMMIT');
      res.json({ ok: true, importados: nuevos + actualizados, nuevos, actualizados, errores, proveedor_id });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('POST /aplicar-libre error:', err.message);
    res.status(500).json({ mensaje: 'Error al importar', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINT 10 — PUT /actualizar-precios  (batch price update)
// ═══════════════════════════════════════════════════════════════
router.put('/actualizar-precios', async (req, res) => {
  const { cliente_id, productos } = req.body;
  if (!cliente_id || !Array.isArray(productos) || productos.length === 0)
    return res.status(400).json({ mensaje: 'Datos incompletos' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let actualizados = 0;
    for (const p of productos) {
      const r = await client.query(
        `UPDATE productos_propios
         SET precio_costo=$1,
             dto_1=$2, dto_2=$3, dto_3=$4,
             imp_1=$5, imp_2=$6,
             alicuota_iva=$7,
             utilidad_1=$8, utilidad_2=$9, utilidad_3=$10,
             precio_venta_final=$11, precio_venta_2=$12, precio_venta_3=$13,
             modificado_en=now()
         WHERE id=$14 AND cliente_id=$15`,
        [
          p.precio_costo || 0,
          p.descuento_1 || 0, p.descuento_2 || 0, p.descuento_3 || 0,
          p.impuesto_1 || 0, p.impuesto_2 || 0,
          p.iva || 0,
          p.utilidad_1 || 0, p.utilidad_2 || 0, p.utilidad_3 || 0,
          p.precio_venta_final || 0, p.precio_venta_2 || 0, p.precio_venta_3 || 0,
          p.id, cliente_id,
        ]
      );
      actualizados += r.rowCount;
    }
    await client.query('COMMIT');
    res.json({ ok: true, actualizados });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PUT /actualizar-precios error:', err.message);
    res.status(500).json({ mensaje: 'Error al actualizar precios', detalle: err.message });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /productos/:cliente_id/:id  — producto individual
// ═══════════════════════════════════════════════════════════════
router.get('/productos/:cliente_id/:id', async (req, res) => {
  try {
    const { cliente_id, id } = req.params;
    const r = await pool.query(
      `SELECT p.*, pv.nombre AS proveedor_nombre
       FROM productos_propios p
       LEFT JOIN proveedores pv ON pv.id = p.proveedor_id
       WHERE p.id=$1 AND p.cliente_id=$2 LIMIT 1`,
      [id, cliente_id]
    );
    if (!r.rows[0]) return res.status(404).json({ mensaje: 'Producto no encontrado' });
    res.json({ producto: r.rows[0] });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /productos/:cliente_id/:id/historial  — historial precios
// ═══════════════════════════════════════════════════════════════
router.get('/productos/:cliente_id/:id/historial', async (req, res) => {
  try {
    const { cliente_id, id } = req.params;
    const r = await pool.query(
      `SELECT precio_costo_anterior, precio_venta_anterior, fecha
       FROM productos_propios_precios
       WHERE producto_id=$1 AND cliente_id=$2
       ORDER BY fecha DESC LIMIT 5`,
      [id, cliente_id]
    ).catch(() => ({ rows: [] }));
    res.json({ historial: r.rows });
  } catch (err) {
    res.json({ historial: [] });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /analizar-diff  — clasificar sin importar (paso 3 UI)
// ═══════════════════════════════════════════════════════════════
router.post('/analizar-diff', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ mensaje: 'Se requiere un archivo Excel' });
    const { cliente_id, proveedor } = req.body;
    if (!cliente_id) return res.status(400).json({ mensaje: 'cliente_id requerido' });

    const cfg = typeof req.body.configuracion === 'string'
      ? JSON.parse(req.body.configuracion) : (req.body.configuracion || {});
    const { hojas_seleccionadas = [], mapeo = {}, marca_defecto, rubro_defecto } = cfg;

    // Guardar archivo temporal 30 min
    const tempId = genTempId();
    tempFiles.set(tempId, { buffer: req.file.buffer, expires: Date.now() + 30 * 60 * 1000 });

    // Resolver proveedor_id
    let proveedor_id = null;
    if (proveedor && proveedor.trim()) {
      const pe = await pool.query('SELECT id FROM proveedores WHERE cliente_id=$1 AND nombre=$2 LIMIT 1', [cliente_id, proveedor.trim()]);
      if (pe.rows[0]) proveedor_id = pe.rows[0].id;
    }
    const prefix = calcPrefix(proveedor);

    // Cargar DB — productos del cliente
    const dbRes = await pool.query(
      `SELECT id, codigo, proveedor_id, descripcion,
              COALESCE(precio_costo,0)::numeric       AS precio_costo,
              COALESCE(precio_venta_1,0)::numeric     AS precio_venta_1,
              COALESCE(precio_venta_2,0)::numeric     AS precio_venta_2,
              COALESCE(precio_venta_final,0)::numeric AS precio_venta_final,
              COALESCE(precio_venta_3,0)::numeric     AS precio_venta_3,
              marca, rubro, unidad_medida, ean,
              COALESCE(dto_1,0)::numeric AS dto_1,
              COALESCE(dto_2,0)::numeric AS dto_2,
              COALESCE(dto_3,0)::numeric AS dto_3,
              COALESCE(alicuota_iva,0)::numeric AS alicuota_iva,
              COALESCE(stock_actual,0)::numeric AS stock_actual,
              COALESCE(stock_minimo,0)::numeric AS stock_minimo
       FROM productos_propios WHERE cliente_id=$1`,
      [cliente_id]
    );
    const dbMap = new Map(dbRes.rows.map(r => [String(r.codigo || '').trim().toUpperCase(), r]));

    // Nombres de proveedores para mostrar en UI
    const provRes = await pool.query('SELECT id, nombre FROM proveedores WHERE cliente_id=$1', [cliente_id]);
    const provNombres = new Map(provRes.rows.map(r => [Number(r.id), r.nombre]));

    // Leer Excel
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });

    const CAMPOS_DIFF = [
      { campo: 'precio_costo',      label: 'Precio costo', tipo: 'num' },
      { campo: 'precio_venta_1',    label: 'PV1',          tipo: 'num' },
      { campo: 'precio_venta_2',    label: 'PV2',          tipo: 'num' },
      { campo: 'precio_venta_final',label: 'PV Final',     tipo: 'num' },
      { campo: 'precio_venta_3',    label: 'PV3',          tipo: 'num' },
      { campo: 'descripcion',       label: 'Descripción',  tipo: 'str' },
      { campo: 'marca',             label: 'Marca',        tipo: 'str' },
      { campo: 'rubro',             label: 'Rubro',        tipo: 'str' },
      { campo: 'unidad_medida',     label: 'Unidad',       tipo: 'str' },
      { campo: 'ean',               label: 'EAN',          tipo: 'str' },
      { campo: 'dto_1',             label: 'Descuento 1%', tipo: 'num' },
      { campo: 'dto_2',             label: 'Descuento 2%', tipo: 'num' },
      { campo: 'dto_3',             label: 'Descuento 3%', tipo: 'num' },
      { campo: 'alicuota_iva',      label: 'IVA%',         tipo: 'num' },
      { campo: 'stock_actual',      label: 'Stock',        tipo: 'num' },
      { campo: 'stock_minimo',      label: 'Stock mínimo', tipo: 'num' },
    ];

    const nuevos = [], actualizar = [], prefijados = [];
    const codigosEnExcel = new Set();
    let preciosSuben = 0, preciosBajan = 0, preciosSinCambio = 0, sumVar = 0, cntVar = 0;

    for (const hojaName of hojas_seleccionadas) {
      if (!wb.Sheets[hojaName]) continue;
      const filas = XLSX.utils.sheet_to_json(wb.Sheets[hojaName], { header: 1, defval: '' });
      if (!filas.length) continue;
      const headerIdx = detectarEncabezado(filas);
      const enc = filas[headerIdx].map(c => String(c).trim());
      const datos = filas.slice(headerIdx + 1).filter(f => f.some(c => c !== '' && c != null));

      for (const fila of datos) {
        const descCols = Array.isArray(mapeo.descripcion) ? mapeo.descripcion : (mapeo.descripcion ? [mapeo.descripcion] : []);
        const descripcion = descCols.map(c => val(fila, c, enc)).filter(Boolean).join(' ').trim();
        const codigo = val(fila, mapeo.codigo, enc) || null;
        if (!descripcion && !codigo) continue;

        const key = codigo ? codigo.trim().toUpperCase() : null;
        if (key) codigosEnExcel.add(key);

        const camposExcel = {
          precio_costo:       numVal(fila, mapeo.precio_costo, enc),
          precio_venta_1:     numVal(fila, mapeo.precio_venta_1, enc),
          precio_venta_2:     numVal(fila, mapeo.precio_venta_2, enc),
          precio_venta_final: numVal(fila, mapeo.precio_venta_final || mapeo.precio_venta_1, enc),
          precio_venta_3:     numVal(fila, mapeo.precio_venta_3, enc),
          descripcion:        descripcion || null,
          marca:              val(fila, mapeo.marca, enc) || marca_defecto || null,
          rubro:              val(fila, mapeo.rubro, enc) || rubro_defecto || null,
          unidad_medida:      val(fila, mapeo.unidad_medida, enc) || null,
          ean:                val(fila, mapeo.ean, enc) || null,
          dto_1:              numVal(fila, mapeo.descuento_1, enc),
          dto_2:              numVal(fila, mapeo.descuento_2, enc),
          dto_3:              numVal(fila, mapeo.descuento_3, enc),
          alicuota_iva:       numVal(fila, mapeo.iva, enc),
          stock_actual:       numVal(fila, mapeo.stock, enc),
          stock_minimo:       numVal(fila, mapeo.stock_minimo, enc),
        };

        const existing = key ? dbMap.get(key) : null;

        if (!existing) {
          nuevos.push({ codigo, descripcion });
        } else {
          const mismoProv = proveedor_id === null ||
            existing.proveedor_id === null ||
            Number(existing.proveedor_id) === Number(proveedor_id);

          if (mismoProv) {
            // Mismo proveedor → calcular diffs
            const diffs = [];
            for (const { campo, label, tipo } of CAMPOS_DIFF) {
              const vEx = camposExcel[campo];
              if (vEx === null || vEx === undefined) continue;
              const vDb = existing[campo];
              const changed = tipo === 'num'
                ? Math.abs((parseFloat(vEx) || 0) - (parseFloat(vDb) || 0)) > 0.001
                : String(vEx || '').trim() !== String(vDb || '').trim();
              if (changed) diffs.push({ campo, label, anterior: vDb ?? null, nuevo: vEx });
            }

            // Estadísticas de precio
            const pcDb = parseFloat(existing.precio_costo) || 0;
            const pcEx = camposExcel.precio_costo;
            if (pcEx !== null) {
              if (pcEx > pcDb)      { preciosSuben++;    sumVar += pcDb > 0 ? ((pcEx - pcDb) / pcDb) * 100 : 0; cntVar++; }
              else if (pcEx < pcDb) { preciosBajan++;    sumVar += pcDb > 0 ? ((pcEx - pcDb) / pcDb) * 100 : 0; cntVar++; }
              else                   preciosSinCambio++;
            }

            actualizar.push({ codigo, descripcion, id: existing.id, diffs });
          } else {
            // Distinto proveedor → prefijo automático
            const codigoPrefijado = prefix ? `${prefix}-${codigo}` : codigo;
            const provNombre = provNombres.get(Number(existing.proveedor_id)) || `(sin nombre)`;
            prefijados.push({ codigo_original: codigo, codigo_nuevo: codigoPrefijado, descripcion, proveedor_existente: provNombre });
          }
        }
      }
    }

    // Productos del mismo proveedor en DB que NO están en el Excel
    const ausentes = [];
    for (const [key, row] of dbMap) {
      const esMismoProv = proveedor_id === null ||
        row.proveedor_id === null ||
        Number(row.proveedor_id) === Number(proveedor_id);
      if (esMismoProv && !codigosEnExcel.has(key) && row.codigo) {
        ausentes.push({ codigo: row.codigo, descripcion: row.descripcion, precio_costo: parseFloat(row.precio_costo) || 0 });
      }
    }

    res.json({
      temp_id: tempId,
      resumen: {
        nuevos:             nuevos.length,
        actualizar:         actualizar.length,
        prefijados:         prefijados.length,
        ausentes:           ausentes.length,
        precios_suben:      preciosSuben,
        precios_bajan:      preciosBajan,
        precios_sin_cambio: preciosSinCambio,
        variacion_promedio: cntVar > 0 ? Math.round(sumVar / cntVar * 10) / 10 : 0,
      },
      actualizar,
      prefijados,
      ausentes,
    });
  } catch (err) {
    console.error('POST /analizar-diff error:', err.message);
    res.status(500).json({ mensaje: 'Error al analizar', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /analizar-v2  — detectar todas las hojas del Excel
// ═══════════════════════════════════════════════════════════════
router.post('/analizar-v2', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ mensaje: 'Se requiere un archivo Excel' });
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const hojas = wb.SheetNames.map(nombre => {
      try {
        const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, defval: '' });
        if (!filas.length) return { nombre, columnas: [], total_filas: 0, muestra: [] };
        const headerIdx = detectarEncabezado(filas);
        const columnasConIdx = filas[headerIdx]
          .map((c, i) => ({ nombre: String(c ?? '').trim().replace('[object Object]', ''), idx: i }))
          .filter(({ nombre }) => nombre !== '');
        const columnas = columnasConIdx.map(c => c.nombre);
        const datos = filas.slice(headerIdx + 1).filter(f => f.some(c => c !== '' && c != null));
        const muestra = datos.slice(0, 3).map(fila =>
          Object.fromEntries(columnasConIdx.map(({ nombre, idx }) => [nombre, fila[idx] != null ? String(fila[idx]) : '']))
        );
        return { nombre, columnas, total_filas: datos.length, muestra };
      } catch { return { nombre, columnas: [], total_filas: 0, muestra: [] }; }
    });
    res.json({ hojas });
  } catch (err) {
    console.error('POST /analizar-v2 error:', err.message);
    res.status(500).json({ mensaje: 'Error al analizar', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /importar-v2  — importar con selección de hojas
// ═══════════════════════════════════════════════════════════════
router.post('/importar-v2', (req, res, next) => { req.setTimeout(300000); next(); }, upload.single('archivo'), async (req, res) => {
  const client = await pool.connect();
  try {
    // Aceptar archivo subido O temp_id del análisis previo
    let fileBuffer;
    if (req.file) {
      fileBuffer = req.file.buffer;
    } else {
      const tmpId = req.body.temp_id;
      if (!tmpId) return res.status(400).json({ mensaje: 'Se requiere un archivo Excel o temp_id' });
      const tmp = tempFiles.get(tmpId);
      if (!tmp) return res.status(400).json({ mensaje: 'Archivo temporal no encontrado o expirado. Volvé al mapeo y analizá de nuevo.' });
      fileBuffer = tmp.buffer;
      tempFiles.delete(tmpId);
    }

    const { cliente_id, proveedor } = req.body;
    const cfg = typeof req.body.configuracion === 'string'
      ? JSON.parse(req.body.configuracion) : (req.body.configuracion || {});
    const { hojas_seleccionadas = [], mapeo = {}, marca_defecto, rubro_defecto } = cfg;

    let proveedor_id = null;
    if (proveedor && proveedor.trim()) {
      const pe = await pool.query('SELECT id FROM proveedores WHERE cliente_id=$1 AND nombre=$2 LIMIT 1', [cliente_id, proveedor.trim()]);
      if (pe.rows[0]) { proveedor_id = pe.rows[0].id; }
      else { const ins = await pool.query('INSERT INTO proveedores (cliente_id, nombre, activo) VALUES ($1,$2,true) RETURNING id', [cliente_id, proveedor.trim()]); proveedor_id = ins.rows[0].id; }
    }
    const prefix = calcPrefix(proveedor);

    const wb = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    const existRes = await pool.query('SELECT id, codigo, proveedor_id FROM productos_propios WHERE cliente_id=$1', [cliente_id]);
    const existMap = new Map(existRes.rows.map(r => [String(r.codigo || '').trim().toUpperCase(), { id: r.id, proveedor_id: r.proveedor_id }]));

    let totalNuevos = 0, totalActualizados = 0, totalErrores = 0;
    const porHoja = [];
    const BATCH = 100;

    await client.query('BEGIN');
    for (const hojaName of hojas_seleccionadas) {
      if (!wb.Sheets[hojaName]) continue;
      const filas = XLSX.utils.sheet_to_json(wb.Sheets[hojaName], { header: 1, defval: '' });
      if (!filas.length) { porHoja.push({ hoja: hojaName, nuevos: 0, actualizados: 0, errores: 0 }); continue; }
      const headerIdx = detectarEncabezado(filas);
      const enc = filas[headerIdx].map(c => String(c).trim());
      const datos = filas.slice(headerIdx + 1).filter(f => f.some(c => c !== '' && c != null));
      let nuevos = 0, actualizados = 0, errores = 0;

      for (let i = 0; i < datos.length; i += BATCH) {
        for (const fila of datos.slice(i, i + BATCH)) {
          try {
            const descCols = Array.isArray(mapeo.descripcion) ? mapeo.descripcion : (mapeo.descripcion ? [mapeo.descripcion] : []);
            const descripcion = descCols.map(c => val(fila, c, enc)).filter(Boolean).join(' ').trim();
            if (!descripcion) { errores++; continue; }
            const codigo = val(fila, mapeo.codigo, enc) || null;
            const key = codigo ? codigo.trim().toUpperCase() : null;
            const campos = {
              precio_costo:   numVal(fila, mapeo.precio_costo, enc),
              precio_venta_1: numVal(fila, mapeo.precio_venta_1, enc),
              precio_venta_2: numVal(fila, mapeo.precio_venta_2, enc),
              precio_venta_3: numVal(fila, mapeo.precio_venta_3, enc),
              marca:          val(fila, mapeo.marca, enc) || marca_defecto || null,
              rubro:          val(fila, mapeo.rubro, enc) || rubro_defecto || null,
              unidad_medida:  val(fila, mapeo.unidad_medida, enc) || null,
              ean:            val(fila, mapeo.ean, enc) || null,
              dto_1:          numVal(fila, mapeo.descuento_1, enc),
              dto_2:          numVal(fila, mapeo.descuento_2, enc),
              dto_3:          numVal(fila, mapeo.descuento_3, enc),
              alicuota_iva:   numVal(fila, mapeo.iva, enc),
              stock_actual:   numVal(fila, mapeo.stock, enc),
              stock_minimo:   numVal(fila, mapeo.stock_minimo, enc),
            };
            if (key && existMap.has(key)) {
              const existing = existMap.get(key);
              const mismoProv = proveedor_id === null ||
                existing.proveedor_id === null ||
                Number(existing.proveedor_id) === Number(proveedor_id);

              if (mismoProv) {
                // CASO 1 — mismo proveedor: actualizar
                await client.query(
                  `UPDATE productos_propios SET descripcion=$1,proveedor_id=$2,
                   precio_costo=COALESCE($3,precio_costo),precio_venta_1=COALESCE($4,precio_venta_1),
                   precio_venta_2=COALESCE($5,precio_venta_2),precio_venta_3=COALESCE($6,precio_venta_3),
                   marca=COALESCE($7,marca),rubro=COALESCE($8,rubro),
                   unidad_medida=COALESCE($9,unidad_medida),ean=COALESCE($10,ean),
                   dto_1=COALESCE($11,dto_1),dto_2=COALESCE($12,dto_2),dto_3=COALESCE($13,dto_3),
                   alicuota_iva=COALESCE($14,alicuota_iva),
                   stock_actual=COALESCE($15,stock_actual),stock_minimo=COALESCE($16,stock_minimo),
                   modificado_en=now() WHERE id=$17 AND cliente_id=$18`,
                  [descripcion,proveedor_id,campos.precio_costo,campos.precio_venta_1,campos.precio_venta_2,
                   campos.precio_venta_3,campos.marca,campos.rubro,campos.unidad_medida,campos.ean,
                   campos.dto_1,campos.dto_2,campos.dto_3,campos.alicuota_iva,
                   campos.stock_actual,campos.stock_minimo,existing.id,cliente_id]
                );
                actualizados++;
              } else {
                // CASO 2 — distinto proveedor: insertar con prefijo
                const codigoPrefijado = prefix ? `${prefix}-${codigo}` : codigo;
                const ins = await client.query(
                  `INSERT INTO productos_propios
                   (cliente_id,proveedor_id,codigo,descripcion,precio_costo,precio_venta_1,precio_venta_2,
                    precio_venta_3,marca,rubro,unidad_medida,ean,dto_1,dto_2,dto_3,alicuota_iva,
                    stock_actual,stock_minimo,activo)
                   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,true) RETURNING id`,
                  [cliente_id,proveedor_id,codigoPrefijado,descripcion,
                   campos.precio_costo||0,campos.precio_venta_1||0,campos.precio_venta_2||0,campos.precio_venta_3||0,
                   campos.marca,campos.rubro,campos.unidad_medida,campos.ean,
                   campos.dto_1||0,campos.dto_2||0,campos.dto_3||0,campos.alicuota_iva||0,
                   campos.stock_actual||0,campos.stock_minimo||0]
                );
                const newKey = codigoPrefijado ? codigoPrefijado.trim().toUpperCase() : null;
                if (newKey) existMap.set(newKey, { id: ins.rows[0].id, proveedor_id });
                nuevos++;
              }
            } else {
              // CASO 3 — código nuevo: insertar normal
              const ins = await client.query(
                `INSERT INTO productos_propios
                 (cliente_id,proveedor_id,codigo,descripcion,precio_costo,precio_venta_1,precio_venta_2,
                  precio_venta_3,marca,rubro,unidad_medida,ean,dto_1,dto_2,dto_3,alicuota_iva,
                  stock_actual,stock_minimo,activo)
                 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,true) RETURNING id`,
                [cliente_id,proveedor_id,codigo,descripcion,
                 campos.precio_costo||0,campos.precio_venta_1||0,campos.precio_venta_2||0,campos.precio_venta_3||0,
                 campos.marca,campos.rubro,campos.unidad_medida,campos.ean,
                 campos.dto_1||0,campos.dto_2||0,campos.dto_3||0,campos.alicuota_iva||0,
                 campos.stock_actual||0,campos.stock_minimo||0]
              );
              if (key) existMap.set(key, { id: ins.rows[0].id, proveedor_id });
              nuevos++;
            }
          } catch { errores++; }
        }
      }
      totalNuevos += nuevos; totalActualizados += actualizados; totalErrores += errores;
      porHoja.push({ hoja: hojaName, nuevos, actualizados, errores });
    }
    if (proveedor_id) {
      await client.query(
        `INSERT INTO importaciones_historial (cliente_id,proveedor_id,nuevos,aplicados,errores) VALUES($1,$2,$3,$4,$5)`,
        [cliente_id, proveedor_id, totalNuevos, totalNuevos + totalActualizados, totalErrores]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true, importados: totalNuevos + totalActualizados, nuevos: totalNuevos,
      actualizados: totalActualizados, errores: totalErrores,
      total: totalNuevos + totalActualizados + totalErrores, por_hoja: porHoja });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /importar-v2 error:', err.message);
    res.status(500).json({ mensaje: 'Error al importar', detalle: err.message });
  } finally { client.release(); }
});

// ═══════════════════════════════════════════════════════════════
// PUT /actualizar-precios-v2
// ═══════════════════════════════════════════════════════════════
router.put('/actualizar-precios-v2', async (req, res) => {
  try {
    const { cliente_id, productos } = req.body;
    if (!cliente_id || !Array.isArray(productos) || !productos.length)
      return res.status(400).json({ mensaje: 'Datos inválidos' });

    // Asegurar columnas nuevas por si no existían al iniciar
    const colsNuevas = [
      'dto_1','dto_2','dto_3','imp_1','imp_2',
      'utilidad_1','utilidad_2','utilidad_3',
      'precio_venta_2','precio_venta_3',
    ];
    for (const col of colsNuevas) {
      await pool.query(`ALTER TABLE productos_propios ADD COLUMN IF NOT EXISTS ${col} NUMERIC DEFAULT 0`).catch(() => {});
    }
    await pool.query(`ALTER TABLE productos_propios ADD COLUMN IF NOT EXISTS stock_minimo NUMERIC DEFAULT 0`).catch(() => {});

    let actualizados = 0;
    for (const p of productos) {
      try {
        // Guardar historial de precios
        const prev = await pool.query(
          'SELECT precio_costo, precio_venta_final FROM productos_propios WHERE id=$1 AND cliente_id=$2',
          [p.id, cliente_id]
        );
        if (prev.rows[0]) {
          await pool.query(
            `INSERT INTO productos_propios_precios (producto_id,cliente_id,precio_costo_anterior,precio_venta_anterior)
             VALUES($1,$2,$3,$4)`,
            [p.id, cliente_id, prev.rows[0].precio_costo, prev.rows[0].precio_venta_final]
          ).catch(() => {});
        }
        // UPDATE principal — cada producto en su propio try/catch
        const r = await pool.query(
          `UPDATE productos_propios SET
             precio_costo=COALESCE($1,precio_costo),
             dto_1=COALESCE($2,dto_1), dto_2=COALESCE($3,dto_2), dto_3=COALESCE($4,dto_3),
             imp_1=COALESCE($5,imp_1), imp_2=COALESCE($6,imp_2),
             alicuota_iva=COALESCE($7,alicuota_iva),
             utilidad_1=COALESCE($8,utilidad_1), utilidad_2=COALESCE($9,utilidad_2), utilidad_3=COALESCE($10,utilidad_3),
             precio_venta_final=COALESCE($11,precio_venta_final),
             precio_venta_1=COALESCE($12,precio_venta_1), precio_venta_2=COALESCE($13,precio_venta_2), precio_venta_3=COALESCE($14,precio_venta_3),
             marca=COALESCE($15,marca), rubro=COALESCE($16,rubro),
             unidad_medida=COALESCE($17,unidad_medida), stock_minimo=COALESCE($18,stock_minimo),
             activo=COALESCE($19,activo), imagen_url=COALESCE($20,imagen_url),
             modificado_en=now()
           WHERE id=$21 AND cliente_id=$22`,
          [p.precio_costo??null, p.descuento_1??null, p.descuento_2??null, p.descuento_3??null,
           p.impuesto_1??null, p.impuesto_2??null, p.iva??null,
           p.utilidad_1??null, p.utilidad_2??null, p.utilidad_3??null,
           p.precio_venta_final??null, p.precio_venta_1??null, p.precio_venta_2??null, p.precio_venta_3??null,
           p.marca??null, p.rubro??null, p.unidad_medida??null,
           p.stock_minimo??null, p.activo??null, p.imagen_url??null, p.id, cliente_id]
        );
        actualizados += r.rowCount;
      } catch (err) {
        console.error(`PUT /actualizar-precios-v2 producto ${p.id}:`, err.message);
      }
    }
    res.json({ ok: true, actualizados });
  } catch (err) {
    console.error('PUT /actualizar-precios-v2 error:', err.message);
    res.status(500).json({ mensaje: 'Error al actualizar', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PUT /actualizar-masivo
// ═══════════════════════════════════════════════════════════════
router.put('/actualizar-masivo', async (req, res) => {
  try {
    const { cliente_id, ids, campo, valor } = req.body;
    const PERMITIDOS = ['marca','rubro','utilidad_1','utilidad_2','utilidad_3','precio_costo','alicuota_iva','activo','unidad_medida','stock_minimo'];
    if (!PERMITIDOS.includes(campo)) return res.status(400).json({ mensaje: 'Campo no permitido' });
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ mensaje: 'IDs requeridos' });
    const r = await pool.query(
      `UPDATE productos_propios SET ${campo}=$1, modificado_en=now() WHERE id=ANY($2) AND cliente_id=$3`,
      [valor, ids, cliente_id]
    );
    res.json({ ok: true, actualizados: r.rowCount });
  } catch (err) {
    console.error('PUT /actualizar-masivo error:', err.message);
    res.status(500).json({ mensaje: 'Error', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PUT /ajuste-porcentaje
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// PUT /ajuste-porcentaje
// confirmar=false → solo calcular (sin guardar)
// confirmar=true  → calcular y guardar
// ═══════════════════════════════════════════════════════════════
router.put('/ajuste-porcentaje', async (req, res) => {
  try {
    const { cliente_id, ids, tipo, porcentaje, utilidad_anterior, utilidad_nueva, confirmar } = req.body;

    const TIPOS = ['aumento_costo', 'descuento_costo', 'cambio_utilidad'];
    if (!TIPOS.includes(tipo)) return res.status(400).json({ mensaje: 'Tipo inválido' });
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ mensaje: 'IDs requeridos' });
    if (!cliente_id) return res.status(400).json({ mensaje: 'cliente_id requerido' });

    const productosRes = await pool.query(
      `SELECT id, codigo, descripcion,
              precio_costo, dto_1, dto_2, dto_3,
              imp_1, imp_2, alicuota_iva,
              utilidad_1, utilidad_2, utilidad_3
       FROM productos_propios
       WHERE id=ANY($1) AND cliente_id=$2`,
      [ids, cliente_id]
    );

    const productos = productosRes.rows;
    if (!productos.length) return res.status(404).json({ mensaje: 'No se encontraron productos' });

    const calcPcFinal = (pc, d1, d2, d3) =>
      pc * (1 - (d1||0)/100) * (1 - (d2||0)/100) * (1 - (d3||0)/100);
    const calcPv = (pcFinal, i1, i2, iva, ut) =>
      pcFinal * (1 + (i1||0)/100) * (1 + (i2||0)/100) * (1 + (iva||0)/100) * (1 + (ut||0)/100);

    const resultados = [];

    for (const p of productos) {
      const pcAnterior = parseFloat(p.precio_costo) || 0;
      const pcFinalAnterior = calcPcFinal(pcAnterior, p.dto_1, p.dto_2, p.dto_3);
      const pv1Anterior = calcPv(pcFinalAnterior, p.imp_1, p.imp_2, p.alicuota_iva, p.utilidad_1);
      const pv2Anterior = calcPv(pcFinalAnterior, p.imp_1, p.imp_2, p.alicuota_iva, p.utilidad_2);
      const pv3Anterior = calcPv(pcFinalAnterior, p.imp_1, p.imp_2, p.alicuota_iva, p.utilidad_3);

      let pcNuevo = pcAnterior;
      let u1 = parseFloat(p.utilidad_1) || 0;
      let u2 = parseFloat(p.utilidad_2) || 0;
      let u3 = parseFloat(p.utilidad_3) || 0;

      if (tipo === 'aumento_costo') {
        pcNuevo = pcAnterior * (1 + (parseFloat(porcentaje) || 0) / 100);
      } else if (tipo === 'descuento_costo') {
        pcNuevo = pcAnterior * (1 - (parseFloat(porcentaje) || 0) / 100);
      } else if (tipo === 'cambio_utilidad') {
        const uAnt = parseFloat(utilidad_anterior) || 0;
        const uNueva = parseFloat(utilidad_nueva) || 0;
        if (Math.abs(u1 - uAnt) < 0.001) u1 = uNueva;
        if (Math.abs(u2 - uAnt) < 0.001) u2 = uNueva;
        if (Math.abs(u3 - uAnt) < 0.001) u3 = uNueva;
      }

      const pcFinalNuevo = calcPcFinal(pcNuevo, p.dto_1, p.dto_2, p.dto_3);
      const pv1Nuevo = calcPv(pcFinalNuevo, p.imp_1, p.imp_2, p.alicuota_iva, u1);
      const pv2Nuevo = calcPv(pcFinalNuevo, p.imp_1, p.imp_2, p.alicuota_iva, u2);
      const pv3Nuevo = calcPv(pcFinalNuevo, p.imp_1, p.imp_2, p.alicuota_iva, u3);

      resultados.push({
        id: p.id,
        codigo: p.codigo,
        descripcion: p.descripcion,
        precio_costo_anterior: +pcAnterior.toFixed(2),
        precio_costo_nuevo:    +pcNuevo.toFixed(2),
        pv1_anterior: +pv1Anterior.toFixed(2),
        pv1_nuevo:    +pv1Nuevo.toFixed(2),
        pv2_anterior: +pv2Anterior.toFixed(2),
        pv2_nuevo:    +pv2Nuevo.toFixed(2),
        pv3_anterior: +pv3Anterior.toFixed(2),
        pv3_nuevo:    +pv3Nuevo.toFixed(2),
        _pcFinalNuevo: +pcFinalNuevo.toFixed(4),
        _u1: u1, _u2: u2, _u3: u3,
        _pv1: +pv1Nuevo.toFixed(4),
        _pv2: +pv2Nuevo.toFixed(4),
        _pv3: +pv3Nuevo.toFixed(4),
        _pcNuevo: +pcNuevo.toFixed(4),
      });
    }

    // Si confirmar=true, guardar en DB
    if (confirmar) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const r of resultados) {
          await client.query(
            `UPDATE productos_propios
             SET precio_costo=$1, utilidad_1=$2, utilidad_2=$3, utilidad_3=$4,
                 precio_venta_final=$5, precio_venta_2=$6, precio_venta_3=$7,
                 modificado_en=now()
             WHERE id=$8 AND cliente_id=$9`,
            [r._pcNuevo, r._u1, r._u2, r._u3,
             r._pv1, r._pv2, r._pv3,
             r.id, cliente_id]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }

    // Limpiar campos internos antes de responder
    const publicos = resultados.map(({ _pcFinalNuevo, _u1, _u2, _u3, _pv1, _pv2, _pv3, _pcNuevo, ...pub }) => pub);
    res.json({ ok: true, actualizados: publicos.length, productos: publicos });
  } catch (err) {
    console.error('PUT /ajuste-porcentaje error:', err.message);
    res.status(500).json({ mensaje: 'Error al aplicar ajuste', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /buscar-imagen-producto — búsqueda IA de imagen por producto
// ═══════════════════════════════════════════════════════════════
router.post('/buscar-imagen-producto', async (req, res) => {
  try {
    const { descripcion, codigo, marca, cliente_id, productos: lote } = req.body;

    // Modo lote: array de hasta 50 productos
    if (Array.isArray(lote)) {
      if (lote.length > 50)
        return res.status(400).json({ mensaje: 'Máximo 50 productos por request' });

      const Anthropic = require('@anthropic-ai/sdk');
      const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const resultados = [];
      for (const prod of lote) {
        try {
          const query = [prod.descripcion, prod.marca ? 'marca ' + prod.marca : '', prod.codigo ? 'código ' + prod.codigo : ''].filter(Boolean).join(' ');
          const response = await claude.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 200,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            messages: [{
              role: 'user',
              content: `Buscá una imagen del producto: "${prod.descripcion}" ${prod.marca ? 'marca ' + prod.marca : ''} ${prod.codigo ? 'código ' + prod.codigo : ''}. Devolvé SOLO la URL directa de una imagen del producto (jpg, png o webp). Si no encontrás nada devolvé null.`,
            }],
          });
          const url = extraerUrlImagen(response);
          resultados.push({ id: prod.id, url });
        } catch (err) {
          console.error('buscar-imagen-producto lote item error:', err.message);
          resultados.push({ id: prod.id, url: null });
        }
      }
      return res.json({ ok: true, resultados });
    }

    // Modo individual
    if (!descripcion)
      return res.status(400).json({ mensaje: 'descripcion es requerida' });

    const Anthropic = require('@anthropic-ai/sdk');
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{
        role: 'user',
        content: `Buscá una imagen del producto: "${descripcion}" ${marca ? 'marca ' + marca : ''} ${codigo ? 'código ' + codigo : ''}. Devolvé SOLO la URL directa de una imagen del producto (jpg, png o webp). Si no encontrás nada devolvé null.`,
      }],
    });

    const url = extraerUrlImagen(response);
    res.json({ ok: true, url });
  } catch (err) {
    console.error('POST /buscar-imagen-producto error:', err.message);
    res.status(500).json({ mensaje: 'Error al buscar imagen', detalle: err.message });
  }
});

function extraerUrlImagen(response) {
  for (const block of response.content || []) {
    if (block.type === 'text') {
      const text = block.text || '';
      const match = text.match(/https?:\/\/\S+\.(?:jpg|jpeg|png|webp)(?:\?\S*)?/i);
      if (match) return match[0];
      if (text.trim().toLowerCase() === 'null') return null;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// DELETE /proveedor/:cliente_id/:proveedor_id — soft delete
// ═══════════════════════════════════════════════════════════════
router.delete('/proveedor/:cliente_id/:proveedor_id', async (req, res) => {
  try {
    const { cliente_id, proveedor_id } = req.params;
    await pool.query(
      'UPDATE proveedores SET activo=false WHERE id=$1 AND cliente_id=$2',
      [proveedor_id, cliente_id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /proveedor error:', err.message);
    res.status(500).json({ mensaje: 'Error al eliminar proveedor', detalle: err.message });
  }
});

module.exports = router;
