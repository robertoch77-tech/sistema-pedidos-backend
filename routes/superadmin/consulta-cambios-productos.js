const express = require('express');
const pool = require('../../db');
const { verificarCualquierToken, verificarClienteId } = require('./authMiddleware');

const router = express.Router();
const TAMANO_PAGINA = 50;
const ES_UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;

function fechaValida(fecha) {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha.startsWith('0000')) return false;
  const fechaUTC = new Date(fecha + 'T00:00:00Z');
  return Number.isFinite(fechaUTC.getTime()) && fechaUTC.toISOString().slice(0, 10) === fecha;
}

function leerFiltros(query, clienteId) {
  const desde = query.desde ?? '';
  const hasta = query.hasta ?? '';
  const buscar = query.buscar ?? '';
  const proveedor = query.proveedor ?? '';
  const origen = query.origen ?? '';
  const operacion = query.operacion ?? '';
  const pagina = Number(query.pagina ?? 1);
  if (typeof buscar !== 'string' || typeof proveedor !== 'string' || typeof origen !== 'string' ||
      [buscar, proveedor, origen].some(v => v.length > 120) ||
      (operacion !== '' && (typeof operacion !== 'string' || !ES_UUID.test(operacion))) ||
      (desde !== '' && !fechaValida(desde)) || (hasta !== '' && !fechaValida(hasta)) ||
      (desde && hasta && desde > hasta) || !Number.isSafeInteger(pagina) || pagina < 1 ||
      pagina > 100_000 || !/^[1-9]\d{0,18}$/.test(clienteId)) return null;
  return { desde, hasta, buscar: buscar.trim(), proveedor: proveedor.trim(), origen: origen.trim(), operacion, pagina, clienteId };
}

function armarConsulta(filtros, importaciones) {
  const valores = [filtros.clienteId];
  const condiciones = ['cliente_id=$1'];
  const campoFecha = importaciones ? 'creado_en' : 'created_at';
  const agregar = (valor) => '$' + (valores.push(valor));
  const patron = (valor) => '%' + valor.replace(/[\\%_]/g, '\\$&') + '%';

  if (filtros.desde) condiciones.push(`${campoFecha} >= (${agregar(filtros.desde)}::date::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')`);
  if (filtros.hasta) condiciones.push(`${campoFecha} < ((${agregar(filtros.hasta)}::date + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')`);
  if (filtros.buscar) {
    const valor = agregar(patron(filtros.buscar));
    condiciones.push(importaciones
      ? `EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          COALESCE(resultado->'procesados','[]'::jsonb) ||
          COALESCE(resultado->'ausentes_detalle','[]'::jsonb) ||
          COALESCE(resultado->'detalle','[]'::jsonb)
        ) AS articulo
        WHERE articulo->>'codigo' ILIKE ${valor} OR articulo->>'descripcion' ILIKE ${valor}
      )`
      : `(codigo ILIKE ${valor} OR descripcion ILIKE ${valor})`);
  }
  if (importaciones) {
    condiciones.push("estado='completada'", 'resultado IS NOT NULL');
    if (filtros.proveedor) condiciones.push(`proveedor ILIKE ${agregar(patron(filtros.proveedor))}`);
  } else if (filtros.origen) condiciones.push(`tipo_operacion=${agregar(filtros.origen)}`);
  if (!importaciones && filtros.operacion) condiciones.push(`operacion_id=${agregar(filtros.operacion)}`);

  const columnas = importaciones
    ? `id, proveedor, creado_en AS fecha, COALESCE(actualizado_en,creado_en) AS finalizada_en,
       resultado->'alcance_importacion' AS alcance,
       resultado->'importados' AS importados, resultado->'nuevos' AS nuevos,
       resultado->'actualizados' AS actualizados, resultado->'ausentes' AS ausentes,
       resultado->'omitidos' AS omitidos, resultado->'fallidos' AS fallidos`
    : 'id, fuente, operacion_id, producto_id, codigo, descripcion, campo, valor_anterior, valor_nuevo, tipo_operacion, origen, created_at AS fecha';
  const tabla = importaciones ? 'importaciones_v2_operaciones' : `(
    SELECT id, 'registro'::text AS fuente, cliente_id, operacion_id, producto_id, codigo, descripcion,
           campo, valor_anterior, valor_nuevo, tipo_operacion, origen, created_at
    FROM roberto_cambios_productos WHERE cliente_id=$1
    UNION ALL
    SELECT id, 'historial'::text AS fuente, cliente_id, NULL::uuid, producto_id, codigo, descripcion,
           campo, valor_anterior, valor_nuevo, tipo_operacion, origen, created_at
    FROM historial_cambios_productos WHERE cliente_id=$1 AND auditoria_id IS NULL
  ) cambios`;
  const offset = agregar((filtros.pagina - 1) * TAMANO_PAGINA);
  return {
    sql: `SELECT ${columnas} FROM ${tabla}
      WHERE ${condiciones.join(' AND ')} ORDER BY ${campoFecha} DESC, id DESC${importaciones ? '' : ', fuente'}
      LIMIT ${TAMANO_PAGINA + 1} OFFSET ${offset}`,
    valores,
  };
}

