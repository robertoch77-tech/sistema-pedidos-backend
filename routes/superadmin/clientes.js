const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../../db');
const { verificarTokenSuperAdmin } = require('./auth');

async function asegurarColumnas() {
  try {
    await pool.query(`ALTER TABLE mayoristas ADD COLUMN IF NOT EXISTS tipo_fuente TEXT`);
    await pool.query(`ALTER TABLE clientes_roberto ADD COLUMN IF NOT EXISTS password_hash TEXT`);
  } catch (err) {
    console.error('SuperAdmin clientes: error al asegurar columnas:', err.message);
  }
}
asegurarColumnas();

router.use(verificarTokenSuperAdmin);

router.get('/', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT c.id, c.nombre_comercial, c.cuit, c.rubro, c.plan, c.estado,
              c.codigo_acceso, c.fecha_alta, c.mayorista_id, c.email, c.whatsapp,
              m.tipo_fuente
       FROM clientes_roberto c
       LEFT JOIN mayoristas m ON m.id = c.mayorista_id
       ORDER BY c.creado_en DESC NULLS LAST`
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('SuperAdmin GET clientes error:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      `SELECT c.*,
              m.habilitar_mensajes, m.habilitar_notificaciones, m.habilitar_banners,
              m.habilitar_analiticas, m.habilitar_ctas_ctes, m.habilitar_cotizaciones,
              m.activo AS mayorista_activo
       FROM clientes_roberto c
       LEFT JOIN mayoristas m ON m.id = c.mayorista_id
       WHERE c.id = $1`,
      [id]
    );
    if (!resultado.rows[0]) return res.status(404).json({ mensaje: 'Cliente no encontrado' });
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('SuperAdmin GET cliente/:id error:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre_comercial, razon_social, cuit, rubro, email,
      whatsapp, telefono, direccion, ciudad, provincia, plan, condicion_iva,
    } = req.body;
    const resultado = await pool.query(
      `UPDATE clientes_roberto SET
        nombre_comercial=$1, razon_social=$2, cuit=$3, rubro=$4,
        email=$5, whatsapp=$6, telefono=$7,
        direccion_fiscal=$8, ciudad_fiscal=$9, provincia_fiscal=$10,
        plan=$11, condicion_iva=$12, modificado_en=now()
       WHERE id=$13 RETURNING *`,
      [nombre_comercial, razon_social || nombre_comercial, cuit, rubro,
       email, whatsapp || null, telefono || null,
       direccion || null, ciudad || null, provincia || null,
       plan, condicion_iva || null, id]
    );
    if (!resultado.rows[0]) return res.status(404).json({ mensaje: 'Cliente no encontrado' });
    res.json({ ok: true, cliente: resultado.rows[0] });
  } catch (error) {
    console.error('SuperAdmin PUT cliente error:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.put('/:id/estado', async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    if (!['activo', 'suspendido'].includes(estado)) {
      return res.status(400).json({ mensaje: 'Estado inválido' });
    }
    const clienteRes = await pool.query(
      'UPDATE clientes_roberto SET estado=$1, modificado_en=now() WHERE id=$2 RETURNING mayorista_id',
      [estado, id]
    );
    if (!clienteRes.rows[0]) return res.status(404).json({ mensaje: 'Cliente no encontrado' });
    const { mayorista_id } = clienteRes.rows[0];
    if (mayorista_id) {
      await pool.query('UPDATE mayoristas SET activo=$1 WHERE id=$2', [estado === 'activo', mayorista_id]);
    }
    res.json({ ok: true, estado });
  } catch (error) {
    console.error('SuperAdmin PUT estado error:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.put('/:id/modulos', async (req, res) => {
  try {
    const { id } = req.params;
    const { modulos = {} } = req.body;
    await pool.query(
      'UPDATE clientes_roberto SET habilitar_sucursales=$1, habilitar_empleados=$2, arca_habilitado=$3, modificado_en=now() WHERE id=$4',
      [!!modulos.sucursales, !!modulos.empleados, !!modulos.arca, id]
    );
    const cr = await pool.query('SELECT mayorista_id FROM clientes_roberto WHERE id=$1', [id]);
    const mayorista_id = cr.rows[0]?.mayorista_id;
    if (mayorista_id) {
      await pool.query(
        `UPDATE mayoristas SET
          habilitar_mensajes=$1, habilitar_notificaciones=$2, habilitar_banners=$3,
          habilitar_analiticas=$4, habilitar_ctas_ctes=$5, habilitar_cotizaciones=$6,
          habilitar_cheques=$7, habilitar_caja=$8,
          habilitar_ventas=$9, habilitar_remitos=$10, habilitar_stock=$11,
          habilitar_compras=$12,
          habilitar_autos=$13
         WHERE id=$14`,
        [!!modulos.chat, !!modulos.notificaciones, !!modulos.banners,
         !!modulos.analytics, !!modulos.cta_cte_clientes, !!modulos.presupuestos,
         !!modulos.cheques, !!modulos.caja,
         !!modulos.ventas, !!modulos.remitos, !!modulos.stock,
         !!modulos.compras, !!modulos.autos,
         mayorista_id]
      );
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('SuperAdmin PUT modulos error:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.post('/', async (req, res) => {
  const {
    nombre_comercial, cuit, rubro, email,
    whatsapp, telefono, razon_social,
    condicion_iva, direccion, ciudad, provincia, plan,
    modulos = {},
    codigo_acceso, clave_inicial,
  } = req.body;

  if (!nombre_comercial || !cuit || !email || !codigo_acceso || !clave_inicial) {
    return res.status(400).json({ mensaje: 'Faltan campos obligatorios' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verificar CUIT único
    const cuitCheck = await client.query(
      'SELECT id FROM clientes_roberto WHERE cuit=$1',
      [cuit.trim()]
    );
    if (cuitCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ mensaje: 'CUIT ya registrado' });
    }

    // 2. Verificar código único
    const codigoCheck = await client.query(
      'SELECT id FROM clientes_roberto WHERE codigo_acceso=$1',
      [codigo_acceso.trim()]
    );
    if (codigoCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ mensaje: 'Código ya en uso' });
    }

    // 3. Hashear clave
    const password_hash = bcrypt.hashSync(clave_inicial, 10);

    // 4. Insertar en mayoristas (para que el sistema lo reconozca)
    const mayoristaRes = await client.query(
      `INSERT INTO mayoristas (
        nombre, email, password, codigo, config_habilitada, activo, tipo_fuente,
        habilitar_mensajes, habilitar_notificaciones, habilitar_banners,
        habilitar_analiticas, habilitar_ctas_ctes, habilitar_cotizaciones
      ) VALUES ($1, $2, $3, $4, true, true, 'roberto', $5, $6, $7, $8, $9, $10)
      RETURNING id`,
      [
        nombre_comercial,
        email,
        password_hash,
        codigo_acceso,
        !!modulos.chat,
        !!modulos.notificaciones,
        !!modulos.banners,
        !!modulos.analytics,
        !!modulos.cta_cte_clientes,
        !!modulos.presupuestos,
      ]
    );
    const mayorista_id = mayoristaRes.rows[0].id;

    // 5 + 6. Insertar en clientes_roberto con mayorista_id
    const clienteRes = await client.query(
      `INSERT INTO clientes_roberto (
        nombre_comercial, razon_social, cuit, condicion_iva, rubro,
        email, whatsapp, telefono,
        direccion_fiscal, ciudad_fiscal, provincia_fiscal,
        plan, estado, codigo_acceso, password_hash, mayorista_id, fecha_alta,
        habilitar_sucursales, habilitar_empleados, arca_habilitado
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
        $12,'activo',$13,$14,$15,now(),
        $16,$17,$18
      ) RETURNING id`,
      [
        nombre_comercial,
        razon_social || nombre_comercial,
        cuit.trim(),
        condicion_iva || null,
        rubro || null,
        email,
        whatsapp || null,
        telefono || null,
        direccion || null,
        ciudad || null,
        provincia || null,
        plan || 'Estándar',
        codigo_acceso,
        password_hash,
        mayorista_id,
        !!modulos.sucursales,
        !!modulos.empleados,
        !!modulos.arca,
      ]
    );
    const cliente_id = clienteRes.rows[0].id;

    await client.query('COMMIT');
    client.release();

    // 7. Respuesta
    res.json({
      ok: true,
      cliente_id,
      mayorista_id,
      codigo_acceso,
      link: `sistemagestiopedidos.netlify.app/?m=${codigo_acceso}`,
    });

  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    console.error('SuperAdmin crear cliente error:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor', detalle: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const clienteRes = await client.query(
      `SELECT c.mayorista_id, m.tipo_fuente
       FROM clientes_roberto c
       LEFT JOIN mayoristas m ON m.id = c.mayorista_id
       WHERE c.id = $1`,
      [id]
    );
    if (!clienteRes.rows[0]) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ mensaje: 'Cliente no encontrado' });
    }

    const { mayorista_id, tipo_fuente } = clienteRes.rows[0];
    if (tipo_fuente !== 'roberto') {
      await client.query('ROLLBACK');
      client.release();
      return res.status(403).json({ mensaje: 'Este cliente pertenece al sistema Ivan y no puede eliminarse desde aquí' });
    }

    await client.query('DELETE FROM clientes_roberto WHERE id=$1', [id]);
    if (mayorista_id) {
      await client.query('DELETE FROM mayoristas WHERE id=$1', [mayorista_id]);
    }

    await client.query('COMMIT');
    client.release();
    res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    console.error('SuperAdmin DELETE cliente error:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

module.exports = router;
