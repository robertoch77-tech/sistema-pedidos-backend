const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const pool = require('../db');

const TIPOS_VALIDOS = ['no_encontrado'];
const ESTADOS_VALIDOS = ['pendiente', 'atendida', 'descartada'];
const BUSQUEDA_MIN = 2;
const BUSQUEDA_MAX = 120;
const MOTIVO_MAX = 300;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizarClave(texto) {
  return texto
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function esEnteroPositivo(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0;
}

function fechaCalendarioValida(str) {
  if (!FECHA_RE.test(str)) return false;
  const [anio, mes, dia] = str.split('-').map(Number);
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function verificarCliente(req, res, next) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ mensaje: 'Sesion requerida' });
  try {
    const sesion = jwt.verify(token, process.env.JWT_SECRET);
    if (sesion.tipo !== 'cliente') return res.status(403).json({ mensaje: 'Acceso denegado' });
    if (!esEnteroPositivo(sesion.id)) return res.status(403).json({ mensaje: 'Sesion invalida' });
    if (!esEnteroPositivo(sesion.mayorista_id)) return res.status(403).json({ mensaje: 'Sesion invalida' });
    const cuit = String(sesion.cuit ?? '').trim();
    if (cuit.length < 5) {
      return res.status(403).json({ mensaje: 'CUIT requerido' });
    }
    req.clienteSesion = {
      id: Number(sesion.id),
      cuit,
      mayorista_id: Number(sesion.mayorista_id),
    };
    next();
  } catch {
    return res.status(401).json({ mensaje: 'Sesion vencida' });
  }
}

function verificarMayorista(req, res, next) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ mensaje: 'Sesion requerida' });
  try {
    const sesion = jwt.verify(token, process.env.JWT_SECRET);
    if (sesion.tipo === 'cliente') return res.status(403).json({ mensaje: 'Acceso denegado' });
    if (!esEnteroPositivo(sesion.id)) return res.status(403).json({ mensaje: 'Sesion invalida' });
    req.mayoristaSesionId = Number(sesion.id);
    next();
  } catch {
    return res.status(401).json({ mensaje: 'Sesion vencida' });
  }
}

function validarPropietario(req, res, next) {
  if (Number(req.params.mayorista_id) !== req.mayoristaSesionId) {
    return res.status(403).json({ mensaje: 'Acceso denegado' });
  }
  next();
}

router.post('/', verificarCliente, async (req, res) => {
  try {
    const { busqueda, tipo } = req.body;
    const { mayorista_id, id: cliente_id, cuit: cliente_cuit } = req.clienteSesion;

    if (!busqueda || typeof busqueda !== 'string') {
      return res.status(400).json({ mensaje: 'Busqueda requerida' });
    }
    const texto = busqueda.trim();
    if (texto.length < BUSQUEDA_MIN || texto.length > BUSQUEDA_MAX) {
      return res.status(400).json({ mensaje: `Busqueda debe tener entre ${BUSQUEDA_MIN} y ${BUSQUEDA_MAX} caracteres` });
    }
    const tipoFinal = tipo || 'no_encontrado';
    if (!TIPOS_VALIDOS.includes(tipoFinal)) {
      return res.status(400).json({ mensaje: 'Tipo no permitido' });
    }

    const clave = normalizarClave(texto);

    const resultado = await pool.query(
      `INSERT INTO demanda_no_satisfecha
         (mayorista_id, cliente_id, cliente_cuit, cliente_nombre, busqueda, clave_normalizada, tipo, estado, ventana_inicio)
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, 'pendiente',
         date_trunc('hour', NOW()) + (floor(extract(minute FROM NOW()) / 30) * interval '30 minutes')
       )
       ON CONFLICT (mayorista_id, cliente_cuit, tipo, clave_normalizada, ventana_inicio)
         WHERE cliente_cuit IS NOT NULL
           AND clave_normalizada IS NOT NULL
           AND ventana_inicio IS NOT NULL
       DO NOTHING
       RETURNING id`,
      [mayorista_id, cliente_id, cliente_cuit, '', texto.toLowerCase(), clave, tipoFinal]
    );

    if (resultado.rows.length === 0) {
      return res.status(200).json({ duplicado: true });
    }
    res.status(201).json({ id: resultado.rows[0].id });
  } catch (error) {
    console.error('[demanda] POST:', error.message);
    res.status(500).json({ mensaje: 'Error al registrar demanda' });
  }
});

