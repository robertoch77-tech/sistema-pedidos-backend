const XLSX = require('xlsx');
const { createHash } = require('node:crypto');
const { parseNumeroImportacion, parsePorcentajeImportacion } = require('../../utils/parseNumeroImportacion');
const { fijarRegistro, registroProducto, guardarEvidencia } = require('./registro-productos');

function error(mensaje, status = 400) {
  return Object.assign(new Error(mensaje), { status });
}

function leerHoja(buffer, opciones, detectarEncabezado, val) {
  const { hoja, modo, columnas, fijos } = opciones;
  if (!['lista', 'neto'].includes(modo) || !columnas?.codigo || !columnas?.precio || !Array.isArray(fijos) || fijos.length !== 3)
    throw error('Elegí código, precio y descuentos.');
  const wb = XLSX.read(buffer, { type: 'buffer', cellNF: true });
  if (!wb.SheetNames.includes(hoja)) throw error('Seleccioná una hoja del archivo.');
  const ws = wb.Sheets[hoja];
  if (!ws['!ref']) throw error('La hoja está vacía.');
  const rango = XLSX.utils.decode_range(ws['!ref']);
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: true });
  const inicio = detectarEncabezado(filas);
  const nombres = filas[inicio]?.map(v => String(v).trim()) || [];
  const descripciones = opciones.descripciones;
  if (!Array.isArray(descripciones) || !descripciones.length || new Set(descripciones).size !== descripciones.length ||
      descripciones.some(col => !col || nombres.indexOf(col) < 0 || nombres.indexOf(col) !== nombres.lastIndexOf(col)))
    throw error('Elegí las columnas de descripción en el orden que usaste al importar los productos.');
  const indices = {};
  for (const [campo, nombre] of Object.entries(columnas)) {
    if (!nombre) continue;
    const i = nombres.indexOf(nombre);
    if (i < 0 || nombres.lastIndexOf(nombre) !== i || Object.values(indices).includes(i))
      throw error('Revisá las columnas. Cada campo debe tener un encabezado único.');
    indices[campo] = i;
  }
  return filas.slice(inicio + 1).flatMap((fila, offset) => {
    if (fila.every(v => v === '')) return [];
    const r = rango.s.r + inicio + 1 + offset;
    function celda(campo) {
      if (indices[campo] === undefined) return undefined;
      return ws[XLSX.utils.encode_cell({ r, c: rango.s.c + indices[campo] })];
    }
    const codigo = val(fila, columnas.codigo, nombres);
    const descripcion = descripciones.map(col => val(fila,col,nombres)).filter(Boolean).join(' ').trim();
    const dato = { codigo, descripcion, rubro:val(fila,columnas.rubro,nombres), marca:val(fila,columnas.marca,nombres), fila:r+1 };
    function numero(campo, porcentaje, fijo) {
      const c = celda(campo);
      if (c?.t === 'e' || (c?.f && c.v == null)) throw error('Celda con error o fórmula sin resultado.');
      let v = c?.v;
      if (v == null || String(v).trim() === '') {
        if (indices[campo] !== undefined || fijo == null || fijo === '') return null;
        v = String(fijo).trim().replace(/%$/, '') + '%';
      }
      const n = porcentaje ? parsePorcentajeImportacion(v,c) : parseNumeroImportacion(v);
      if (n.estado !== 'valido' || n.valor < 0 || (porcentaje && n.valor > 100))
        throw error('Valor inválido en ' + campo + '.');
      return n.valor;
    }
    try {
      if (!codigo) throw error('Falta el código.');
      const precio = numero('precio', false);
      if (precio === null) throw error('Falta el precio.');
      const descuentos = [0,1,2].map(i => modo === 'neto' ? 0 : numero('dto' + (i+1), true, fijos[i]));
      return [{ ...dato, precio, descuentos, control: modo === 'lista' ? numero('control',false) : null }];
    } catch (e) { return [{ ...dato, motivo:e.message }]; }
  });
}

