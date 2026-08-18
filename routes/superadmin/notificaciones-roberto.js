const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { verificarCualquierToken, verificarClienteId } = require('./authMiddleware');

let tablasListas;
function asegurarTablas() {
  if (!tablasListas) tablasListas = pool.query(`
    CREATE TABLE IF NOT EXISTS notificaciones_roberto_eventos (
      id BIGSERIAL PRIMARY KEY,
      cliente_id BIGINT NOT NULL,
      clave TEXT NOT NULL,
      tipo TEXT NOT NULL,
      titulo TEXT NOT NULL,
      detalle TEXT NOT NULL DEFAULT '',
      icono TEXT NOT NULL DEFAULT '🔔',
      severidad TEXT NOT NULL DEFAULT 'info',
      modulo TEXT NOT NULL DEFAULT 'general',
      ruta TEXT NOT NULL DEFAULT '/roberto/dashboard',
      entidad_tipo TEXT,
      entidad_id BIGINT,
      leida BOOLEAN NOT NULL DEFAULT false,
      creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (cliente_id, clave)
    )
  `).then(() => pool.query(`
    CREATE INDEX IF NOT EXISTS idx_notificaciones_roberto_cliente_fecha
    ON notificaciones_roberto_eventos (cliente_id, creada_en DESC)
  `)).catch(error => { tablasListas = null; throw error; });
  return tablasListas;
}

async function ejecutarSeguro(sql, params) {
  try { await pool.query(sql, params); }
  catch (error) { console.error('[Notificaciones Roberto] Fuente omitida:', error.message); }
}

async function sincronizarEventos(clienteId, modulos) {
  const parametros = [clienteId];

  if (modulos.ventas) await ejecutarSeguro(`
    INSERT INTO notificaciones_roberto_eventos
      (cliente_id,clave,tipo,titulo,detalle,icono,severidad,modulo,ruta,entidad_tipo,entidad_id,creada_en)
    SELECT v.cliente_id, 'venta:'||v.id, 'venta',
      'Venta '||COALESCE(v.numero_completo,'#'||v.id),
      COALESCE(NULLIF(v.comprador_nombre,''),'Consumidor final')||' · $'||ROUND(COALESCE(v.total,0),2),
      '✅','info','general','/roberto/ventas?abrir='||v.id,'venta',v.id,COALESCE(v.fecha,v.creado_en,now())
    FROM ventas v
    WHERE v.cliente_id=$1 AND COALESCE(v.anulada,false)=false
      AND COALESCE(v.fecha,v.creado_en,now()) >= now()-interval '7 days'
    ON CONFLICT (cliente_id,clave) DO NOTHING`, parametros);

  if (modulos.stock || modulos.productos) await ejecutarSeguro(`
    INSERT INTO notificaciones_roberto_eventos
      (cliente_id,clave,tipo,titulo,detalle,icono,severidad,modulo,ruta,entidad_tipo,entidad_id,creada_en)
    SELECT p.cliente_id, 'stock:'||p.id||':'||COALESCE(p.stock_actual,0), 'stock_bajo',
      'Stock bajo: '||COALESCE(NULLIF(p.descripcion,''),p.codigo),
      'Disponible '||COALESCE(p.stock_actual,0)||' · mínimo '||COALESCE(p.stock_minimo,0),
      '⚠️','critica','general','/roberto/stock?buscar='||replace(COALESCE(p.codigo,''),' ','%20'),'producto',p.id,COALESCE(p.modificado_en,now())
    FROM productos_propios p
    WHERE p.cliente_id=$1 AND COALESCE(p.activo,true)=true AND COALESCE(p.stock_minimo,0)>0
      AND COALESCE(p.stock_actual,0)<=p.stock_minimo
    ON CONFLICT (cliente_id,clave) DO NOTHING`, parametros);

  if (modulos.cuentacorriente || modulos.ventas) await ejecutarSeguro(`
    INSERT INTO notificaciones_roberto_eventos
      (cliente_id,clave,tipo,titulo,detalle,icono,severidad,modulo,ruta,entidad_tipo,entidad_id,creada_en)
    SELECT v.cliente_id, 'cobro:'||v.id||':'||ROUND(COALESCE(v.saldo,v.total,0),2), 'cobro_pendiente',
      'Cobro pendiente '||COALESCE(v.numero_completo,'#'||v.id),
      COALESCE(NULLIF(v.comprador_nombre,''),'Cliente')||' · $'||ROUND(COALESCE(v.saldo,v.total,0),2),
      '💳','atencion','general','/roberto/ventas?abrir='||v.id,'venta',v.id,COALESCE(v.fecha,v.creado_en,now())
    FROM ventas v
    WHERE v.cliente_id=$1 AND COALESCE(v.cobrada,false)=false AND COALESCE(v.anulada,false)=false
      AND COALESCE(v.saldo,v.total,0)>0
    ON CONFLICT (cliente_id,clave) DO NOTHING`, parametros);

  if (modulos.cheques) await ejecutarSeguro(`
    INSERT INTO notificaciones_roberto_eventos
      (cliente_id,clave,tipo,titulo,detalle,icono,severidad,modulo,ruta,entidad_tipo,entidad_id,creada_en)
    SELECT c.cliente_id,
      'cheque:'||c.id||':'||CASE WHEN c.fecha_cobro<CURRENT_DATE THEN 'vencido' ELSE 'proximo' END,
      'cheque',
      CASE WHEN c.fecha_cobro<CURRENT_DATE THEN 'Cheque vencido' ELSE 'Cheque próximo' END||' #'||COALESCE(c.numero,''),
      COALESCE(NULLIF(c.banco,''),'Sin banco')||' · $'||ROUND(COALESCE(c.monto,0),2)||' · '||to_char(c.fecha_cobro,'DD/MM/YYYY'),
      '🧾',CASE WHEN c.fecha_cobro<CURRENT_DATE THEN 'critica' ELSE 'atencion' END,
      'general','/roberto/cheques?buscar='||COALESCE(c.numero,''),'cheque',c.id,COALESCE(c.creado_en,now())
    FROM cheques c
    WHERE c.cliente_id=$1 AND c.estado='en_cartera' AND COALESCE(c.activo,true)=true
      AND c.fecha_cobro<=CURRENT_DATE+interval '7 days'
    ON CONFLICT (cliente_id,clave) DO NOTHING`, parametros);

  if (modulos.autos) {
    await ejecutarSeguro(`
      INSERT INTO notificaciones_roberto_eventos
        (cliente_id,clave,tipo,titulo,detalle,icono,severidad,modulo,ruta,entidad_tipo,entidad_id,creada_en)
      SELECT v.cliente_id,'auto-reservado:'||v.id,'auto_reservado','Vehículo reservado',
        trim(COALESCE(v.marca,'')||' '||COALESCE(v.modelo,'')||' · '||COALESCE(v.patente,'')),
        '🚗','atencion','autos','/roberto/autos/vehiculos?buscar='||COALESCE(v.patente,''),'vehiculo',v.id,COALESCE(v.modificado_en,now())
      FROM vehiculos v WHERE v.cliente_id=$1 AND v.estado='reservado'
      ON CONFLICT (cliente_id,clave) DO NOTHING`, parametros);
    await ejecutarSeguro(`
      INSERT INTO notificaciones_roberto_eventos
        (cliente_id,clave,tipo,titulo,detalle,icono,severidad,modulo,ruta,entidad_tipo,entidad_id,creada_en)
      SELECT l.cliente_id,'liquidacion:'||l.id,'liquidacion','Liquidación pendiente',
        COALESCE(NULLIF(l.consignante_nombre,''),'Consignante')||' · $'||ROUND(COALESCE(l.precio_consignante,0),2),
        '💰','critica','autos','/roberto/autos/liquidaciones','liquidacion',l.id,COALESCE(l.creado_en,now())
      FROM liquidaciones_consignacion l WHERE l.cliente_id=$1 AND l.estado='pendiente'
      ON CONFLICT (cliente_id,clave) DO NOTHING`, parametros);
  }
}

