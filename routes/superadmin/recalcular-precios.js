const { createHash } = require('node:crypto');
const { registroProducto, fijarRegistro } = require('./registro-productos');

const pv = [1, 2, 3].map(i => 'precio_venta_' + i);
const columnas = ['precio_costo_final', ...pv, 'precio_venta_final'];

function fallo(estado, mensaje) {
  return Object.assign(new Error(mensaje), { estado });
}

function registrarRecalculo(router, pool, autorizar, filtrosProductos, resolverMapeoFila) {
  router.post('/recalcular-precios/:cliente_id/:accion', autorizar, async (req, res) => {
    const { cliente_id, accion } = req.params;
    const aplicar = accion === 'aplicar';
    const { alcance, ids, filtros = {}, huella, seleccionHex } = req.body;
    let db;
    try {
      if (!['revisar','aplicar'].includes(accion) || !['todos','seleccionados','filtrados'].includes(alcance))
        throw fallo(400, 'Elegí un alcance válido.');
      if (alcance === 'seleccionados' && (!Array.isArray(ids) || !ids.length || !ids.every(id => Number.isSafeInteger(id) && id > 0)))
        throw fallo(400, 'Seleccioná al menos un artículo.');
      if (aplicar && (!huella || typeof seleccionHex !== 'string' || !/^[a-f0-9]+$/.test(seleccionHex)))
        throw fallo(400, 'Revisá y elegí las diferencias que querés guardar.');
      const { values, where } = filtrosProductos(cliente_id, alcance === 'filtrados' ? filtros : {});
      if (alcance === 'seleccionados') where.push('id = ANY($' + values.push(ids) + '::bigint[])');
      if (alcance === 'filtrados' && String(filtros.buscar || '').trim().length === 1) where.push('false');
      db = await pool.connect();
      await db.query(aplicar ? 'BEGIN ISOLATION LEVEL REPEATABLE READ' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      // Calcular en decimal y comparar al centavo que ve el operador en Productos.
      const { rows } = await db.query(`WITH articulos AS (
        SELECT id, codigo, descripcion, proveedor_id, rubro, marca, precio_costo,
          precio_costo_final, precio_venta_1,precio_venta_2,precio_venta_3,precio_venta_final,
          utilidad_1,utilidad_2,utilidad_3, modificado_en::text AS version,
          precio_costo*(1-COALESCE(dto_1,0)/100.0)*(1-COALESCE(dto_2,0)/100.0)*(1-COALESCE(dto_3,0)/100.0) AS costo,
          (1+COALESCE(imp_1,0)/100.0)*(1+COALESCE(imp_2,0)/100.0)*(1+COALESCE(alicuota_iva,21)/100.0) AS impuestos
        FROM productos_propios WHERE ${where.join(' AND ')} ORDER BY id
      ) SELECT a.*, round(costo,2) AS nuevo_costo,
        round(costo*impuestos*(1+COALESCE(utilidad_1,0)/100.0),2) AS nuevo_1,
        round(costo*impuestos*(1+COALESCE(utilidad_2,0)/100.0),2) AS nuevo_2,
        round(costo*impuestos*(1+COALESCE(utilidad_3,0)/100.0),2) AS nuevo_3,
          round(precio_costo_final,2) AS guardado_costo, round(precio_venta_1,2) AS guardado_1,
          round(precio_venta_2,2) AS guardado_2, round(precio_venta_3,2) AS guardado_3, round(precio_venta_final,2) AS guardado_final
        FROM articulos a ORDER BY id`, values);
      const mapas = await db.query('SELECT proveedor_id,mapeo,perfiles_por_rubro,perfiles_por_marca FROM proveedores_mapeo_excel WHERE cliente_id=$1', [cliente_id]);
      const porProveedor = new Map(mapas.rows.map(m => [String(m.proveedor_id), m]));
      const cambios = [];
      const revisarFinal = [];
      let protegidos = 0;
      for (const p of rows) {
        if (!(Number(p.precio_costo) > 0)) { protegidos++; continue; }
        const perfil = porProveedor.get(String(p.proveedor_id));
        const { mapeo } = resolverMapeoFila(perfil?.mapeo || {}, [], [], {
          porRubro:perfil?.perfiles_por_rubro || {}, porMarca:perfil?.perfiles_por_marca || {}
        }, {rubro:p.rubro, marca:p.marca});
        const diferencias = [];
        function comparar(campo, nuevo, guardado, revisar) {
          if (nuevo == null || (p[campo] != null && guardado === nuevo)) return;
          diferencias.push({campo, anterior:p[campo], nuevo, revisar});
        }
        comparar('precio_costo_final',p.nuevo_costo, p.guardado_costo, false);
        const activas = pv.filter(c => p[c] != null && p.precio_venta_final != null && Number(p[c]) === Number(p.precio_venta_final));
        for (let i = 0; i < pv.length; i++) {
          const campo = pv[i];
          if (mapeo[campo]) { protegidos++; continue; }
          // Una lista vacía también puede diferir. El operador decide si la utiliza.
          // El mapeo actual tampoco prueba el origen histórico de una lista.
          // El operador identifica explícitamente las listas calculadas.
          comparar(campo,p['nuevo_'+(i+1)],p['guardado_'+(i+1)],true);
        }
        if (activas.length !== 1 && p.precio_venta_final != null) {
          const candidatas = activas.length ? activas : pv;
          const propuestos = candidatas.map(c => p['nuevo_'+c.slice(-1)]);
          if (!candidatas.some(c => mapeo[c]) && !propuestos.includes(p.guardado_final)) {
            if (new Set(propuestos).size === 1) comparar('precio_venta_final',propuestos[0],p.guardado_final,true);
            else revisarFinal.push({codigo:p.codigo, descripcion:p.descripcion});
          }
        }
        if (diferencias.length) cambios.push({id:p.id,codigo:p.codigo,descripcion:p.descripcion,version:p.version,diferencias,
          listaFinal:activas.length === 1 && !mapeo[activas[0]] ? activas[0] : null, finalAnterior:p.precio_venta_final});
      }
      if (cambios.length) {
        const ultimos = await db.query(`SELECT DISTINCT ON (producto_id,campo) producto_id,campo,valor_nuevo,tipo_operacion,origen
          FROM roberto_cambios_productos WHERE cliente_id=$1 AND producto_id=ANY($2::bigint[]) AND campo=ANY($3::text[])
          ORDER BY producto_id,campo,id DESC`, [cliente_id,cambios.map(p => p.id),pv]);
        const trazas = new Map(ultimos.rows.map(h => [h.producto_id + '/' + h.campo, h]));
        for (const p of cambios) for (const d of p.diferencias) {
          const h = trazas.get(p.id + '/' + d.campo);
          if (h && h.valor_nuevo != null && d.anterior != null && Number(h.valor_nuevo) === Number(d.anterior) &&
              (h.tipo_operacion === 'recalculo' || h.tipo_operacion === 'ajuste_porcentaje' || h.origen === 'Excel de costos del proveedor')) d.revisar = false;
        }
      }
      const firma = createHash('sha256').update(JSON.stringify([cliente_id,alcance,rows.map(p => p.id),cambios])).digest('hex');
      if (!aplicar) {
        await db.query('COMMIT');
        return res.json({revisados:rows.length, protegidos, revisarFinal, cambios, huella:firma});
      }
      if (firma !== huella) throw fallo(409, 'Los datos cambiaron desde la revisión. Volvé a revisar antes de aplicar.');
      const claves = cambios.flatMap(p => p.diferencias.map(d => p.id + '/' + d.campo));
      const bits = Buffer.from(seleccionHex, 'hex');
      if (seleccionHex.length !== 2 * Math.ceil(claves.length / 8)) throw fallo(400, 'La selección no corresponde a la revisión.');
      const seleccion = new Set(claves.filter((_,i) => bits[i >> 3] & (1 << (i % 8))));
      const ajustes = [];
      let esperados = 0;
      for (const fila of cambios) {
        const ajuste = {id:fila.id};
        for (const d of fila.diferencias) {
          if (!seleccion.delete(fila.id + '/' + d.campo)) continue;
          ajuste[d.campo] = d.nuevo;
          esperados++;
          if (fila.listaFinal === d.campo) { ajuste.precio_venta_final = d.nuevo; esperados++; }
        }
        if (Object.keys(ajuste).length > 1) ajustes.push(ajuste);
      }
      if (seleccion.size || !ajustes.length) throw fallo(400, 'La selección no corresponde a la revisión.');
      const registro = registroProducto('recalculo', 'Recalcular precios');
      await fijarRegistro(db, registro);
      const campos = columnas.map(c => c + ' = COALESCE(j.' + c + ', p.' + c + ')').join(',');
      const tipos = columnas.map(c => c + ' numeric').join(',');
      const actualizados = await db.query(`UPDATE productos_propios p SET ${campos},modificado_en=now()
        FROM jsonb_to_recordset($2::jsonb) AS j(id bigint,${tipos}) WHERE p.cliente_id=$1 AND p.id=j.id`, [cliente_id,JSON.stringify(ajustes)]);
      const historico = await db.query(`INSERT INTO historial_cambios_productos(cliente_id,producto_id,codigo,descripcion,campo,valor_anterior,valor_nuevo,tipo_operacion,origen,auditoria_id)
        SELECT cliente_id,producto_id,codigo,descripcion,campo,valor_anterior,valor_nuevo,tipo_operacion,origen,operacion_id
        FROM roberto_cambios_productos WHERE cliente_id=$1 AND operacion_id=$2`, [cliente_id,registro.id]);
      if (actualizados.rowCount !== ajustes.length || historico.rowCount !== esperados) throw fallo(409,'No se pudieron verificar ambos historiales. Se canceló el recálculo.');
      await db.query('COMMIT');
      res.json({actualizados:ajustes.length});
    } catch (err) {
      if (db) await db.query('ROLLBACK').catch(() => {});
      const concurrente = ['40001','40P01'].includes(err.code);
      res.status(err.estado || (concurrente ? 409 : 500)).json({mensaje:err.estado ? err.message : concurrente ? 'Otro usuario modificó los datos. Volvé a revisar.' : 'No se pudo completar la revisión de precios.'});
    } finally { if (db) db.release(); }
  });
}

module.exports = registrarRecalculo;
