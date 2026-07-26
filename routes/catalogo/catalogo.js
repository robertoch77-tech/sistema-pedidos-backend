const express = require('express');
const router = express.Router();
const pool = require('../../db');

// ─── CREAR TABLAS Y COLUMNAS ──────────────────────────────────
;(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS catalogo_config (
        id             BIGSERIAL PRIMARY KEY,
        cliente_id     BIGINT NOT NULL UNIQUE,
        tipo           TEXT DEFAULT 'productos',
        activo         BOOLEAN DEFAULT false,
        mostrar_stock  TEXT DEFAULT 'disponibilidad',
        whatsapp       TEXT DEFAULT '',
        banners        JSONB DEFAULT '[]',
        creado_en      TIMESTAMPTZ DEFAULT now(),
        modificado_en  TIMESTAMPTZ DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS catalogo_pedidos (
        id                  BIGSERIAL PRIMARY KEY,
        cliente_id          BIGINT NOT NULL,
        numero              TEXT DEFAULT '',
        comprador_nombre    TEXT DEFAULT '',
        comprador_telefono  TEXT DEFAULT '',
        comprador_email     TEXT DEFAULT '',
        comprador_direccion TEXT DEFAULT '',
        notas               TEXT DEFAULT '',
        items               JSONB NOT NULL DEFAULT '[]',
        total               NUMERIC DEFAULT 0,
        estado              TEXT DEFAULT 'nuevo',
        creado_en           TIMESTAMPTZ DEFAULT now()
      )
    `);
    await pool.query(`ALTER TABLE productos_propios ADD COLUMN IF NOT EXISTS destacado         BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE productos_propios ADD COLUMN IF NOT EXISTS imagen_url        TEXT    DEFAULT ''`);
    await pool.query(`ALTER TABLE vehiculos         ADD COLUMN IF NOT EXISTS destacado         BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE catalogo_config   ADD COLUMN IF NOT EXISTS texto_bienvenida TEXT    DEFAULT ''`);
    await pool.query(`ALTER TABLE catalogo_config   ADD COLUMN IF NOT EXISTS mensaje_cierre   TEXT    DEFAULT ''`);
  } catch (err) {
    console.error('catalogo: error al asegurar tablas:', err.message);
  }
})();

// ─── HELPER — buscar cliente + config por codigo_acceso ───────
async function clienteYConfig(codigo) {
  const r = await pool.query(
    `SELECT c.id AS cliente_id, c.nombre_comercial, c.codigo_acceso,
            m.config_habilitada,
            cc.activo, cc.tipo, cc.mostrar_stock, cc.whatsapp, cc.banners,
            cc.texto_bienvenida, cc.mensaje_cierre, cc.modo_catalogo
     FROM clientes_roberto c
     LEFT JOIN mayoristas m       ON m.id = c.mayorista_id
     LEFT JOIN catalogo_config cc ON cc.cliente_id = c.id
     WHERE c.codigo_acceso = $1
     LIMIT 1`,
    [codigo.trim()]
  );
  return r.rows[0] || null;
}

// ─── GET /:codigo/config ──────────────────────────────────────
router.get('/:codigo/config', async (req, res) => {
  try {
    const row = await clienteYConfig(req.params.codigo);
    if (!row) return res.status(404).json({ error: 'Catálogo no disponible' });
    if (row.activo === false) return res.status(404).json({ error: 'Catálogo no disponible' });
    if (row.activo === null) {
      return res.json({
        ...row,
        activo:           false,
        tipo:             'productos',
        mostrar_stock:    'disponibilidad',
        whatsapp:         '',
        banners:          [],
        texto_bienvenida: '',
        mensaje_cierre:   '',
        modo_catalogo:    'todos',
      });
    }

    // Buscar color_primario y logo desde config_negocio si existe
    let color_primario = '#2B6CB0';
    let logo_url       = '';
    let direccion      = '';
    try {
      const cfg = await pool.query(
        `SELECT color_primario, logo_url, direccion
         FROM config_negocio WHERE cliente_id = $1 LIMIT 1`,
        [row.cliente_id]
      );
      if (cfg.rows[0]) {
        color_primario = cfg.rows[0].color_primario || color_primario;
        logo_url       = cfg.rows[0].logo_url       || '';
        direccion      = cfg.rows[0].direccion      || '';
      }
    } catch { /* config_negocio puede no existir aún */ }

    res.json({
      nombre_comercial:  row.nombre_comercial,
      logo_url,
      direccion,
      whatsapp:          row.whatsapp          || '',
      banners:           row.banners           || [],
      tipo:              row.tipo              || 'productos',
      activo:            !!row.activo,
      mostrar_stock:     row.mostrar_stock     || 'disponibilidad',
      color_primario,
      texto_bienvenida:  row.texto_bienvenida  || '',
      mensaje_cierre:    row.mensaje_cierre    || '',
      modo_catalogo:     row.modo_catalogo     || 'todos',
    });
  } catch (err) {
    console.error('catalogo/config error:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ─── GET /:codigo/productos ───────────────────────────────────
router.get('/:codigo/productos', async (req, res) => {
  try {
    const row = await clienteYConfig(req.params.codigo);
    if (!row || !row.activo) return res.status(404).json({ error: 'Catálogo no disponible' });

    const { buscar, rubro, marca, precio_min, precio_max,
            solo_disponible, destacado, page = 1, limit = 24 } = req.query;

    const params = [row.cliente_id];
    const where  = ['p.cliente_id = $1', 'p.activo = true'];
    let   i      = 2;

    if (buscar) {
      where.push(`(p.descripcion ILIKE $${i} OR p.codigo ILIKE $${i})`);
      params.push(`%${buscar}%`); i++;
    }
    if (rubro) {
      const rubros = Array.isArray(rubro) ? rubro : rubro.split(',').filter(Boolean);
      if (rubros.length === 1) {
        where.push(`p.rubro = $${i}`); params.push(rubros[0]); i++;
      } else if (rubros.length > 1) {
        where.push(`p.rubro = ANY($${i}::text[])`); params.push(rubros); i++;
      }
    }
    if (marca) {
      const marcas = Array.isArray(marca) ? marca : marca.split(',').filter(Boolean);
      if (marcas.length === 1) {
        where.push(`p.marca = $${i}`); params.push(marcas[0]); i++;
      } else if (marcas.length > 1) {
        where.push(`p.marca = ANY($${i}::text[])`); params.push(marcas); i++;
      }
    }
    if (precio_min) {
      where.push(`p.precio_venta_final >= $${i}`); params.push(Number(precio_min)); i++;
    }
    if (precio_max) {
      where.push(`p.precio_venta_final <= $${i}`); params.push(Number(precio_max)); i++;
    }
    if (solo_disponible === 'true') {
      where.push(`p.stock_actual > 0`);
    }
    if (destacado === 'true') {
      where.push(`p.destacado = true`);
    }

    const offset = (Math.max(1, Number(page)) - 1) * Number(limit);

    const sql = `
      SELECT p.id, p.codigo, p.descripcion, p.marca, p.rubro,
             p.precio_venta_final, p.stock_actual, p.imagen_url, p.destacado
      FROM productos_propios p
      WHERE ${where.join(' AND ')}
      ORDER BY p.destacado DESC, p.descripcion ASC
      LIMIT ${Number(limit)} OFFSET ${offset}
    `;
    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM productos_propios p
      WHERE ${where.join(' AND ')}
    `;

    const [data, count] = await Promise.all([
      pool.query(sql, params),
      pool.query(countSql, params),
    ]);

    const mostrar_stock = row.mostrar_stock || 'disponibilidad';
    const productos = data.rows.map(p => {
      const base = {
        id: p.id, codigo: p.codigo, descripcion: p.descripcion,
        marca: p.marca, rubro: p.rubro,
        precio_venta_final: Number(p.precio_venta_final),
        imagen_url: p.imagen_url || '', destacado: !!p.destacado,
      };
      if      (mostrar_stock === 'cantidad')       base.stock = Number(p.stock_actual);
      else if (mostrar_stock === 'disponibilidad') base.disponible = Number(p.stock_actual) > 0;
      // 'oculto' → no agrega campo de stock
      return base;
    });

    res.json({ productos, total: count.rows[0].total });
  } catch (err) {
    console.error('catalogo/productos error:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ─── GET /:codigo/autos ───────────────────────────────────────
router.get('/:codigo/autos', async (req, res) => {
  try {
    const row = await clienteYConfig(req.params.codigo);
    if (!row || !row.activo) return res.status(404).json({ error: 'Catálogo no disponible' });

    const result = await pool.query(
      `SELECT id, marca, modelo, anio, version, color, patente, km, tipo,
              precio_venta, fotos, destacado, observaciones
       FROM vehiculos
       WHERE cliente_id = $1 AND estado = 'disponible'
       ORDER BY destacado DESC, creado_en DESC`,
      [row.cliente_id]
    );
    res.json({ autos: result.rows });
  } catch (err) {
    console.error('catalogo/autos error:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ─── GET /:codigo/filtros ─────────────────────────────────────
router.get('/:codigo/filtros', async (req, res) => {
  try {
    const row = await clienteYConfig(req.params.codigo);
    if (!row || !row.activo) return res.status(404).json({ error: 'Catálogo no disponible' });

    const [rubros, marcas, precios] = await Promise.all([
      pool.query(
        `SELECT DISTINCT rubro FROM productos_propios
         WHERE cliente_id = $1 AND activo = true AND rubro IS NOT NULL AND rubro <> ''
         ORDER BY rubro`,
        [row.cliente_id]
      ),
      pool.query(
        `SELECT DISTINCT marca FROM productos_propios
         WHERE cliente_id = $1 AND activo = true AND marca IS NOT NULL AND marca <> ''
         ORDER BY marca`,
        [row.cliente_id]
      ),
      pool.query(
        `SELECT MIN(precio_venta_final)::numeric AS precio_min,
                MAX(precio_venta_final)::numeric AS precio_max
         FROM productos_propios
         WHERE cliente_id = $1 AND activo = true`,
        [row.cliente_id]
      ),
    ]);

    res.json({
      rubros:     rubros.rows.map(r => r.rubro),
      marcas:     marcas.rows.map(r => r.marca),
      precio_min: Number(precios.rows[0]?.precio_min || 0),
      precio_max: Number(precios.rows[0]?.precio_max || 0),
    });
  } catch (err) {
    console.error('catalogo/filtros error:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ─── POST /:codigo/pedido ─────────────────────────────────────
router.post('/:codigo/pedido', async (req, res) => {
  try {
    const row = await clienteYConfig(req.params.codigo);
    if (!row || !row.activo) return res.status(404).json({ error: 'Catálogo no disponible' });

    const {
      comprador_nombre = '', comprador_telefono = '',
      comprador_email  = '', comprador_direccion = '',
      notas = '', items = [],
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'El pedido debe tener al menos un ítem' });
    }

    const total = items.reduce((s, it) => s + (Number(it.precio) * Number(it.cantidad)), 0);

    // Número correlativo: CAT-000001
    const last = await pool.query(
      `SELECT numero FROM catalogo_pedidos
       WHERE cliente_id = $1 AND numero LIKE 'CAT-%'
       ORDER BY id DESC LIMIT 1`,
      [row.cliente_id]
    );
    let seq = 1;
    if (last.rows[0]) {
      const prev = parseInt((last.rows[0].numero || '').replace('CAT-', ''), 10);
      if (!isNaN(prev)) seq = prev + 1;
    }
    const numero = `CAT-${String(seq).padStart(6, '0')}`;

    await pool.query(
      `INSERT INTO catalogo_pedidos
         (cliente_id, numero, comprador_nombre, comprador_telefono,
          comprador_email, comprador_direccion, notas, items, total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [row.cliente_id, numero, comprador_nombre, comprador_telefono,
       comprador_email, comprador_direccion, notas,
       JSON.stringify(items), total]
    );

    res.json({ ok: true, numero });
  } catch (err) {
    console.error('catalogo/pedido error:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ─── GET /:codigo/manifest.json ──────────────────────────────
router.get('/:codigo/manifest.json', async (req, res) => {
  try {
    const row = await clienteYConfig(req.params.codigo);
    if (!row || !row.activo) return res.status(404).json({ error: 'Catálogo no disponible' });

    let logo_url = '';
    try {
      const cfg = await pool.query(
        `SELECT logo_url FROM config_negocio WHERE cliente_id = $1 LIMIT 1`,
        [row.cliente_id]
      );
      if (cfg.rows[0]) logo_url = cfg.rows[0].logo_url || '';
    } catch { /* config_negocio puede no existir aún */ }

    const tipo      = row.tipo || 'productos';
    const startPath = tipo === 'autos' ? 'autos' : 'productos';
    const nombre    = row.nombre_comercial || 'Catálogo';
    const shortName = nombre.slice(0, 12);
    const iconSrc192 = logo_url || '/logo192.png';
    const iconSrc512 = logo_url || '/logo512.png';

    res.setHeader('Content-Type', 'application/manifest+json');
    res.json({
      name:             nombre,
      short_name:       shortName,
      description:      `Catálogo de ${nombre}`,
      start_url:        `/catalogo/${startPath}/${req.params.codigo}`,
      display:          'standalone',
      orientation:      'portrait',
      background_color: '#F5F5F5',
      theme_color:      '#2B6CB0',
      icons: [
        { src: iconSrc192, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: iconSrc512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    });
  } catch (err) {
    console.error('catalogo/manifest error:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