router.use(verificarCualquierToken);
router.get('/:cliente_id/:vista(importaciones|cambios)', verificarClienteId, async (req, res) => {
  const filtros = leerFiltros(req.query, req.params.cliente_id);
  if (!filtros) return res.status(400).json({ mensaje: 'Revisá el rango de fechas y los filtros.' });
  try {
    const { sql, valores } = armarConsulta(filtros, req.params.vista === 'importaciones');
    const { rows } = await pool.query(sql, valores);
    res.set('Cache-Control', 'private, no-store');
    res.json({ filas: rows.slice(0, TAMANO_PAGINA), hay_mas: rows.length > TAMANO_PAGINA });
  } catch (err) {
    console.error('Error en consulta de cambios de Productos:', err.code);
    res.status(500).json({ mensaje: 'No se pudo cargar la consulta.' });
  }
});

router.get('/:cliente_id/importaciones/:operacion', verificarClienteId, async (req, res) => {
  const { cliente_id, operacion } = req.params;
  if (!/^[1-9]\d{0,18}$/.test(cliente_id) || !ES_UUID.test(operacion)) {
    return res.status(400).json({ mensaje: 'Importación inválida.' });
  }
  try {
    const { rows } = await pool.query(`
      SELECT i.id, i.proveedor, i.creado_en AS fecha, i.resultado, e.nombre_archivo, e.vista_previa
      FROM importaciones_v2_operaciones i
      LEFT JOIN roberto_importacion_evidencia e ON e.cliente_id=i.cliente_id AND e.operacion_id=i.id
      WHERE i.cliente_id=$1 AND i.id=$2 AND i.estado='completada'
    `, [cliente_id, operacion]);
    if (!rows[0]?.resultado) return res.status(404).json({ mensaje: 'No se encontró el informe de esta carga.' });
    res.set('Cache-Control', 'private, no-store');
    res.json(rows[0]);
  } catch (err) {
    console.error('Error al abrir informe de importación:', err.code);
    res.status(500).json({ mensaje: 'No se pudo abrir el informe.' });
  }
});

router.get('/:cliente_id/importaciones/:operacion/archivo', verificarClienteId, async (req, res) => {
  const { cliente_id, operacion } = req.params;
  if (!/^[1-9]\d{0,18}$/.test(cliente_id) || !ES_UUID.test(operacion)) {
    return res.status(400).json({ mensaje: 'Importación inválida.' });
  }
  try {
    const { rows } = await pool.query(`
      SELECT e.nombre_archivo, a.contenido FROM roberto_importacion_evidencia e
      JOIN roberto_archivos_importacion a ON a.cliente_id=e.cliente_id AND a.huella=e.huella
      JOIN importaciones_v2_operaciones i ON i.id=e.operacion_id AND i.cliente_id=e.cliente_id AND i.estado='completada'
      WHERE e.cliente_id=$1 AND e.operacion_id=$2
    `, [cliente_id, operacion]);
    if (!rows[0]) return res.status(404).json({ mensaje: 'Esta carga no tiene un Excel guardado.' });
    const nombre = rows[0].nombre_archivo.split(/[\\/]/).pop().replace(/[\r\n]/g, '');
    const extension = /\.xls$/i.test(nombre) ? 'xls' : 'xlsx';
    res.set('Cache-Control', 'private, no-store');
    res.set('Content-Disposition', `attachment; filename="importacion.${extension}"; filename*=UTF-8''${encodeURIComponent(nombre).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}`);
    res.type('application/octet-stream').send(rows[0].contenido);
  } catch (err) {
    console.error('Error al descargar Excel de importación:', err.code);
    res.status(500).json({ mensaje: 'No se pudo descargar el Excel.' });
  }
});

module.exports = router;