router.use(verificarCualquierToken);

router.get('/:cliente_id', verificarClienteId, async (req, res) => {
  try {
    await asegurarTablas();
    const clienteId = Number(req.params.cliente_id);
    const permisos = await pool.query(
      `SELECT m.habilitar_ventas, m.habilitar_stock, m.habilitar_cheques, m.habilitar_autos
       FROM clientes_roberto c JOIN mayoristas m ON m.id=c.mayorista_id WHERE c.id=$1`,
      [clienteId]
    );
    const p = permisos.rows[0] || {};
    const modulos = {
      ventas: !!p.habilitar_ventas, productos: true, stock: !!p.habilitar_stock,
      cuentacorriente: true, cheques: !!p.habilitar_cheques, autos: !!p.habilitar_autos,
    };
    await sincronizarEventos(clienteId, modulos);
    const limite = Math.min(Math.max(Number(req.query.limite)||100,1),200);
    const [items, total, config] = await Promise.all([
      pool.query(`SELECT id,tipo,titulo,detalle,icono,severidad,modulo,ruta,entidad_tipo,entidad_id,leida,creada_en
                  FROM notificaciones_roberto_eventos WHERE cliente_id=$1 ORDER BY creada_en DESC,id DESC LIMIT $2`, [clienteId,limite]),
      pool.query('SELECT COUNT(*)::int AS total FROM notificaciones_roberto_eventos WHERE cliente_id=$1 AND leida=false',[clienteId]),
      pool.query('SELECT campana FROM config_negocio WHERE cliente_id=$1',[clienteId]).catch(() => ({rows:[]})),
    ]);
    res.json({ items: items.rows, no_leidas: total.rows[0].total, campana: config.rows[0]?.campana ?? true });
  } catch (error) {
    console.error('[Notificaciones Roberto] GET:', error.message);
    res.status(500).json({ mensaje: 'No se pudieron cargar las notificaciones' });
  }
});

router.put('/:cliente_id/leidas', verificarClienteId, async (req,res) => {
  try { await asegurarTablas(); await pool.query('UPDATE notificaciones_roberto_eventos SET leida=true WHERE cliente_id=$1',[req.params.cliente_id]); res.json({ok:true}); }
  catch { res.status(500).json({mensaje:'No se pudieron actualizar'}); }
});

router.put('/:cliente_id/:id/leida', verificarClienteId, async (req,res) => {
  try {
    await asegurarTablas();
    const r=await pool.query('UPDATE notificaciones_roberto_eventos SET leida=true WHERE id=$1 AND cliente_id=$2 RETURNING id',[req.params.id,req.params.cliente_id]);
    if(!r.rows[0]) return res.status(404).json({mensaje:'Notificación no encontrada'});
    res.json({ok:true});
  } catch { res.status(500).json({mensaje:'No se pudo actualizar'}); }
});

module.exports=router;
