const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const pool    = require('../../db');
const { verificarCualquierToken } = require('./authMiddleware');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(verificarCualquierToken);

// ── Helpers ────────────────────────────────────────────────────────────────────

function leerArchivo(buffer) {
  const wb   = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' });
}

function detectarEncabezado(filas) {
  let mejorIdx = 0, maxNoVacias = 0;
  filas.slice(0, 10).forEach((fila, i) => {
    const noVacias = fila.filter(c => c !== '' && c != null).length;
    if (noVacias > maxNoVacias) { maxNoVacias = noVacias; mejorIdx = i; }
  });
  return mejorIdx;
}

function txt(v) {
  if (v == null) return '';
  return String(v).trim();
}

function valPorCol(fila, nombreCol, encabezados) {
  const idx = encabezados.indexOf(nombreCol);
  return idx >= 0 ? txt(fila[idx]) : '';
}

function buildFila(fila, mapeo, encabezados) {
  const out = {};
  for (const [campo, colExcel] of Object.entries(mapeo)) {
    if (colExcel) out[campo] = valPorCol(fila, colExcel, encabezados);
  }
  return out;
}

function analizarArchivo(buffer) {
  const filas = leerArchivo(buffer);
  if (!filas.length) throw new Error('El archivo está vacío');
  const idxEnc    = detectarEncabezado(filas);
  const columnas  = filas[idxEnc].map(c => txt(c)).filter(Boolean);
  const muestra   = filas.slice(idxEnc + 1, idxEnc + 6)
    .map(fila => columnas.map((_, i) => txt(fila[i] ?? '')));
  const dataFilas = filas.slice(idxEnc + 1).filter(f => f.some(c => c !== '' && c != null));
  return { columnas, muestra, total_filas: dataFilas.length, dataFilas, idxEnc };
}

// ══════════════════════════════════════════════════════════════════════════════
// CLIENTES — cuentas_corrientes_clientes
// ══════════════════════════════════════════════════════════════════════════════

// POST /clientes/:clienteId/analizar
router.post('/clientes/:clienteId/analizar', upload.single('archivo'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ mensaje: 'No se recibió archivo' });
    const { columnas, muestra, total_filas } = analizarArchivo(req.file.buffer);
    res.json({ columnas, muestra, total_filas });
  } catch (err) {
    res.status(400).json({ mensaje: err.message });
  }
});

