const { Pool } = require('pg');
const poolCentral = require('../db');

const conexionesPorMayorista = new Map();

function crearPoolExterno(mayoristaId, connectionString) {
  const poolExterno = new Pool({
    connectionString,
    ssl: false,
    max: 10,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });

  // La base externa de Iván trabaja en LATIN1.
  poolExterno.on('connect', (client) => {
    client.query("SET client_encoding TO 'LATIN1'").catch((error) => {
      console.error(`[IVAN] No se pudo configurar LATIN1 para mayorista ${mayoristaId}:`, error.message);
    });
  });
  poolExterno.on('error', (error) => {
    console.error(`[IVAN] Error en pool compartido del mayorista ${mayoristaId}:`, error.message);
  });

  conexionesPorMayorista.set(String(mayoristaId), poolExterno);
  return poolExterno;
}

function obtenerOCrear(mayoristaId, connectionString) {
  const clave = String(mayoristaId);
  if (conexionesPorMayorista.has(clave)) return conexionesPorMayorista.get(clave);
  return crearPoolExterno(mayoristaId, connectionString);
}

async function getConexionMayorista(mayoristaId) {
  const existente = conexionesPorMayorista.get(String(mayoristaId));
  if (existente) return existente;

  const resultado = await poolCentral.query(
    'SELECT id, db_connection FROM mayoristas WHERE id = $1',
    [mayoristaId]
  );
  const mayorista = resultado.rows[0];
  if (!mayorista?.db_connection) return null;
  return obtenerOCrear(mayorista.id, mayorista.db_connection);
}

async function getConexionPorCodigo(codigo) {
  const resultado = await poolCentral.query(
    'SELECT id, db_connection FROM mayoristas WHERE codigo = $1',
    [codigo]
  );
  const mayorista = resultado.rows[0];
  if (!mayorista?.db_connection) return null;
  return {
    pool: obtenerOCrear(mayorista.id, mayorista.db_connection),
    mayorista_id: mayorista.id,
  };
}

module.exports = { getConexionMayorista, getConexionPorCodigo };