const centavos = v => Math.round((Number(v) + Number.EPSILON) * 100);
function preparar(filas,productos,proveedor,nombre,reglas) {
  const {calcPCF, calcPrefix, identidadExcelImportacion, mapearProductosPorCodigo, resolverDestinoImportacion, candidatosCodigoImportacion} = reglas;
  const prefix = calcPrefix(nombre);
  const mapa = mapearProductosPorCodigo(productos);
  const vistos = new Set(), presentes = new Set(), destinos = new Set();
  const detalle = filas.map(f => {
    const base = {fila:f.fila,codigo:f.codigo,descripcion:f.descripcion,rubro:f.rubro,marca:f.marca};
    const identidad = identidadExcelImportacion(f.codigo,f.descripcion);
    if (vistos.has(identidad)) return {...base,motivo:'Producto duplicado en Excel dentro del mismo alcance'};
    vistos.add(identidad);
    for (const codigo of candidatosCodigoImportacion(f.codigo,prefix,f.rubro,f.marca))
      presentes.add(identidadExcelImportacion(codigo,f.descripcion));
    const destino = resolverDestinoImportacion(f.codigo,f.descripcion,f.rubro,f.marca,{tipo:'proveedor'},proveedor,prefix,mapa);
    if (f.motivo || destino.tipo !== 'actualizar') return {...base,motivo:f.motivo || destino.motivo || 'Sin coincidencia de código y descripción en el proveedor'};
    const p = destino.existing;
    if (destinos.has(p.id)) return {...base,motivo:'Otra fila ya identifica este artículo'};
    destinos.add(p.id);
    base.codigo = p.codigo;
    base.descripcion = p.descripcion;
    const descuentos = f.descuentos.map((v,i) => v ?? Number(p['dto_' + (i+1)] || 0));
    const costo = calcPCF(f.precio,...descuentos);
    if (f.control !== null && centavos(f.control) !== centavos(costo))
      return { ...base, motivo:'Neto informado distinto del calculado', costo, informado:f.control };
    const puestos = [1,2,3];
    const ventas = puestos.map(i => costo * (1 + Number(p.imp_1)/100) * (1 + Number(p.imp_2)/100)
      * (1 + Number(p.alicuota_iva)/100) * (1 + Number(p['utilidad_' + i])/100));
    const activos = puestos.filter(i => p['precio_venta_' + i] != null && p.precio_venta_final != null
      && centavos(p['precio_venta_' + i]) === centavos(p.precio_venta_final));
    if (!activos.length || activos.some(i => centavos(ventas[i-1]) !== centavos(ventas[activos[0]-1])))
      return { ...base, motivo:'Revisar precio de venta activo en la ficha' };
    const venta = ventas[activos[0]-1];
    const anterior = Number(p.precio_costo_final);
    const cambio = f.precio !== Number(p.precio_costo) || descuentos.some((v,i)=>v !== Number(p['dto_'+(i+1)]))
      || centavos(costo) !== centavos(anterior) || ventas.some((v,i)=>centavos(v)!==centavos(p['precio_venta_'+(i+1)]));
    return { ...base, id:p.id, precio:f.precio, descuentos, anteriores:puestos.map(i=>Number(p['dto_'+i])),
      anterior, costo, ventas, venta, cambio, variacion: anterior ? 100*(costo/anterior-1) : null };
  });
  const ausentes = productos.filter(p => p.activo && p.codigo && !presentes.has(identidadExcelImportacion(p.codigo,p.descripcion)));
  return {detalle,ausentes};
}

async function guardarInforme(db,{cliente_id,proveedor,nombre,registro,detalle,ausentes,hoja,archivo}) {
  const validos = detalle.filter(f=>!f.motivo);
  const cambios = validos.filter(f=>f.cambio);
  const omitidos = detalle.filter(f=>f.motivo).map(f=>({...f,hoja,estado:'omitido'}));
  const variaciones = validos.map(f=>f.variacion).filter(v=>v!==null);
  const resultado = {
    solicitados:detalle.length,importados:cambios.length,nuevos:0,actualizados:cambios.length,fallidos:0,
    omitidos:omitidos.length,ausentes:ausentes.length, alcance_importacion:{tipo:'proveedor',clave:nombre},
    procesados:validos.map(f=>({...f,hoja,estado:f.cambio?'actualizado':'sin_cambio'})),detalle:omitidos,
    ausentes_detalle:ausentes.map(({codigo,descripcion,rubro,marca})=>({codigo,descripcion,rubro,marca})),
    por_hoja:[{hoja,nuevos:0,actualizados:cambios.length,omitidos:omitidos.length,fallidos:0}]
  };
  const vistaPrevia = {
    resumen:{nuevos:0,actualizar:cambios.length,ausentes:ausentes.length,omitidos:omitidos.length,
      precios_suben:validos.filter(f=>f.costo>f.anterior).length,precios_bajan:validos.filter(f=>f.costo<f.anterior).length,
      precios_sin_cambio:validos.filter(f=>f.costo===f.anterior).length,
      variacion_promedio:variaciones.length?Number((variaciones.reduce((a,b)=>a+b,0)/variaciones.length).toFixed(2)):0},
    actualizar:cambios.map(f=>({...f,diffs:[{label:'Costo final',anterior:f.anterior,nuevo:f.costo}]}))
  };
  await db.query("INSERT INTO importaciones_v2_operaciones(id,cliente_id,proveedor,estado,filas_evaluadas,resultado) VALUES($1,$2,$3,'completada',$4,$5)",[registro.id,cliente_id,nombre,detalle.length,resultado]);
  await guardarEvidencia(db,{clienteId:cliente_id,operacionId:registro.id,archivo:archivo.buffer,nombre:archivo.originalname,vistaPrevia});
  await db.query('INSERT INTO importaciones_historial(cliente_id,proveedor_id,nuevos,aplicados,errores) VALUES($1,$2,0,$3,$4)',[cliente_id,proveedor,cambios.length,omitidos.length]);
  await db.query(`INSERT INTO historial_cambios_productos(cliente_id,producto_id,codigo,descripcion,campo,valor_anterior,valor_nuevo,tipo_operacion,origen,auditoria_id)
    SELECT cliente_id,producto_id,codigo,descripcion,campo,valor_anterior,valor_nuevo,tipo_operacion,origen,operacion_id
    FROM roberto_cambios_productos WHERE cliente_id=$1 AND operacion_id=$2`,[cliente_id,registro.id]);
}

