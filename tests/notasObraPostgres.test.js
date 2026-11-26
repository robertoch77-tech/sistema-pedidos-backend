const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');
const notas = require('../services/notasObra');

// Opt-in: usa exclusivamente una base local de pruebas, sin cargar .env.
test('Notas de obra: concurrencia, devolución parcial y conversión íntegra', {
  skip: !process.env.NOTAS_OBRA_PG_PORT,
}, async t => {
  const schema = 'notas_test_' + randomUUID().replaceAll('-', '');
  const config = { host:'127.0.0.1', port:Number(process.env.NOTAS_OBRA_PG_PORT),
    database:'qa_notas_obra_backend', user:process.env.NOTAS_OBRA_PG_USER || 'pruebas' };
  const admin = new Pool(config);
  const pool = new Pool({...config, options:'-c search_path=' + schema});
  await admin.query('CREATE SCHEMA ' + schema);
  t.after(async () => {
    await pool.end();
    await admin.query('DROP SCHEMA ' + schema + ' CASCADE');
    await admin.end();
  });
  await pool.query(`
    CREATE TABLE clientes_roberto (id int PRIMARY KEY, mayorista_id int);
    CREATE TABLE mayoristas (id int PRIMARY KEY, tipo_fuente text, habilitar_ventas boolean);
    CREATE TABLE cuentas_corrientes_clientes (id int PRIMARY KEY,cliente_id int,comprador_nombre text,
      comprador_cuit text,condicion_iva text,lista_precio_id int,activo boolean);
    CREATE TABLE ventas (id int PRIMARY KEY,cliente_id int,numero_completo text);
    CREATE TABLE productos_propios (id int PRIMARY KEY, cliente_id int, codigo text, descripcion text,
      precio_venta_1 numeric,precio_venta_2 numeric,precio_venta_3 numeric,precio_venta_final numeric,
      alicuota_iva numeric,activo boolean,stock_actual numeric);
    INSERT INTO mayoristas VALUES (1,'roberto',true),(2,'roberto',false),(3,'ivan',true);
    INSERT INTO clientes_roberto VALUES(1,1),(2,2),(3,3);
    INSERT INTO cuentas_corrientes_clientes VALUES (11,1,'Cliente','', 'Consumidor Final',1,true),(22,2,'Otro','','',1,true);
    INSERT INTO productos_propios VALUES(10,1,'P10','Caño',10,20,30,10,0,true,5),(20,2,'P20','Ajeno',1,2,3,1,21,true,8);`);
  const migracion = await readFile(path.join(__dirname,'../migrations/2026-11-25-roberto-notas-obra.sql'),'utf8');
  await pool.query(migracion);
  await pool.query(migracion);
  await notas.exigirVentas(pool,1);
  for (const id of [2,3]) await assert.rejects(notas.exigirVentas(pool,id), {statusCode:403});

  async function tx(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const valor = await fn(client);
      await client.query('COMMIT');
      return valor;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally { client.release(); }
  }
  const alta = {cuenta_id:11, obra:'Obra 1', operacion_id:randomUUID()};
  const creaciones = await Promise.all([tx(db=>notas.crear(db,1,alta)),tx(db=>notas.crear(db,1,alta))]);
  const id = creaciones[0].nota.id;
  assert.equal(creaciones[1].nota.id,id);
  await assert.rejects(tx(db=>notas.crear(db,1,{...alta,obra:'Otra'})),{statusCode:409});
  await assert.rejects(tx(db=>notas.crear(db,1,{...alta,cuenta_id:22,operacion_id:randomUUID()})),{statusCode:400});
  const retiro = {tipo:'retiro',producto_id:10,precio_unitario:10,descuento_porcentaje:0,alicuota_iva:0,cantidad:'1.50'};
  const registrar = (items,op=randomUUID()) => tx(db=>notas.registrar(db,1,id,{operacion_id:op,items,retira:'Plomero'}));
  await assert.rejects(registrar([retiro,{...retiro,producto_id:20}]),{statusCode:409});
  assert.equal((await notas.detalle(pool,1,id)).movimientos.length,0);  // rollback del lote

  const op = randomUUID();
  const duplicados = await Promise.all([registrar([retiro],op),registrar([retiro],op)]);
  assert.equal(duplicados[1].movimientos.length,1);
  await assert.rejects(registrar([{...retiro,cantidad:5}],op),{statusCode:409});
  const devolucion = {tipo:'devolucion',retiro_id:duplicados[0].saldos[0].retiro_id,cantidad:'1.25'};
  const concurrentes = await Promise.allSettled([registrar([devolucion]),registrar([devolucion])]);
  assert.equal(concurrentes.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(concurrentes.find(r=>r.status==='rejected').reason.statusCode,409);
  const detalle = await notas.detalle(pool,1,id);
  const saldo = detalle.saldos[0];
  assert.equal(Number(saldo.cantidad),0.25);
  assert.equal(Number(saldo.alicuota_iva),0);
  assert.equal(Number(saldo.producto.stock_actual),5);
  await assert.rejects(notas.detalle(pool,2,id),{statusCode:404});
  const item = {producto_id:10, nota_obra_retiro_id:saldo.retiro_id,cantidad:0.25,precio_unitario:10};
  const venta = {nota_obra_id:id, nota_obra_version:detalle.nota.version, comprador_nombre:'Cliente', items:[item]};
  for (const cambio of [
    {items:[item,item]}, {items:[{...item,cantidad:0.5}]}, {items:[]}, {items:[{...item,producto_id:20}]},
    {nota_obra_version:detalle.nota.version-1}, {comprador_nombre:'Otro'},
    {va_a_cuenta_corriente:true,cuenta_corriente_cliente_id:22},
  ]) await assert.rejects(tx(db=>notas.validarParaVenta(db,1,{...venta,...cambio})), {statusCode:409});
  await tx(async db => {
    await notas.validarParaVenta(db,1,venta);
    await db.query("INSERT INTO ventas VALUES(100,1,'V-100')");
    await notas.finalizar(db,1,venta,100);
  });
  const repetida = await tx(db=>notas.validarParaVenta(db,1,venta));
  assert.equal(Number(repetida.venta_id),100);
  await assert.rejects(tx(db=>notas.validarParaVenta(db,1,{...venta,items:[{...item,precio_unitario:12}]})), {statusCode:409});
  await assert.rejects(registrar([retiro]),{statusCode:409});
});
