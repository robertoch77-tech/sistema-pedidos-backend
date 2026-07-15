const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const pool    = require('../../db');

// ── Multer en memoria ─────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── Asegurar tablas ───────────────────────────────────────────
async function asegurarTablas() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pi_productos (
        id                  BIGSERIAL PRIMARY KEY,
        codigo              TEXT UNIQUE,
        detalle             TEXT,
        detalle_normalizado TEXT,
        precio_venta        NUMERIC,
        rubro               TEXT,
        marca               TEXT,
        tipo                TEXT,
        unidad_medida       TEXT,
        ean                 TEXT,
        proveedor           TEXT,
        activo              BOOLEAN DEFAULT true,
        creado_en           TIMESTAMPTZ DEFAULT now(),
        actualizado_en      TIMESTAMPTZ DEFAULT now()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pi_clientes (
        id                BIGSERIAL PRIMARY KEY,
        numero_cliente    TEXT UNIQUE,
        razon_social      TEXT,
        cuit              TEXT,
        condicion_iva     TEXT,
        calle             TEXT,
        numero            TEXT,
        localidad         TEXT,
        provincia         TEXT,
        telefono          TEXT,
        celular           TEXT,
        email             TEXT,
        lista_precio      TEXT,
        condicion_venta   TEXT,
        descuento         NUMERIC,
        zona              TEXT,
        vendedor          TEXT,
        activo            BOOLEAN DEFAULT true,
        creado_en         TIMESTAMPTZ DEFAULT now(),
        actualizado_en    TIMESTAMPTZ DEFAULT now()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pi_importaciones (
        id          BIGSERIAL PRIMARY KEY,
        tipo        TEXT NOT NULL,
        importados  INTEGER DEFAULT 0,
        errores     INTEGER DEFAULT 0,
        total       INTEGER DEFAULT 0,
        creado_en   TIMESTAMPTZ DEFAULT now()
      )
    `);
  } catch (err) {
    console.error('PI Importar: error tablas:', err.message);
  }
}
asegurarTablas();

// ── Normalizar texto para búsqueda ────────────────────────────
function normalizar(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Leer Excel y detectar encabezado ─────────────────────────
function leerExcel(buffer) {
  const wb   = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  if (!rows.length) return [];

  // Buscar fila de encabezado — primera fila con ≥3 celdas no vacías
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const noVacias = rows[i].filter(c => String(c).trim() !== '').length;
    if (noVacias >= 3) { headerIdx = i; break; }
  }

  const headers = rows[headerIdx].map(h => String(h).trim());
  const data    = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every(c => String(c).trim() === '')) continue; // fila vacía
    const obj = {};
    headers.forEach((h, j) => { obj[h] = row[j] !== undefined ? row[j] : ''; });
    data.push(obj);
  }
  return data;
}

// ── Extraer número de cliente del inicio de razón social ──────
function extraerNumeroCliente(razonSocial) {
  if (!razonSocial) return { numero: null, nombre: String(razonSocial || '').trim() };
  const s   = String(razonSocial).trim();
  const m   = s.match(/^(\d+)\s+(.+)$/);
  if (m) return { numero: m[1], nombre: m[2].trim() };
  return { numero: null, nombre: s };
}

// ═══════════════════════════════════════════════════════════════
// POST /productos
// ═══════════════════════════════════════════════════════════════
router.post('/productos', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'Falta el archivo' });

  let importados = 0, errores = 0;

  try {
    const filas = leerExcel(req.file.buffer);

    for (const fila of filas) {
      const codigo       = String(fila['Código']         || fila['Codigo']          || '').trim();
      const detalle      = String(fila['Detalle']         || fila['Descripcion']      || fila['Descripción'] || '').trim();
      const precio_venta = parseFloat(String(fila['Precio Venta'] || fila['Precio'] || 0).replace(',', '.')) || null;
      const rubro        = String(fila['Observaciones']   || '').trim() || null;
      const marca        = String(fila['Marca']           || '').trim() || null;
      const tipo         = String(fila['Rubro']           || '').trim() || null;
      const unidad_medida= String(fila['Unidad Medida']   || fila['Unidad']          || '').trim() || null;
      const ean          = String(fila['EAN']             || '').trim() || null;
      const proveedor    = String(fila['Proveedor']       || '').trim() || null;

      if (!codigo && !detalle) { errores++; continue; }

      const detalle_normalizado = normalizar(detalle);

      try {
        await pool.query(`
          INSERT INTO pi_productos
            (codigo, detalle, detalle_normalizado, precio_venta, rubro, marca, tipo, unidad_medida, ean, proveedor, actualizado_en)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
          ON CONFLICT (codigo) DO UPDATE SET
            detalle             = EXCLUDED.detalle,
            detalle_normalizado = EXCLUDED.detalle_normalizado,
            precio_venta        = EXCLUDED.precio_venta,
            rubro               = EXCLUDED.rubro,
            marca               = EXCLUDED.marca,
            tipo                = EXCLUDED.tipo,
            unidad_medida       = EXCLUDED.unidad_medida,
            ean                 = EXCLUDED.ean,
            proveedor           = EXCLUDED.proveedor,
            actualizado_en      = now()
        `, [codigo || null, detalle || null, detalle_normalizado, precio_venta, rubro, marca, tipo, unidad_medida, ean, proveedor]);
        importados++;
      } catch {
        errores++;
      }
    }

    await pool.query(
      'INSERT INTO pi_importaciones (tipo, importados, errores, total) VALUES ($1,$2,$3,$4)',
      ['productos', importados, errores, importados + errores]
    ).catch(() => {});

    res.json({ ok: true, importados, errores, total: importados + errores });
  } catch (err) {
    console.error('PI importar productos:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /clientes
// ═══════════════════════════════════════════════════════════════
router.post('/clientes', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'Falta el archivo' });

  let importados = 0, errores = 0;

  try {
    const filas = leerExcel(req.file.buffer);

    for (const fila of filas) {
      const razonRaw      = String(fila['Razón Social'] || fila['Razon Social'] || fila['Nombre'] || '').trim();
      const { numero, nombre } = extraerNumeroCliente(razonRaw);
      const numero_cliente = numero || String(fila['Número'] || fila['Numero'] || '').trim() || null;
      const razon_social  = nombre;

      const cuit           = String(fila['Documento']     || fila['CUIT']         || '').trim() || null;
      const condicion_iva  = String(fila['sit. IVA']      || fila['Sit. IVA']     || fila['Condicion IVA'] || '').trim() || null;
      const calle          = String(fila['Calle']         || '').trim() || null;
      const numero_dir     = String(fila['Nro.']          || fila['Número Dir']   || '').trim() || null;
      const localidad      = String(fila['Localidad']     || '').trim() || null;
      const provincia      = String(fila['Provincia']     || '').trim() || null;
      const telefono       = String(fila['Telefono']      || fila['Teléfono']     || '').trim() || null;
      const celular        = String(fila['Celular']       || '').trim() || null;
      const email          = String(fila['Mail1']         || fila['Email']        || fila['Mail'] || '').trim() || null;
      const lista_precio   = String(fila['Lista Precio']  || '').trim() || null;
      const condicion_venta= String(fila['Cond. Venta']   || fila['Condicion Venta'] || '').trim() || null;
      const descuento      = parseFloat(String(fila['% Descuento'] || fila['Descuento'] || 0).replace(',', '.')) || null;
      const zona           = String(fila['Zona']          || '').trim() || null;
      const vendedor       = String(fila['Vendedor']      || '').trim() || null;
      const activoRaw      = String(fila['Activo']        || '').trim().toLowerCase();
      const activo         = activoRaw === '' ? true : (activoRaw === 'si' || activoRaw === 'sí' || activoRaw === 's' || activoRaw === '1' || activoRaw === 'true');

      if (!numero_cliente && !razon_social) { errores++; continue; }

      try {
        await pool.query(`
          INSERT INTO pi_clientes
            (numero_cliente, razon_social, cuit, condicion_iva, calle, numero, localidad, provincia,
             telefono, celular, email, lista_precio, condicion_venta, descuento, zona, vendedor, activo, actualizado_en)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, now())
          ON CONFLICT (numero_cliente) DO UPDATE SET
            razon_social    = EXCLUDED.razon_social,
            cuit            = EXCLUDED.cuit,
            condicion_iva   = EXCLUDED.condicion_iva,
            calle           = EXCLUDED.calle,
            numero          = EXCLUDED.numero,
            localidad       = EXCLUDED.localidad,
            provincia       = EXCLUDED.provincia,
            telefono        = EXCLUDED.telefono,
            celular         = EXCLUDED.celular,
            email           = EXCLUDED.email,
            lista_precio    = EXCLUDED.lista_precio,
            condicion_venta = EXCLUDED.condicion_venta,
            descuento       = EXCLUDED.descuento,
            zona            = EXCLUDED.zona,
            vendedor        = EXCLUDED.vendedor,
            activo          = EXCLUDED.activo,
            actualizado_en  = now()
        `, [numero_cliente, razon_social, cuit, condicion_iva, calle, numero_dir, localidad, provincia,
            telefono, celular, email, lista_precio, condicion_venta, descuento, zona, vendedor, activo]);
        importados++;
      } catch {
        errores++;
      }
    }

    await pool.query(
      'INSERT INTO pi_importaciones (tipo, importados, errores, total) VALUES ($1,$2,$3,$4)',
      ['clientes', importados, errores, importados + errores]
    ).catch(() => {});

    res.json({ ok: true, importados, errores, total: importados + errores });
  } catch (err) {
    console.error('PI importar clientes:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /productos/stats
// ═══════════════════════════════════════════════════════════════
router.get('/productos/stats', async (_req, res) => {
  try {
    const [totQ, rubQ, impQ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM pi_productos WHERE activo = true'),
      pool.query('SELECT COUNT(DISTINCT rubro) FROM pi_productos WHERE activo = true AND rubro IS NOT NULL'),
      pool.query("SELECT creado_en FROM pi_importaciones WHERE tipo = 'productos' ORDER BY creado_en DESC LIMIT 1"),
    ]);
    res.json({
      total:             parseInt(totQ.rows[0].count),
      rubros:            parseInt(rubQ.rows[0].count),
      ultima_importacion: impQ.rows[0]?.creado_en ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /clientes/stats
// ═══════════════════════════════════════════════════════════════
router.get('/clientes/stats', async (_req, res) => {
  try {
    const [totQ, zonQ, impQ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM pi_clientes WHERE activo = true'),
      pool.query('SELECT COUNT(DISTINCT zona) FROM pi_clientes WHERE activo = true AND zona IS NOT NULL'),
      pool.query("SELECT creado_en FROM pi_importaciones WHERE tipo = 'clientes' ORDER BY creado_en DESC LIMIT 1"),
    ]);
    res.json({
      total:             parseInt(totQ.rows[0].count),
      zonas:             parseInt(zonQ.rows[0].count),
      ultima_importacion: impQ.rows[0]?.creado_en ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /productos — lista con filtros y paginación
// ═══════════════════════════════════════════════════════════════
router.get('/productos', async (req, res) => {
  const { q, rubro, marca, activo, page = '1', limit = '25' } = req.query;
  const pg  = Math.max(1, parseInt(page));
  const lim = Math.min(100, Math.max(1, parseInt(limit)));
  const off = (pg - 1) * lim;

  const where = ['1=1'];
  const params = [];

  if (q) {
    params.push(`%${normalizar(q)}%`);
    where.push(`(detalle_normalizado ILIKE $${params.length} OR codigo ILIKE $${params.length})`);
  }
  if (rubro) { params.push(rubro); where.push(`rubro = $${params.length}`); }
  if (marca) { params.push(marca); where.push(`marca = $${params.length}`); }
  if (activo !== undefined && activo !== '') {
    params.push(activo === 'true' || activo === '1');
    where.push(`activo = $${params.length}`);
  }

  try {
    const cond = where.join(' AND ');
    const [rows, cnt] = await Promise.all([
      pool.query(`SELECT * FROM pi_productos WHERE ${cond} ORDER BY detalle LIMIT ${lim} OFFSET ${off}`, params),
      pool.query(`SELECT COUNT(*) FROM pi_productos WHERE ${cond}`, params),
    ]);
    res.json({ productos: rows.rows, total: parseInt(cnt.rows[0].count), page: pg, limit: lim });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /clientes — lista con filtros y paginación
// ═══════════════════════════════════════════════════════════════
router.get('/clientes', async (req, res) => {
  const { q, zona, activo, page = '1', limit = '25' } = req.query;
  const pg  = Math.max(1, parseInt(page));
  const lim = Math.min(100, Math.max(1, parseInt(limit)));
  const off = (pg - 1) * lim;

  const where = ['1=1'];
  const params = [];

  if (q) {
    params.push(`%${normalizar(q)}%`);
    params.push(`%${String(q).trim()}%`);
    where.push(`(LOWER(razon_social) ILIKE $${params.length - 1} OR numero_cliente ILIKE $${params.length})`);
  }
  if (zona) { params.push(zona); where.push(`zona = $${params.length}`); }
  if (activo !== undefined && activo !== '') {
    params.push(activo === 'true' || activo === '1');
    where.push(`activo = $${params.length}`);
  }

  try {
    const cond = where.join(' AND ');
    const [rows, cnt] = await Promise.all([
      pool.query(`SELECT * FROM pi_clientes WHERE ${cond} ORDER BY razon_social LIMIT ${lim} OFFSET ${off}`, params),
      pool.query(`SELECT COUNT(*) FROM pi_clientes WHERE ${cond}`, params),
    ]);
    res.json({ clientes: rows.rows, total: parseInt(cnt.rows[0].count), page: pg, limit: lim });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
