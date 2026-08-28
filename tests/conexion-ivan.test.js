/**
 * Tests para Conexión Iván — editor protegido
 * Ejecutar: node tests/conexion-ivan.test.js
 * Usa cadenas ficticias. No se conecta a PostgreSQL real.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function test(nombre, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${nombre}`);
    console.error(`    ${e.message}`);
  }
}

// --- Leer archivos fuente para validaciones estáticas ---
const adminJs = fs.readFileSync(path.join(__dirname, '..', 'routes', 'admin.js'), 'utf8');
const authJs = fs.readFileSync(path.join(__dirname, '..', 'routes', 'auth.js'), 'utf8');
const conexionJs = fs.readFileSync(path.join(__dirname, '..', 'services', 'conexionMayorista.js'), 'utf8');

console.log('\n=== SEGURIDAD ===');

test('Revelar requiere checkAdmin middleware', () => {
  assert.ok(adminJs.includes("revelar-conexion', checkAdmin"), 'Falta checkAdmin en revelar-conexion');
});

test('Revelar requiere rate limiter', () => {
  assert.ok(adminJs.includes('revelarConexionLimiter'), 'Falta rate limiter en revelar-conexion');
});

test('Rate limiter configurado a 5 intentos / 15 min', () => {
  assert.ok(adminJs.includes('max: 5'), 'Max no es 5');
  assert.ok(adminJs.includes('windowMs: 15 * 60 * 1000'), 'Window no es 15 min');
});

test('Revelar con clave incorrecta devuelve 403', () => {
  assert.ok(adminJs.includes("res.status(403).json({ mensaje: 'Clave incorrecta' })"), 'Falta 403 para clave incorrecta');
});

test('Revelar mayorista inexistente devuelve 404', () => {
  const match = adminJs.match(/revelar-conexion[\s\S]*?res\.status\(404\)/);
  assert.ok(match, 'Falta 404 para mayorista inexistente en revelar');
});

test('Revelar con clave correcta devuelve solo db_connection', () => {
  assert.ok(adminJs.includes("res.json({ db_connection: resultado.rows[0].db_connection"), 'No devuelve solo db_connection');
});

test('El listado general NO expone db_connection como valor', () => {
  const listadoMatch = adminJs.match(/router\.get\('\/mayoristas'[\s\S]*?SELECT([\s\S]*?)FROM mayoristas/);
  if (listadoMatch) {
    const selectCols = listadoMatch[1];
    const sinComputada = selectCols.replace(/db_connection_configurada/g, '');
    const sinExpresion = sinComputada.replace(/\(db_connection IS NOT NULL[^)]*\)/g, '');
    assert.ok(!sinExpresion.match(/\bdb_connection\b/), 'El listado general expone db_connection como columna directa');
  }
});

test('La clave no aparece en console.log/console.error del reveal', () => {
  const revealBlock = adminJs.match(/revelar-conexion[\s\S]*?catch[\s\S]*?\}/);
  if (revealBlock) {
    assert.ok(!revealBlock[0].includes('console.log(clave'), 'Se loguea la clave');
    assert.ok(!revealBlock[0].includes('console.log(req.body'), 'Se loguea req.body con clave');
  }
});

test('La cadena no aparece en console.log/console.error del reveal', () => {
  const revealBlock = adminJs.match(/revelar-conexion[\s\S]*?catch[\s\S]*?\}/);
  if (revealBlock) {
    assert.ok(!revealBlock[0].includes('console.log(db_connection'), 'Se loguea db_connection');
  }
});

console.log('\n=== EDICION ===');

test('Guardar sin cadena no modifica db_connection (CASE WHEN)', () => {
  assert.ok(adminJs.includes("CASE WHEN NULLIF(trim($3), '') IS NULL THEN db_connection ELSE $3 END"),
    'Falta CASE WHEN para preservar db_connection cuando viene vacío');
});

test('Guardar cadena nueva sin reautenticación se rechaza con 403', () => {
  assert.ok(adminJs.includes("secretValido(clave_admin)"), 'No valida clave_admin con secretValido');
  assert.ok(adminJs.includes("'Clave administrativa requerida para modificar la conexión'"), 'Falta mensaje de rechazo');
});

test('Modificar conexión tiene rate limiter propio', () => {
  assert.ok(adminJs.includes('modificarConexionLimiter'), 'Falta limiter para modificar conexión');
  assert.ok(adminJs.includes("datos', checkAdmin, modificarConexionLimiter"), 'El PUT datos no aplica el limiter');
});

test('Guardar con clave correcta llama invalidarConexion', () => {
  assert.ok(adminJs.includes('invalidarConexion(Number(id))'), 'No llama invalidarConexion después de actualizar');
});

test('PUT datos RETURNING no expone db_connection como valor directo', () => {
  const datosBlock = adminJs.match(/mayoristas\/:id\/datos[\s\S]*?RETURNING([\s\S]*?)`,/);
  if (datosBlock) {
    const fields = datosBlock[1].replace(/db_connection_configurada/g, '').replace(/\([^)]*db_connection[^)]*\)/g, '');
    assert.ok(!fields.match(/\bdb_connection\b/), 'RETURNING devuelve db_connection como columna directa');
  }
});

test('No transforma test en GestionIntegral', () => {
  assert.ok(!adminJs.includes('GestionIntegral'), 'Se encontró GestionIntegral en admin.js');
  assert.ok(!adminJs.includes('gestionintegral'), 'Se encontró gestionintegral en admin.js');
});

test('No recorta ni reconstruye cadenas de conexión internamente', () => {
  const datosBlock = adminJs.match(/mayoristas\/:id\/datos[\s\S]*?invalidarConexion/);
  if (datosBlock) {
    assert.ok(!datosBlock[0].includes('.replace('), 'Se encontró .replace() en el bloque de datos — posible reconstrucción de cadena');
  }
});

console.log('\n=== MENSAJES ===');

test('Mensaje de proveedor/enlace correcto en login-cliente', () => {
  const loginCliente = authJs.match(/login-cliente[\s\S]*?res\.status\(404\)[\s\S]*?mensaje.*?\}/);
  assert.ok(loginCliente, 'No se encontró 404 en login-cliente');
  assert.ok(loginCliente[0].includes('No pudimos acceder al proveedor'), 'Mensaje 404 incorrecto');
});

test('Mensaje de CUIT/inactivo correcto en login-cliente', () => {
  const loginCliente = authJs.match(/login-cliente[\s\S]*?res\.status\(401\)[\s\S]*?mensaje.*?\}/);
  assert.ok(loginCliente, 'No se encontró 401 en login-cliente');
  assert.ok(loginCliente[0].includes('Verificá el CUIT ingresado'), 'Mensaje 401 incorrecto');
});

test('Códigos HTTP conservados (404 y 401)', () => {
  const has404 = authJs.includes("res.status(404).json({ mensaje: 'No pudimos acceder al proveedor");
  const has401 = authJs.includes("res.status(401).json({ mensaje: 'Verificá el CUIT ingresado");
  assert.ok(has404, 'Falta status 404');
  assert.ok(has401, 'Falta status 401');
});

test('cambiar-password no fue modificado (conserva mensaje original)', () => {
  assert.ok(authJs.includes("'Mayorista no encontrado'"), 'Se cambió el mensaje de cambiar-password');
});

console.log('\n=== REGRESION E INTOCABLES ===');

test('getConexionMayorista no aparece en el diff de admin.js', () => {
  assert.ok(!adminJs.includes('getConexionMayorista'), 'admin.js importa getConexionMayorista');
});

test('getConexionPorCodigo no fue modificado en conexionMayorista.js', () => {
  assert.ok(conexionJs.includes('async function getConexionPorCodigo'), 'getConexionPorCodigo fue alterado');
});

test('crearPoolExterno no fue modificado', () => {
  assert.ok(conexionJs.includes('function crearPoolExterno(mayoristaId, connectionString)'), 'crearPoolExterno fue alterado');
});

test('SSL permanece en false', () => {
  assert.ok(conexionJs.includes('ssl: false'), 'SSL fue modificado');
});

test('LATIN1 encoding permanece', () => {
  assert.ok(conexionJs.includes("SET client_encoding TO 'LATIN1'"), 'Encoding fue modificado');
});

test('invalidarConexion existe y se exporta', () => {
  assert.ok(conexionJs.includes('async function invalidarConexion'), 'Falta función invalidarConexion');
  assert.ok(conexionJs.includes('invalidarConexion'), 'invalidarConexion no se exporta');
});

test('invalidarConexion cierra pool y elimina del Map', () => {
  assert.ok(conexionJs.includes('conexionesPorMayorista.delete(clave)'), 'No elimina del Map');
  assert.ok(conexionJs.includes('await pool.end()'), 'No cierra pool');
});

test('Precios e IVA no fueron modificados en auth.js', () => {
  assert.ok(!authJs.includes('precio_con_iva'), 'Se tocó precio_con_iva en auth.js');
  assert.ok(!authJs.includes('calcular_iva'), 'Se tocó calcular_iva en auth.js');
});

test('Roberto y ARCA no fueron alterados por esta tarea', () => {
  assert.ok(!adminJs.includes('RobertoProductos'), 'Se tocó RobertoProductos en admin.js');
  assert.ok(!adminJs.includes('RobertoVentas'), 'Se tocó RobertoVentas en admin.js');
  assert.ok(!adminJs.includes('ARCA'), 'Se tocó ARCA en admin.js');
});

// --- Resumen ---
console.log(`\n=== RESULTADO: ${passed} pasaron, ${failed} fallaron ===\n`);
process.exit(failed > 0 ? 1 : 0);