router.get('/:mayorista_id', verificarMayorista, validarPropietario, async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta, busqueda, estado } = req.query;
    const condiciones = ['mayorista_id = $1'];
    const params = [req.mayoristaSesionId];
    let i = 2;

    condiciones.push(`tipo = 'no_encontrado'`);

    if (fecha_desde) {
      if (!fechaCalendarioValida(fecha_desde)) return res.status(400).json({ mensaje: 'fecha_desde invalida (YYYY-MM-DD)' });
      condiciones.push(`fecha >= ($${i}::date AT TIME ZONE 'America/Argentina/Buenos_Aires')`);
      params.push(fecha_desde); i++;
    }
    if (fecha_hasta) {
      if (!fechaCalendarioValida(fecha_hasta)) return res.status(400).json({ mensaje: 'fecha_hasta invalida (YYYY-MM-DD)' });
      condiciones.push(`fecha < (($${i}::date + interval '1 day') AT TIME ZONE 'America/Argentina/Buenos_Aires')`);
      params.push(fecha_hasta); i++;
    }
    if (fecha_desde && fecha_hasta && fecha_desde > fecha_hasta) {
      return res.status(400).json({ mensaje: 'fecha_desde debe ser menor o igual a fecha_hasta' });
    }
    if (busqueda) {
      condiciones.push(`busqueda ILIKE $${i}`);
      params.push(`%${busqueda}%`); i++;
    }
    if (estado) {
      if (!ESTADOS_VALIDOS.includes(estado)) {
        return res.status(400).json({ mensaje: 'Estado invalido' });
      }
      condiciones.push(`estado = $${i}`);
      params.push(estado); i++;
    }

    const limite = Math.min(Math.max(Number(req.query.limite) || 200, 1), 500);
    params.push(limite); i++;

    const resultado = await pool.query(
      `SELECT
         clave_normalizada,
         tipo,
         estado,
         COUNT(*) as veces,
         MAX(fecha) as ultima_vez,
         array_agg(DISTINCT cliente_cuit) FILTER (WHERE cliente_cuit IS NOT NULL AND cliente_cuit != '') as clientes_cuit,
         array_agg(DISTINCT cliente_nombre) FILTER (WHERE cliente_nombre != '') as clientes,
         MIN(busqueda) as busqueda
       FROM demanda_no_satisfecha
       WHERE ${condiciones.join(' AND ')}
       GROUP BY clave_normalizada, tipo, estado
       ORDER BY
         CASE estado WHEN 'pendiente' THEN 0 WHEN 'atendida' THEN 1 ELSE 2 END,
         COUNT(*) DESC, MAX(fecha) DESC
       LIMIT $${i - 1}`,
      params
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('[demanda] GET:', error.message);
    res.status(500).json({ mensaje: 'Error al consultar demanda' });
  }
});

router.put('/:mayorista_id/estado', verificarMayorista, validarPropietario, async (req, res) => {
  try {
    const { clave_normalizada, tipo, estado_anterior, estado_nuevo } = req.body;
    let { motivo } = req.body;

    if (!clave_normalizada || typeof clave_normalizada !== 'string') {
      return res.status(400).json({ mensaje: 'clave_normalizada requerida' });
    }
    if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ mensaje: 'Tipo invalido' });
    }
    if (!estado_anterior || !ESTADOS_VALIDOS.includes(estado_anterior)) {
      return res.status(400).json({ mensaje: 'estado_anterior invalido' });
    }
    if (!estado_nuevo || !ESTADOS_VALIDOS.includes(estado_nuevo)) {
      return res.status(400).json({ mensaje: 'estado_nuevo invalido' });
    }
    if (estado_anterior === estado_nuevo) {
      return res.status(400).json({ mensaje: 'estado_anterior y estado_nuevo deben ser diferentes' });
    }
    if (motivo !== undefined && motivo !== null) {
      if (typeof motivo !== 'string') {
        return res.status(400).json({ mensaje: 'Motivo debe ser texto' });
      }
      motivo = motivo.trim();
      if (motivo.length > MOTIVO_MAX) {
        return res.status(400).json({ mensaje: `Motivo no puede exceder ${MOTIVO_MAX} caracteres` });
      }
    }

    const setCols = ['estado = $5'];
    const params = [req.mayoristaSesionId, clave_normalizada, tipo, estado_anterior, estado_nuevo];
    let i = 6;

    if (estado_nuevo === 'atendida') {
      setCols.push(`atendida_en = NOW()`);
      setCols.push(`descartada_en = NULL`);
      setCols.push(`motivo_descarte = NULL`);
    } else if (estado_nuevo === 'descartada') {
      setCols.push(`descartada_en = NOW()`);
      setCols.push(`atendida_en = NULL`);
      setCols.push(`motivo_descarte = $${i}`);
      params.push(motivo || null); i++;
    } else {
      setCols.push(`atendida_en = NULL`);
      setCols.push(`descartada_en = NULL`);
      setCols.push(`motivo_descarte = NULL`);
    }

    const resultado = await pool.query(
      `UPDATE demanda_no_satisfecha
       SET ${setCols.join(', ')}
       WHERE mayorista_id = $1
         AND clave_normalizada = $2
         AND tipo = $3
         AND estado = $4`,
      params
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ mensaje: 'No se encontraron registros con ese estado anterior' });
    }
    res.json({ actualizado: resultado.rowCount });
  } catch (error) {
    console.error('[demanda] PUT estado:', error.message);
    res.status(500).json({ mensaje: 'Error al cambiar estado' });
  }
});

module.exports = router;
module.exports.normalizarClave = normalizarClave;
