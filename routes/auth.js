const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { Pool } = require('pg');

const conexiones = {};

async function getConexionPorCodigo(codigo) {
  if (conexiones[codigo]) return conexiones[codigo];

  const resultado = await pool.query(
    'SELECT id, db_connection FROM mayoristas WHERE codigo = $1',
    [codigo]
  );

  if (!resultado.rows[0]?.db_connection) return null;

  const poolExterno = new Pool({
    connectionString: resultado.rows[0].db_connection,
    ssl: false
  });

  conexiones[codigo] = { pool: poolExterno, mayorista_id: resultado.rows[0].id };
  return conexiones[codigo];
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const resultado = await pool.query(
      'SELECT * FROM mayoristas WHERE email = $1 AND activo = true',
      [email]
    );
    if (resultado.rows.length === 0) {
      return res.status(401).json({ mensaje: 'Email o contraseña incorrectos' });
    }
    const mayorista = resultado.rows[0];
    const passwordValida = await bcrypt.compare(password, mayorista.password);
    if (!passwordValida) {
      return res.status(401).json({ mensaje: 'Email o contraseña incorrectos' });
    }
    const token = jwt.sign(
      { id: mayorista.id, email: mayorista.email },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({
      token,
      mayorista: {
        id: mayorista.id,
        nombre: mayorista.nombre,
        email: mayorista.email,
        mostrar_precios: mayorista.mostrar_precios,
        mostrar_stock: mayorista.mostrar_stock,
        mostrar_marca: mayorista.mostrar_marca,
        mostrar_rubro: mayorista.mostrar_rubro,
        mostrar_tipo: mayorista.mostrar_tipo,
        pedir_clave: mayorista.pedir_clave,
        descuento_default: mayorista.descuento_default,
        tamanio_hoja: mayorista.tamanio_hoja,
        items_por_hoja: mayorista.items_por_hoja,
        numero_pedido_inicio: mayorista.numero_pedido_inicio,
        razon_social: mayorista.razon_social || '',
        habilitar_demanda: mayorista.habilitar_demanda || false,
        habilitar_ofertas: mayorista.habilitar_ofertas || false
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.post('/login-cliente', async (req, res) => {
  const { cuit, codigo, clave } = req.body;
  try {
    const conexion = await getConexionPorCodigo(codigo);
    if (!conexion) {
      return res.status(404).json({ mensaje: 'Mayorista no encontrado' });
    }

    const resultado = await conexion.pool.query(
      'SELECT * FROM "viewClientes" WHERE doc_cliente = $1 AND es_activo = true',
      [cuit]
    );
    if (resultado.rows.length === 0) {
      return res.status(401).json({ mensaje: 'CUIT incorrecto o cliente inactivo' });
    }
    const cliente = resultado.rows[0];

    const cfg = await pool.query(
      'SELECT pedir_clave FROM mayoristas WHERE codigo = $1',
      [codigo]
    );
    const pedirClave = cfg.rows[0]?.pedir_clave === true;

    if (pedirClave) {
      const claveRow = await pool.query(
        'SELECT clave FROM claves_clientes WHERE mayorista_codigo = $1 AND cuit = $2',
        [codigo, cuit]
      );
      const tieneClave = claveRow.rows.length > 0;

      if (!tieneClave) {
        if (!clave) {
          return res.json({ requiere_clave: true, primera_vez: true });
        }
        const hash = await bcrypt.hash(clave, 10);
        await pool.query(
          'INSERT INTO claves_clientes (mayorista_codigo, cuit, clave) VALUES ($1, $2, $3)',
          [codigo, cuit, hash]
        );
      } else {
        if (!clave) {
          return res.json({ requiere_clave: true, primera_vez: false });
        }
        const ok = await bcrypt.compare(clave, claveRow.rows[0].clave);
        if (!ok) {
          return res.status(401).json({ mensaje: 'Clave incorrecta' });
        }
      }
    }

    const token = jwt.sign(
      { id: cliente.id_cliente, cuit: cliente.doc_cliente, tipo: 'cliente' },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      cliente: {
        id: cliente.id_cliente,
        nombre: cliente.nom_fan_cliente || cliente.raz_soc_cliente,
        cuit: cliente.doc_cliente,
        mayorista_id: conexion.mayorista_id,
        ver_stock: true,
        ver_precios: true
      }
    });
  } catch (error) {
    console.error('Error login cliente:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.post('/cambiar-password', async (req, res) => {
  const { id, clave_actual, clave_nueva } = req.body;
  try {
    const resultado = await pool.query(
      'SELECT password FROM mayoristas WHERE id = $1',
      [id]
    );
    if (!resultado.rows[0]) {
      return res.status(404).json({ mensaje: 'Mayorista no encontrado' });
    }
    const ok = await bcrypt.compare(clave_actual, resultado.rows[0].password);
    if (!ok) {
      return res.status(401).json({ mensaje: 'La contraseña actual es incorrecta' });
    }
    const hash = await bcrypt.hash(clave_nueva, 10);
    await pool.query('UPDATE mayoristas SET password = $1 WHERE id = $2', [hash, id]);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

module.exports = router;