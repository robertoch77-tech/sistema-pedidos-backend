const { iniciarEmision,bloquearSerie,centavos } = require('./arcaEmision');
const { interpretarConsulta } = require('./arcaConciliacion');
const { importesGuardados } = require('./arcaNotaCredito');

function fechaISO(fecha) {
  if (!/^\d{8}$/.test(String(fecha))) throw new Error('Fecha N/C invalida');
  const iso=`${fecha.slice(0,4)}-${fecha.slice(4,6)}-${fecha.slice(6,8)}`;
  if (!Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString().slice(0,10)!==iso) throw new Error('Fecha N/C imposible');
  return iso;
}
async function guardarNC(db,cliente,intentoId,datos,fiscal) {
  const numero_completo=`${datos.tipo===3?'NCA':'NCB'}-${String(datos.punto).padStart(5,'0')}-${String(datos.numero).padStart(8,'0')}`;
  const comp=await db.query(`INSERT INTO arca_comprobantes
    (cliente_id,tipo_comprobante,numero_completo,punto_venta,numero,receptor_cuit,receptor_nombre,
     receptor_cond_iva,importe_neto,importe_iva,importe_total,cae,cae_vencimiento,fecha_emision)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [cliente,String(datos.tipo),numero_completo,datos.punto,datos.numero,datos.receptor_cuit,datos.receptor_nombre,
      String(datos.condicionReceptor),datos.neto,datos.iva,datos.total,fiscal.cae,fiscal.cae_vencimiento,fechaISO(datos.fecha)]);
  if(comp.rows.length!==1) throw new Error('No se guardo un unico comprobante N/C');
  const iva=tasa=>datos.alicuotas.filter(a=>a.alicuota===tasa).reduce((s,a)=>s+centavos(a.iva),0)/100;
  await db.query(`INSERT INTO libros_iva_ventas
    (cliente_id,comprobante_id,tipo_comprobante,numero_completo,cuit_receptor,nombre_receptor,
     importe_neto,importe_iva_21,importe_iva_105,importe_total,cae)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [cliente,comp.rows[0].id,String(datos.tipo),numero_completo,datos.receptor_cuit,datos.receptor_nombre,
      -datos.neto,-iva(21),-iva(10.5),-datos.total,fiscal.cae]);
  const resultado={ok:true,cae:fiscal.cae,numero_completo,tipo_nc:String(datos.tipo),
    vencimiento_cae:fiscal.cae_vencimiento,importe_total:Number(datos.total).toFixed(2),comprobante_id:comp.rows[0].id};
  const diario=await db.query('UPDATE arca_logs SET exitoso=true,response=$1 WHERE id=$2 AND cliente_id=$3',
    [`registrada|${JSON.stringify(resultado)}`,intentoId,cliente]);
  if(diario.rowCount!==1) throw new Error('No se pudo finalizar el diario N/C');
  return resultado;
}
async function registradaNC(db,cliente,response) {
  const resultado=JSON.parse(response.slice(11));
  const comp=(await db.query('SELECT * FROM arca_comprobantes WHERE id=$1 AND cliente_id=$2',[resultado.comprobante_id,cliente])).rows;
  const libro=(await db.query('SELECT * FROM libros_iva_ventas WHERE comprobante_id=$1 AND cliente_id=$2',[resultado.comprobante_id,cliente])).rows;
  if(comp.length!==1 || libro.length!==1 || !['3','8'].includes(String(comp[0].tipo_comprobante)) ||
      comp[0].cae!==resultado.cae || libro[0].cae!==resultado.cae ||
      comp[0].numero_completo!==resultado.numero_completo || centavos(comp[0].importe_total)!==centavos(resultado.importe_total) ||
      Number(libro[0].importe_total)!==-Number(comp[0].importe_total)) throw new Error('Registro fiscal N/C inconsistente; requiere revision');
  return {...resultado,ya_emitida:true};
}
async function conciliarNC({pool,consultar,obtenerToken},cliente,notaId) {
  const nota_id=Number(notaId);
  if(!Number.isSafeInteger(nota_id)||nota_id<=0) throw new Error('N/C invalida');
  const db=await iniciarEmision(pool,cliente,`nc:${nota_id}`);
  try {
    const config=(await db.query('SELECT * FROM arca_configuracion WHERE cliente_id=$1 FOR UPDATE',[cliente])).rows[0];
    const nota=(await db.query('SELECT * FROM notas_credito WHERE id=$1 AND cliente_id=$2 FOR UPDATE',[nota_id,cliente])).rows[0];
    if(!config||!nota||nota.tipo!=='emitida'||nota.estado!=='emitida'||nota.anulada) throw new Error('N/C comercial no vigente o no pertenece al cliente');
    const diarios=(await db.query(`SELECT id,request,response FROM arca_logs WHERE cliente_id=$1
      AND tipo='nc_intento' AND request LIKE $2 AND response <> 'rechazada' FOR UPDATE`,[cliente,`nc:${nota_id}|%`])).rows;
    if(diarios.length!==1) throw new Error('Debe existir un unico intento N/C para conciliar');
    const registro=diarios[0];
    if(registro.response.startsWith('registrada|')) {
      const resultado=await registradaNC(db,cliente,registro.response);await db.query('COMMIT');return resultado;
    }
    const datos=JSON.parse(registro.request.slice(registro.request.indexOf('|')+1));
    if(datos.nota_id!==nota_id || ![3,8].includes(datos.tipo) || !Number.isSafeInteger(datos.numero) || datos.numero<1 || datos.numero>99999999 ||
        !Number.isInteger(datos.punto)||datos.punto<1||datos.punto>99999 || !['produccion','homologacion'].includes(datos.modo) ||
        datos.modo!==config.modo||datos.cuit!==config.cuit||datos.punto!==config.punto_venta ||
        ![1,4,5,6,7,8,9,10,13,15,16].includes(datos.condicionReceptor) ||
        !/^(0|\d{11})$/.test(String(datos.receptor_cuit)) || (datos.tipo===3&&datos.receptor_cuit==='0')) {
      throw new Error('Intento N/C incompleto o configuracion cambiada; requiere revision');
    }
    fechaISO(datos.fecha);
    const origen=(await db.query('SELECT id FROM arca_comprobantes WHERE id=$1 AND cliente_id=$2 AND venta_id=$3',
      [datos.origen_id,cliente,nota.venta_id])).rows;
    if(origen.length!==1) throw new Error('Factura de origen N/C no coincide');
    const items=(await db.query(`SELECT to_jsonb(i) AS item FROM notas_credito_items i
      WHERE COALESCE(to_jsonb(i)->>'nota_id',to_jsonb(i)->>'nota_credito_id')=$1 FOR SHARE`,[String(nota_id)])).rows.map(r=>r.item);
    const guardados=importesGuardados(nota,items);
    if(centavos(guardados.importe_total)!==centavos(datos.total) || centavos(guardados.importe_neto)!==centavos(datos.neto) ||
       centavos(guardados.impIVA)!==centavos(datos.iva) ||
       JSON.stringify([...guardados.alicuotas].sort((a,b)=>a.alicuota-b.alicuota))!==JSON.stringify([...datos.alicuotas].sort((a,b)=>a.alicuota-b.alicuota))) {
      throw new Error('Importes comerciales N/C cambiaron; no recalcular ni emitir otra');
    }
    await bloquearSerie(db,datos.modo,datos.cuit,datos.punto,datos.tipo);
    const token=await obtenerToken(config);
    const xml=await consultar(config,token,datos);
    const fiscal=await interpretarConsulta(xml,datos);
    if(registro.response) {
      const previo=JSON.parse(registro.response);
      if(previo.cae!==fiscal.cae||previo.cae_vencimiento!==fiscal.cae_vencimiento) throw new Error('CAE consultado difiere del diario N/C');
    }
    const resultado=await guardarNC(db,cliente,registro.id,datos,fiscal);
    await db.query('COMMIT');return {...resultado,conciliada:true};
  } catch(error) {await db.query('ROLLBACK').catch(()=>{});throw error;}
  finally {db.release();}
}
module.exports={guardarNC,registradaNC,conciliarNC};