function rutasCostos(router,reglas) {
  const {pool,upload,verificarClienteId,detectarEncabezado,val} = reglas;
  router.get('/costos-proveedor/:cliente_id/mapeo/:proveedor', verificarClienteId, async (req,res) => {
    try {
      const {rows} = await pool.query('SELECT opciones FROM roberto_mapeos_costos_proveedor WHERE cliente_id=$1 AND proveedor_id=$2',
        [req.params.cliente_id,req.params.proveedor]);
      res.json(rows[0]?.opciones || null);
    } catch { res.status(500).json({mensaje:'No se pudo consultar el mapeo del proveedor.'}); }
  });
  router.post('/costos-proveedor/:cliente_id/:accion', verificarClienteId, upload.single('archivo'), async (req,res) => {
    let db;
    try {
      const {cliente_id, accion} = req.params;
      const proveedor = Number(req.body.proveedor);
      if (!req.file || !Number.isSafeInteger(proveedor) || proveedor <= 0 || !['prever','confirmar'].includes(accion))
        throw error('Seleccioná el proveedor y el Excel.');
      let opciones;
      try { opciones = JSON.parse(req.body.opciones); } catch { throw error('Mapeo inválido.'); }
      const filas = leerHoja(req.file.buffer,opciones,detectarEncabezado,val);
      const confirmar = accion === 'confirmar';
      db = await pool.connect();
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      const prov = await db.query('SELECT nombre FROM proveedores WHERE cliente_id=$1 AND id=$2',[cliente_id,proveedor]);
      if (!prov.rowCount) throw error('Proveedor no disponible.',404);
      const nombre = prov.rows[0].nombre;
      const {rows} = await db.query(
        'SELECT id,proveedor_id,codigo,descripcion,activo,rubro,marca,precio_costo,precio_costo_final,dto_1,dto_2,dto_3,imp_1,imp_2,alicuota_iva,' +
        'utilidad_1,utilidad_2,utilidad_3,precio_venta_1,precio_venta_2,precio_venta_3,precio_venta_final FROM productos_propios ' +
        'WHERE cliente_id=$1 AND proveedor_id=$2 ORDER BY id', [cliente_id,proveedor]);
      const {detalle,ausentes} = preparar(filas,rows,proveedor,nombre,reglas);
      const huella = createHash('sha256').update(req.file.buffer).update(JSON.stringify([cliente_id,proveedor,opciones,rows,detalle])).digest('hex');
      if (confirmar) {
        if (huella !== req.body.huella) throw error('Los datos cambiaron. Volvé a revisar la vista previa.',409);
        await db.query(
          'INSERT INTO roberto_mapeos_costos_proveedor(cliente_id,proveedor_id,opciones) VALUES($1,$2,$3) ' +
          'ON CONFLICT(cliente_id,proveedor_id) DO UPDATE SET opciones=EXCLUDED.opciones',
          [cliente_id, proveedor, JSON.stringify({modo:opciones.modo,columnas:opciones.columnas,descripciones:opciones.descripciones,fijos:opciones.fijos})]);
        const registro = registroProducto('importacion','Excel de costos del proveedor');
        await fijarRegistro(db,registro);
        for (const p of detalle.filter(f=>f.cambio)) {
          await db.query('INSERT INTO productos_propios_precios(producto_id,cliente_id,precio_costo_anterior,precio_venta_anterior) SELECT id,cliente_id,precio_costo,precio_venta_final FROM productos_propios WHERE id=$1 AND cliente_id=$2',[p.id,cliente_id]);
          await db.query('UPDATE productos_propios SET precio_costo=$1,dto_1=$2,dto_2=$3,dto_3=$4,precio_costo_final=$5,precio_venta_1=$6,precio_venta_2=$7,precio_venta_3=$8,precio_venta_final=$9,modificado_en=now() WHERE id=$10 AND cliente_id=$11 AND proveedor_id=$12',
            [p.precio,...p.descuentos,p.costo,...p.ventas,p.venta,p.id,cliente_id,proveedor]);
        }
        await guardarInforme(db,{cliente_id,proveedor,nombre,registro,detalle,ausentes,hoja:opciones.hoja,archivo:req.file});
      }
      await db.query('COMMIT');
      res.json({ detalle, huella, actualizados: detalle.filter(f=>f.cambio).length });
    } catch (e) {
      if (db) await db.query('ROLLBACK').catch(()=>{});
      if (e.code === '40001') return res.status(409).json({mensaje:'Hubo otra actualización. Volvé a revisar la vista previa.'});
      res.status(e.status || 500).json({mensaje:e.status ? e.message : 'No se pudo procesar la lista de costos.'});
    } finally { db?.release(); }
  });
}
module.exports = { rutasCostos, leerHoja, preparar };