// POST /clientes/:clienteId/importar
router.post('/clientes/:clienteId/importar', upload.single('archivo'), async (req, res) => {
  const { clienteId } = req.params;
  let mapeo, conflicto;
  try {
    mapeo     = JSON.parse(req.body.mapeo || '{}');
    conflicto = req.body.conflicto || 'actualizar';
  } catch {
    return res.status(400).json({ mensaje: 'mapeo JSON inválido' });
  }
  if (!req.file) return res.status(400).json({ mensaje: 'No se recibió archivo' });

  let importados = 0, actualizados = 0, saltados = 0, errores = 0;

  try {
    const { columnas, dataFilas } = analizarArchivo(req.file.buffer);

    for (const fila of dataFilas) {
      try {
        const d = buildFila(fila, mapeo, columnas);
        const nombre = d.nombre || '';
        const cuit   = d.cuit   || '';
        if (!nombre) { errores++; continue; }

        // Buscar existente por CUIT (si hay) o por nombre
        const existeRes = await pool.query(
          `SELECT id FROM cuentas_corrientes_clientes
           WHERE cliente_id = $1
             AND CASE WHEN $2 != '' THEN comprador_cuit = $2
                                    ELSE comprador_nombre = $3 END
           LIMIT 1`,
          [clienteId, cuit, nombre]
        );

        if (existeRes.rows.length > 0) {
          if (conflicto === 'saltar') { saltados++; continue; }
          await pool.query(
            `UPDATE cuentas_corrientes_clientes SET
               comprador_nombre      = $1,
               comprador_cuit        = $2,
               comprador_razon_social= $3,
               comprador_email       = $4,
               comprador_telefono    = $5,
               comprador_whatsapp    = $6,
               comprador_direccion   = $7,
               comprador_ciudad      = $8,
               condicion_iva         = COALESCE(NULLIF($9,''), condicion_iva),
               limite_credito        = COALESCE(NULLIF($11,'')::numeric, limite_credito),
               plazo_pago_dias       = COALESCE(NULLIF($12,'')::int, plazo_pago_dias),
               descuento_especial    = COALESCE(NULLIF($13,'')::numeric, descuento_especial),
               modificado_en         = now()
             WHERE id = $10`,
            [nombre, cuit,
             d.razon_social      || '',
             d.email             || '',
             d.telefono          || '',
             d.whatsapp          || '',
             d.direccion         || '',
             d.ciudad            || '',
             d.condicion_iva     || '',
             existeRes.rows[0].id,
             d.limite_credito    || '',
             d.plazo_pago_dias   || '',
             d.descuento_especial|| '']
          );
          actualizados++;
        } else {
          await pool.query(
            `INSERT INTO cuentas_corrientes_clientes
               (cliente_id, comprador_nombre, comprador_cuit,
                comprador_razon_social, comprador_email,
                comprador_telefono, comprador_whatsapp,
                comprador_direccion, comprador_ciudad,
                condicion_iva,
                limite_credito, plazo_pago_dias, descuento_especial,
                activo, creado_en)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                     NULLIF($11,'')::numeric, NULLIF($12,'')::int, NULLIF($13,'')::numeric,
                     true, now())`,
            [clienteId, nombre, cuit,
             d.razon_social      || '',
             d.email             || '',
             d.telefono          || '',
             d.whatsapp          || '',
             d.direccion         || '',
             d.ciudad            || '',
             d.condicion_iva     || 'Consumidor Final',
             d.limite_credito    || '',
             d.plazo_pago_dias   || '',
             d.descuento_especial|| '']
          );
          importados++;
        }
      } catch (err) {
        console.error('Error fila cliente:', err.message);
        errores++;
      }
    }

    res.json({ importados, actualizados, saltados, errores });
  } catch (err) {
    console.error('Error importar clientes:', err.message);
    res.status(500).json({ mensaje: 'Error al importar', detalle: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PROVEEDORES — tabla proveedores
// ══════════════════════════════════════════════════════════════════════════════

// POST /proveedores/:clienteId/analizar
router.post('/proveedores/:clienteId/analizar', upload.single('archivo'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ mensaje: 'No se recibió archivo' });
    const { columnas, muestra, total_filas } = analizarArchivo(req.file.buffer);
    res.json({ columnas, muestra, total_filas });
  } catch (err) {
    res.status(400).json({ mensaje: err.message });
  }
});

// POST /proveedores/:clienteId/importar
router.post('/proveedores/:clienteId/importar', upload.single('archivo'), async (req, res) => {
  const { clienteId } = req.params;
  let mapeo, conflicto;
  try {
    mapeo     = JSON.parse(req.body.mapeo || '{}');
    conflicto = req.body.conflicto || 'actualizar';
  } catch {
    return res.status(400).json({ mensaje: 'mapeo JSON inválido' });
  }
  if (!req.file) return res.status(400).json({ mensaje: 'No se recibió archivo' });

  let importados = 0, actualizados = 0, saltados = 0, errores = 0;

  try {
    const { columnas, dataFilas } = analizarArchivo(req.file.buffer);

    for (const fila of dataFilas) {
      try {
        const d = buildFila(fila, mapeo, columnas);
        const nombre = d.nombre || '';
        const cuit   = d.cuit   || '';
        if (!nombre) { errores++; continue; }

        const existeRes = await pool.query(
          `SELECT id FROM proveedores
           WHERE cliente_id = $1
             AND CASE WHEN $2 != '' THEN cuit = $2
                                    ELSE nombre = $3 END
           LIMIT 1`,
          [clienteId, cuit, nombre]
        );

        if (existeRes.rows.length > 0) {
          if (conflicto === 'saltar') { saltados++; continue; }
          await pool.query(
            `UPDATE proveedores SET
               nombre            = $1,
               cuit              = $2,
               nombre_corto      = COALESCE(NULLIF($3,''), nombre_corto),
               email             = $4,
               telefono          = $5,
               whatsapp          = $6,
               direccion         = $7,
               ciudad            = $8,
               provincia         = $9,
               contacto_nombre   = $10,
               contacto_cargo    = $11,
               condicion_iva     = COALESCE(NULLIF($12,''), condicion_iva),
               notas             = COALESCE(NULLIF($13,''), notas),
               descuento_general = COALESCE(NULLIF($14,'')::numeric, descuento_general),
               limite_credito    = COALESCE(NULLIF($15,'')::numeric, limite_credito),
               plazo_pago_dias   = COALESCE(NULLIF($16,'')::int, plazo_pago_dias),
               codigo_postal     = COALESCE(NULLIF($17,''), codigo_postal),
               sitio_web         = COALESCE(NULLIF($18,''), sitio_web),
               modificado_en     = now()
             WHERE id = $19`,
            [nombre, cuit,
             d.nombre_corto     || '',
             d.email            || '',
             d.telefono         || '',
             d.whatsapp         || '',
             d.direccion        || '',
             d.ciudad           || '',
             d.provincia        || '',
             d.contacto_nombre  || '',
             d.contacto_cargo   || '',
             d.condicion_iva    || '',
             d.notas            || '',
             d.descuento_general|| '',
             d.limite_credito   || '',
             d.plazo_pago_dias  || '',
             d.codigo_postal    || '',
             d.sitio_web        || '',
             existeRes.rows[0].id]
          );
          actualizados++;
        } else {
          await pool.query(
            `INSERT INTO proveedores
               (cliente_id, nombre, cuit, nombre_corto,
                email, telefono, whatsapp,
                direccion, ciudad, provincia,
                contacto_nombre, contacto_cargo,
                condicion_iva, notas,
                descuento_general, limite_credito, plazo_pago_dias,
                codigo_postal, sitio_web,
                activo, creado_en)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
                     NULLIF($15,'')::numeric, NULLIF($16,'')::numeric, NULLIF($17,'')::int,
                     $18, $19,
                     true, now())`,
            [clienteId, nombre, cuit,
             d.nombre_corto     || '',
             d.email            || '',
             d.telefono         || '',
             d.whatsapp         || '',
             d.direccion        || '',
             d.ciudad           || '',
             d.provincia        || '',
             d.contacto_nombre  || '',
             d.contacto_cargo   || '',
             d.condicion_iva    || 'Responsable Inscripto',
             d.notas            || '',
             d.descuento_general|| '',
             d.limite_credito   || '',
             d.plazo_pago_dias  || '',
             d.codigo_postal    || '',
             d.sitio_web        || '']
          );
          importados++;
        }
      } catch (err) {
        console.error('Error fila proveedor:', err.message);
        errores++;
      }
    }

    res.json({ importados, actualizados, saltados, errores });
  } catch (err) {
    console.error('Error importar proveedores:', err.message);
    res.status(500).json({ mensaje: 'Error al importar', detalle: err.message });
  }
});

module.exports = router;
