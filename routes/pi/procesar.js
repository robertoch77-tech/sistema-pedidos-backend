const express   = require('express');
const router    = express.Router();
const multer    = require('multer');
const XLSX      = require('xlsx');
const Fuse      = require('fuse.js');
const Anthropic = require('@anthropic-ai/sdk');
const pool      = require('../../db');

const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const claude  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Asegurar tablas ───────────────────────────────────────────
async function asegurarTablas() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pi_config (
        id                    BIGSERIAL PRIMARY KEY,
        ultimo_numero_pedido  INTEGER DEFAULT 0
      )
    `);
    await pool.query(`INSERT INTO pi_config (ultimo_numero_pedido) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM pi_config)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pi_pedidos (
        id             BIGSERIAL PRIMARY KEY,
        numero         INTEGER NOT NULL,
        numero_completo TEXT NOT NULL,
        cliente_id     BIGINT,
        cliente_nombre TEXT,
        total_items    INTEGER DEFAULT 0,
        estado         TEXT DEFAULT 'pendiente',
        creado_en      TIMESTAMPTZ DEFAULT now()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pi_pedidos_items (
        id                BIGSERIAL PRIMARY KEY,
        pedido_id         BIGINT NOT NULL REFERENCES pi_pedidos(id),
        producto_id       BIGINT,
        codigo            TEXT,
        descripcion       TEXT,
        rubro             TEXT,
        cantidad          NUMERIC NOT NULL,
        cantidad_original NUMERIC,
        texto_original    TEXT,
        estado_matcheo    TEXT,
        confianza_matcheo NUMERIC,
        es_manual         BOOLEAN DEFAULT false,
        creado_en         TIMESTAMPTZ DEFAULT now()
      )
    `);
  } catch (err) {
    console.error('PI Procesar: error tablas:', err.message);
  }
}
asegurarTablas();

// ── Normalizar texto ──────────────────────────────────────────
function normalizar(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Cache de productos en memoria ─────────────────────────────
let _productosCache  = null;
let _cacheFechaUlt   = 0;
const CACHE_TTL_MS   = 5 * 60 * 1000; // 5 min

async function obtenerProductos() {
  if (_productosCache && Date.now() - _cacheFechaUlt < CACHE_TTL_MS) return _productosCache;
  const { rows } = await pool.query(
    'SELECT id, codigo, detalle, detalle_normalizado, precio_venta, rubro, marca, tipo, ean FROM pi_productos WHERE activo = true'
  );
  _productosCache = rows;
  _cacheFechaUlt  = Date.now();
  return rows;
}

// ── FUNCIÓN CENTRAL: matchearProducto() ──────────────────────
async function matchearProducto(textoOriginal) {
  const texto = normalizar(textoOriginal);
  if (!texto) return null;

  const productos = await obtenerProductos();
  if (!productos.length) return { estado: 'no_encontrado', confianza: 0, alternativas: [], texto_original: textoOriginal };

  // PASO 1 — Código exacto (alfanumérico corto ≤20 chars sin espacios)
  const codigoMatch = textoOriginal.trim().match(/^([A-Z0-9\-\/\.]{2,20})$/i);
  if (codigoMatch) {
    const cod = codigoMatch[1].toUpperCase();
    const encontrado = productos.find(p => p.codigo && p.codigo.toUpperCase() === cod);
    if (encontrado) {
      return { estado: 'exacto', confianza: 100, producto: encontrado, alternativas: [], texto_original: textoOriginal };
    }
  }

  // PASO 2 — EAN (solo dígitos, 8+ chars)
  if (/^\d{8,}$/.test(textoOriginal.trim())) {
    const encontrado = productos.find(p => p.ean && p.ean.trim() === textoOriginal.trim());
    if (encontrado) {
      return { estado: 'exacto', confianza: 100, producto: encontrado, alternativas: [], texto_original: textoOriginal };
    }
  }

  // PASO 3 — Búsqueda fuzzy en detalle_normalizado con Fuse.js
  const fuse = new Fuse(productos, {
    keys:              [{ name: 'detalle_normalizado', weight: 0.8 }, { name: 'rubro', weight: 0.2 }],
    threshold:         0.5,
    includeScore:      true,
    minMatchCharLength: 3,
    ignoreLocation:    true,
  });

  const resultados = fuse.search(texto);

  if (!resultados.length) {
    return { estado: 'no_encontrado', confianza: 0, alternativas: [], texto_original: textoOriginal };
  }

  // score de Fuse: 0=perfecto, 1=pésimo → invertir a confianza %
  const confianza = Math.round((1 - resultados[0].score) * 100);
  const candidatos = resultados.slice(0, 5).map(r => ({ ...r.item, confianza_fuse: Math.round((1 - r.score) * 100) }));

  // PASO 4 — Múltiples candidatos sin marca especificada → precio más bajo
  let producto = candidatos[0];
  let estado;
  const alternativas = candidatos.slice(1);

  if (confianza > 80) {
    estado = 'exacto';
    // Si hay varios con confianza similar de distintas marcas → precio más bajo
    const mismaConfianza = candidatos.filter(c => c.confianza_fuse >= confianza - 15);
    if (mismaConfianza.length > 1) {
      const textoLower = texto.toLowerCase();
      const tieneMarca = mismaConfianza.some(c => c.marca && textoLower.includes(normalizar(c.marca)));
      if (!tieneMarca) {
        const conPrecio = mismaConfianza.filter(c => c.precio_venta != null);
        if (conPrecio.length > 0) {
          conPrecio.sort((a, b) => parseFloat(a.precio_venta) - parseFloat(b.precio_venta));
          producto = conPrecio[0];
          estado   = 'precio';
        }
      }
    }
  } else if (confianza >= 50) {
    estado = 'parcial';
  } else {
    estado = 'no_encontrado';
    return { estado, confianza, alternativas: candidatos, texto_original: textoOriginal };
  }

  return {
    estado,
    confianza,
    producto,
    alternativas: candidatos.filter(c => c.id !== producto.id).slice(0, 4),
    texto_original: textoOriginal,
  };
}

// ── extraerLineas() ───────────────────────────────────────────
function extraerLineas(texto) {
  if (!texto) return [];
  const lineas = texto.split(/\n/).map(l => l.trim()).filter(Boolean);
  const items  = [];

  for (const linea of lineas) {
    // Limpiar prefijos: "- ", "* ", "• "
    let s = linea.replace(/^[-*•]\s*/, '').trim();

    let cantidad    = 1;
    let descripcion = s;

    // Patrón: número al inicio   "10 CODO FPH..."  "10u CODO"
    const inicioNum = s.match(/^(\d+(?:[.,]\d+)?)\s*[uU]?\s+(.+)$/);
    if (inicioNum) {
      cantidad    = parseFloat(inicioNum[1].replace(',', '.'));
      descripcion = inicioNum[2].trim();
    } else {
      // Patrón: "x10" o "x 10" al final   "CODO FPH 25x3/4 x10"
      const finalX = s.match(/^(.+?)\s+[xX]\s*(\d+(?:[.,]\d+)?)\s*$/);
      if (finalX) {
        descripcion = finalX[1].trim();
        cantidad    = parseFloat(finalX[2].replace(',', '.'));
      }
    }

    if (descripcion.length >= 2) {
      items.push({ cantidad, descripcion });
    }
  }

  return items;
}

// ── Serializar match para respuesta ──────────────────────────
function serializarMatch(match, cantidad, descripcion) {
  return {
    texto_original:    match?.texto_original || descripcion,
    cantidad,
    cantidad_original: cantidad,
    producto_id:       match?.producto?.id       || null,
    codigo:            match?.producto?.codigo   || null,
    descripcion:       match?.producto?.detalle  || descripcion,
    rubro:             match?.producto?.rubro    || null,
    marca:             match?.producto?.marca    || null,
    precio_venta:      match?.producto?.precio_venta || null,
    estado_matcheo:    match?.estado    || 'no_encontrado',
    confianza_matcheo: match?.confianza || 0,
    alternativas:      (match?.alternativas || []).map(a => ({
      id: a.id, codigo: a.codigo, detalle: a.detalle, rubro: a.rubro, marca: a.marca,
      precio_venta: a.precio_venta, confianza: a.confianza_fuse,
    })),
    es_manual: false,
  };
}

// ═══════════════════════════════════════════════════════════════
// POST /texto
// ═══════════════════════════════════════════════════════════════
router.post('/texto', async (req, res) => {
  const { texto, cliente_id } = req.body || {};
  if (!texto) return res.status(400).json({ ok: false, error: 'Falta el texto' });

  try {
    const lineas = extraerLineas(texto);
    if (!lineas.length) return res.status(400).json({ ok: false, error: 'No se detectaron líneas de pedido' });

    const items = await Promise.all(
      lineas.map(async l => {
        const match = await matchearProducto(l.descripcion);
        return serializarMatch(match, l.cantidad, l.descripcion);
      })
    );

    res.json({ ok: true, items, total: items.length });
  } catch (err) {
    console.error('PI procesar/texto:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /foto
// ═══════════════════════════════════════════════════════════════
router.post('/foto', upload.single('imagen'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'Falta la imagen' });

  try {
    const base64    = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype || 'image/jpeg';

    // Llamar Claude Vision
    const response = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: 'Sos un asistente que extrae pedidos de productos de imágenes. Extraé TODAS las líneas del pedido. Para cada línea devolvé: cantidad y descripción del producto. Ignorá datos del cliente, fechas, totales y encabezados. Respondé SOLO con JSON válido: [{\"cantidad\": N, \"descripcion\": \"texto\"}]',
      messages: [{
        role: 'user',
        content: [{
          type:   'image',
          source: { type: 'base64', media_type: mediaType, data: base64 },
        }, {
          type: 'text',
          text: 'Extraé los productos del pedido en esta imagen.',
        }],
      }],
    });

    // Parsear JSON de la respuesta
    const texto = response.content[0]?.text || '';
    let lineasIA = [];
    try {
      const jsonMatch = texto.match(/\[[\s\S]*\]/);
      if (jsonMatch) lineasIA = JSON.parse(jsonMatch[0]);
    } catch { lineasIA = []; }

    if (!lineasIA.length) {
      return res.status(422).json({ ok: false, error: 'No se encontraron productos en la imagen', texto_ia: texto });
    }

    const items = await Promise.all(
      lineasIA.map(async l => {
        const match = await matchearProducto(String(l.descripcion || ''));
        return serializarMatch(match, parseFloat(l.cantidad) || 1, String(l.descripcion || ''));
      })
    );

    res.json({ ok: true, items, total: items.length });
  } catch (err) {
    console.error('PI procesar/foto:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /excel
// ═══════════════════════════════════════════════════════════════
router.post('/excel', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'Falta el archivo' });

  const { col_cantidad = 'Cantidad', col_descripcion = 'Descripcion' } = req.body;

  try {
    const wb    = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws    = wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (!filas.length) return res.status(400).json({ ok: false, error: 'El archivo está vacío' });

    // Detectar columnas disponibles
    const columnas = Object.keys(filas[0]);

    const colCant = columnas.find(c => c.toLowerCase().includes(col_cantidad.toLowerCase()))
                  || columnas.find(c => c.toLowerCase().includes('cant') || c.toLowerCase().includes('qty'))
                  || columnas[0];
    const colDesc = columnas.find(c => c.toLowerCase().includes(col_descripcion.toLowerCase()))
                  || columnas.find(c => c.toLowerCase().includes('desc') || c.toLowerCase().includes('detalle') || c.toLowerCase().includes('producto'))
                  || columnas[1];

    const lineas = filas
      .map(f => ({ cantidad: parseFloat(String(f[colCant]).replace(',', '.')) || 1, descripcion: String(f[colDesc] || '').trim() }))
      .filter(l => l.descripcion.length > 1);

    if (!lineas.length) return res.status(400).json({ ok: false, error: 'No se detectaron productos en el archivo' });

    const items = await Promise.all(
      lineas.map(async l => {
        const match = await matchearProducto(l.descripcion);
        return serializarMatch(match, l.cantidad, l.descripcion);
      })
    );

    res.json({ ok: true, items, total: items.length, columnas_detectadas: { cantidad: colCant, descripcion: colDesc }, columnas });
  } catch (err) {
    console.error('PI procesar/excel:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /confirmar
// ═══════════════════════════════════════════════════════════════
router.post('/confirmar', async (req, res) => {
  const { cliente_id, cliente_nombre, items } = req.body || {};

  if (!items || !items.length) return res.status(400).json({ ok: false, error: 'No hay items para confirmar' });

  // Validar que no haya sin identificar sin resolución
  const sinIdentificar = items.filter(it =>
    it.estado_matcheo === 'no_encontrado' && !it.descripcion?.trim()
  );
  if (sinIdentificar.length) {
    return res.status(400).json({
      ok: false,
      error: `Hay ${sinIdentificar.length} producto${sinIdentificar.length > 1 ? 's' : ''} sin identificar. Completá todos antes de confirmar.`,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Número correlativo
    const confRes = await client.query('SELECT ultimo_numero_pedido FROM pi_config LIMIT 1 FOR UPDATE');
    const numero  = (parseInt(confRes.rows[0]?.ultimo_numero_pedido) || 0) + 1;
    await client.query('UPDATE pi_config SET ultimo_numero_pedido = $1', [numero]);

    const numeroPad    = String(numero).padStart(6, '0');
    const numeroCompleto = `NP-${numeroPad}`;

    // INSERT pi_pedidos
    const pedRes = await client.query(
      `INSERT INTO pi_pedidos (numero, numero_completo, cliente_id, cliente_nombre, total_items)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [numero, numeroCompleto, cliente_id || null, cliente_nombre || null, items.length]
    );
    const pedidoId = pedRes.rows[0].id;

    // Ordenar items por rubro luego insertar
    const itemsOrdenados = [...items].sort((a, b) => (a.rubro || '').localeCompare(b.rubro || ''));

    for (const it of itemsOrdenados) {
      await client.query(
        `INSERT INTO pi_pedidos_items
           (pedido_id, producto_id, codigo, descripcion, rubro, cantidad, cantidad_original,
            texto_original, estado_matcheo, confianza_matcheo, es_manual)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [pedidoId, it.producto_id || null, it.codigo || null, it.descripcion, it.rubro || null,
         it.cantidad, it.cantidad_original || it.cantidad, it.texto_original || null,
         it.estado_matcheo || null, it.confianza_matcheo || null, it.es_manual || false]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true, pedido_id: pedidoId, numero_completo: numeroCompleto, total_items: items.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PI confirmar:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
