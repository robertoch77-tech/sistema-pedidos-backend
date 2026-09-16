const express = require('express');
const router  = express.Router();
const pool    = require('../../db');
const { verificarCualquierToken, verificarClienteId } = require('./authMiddleware');
const axios   = require('axios');
const xml2js  = require('xml2js');
const forge   = require('node-forge');

// ─── TABLAS ───────────────────────────────────────────────────
async function asegurarTablas() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS arca_configuracion (
        id                 BIGSERIAL PRIMARY KEY,
        cliente_id         BIGINT NOT NULL UNIQUE,
        cuit               TEXT DEFAULT '',
        razon_social       TEXT DEFAULT '',
        condicion_iva      TEXT DEFAULT '',
        punto_venta        INTEGER DEFAULT 1,
        certificado        TEXT DEFAULT '',
        clave_privada      TEXT DEFAULT '',
        modo               TEXT DEFAULT 'homologacion',
        emite_factura_a    BOOLEAN DEFAULT false,
        emite_factura_b    BOOLEAN DEFAULT true,
        emite_factura_c    BOOLEAN DEFAULT false,
        emite_nota_credito BOOLEAN DEFAULT false,
        emite_nota_debito  BOOLEAN DEFAULT false,
        token_wsaa         TEXT DEFAULT '',
        sign_wsaa          TEXT DEFAULT '',
        token_expira       TIMESTAMPTZ,
        estado_conexion    TEXT DEFAULT 'sin_configurar',
        ultima_conexion    TIMESTAMPTZ,
        ultimo_error       TEXT DEFAULT '',
        creado_en          TIMESTAMPTZ DEFAULT now(),
        actualizado_en     TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS arca_comprobantes (
        id                  BIGSERIAL PRIMARY KEY,
        cliente_id          BIGINT NOT NULL,
        venta_id            BIGINT,
        tipo_comprobante    TEXT DEFAULT '',
        numero_completo     TEXT DEFAULT '',
        punto_venta         INTEGER DEFAULT 1,
        numero              BIGINT DEFAULT 0,
        receptor_cuit       TEXT DEFAULT '',
        receptor_nombre     TEXT DEFAULT '',
        receptor_cond_iva   TEXT DEFAULT '',
        fecha_emision       DATE DEFAULT CURRENT_DATE,
        importe_neto        NUMERIC DEFAULT 0,
        importe_iva         NUMERIC DEFAULT 0,
        importe_total       NUMERIC DEFAULT 0,
        cae                 TEXT DEFAULT '',
        cae_vencimiento     DATE,
        estado              TEXT DEFAULT 'emitida',
        pdf_base64          TEXT DEFAULT '',
        creado_en           TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS arca_logs (
        id          BIGSERIAL PRIMARY KEY,
        cliente_id  BIGINT NOT NULL,
        tipo        TEXT DEFAULT '',
        exitoso     BOOLEAN DEFAULT false,
        request     TEXT DEFAULT '',
        response    TEXT DEFAULT '',
        error       TEXT DEFAULT '',
        creado_en   TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    // libros_iva_ventas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS libros_iva_ventas (
        id               BIGSERIAL PRIMARY KEY,
        cliente_id       BIGINT NOT NULL,
        comprobante_id   BIGINT,
        venta_id         BIGINT,
        fecha            DATE DEFAULT CURRENT_DATE,
        tipo_comprobante TEXT DEFAULT '',
        numero_completo  TEXT DEFAULT '',
        cuit_receptor    TEXT DEFAULT '',
        nombre_receptor  TEXT DEFAULT '',
        importe_neto     NUMERIC DEFAULT 0,
        importe_iva_21   NUMERIC DEFAULT 0,
        importe_iva_105  NUMERIC DEFAULT 0,
        importe_total    NUMERIC DEFAULT 0,
        cae              TEXT DEFAULT '',
        creado_en        TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    const cols = [
      ['token_wsaa',      "TEXT DEFAULT ''"],
      ['sign_wsaa',       "TEXT DEFAULT ''"],
      ['token_expira',    'TIMESTAMPTZ'],
      ['estado_conexion', "TEXT DEFAULT 'sin_configurar'"],
      ['ultima_conexion', 'TIMESTAMPTZ'],
      ['ultimo_error',    "TEXT DEFAULT ''"],
      ['actualizado_en',  'TIMESTAMPTZ DEFAULT now()'],
      ['token_padron',       "TEXT DEFAULT ''"],
      ['sign_padron',        "TEXT DEFAULT ''"],
      ['token_padron_expira','TIMESTAMPTZ'],
    ];
    for (const [col, tipo] of cols) {
      await pool.query(`ALTER TABLE arca_configuracion ADD COLUMN IF NOT EXISTS ${col} ${tipo}`).catch(() => {});
    }

    // Las instalaciones anteriores podían tener la tabla sin la unicidad por
    // cliente. ON CONFLICT (cliente_id) necesita esta regla para poder guardar.
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
          WHERE c.conrelid = 'arca_configuracion'::regclass
            AND c.contype = 'u'
            AND array_length(c.conkey, 1) = 1
            AND a.attname = 'cliente_id'
        ) THEN
          ALTER TABLE arca_configuracion
            ADD CONSTRAINT arca_configuracion_cliente_id_uq UNIQUE (cliente_id);
        END IF;
      END $$;
    `).catch(err => console.error('arca: no se pudo asegurar unicidad por cliente:', err.message));

    // Columnas ARCA en tabla ventas
    const colsVentas = [
      ['cae',             "TEXT DEFAULT ''"],
      ['cae_vencimiento', 'DATE'],
      ['tipo_factura',    "TEXT DEFAULT ''"],
      ['numero_arca',     "TEXT DEFAULT ''"],
      ['facturado',       'BOOLEAN DEFAULT false'],
    ];
    for (const [col, tipo] of colsVentas) {
      await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS ${col} ${tipo}`).catch(() => {});
    }
  } catch (err) {
    console.error('arca: error asegurando tablas:', err.message);
  }
}
asegurarTablas();

router.use(verificarCualquierToken);

// ─── URLS ARCA ───────────────────────────────────────────────
const WSAA_HOMO  = 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms';
const WSAA_PROD  = 'https://wsaa.afip.gov.ar/ws/services/LoginCms';
const WSFE_HOMO  = 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx';
const WSFE_PROD  = 'https://servicios1.afip.gov.ar/wsfev1/service.asmx';
const PADRON_HOMO = 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5';
const PADRON_PROD = 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5';

// ─── HELPERS ─────────────────────────────────────────────────
function n(v) { return parseFloat(v) || 0; }

function normalizarPem(valor) {
  return String(valor || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function leerCredencialesArca(config) {
  const certificado = normalizarPem(config.certificado);
  const clavePrivada = normalizarPem(config.clave_privada);

  try {
    forge.pki.certificateFromPem(certificado);
  } catch (err) {
    throw new Error('Certificado .crt inválido o incompleto: ' + err.message);
  }

  try {
    forge.pki.privateKeyFromPem(clavePrivada);
  } catch (err) {
    throw new Error('Clave privada .key inválida o incompleta: ' + err.message);
  }

  return { certificado, clavePrivada };
}

// Devuelve el motivo que informa ARCA/WSAA sin exponer certificados, claves ni el CMS firmado.
function detalleErrorWSAA(error) {
  const estado = error?.response?.status;
  const cuerpo = typeof error?.response?.data === 'string' ? error.response.data : '';
  const fault = cuerpo.match(/<(?:\w+:)?faultstring[^>]*>([\s\S]*?)<\/(?:\w+:)?faultstring>/i) ||
                cuerpo.match(/<(?:\w+:)?error[^>]*>([\s\S]*?)<\/(?:\w+:)?error>/i);
  const detalle = (fault?.[1] || cuerpo)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 800);

  if (estado && detalle) return `ARCA/WSAA respondi\u00f3 ${estado}: ${detalle}`;
  if (estado) return `ARCA/WSAA respondi\u00f3 ${estado}: ${error.message}`;
  return error.message;
}

async function logARCA(cliente_id, tipo, exitoso, request, response, error) {
  try {
    await pool.query(
      `INSERT INTO arca_logs (cliente_id, tipo, exitoso, request, response, error)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [cliente_id, tipo, exitoso, String(request).slice(0, 4000), String(response).slice(0, 4000), String(error).slice(0, 1000)]
    );
  } catch { /* silencioso */ }
}

function fechaHoraARCA(fecha) {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(fecha).reduce((resultado, parte) => {
    resultado[parte.type] = parte.value;
    return resultado;
  }, {});
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}:${partes.second}`;
}

function fechaComprobanteARCA(fecha = new Date()) {
  return fechaHoraARCA(fecha).slice(0, 10).replace(/-/g, '');
}

function facturaHabilitada(config, tipo) {
  return (tipo === 1 && config.emite_factura_a) ||
         (tipo === 6 && config.emite_factura_b) ||
         (tipo === 11 && config.emite_factura_c);
}

function generarTRA(modo, servicio = 'wsfe') {
  const ahora  = new Date();
  const desde  = new Date(ahora.getTime() - 60000);
  const hasta  = new Date(ahora.getTime() + 14 * 3600000);
  // WSAA exige xsd:unsignedInt: rango de 0 a 4294967295.
  const uniRef = Math.floor(Math.random() * 0x100000000);
  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniRef}</uniqueId>
    <generationTime>${fechaHoraARCA(desde)}</generationTime>
    <expirationTime>${fechaHoraARCA(hasta)}</expirationTime>
  </header>
  <service>${servicio}</service>
</loginTicketRequest>`;
}

async function interpretarRespuestaWSAA(xml) {
  const opciones = { explicitArray: false, tagNameProcessors: [xml2js.processors.stripPrefix] };
  const parsed = await xml2js.parseStringPromise(xml, opciones);
  const body = parsed?.Envelope?.Body;
  if (body?.Fault) throw new Error('ARCA/WSAA devolvio un error SOAP');
  const respuesta = body?.loginCmsResponse;
  const ticketXML = respuesta?.loginCmsReturn ?? respuesta?.return;
  const contenido = typeof ticketXML === 'string' ? ticketXML : ticketXML?._;
  if (!contenido) throw new Error('ARCA/WSAA no devolvio el ticket de acceso');
  const ticket = (await xml2js.parseStringPromise(contenido, opciones))?.loginTicketResponse;
  const token = ticket?.credentials?.token;
  const sign = ticket?.credentials?.sign;
  const expira = new Date(ticket?.header?.expirationTime || '');
  if (typeof token !== 'string' || !token.trim() || typeof sign !== 'string' || !sign.trim()) {
    throw new Error('ARCA/WSAA devolvio credenciales vacias o invalidas');
  }
  if (!Number.isFinite(expira.getTime()) || expira.getTime() <= Date.now()) {
    throw new Error('ARCA/WSAA devolvio un vencimiento invalido o vencido');
  }
  return { token, sign, expira };
}

async function obtenerToken(config) {
  // Si token vigente (con 5 min de margen), reutilizar
  if (config.token_wsaa && config.token_expira) {
    const expira = new Date(config.token_expira);
    if (expira.getTime() - Date.now() > 5 * 60 * 1000) {
      return { token: config.token_wsaa, sign: config.sign_wsaa };
    }
  }

  const tra   = generarTRA(config.modo);
  const wsaaUrl = config.modo === 'produccion' ? WSAA_PROD : WSAA_HOMO;
  const credenciales = leerCredencialesArca(config);

  // Firmar TRA con clave privada + certificado — CMS/PKCS7 real
  let cms;
  try {
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(tra, 'utf8');
    p7.addCertificate(credenciales.certificado);
    p7.addSigner({
      key:             forge.pki.privateKeyFromPem(credenciales.clavePrivada),
      certificate:     forge.pki.certificateFromPem(credenciales.certificado),
      digestAlgorithm: forge.pki.oids.sha256,
    });
    p7.sign({ detached: false });
    const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    cms = forge.util.encode64(der);
  } catch (e) {
    throw new Error('Error firmando TRA (CMS): ' + e.message);
  }

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cms}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

  let resp;
  try {
    resp = await axios.post(wsaaUrl, soapBody, {
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': 'loginCms' },
      timeout: 15000,
    });
  } catch (error) {
    throw new Error(detalleErrorWSAA(error));
  }

  return interpretarRespuestaWSAA(resp.data);
}

async function obtenerTokenPadron(config) {
  if (config.token_padron && config.token_padron_expira) {
    const expira = new Date(config.token_padron_expira);
    if (expira.getTime() - Date.now() > 5 * 60 * 1000) {
      return { token: config.token_padron, sign: config.sign_padron };
    }
  }

  const tra = generarTRA(config.modo, 'ws_sr_constancia_inscripcion');
  const wsaaUrl = config.modo === 'produccion' ? WSAA_PROD : WSAA_HOMO;
  const credenciales = leerCredencialesArca(config);

  let cms;
  try {
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(tra, 'utf8');
    p7.addCertificate(credenciales.certificado);
    p7.addSigner({
      key:             forge.pki.privateKeyFromPem(credenciales.clavePrivada),
      certificate:     forge.pki.certificateFromPem(credenciales.certificado),
      digestAlgorithm: forge.pki.oids.sha256,
    });
    p7.sign({ detached: false });
    const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    cms = forge.util.encode64(der);
  } catch (e) {
    throw new Error('Error firmando TRA padron (CMS): ' + e.message);
  }

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cms}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

  let resp;
  try {
    resp = await axios.post(wsaaUrl, soapBody, {
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': 'loginCms' },
      timeout: 15000,
    });
  } catch (error) {
    throw new Error(detalleErrorWSAA(error));
  }

  const { token, sign, expira } = await interpretarRespuestaWSAA(resp.data);

  await pool.query(
    `UPDATE arca_configuracion SET token_padron=$1, sign_padron=$2, token_padron_expira=$3 WHERE cliente_id=$4`,
    [token, sign, expira, config.cliente_id]
  );

  return { token, sign };
}

// ─── GET /config/:cliente_id ──────────────────────────────────
router.get('/config/:cliente_id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const r = await pool.query(
      `SELECT id, cliente_id, cuit, razon_social, condicion_iva, punto_venta, modo,
              emite_factura_a, emite_factura_b, emite_factura_c,
              emite_nota_credito, emite_nota_debito,
              estado_conexion, ultima_conexion, ultimo_error, token_expira,
              (certificado <> '') AS tiene_certificado,
              (clave_privada <> '') AS tiene_clave
       FROM arca_configuracion WHERE cliente_id=$1`,
      [cliente_id]
    );
    if (r.rows.length === 0) return res.json({ configurado: false });
    res.json({ configurado: true, ...r.rows[0] });
  } catch (err) {
    console.error('arca config get:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /config/:cliente_id ──────────────────────────────────
router.put('/config/:cliente_id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const {
      cuit, razon_social, condicion_iva, punto_venta, certificado, clave_privada, modo,
      emite_factura_a, emite_factura_b, emite_factura_c, emite_nota_credito, emite_nota_debito,
    } = req.body;

    await pool.query(`
      INSERT INTO arca_configuracion
        (cliente_id, cuit, razon_social, condicion_iva, punto_venta,
         certificado, clave_privada, modo,
         emite_factura_a, emite_factura_b, emite_factura_c,
         emite_nota_credito, emite_nota_debito, actualizado_en)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
      ON CONFLICT (cliente_id) DO UPDATE SET
        cuit=$2, razon_social=$3, condicion_iva=$4, punto_venta=$5,
        certificado=CASE WHEN $6='' THEN arca_configuracion.certificado ELSE $6 END,
        clave_privada=CASE WHEN $7='' THEN arca_configuracion.clave_privada ELSE $7 END,
        modo=$8,
        emite_factura_a=$9, emite_factura_b=$10, emite_factura_c=$11,
        emite_nota_credito=$12, emite_nota_debito=$13,
        actualizado_en=now()`,
      [cliente_id, cuit || '', razon_social || '', condicion_iva || '', parseInt(punto_venta) || 1,
       certificado || '', clave_privada || '', modo || 'homologacion',
       !!emite_factura_a, !!emite_factura_b, !!emite_factura_c,
       !!emite_nota_credito, !!emite_nota_debito]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('arca config put:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /config/:cliente_id/test ────────────────────────────
router.post('/config/:cliente_id/test', verificarClienteId, async (req, res) => {
  const { cliente_id } = req.params;
  try {
    const cfgRes = await pool.query(
      `SELECT * FROM arca_configuracion WHERE cliente_id=$1`, [cliente_id]
    );
    if (cfgRes.rows.length === 0) return res.status(400).json({ error: 'Sin configuración' });
    const config = cfgRes.rows[0];

    if (!config.certificado || !config.clave_privada) {
      return res.status(400).json({ error: 'Certificado o clave privada no cargados' });
    }

    let tokenData;
    try {
      tokenData = await obtenerToken({ ...config, token_wsaa: '', token_expira: null });
    } catch (e) {
      await pool.query(
        `UPDATE arca_configuracion SET estado_conexion='error', ultimo_error=$1, actualizado_en=now() WHERE cliente_id=$2`,
        [e.message, cliente_id]
      );
      await logARCA(cliente_id, 'test_wsaa', false, 'TRA generado', '', e.message);
      return res.status(200).json({ ok: false, error: e.message });
    }

    // Guardar token
    await pool.query(
      `UPDATE arca_configuracion SET
         token_wsaa=$1, sign_wsaa=$2, token_expira=$3,
         estado_conexion='ok', ultima_conexion=now(), ultimo_error='', actualizado_en=now()
       WHERE cliente_id=$4`,
      [tokenData.token, tokenData.sign, tokenData.expira, cliente_id]
    );

    await logARCA(cliente_id, 'test_wsaa', true, 'TRA generado', 'Token OK', '');
    res.json({ ok: true, mensaje: 'Conexión exitosa con ARCA', expira_en: tokenData.expira });
  } catch (err) {
    console.error('arca test:', err.message);
    await logARCA(cliente_id, 'test_wsaa', false, '', '', err.message);
    res.status(500).json({ error: err.message });
  }
});

function alicuotaAfipId(pct) {
  if (pct === 0)    return 3;
  if (pct === 10.5) return 4;
  if (pct === 21)   return 5;
  if (pct === 27)   return 6;
  return 5;
}

// ─── POST /facturar/:cliente_id ───────────────────────────────
router.post('/facturar/:cliente_id', verificarClienteId, async (req, res) => {
  const { cliente_id } = req.params;
  const controles = require('../../services/arcaEmision');
  let db;
  let intentoId;
  let autorizado = false;
  try {
    const {
      venta_id, tipo_factura = '6', punto_venta,
      receptor_cuit = '0', receptor_nombre = 'Consumidor Final',
      receptor_condicion_iva = '5',
    } = req.body;

    const ventaId = Number(venta_id);
    if (!Number.isInteger(ventaId) || ventaId <= 0) throw new Error('Venta invalida');
    db = await controles.iniciarEmision(pool, cliente_id, ventaId);
    const existente = await db.query('SELECT * FROM arca_comprobantes WHERE cliente_id=$1 AND venta_id=$2', [cliente_id, ventaId]);
    if (existente.rows.length) {
      if (existente.rows.length !== 1 || !/^\d{14}$/.test(String(existente.rows[0].cae))) {
        throw new Error('La venta tiene registros fiscales inconsistentes; requiere revision');
      }
      const comp = existente.rows[0];
      await db.query('COMMIT');
      return res.json({ ok: true, ya_emitida: true, cae: comp.cae, numero_completo: comp.numero_completo,
        tipo_factura: comp.tipo_comprobante, vencimiento_cae: comp.cae_vencimiento });
    }
    // Bloquear configuracion mientras se prepara y emite.
    const cfgRes = await db.query(`SELECT * FROM arca_configuracion WHERE cliente_id=$1 FOR UPDATE`, [cliente_id]);
    if (cfgRes.rows.length === 0) throw new Error('Sin configuración ARCA');
    const config = cfgRes.rows[0];
    const anteriores = await db.query(`SELECT id FROM arca_logs WHERE cliente_id=$1
      AND tipo='factura_intento' AND request::text LIKE $2
      AND trim(both '"' from response::text) <> 'rechazada' LIMIT 1`,
      [cliente_id, `%venta:${ventaId}|%`]);
    if (anteriores.rows.length) throw new Error('Hay un intento fiscal pendiente. No reintentar: requiere conciliacion con ARCA');

    const cbteTipo = parseInt(tipo_factura, 10);
    if (!['produccion', 'homologacion'].includes(config.modo)) throw new Error('Modo ARCA invalido');
    if (!Number.isInteger(ventaId) || ventaId <= 0) {
      throw new Error('Debés seleccionar una venta válida antes de facturar');
    }
    if (![1, 6, 11].includes(cbteTipo) || !facturaHabilitada(config, cbteTipo)) {
      throw new Error('El tipo de factura solicitado no está habilitado para este cliente');
    }
    if (!['1', 'Responsable Inscripto'].includes(String(config.condicion_iva)) || ![1, 6].includes(cbteTipo)) {
      throw new Error('Este flujo requiere emisor Responsable Inscripto y factura A o B');
    }
    const condicionReceptor = Number(receptor_condicion_iva);
    if (![1, 4, 5, 6, 7, 8, 9, 10, 13, 15, 16].includes(condicionReceptor) ||
        (cbteTipo === 1 && ![1, 6].includes(condicionReceptor))) throw new Error('Condicion IVA del receptor invalida para esta factura');

    // Leer venta
    const pventa = Number(config.punto_venta);
    if (!Number.isInteger(pventa) || pventa < 1 || pventa > 99999 ||
        (punto_venta !== undefined && Number(punto_venta) !== pventa)) throw new Error('Punto de venta invalido o distinto de la configuracion');
    await controles.bloquearSerie(db, config.modo, config.cuit, pventa, cbteTipo);
    const pendientesSerie = await db.query(`SELECT request FROM arca_logs WHERE cliente_id=$1
      AND tipo='factura_intento' AND trim(both '"' from response::text) <> 'rechazada'
      AND response::text NOT LIKE '%registrada|%'`, [cliente_id]);
    for (const row of pendientesSerie.rows) {
      const requestPrevio = typeof row.request === 'string' ? row.request : JSON.stringify(row.request);
      const previo = JSON.parse(requestPrevio.slice(requestPrevio.indexOf('|') + 1).replace(/"$/, ''));
      if (previo.modo === config.modo && previo.cuit === config.cuit && previo.punto === pventa && previo.tipo === cbteTipo) {
        throw new Error('El punto y tipo tienen un intento pendiente; requiere conciliacion antes de emitir otra factura');
      }
    }
    let importe_neto = 0, importe_iva = 0, importe_total = 0;
    let alicuotas = [];

    if (venta_id) {
      try {
        const ventaRes = await db.query(
          `SELECT * FROM ventas WHERE id=$1 AND cliente_id=$2 FOR UPDATE`, [ventaId, cliente_id]
        );
        if (ventaRes.rows.length > 0) {
          const venta = ventaRes.rows[0];
          if (venta.facturado) throw new Error('Esta venta ya tiene un comprobante emitido');
          importe_total = controles.centavos(venta.total ?? venta.monto_total) / 100;

          const itemsAgrup = await db.query(
            `SELECT
               COALESCE(alicuota_iva, 21) AS alicuota,
               SUM(subtotal::numeric)     AS base_imp,
               SUM(iva_monto::numeric)    AS iva_monto
             FROM ventas_items
             WHERE venta_id = $1 AND cliente_id = $2
             GROUP BY COALESCE(alicuota_iva, 21)
             ORDER BY alicuota`,
            [ventaId, cliente_id]
          );

          if (itemsAgrup.rows.length > 0) {
            if (venta.modo_iva === 'off' && itemsAgrup.rows.some(row => Number(row.alicuota) > 0)) {
              throw new Error('No se puede emitir en ARCA: la venta está en "Sin IVA" y contiene productos con alícuota mayor a 0%. La venta no fue modificada.');
            }
            importe_neto = 0;
            importe_iva  = 0;
            alicuotas = [];
            for (const row of itemsAgrup.rows) {
              const alic = parseFloat(row.alicuota);
              const base = controles.centavos(row.base_imp) / 100;
              const iva  = controles.centavos(row.iva_monto) / 100;
              importe_neto += base;
              importe_iva  += iva;
              alicuotas.push({ alicuota: alic, base, iva });
            }
          } else {
            throw new Error('La venta no tiene ítems fiscales; no se puede inventar un importe para facturar');
          }
        }
      } catch (err) { throw err; }
    }

    // Obtener último número
    if (alicuotas.length === 0) throw new Error('La venta no existe o no pertenece a este cliente');
    controles.validarImportes(importe_total, alicuotas);
    const fiscalEmisor = await db.query(`SELECT a.cuit,a.razon_social,a.condicion_iva,
      c.direccion_fiscal,c.ingresos_brutos,to_jsonb(c)->>'inicio_actividades' AS inicio_actividades
      FROM arca_configuracion a JOIN clientes_roberto c ON c.id=a.cliente_id WHERE a.cliente_id=$1`, [cliente_id]);
    require('../../services/arcaPdf').validarEmisor(fiscalEmisor.rows[0] || {});
    const detalleFiscal = await db.query(`SELECT vi.*,p.descripcion AS producto_descripcion
      FROM ventas_items vi LEFT JOIN productos_propios p ON p.id=vi.producto_id AND p.cliente_id=vi.cliente_id
      WHERE vi.venta_id=$1 AND vi.cliente_id=$2 ORDER BY vi.orden FOR SHARE OF vi`, [ventaId, cliente_id]);
    if (!detalleFiscal.rows.length) throw new Error('Sin detalle fiscal');
    require('../../services/arcaPdf').validarDetalle({ importe_neto, importe_iva }, detalleFiscal.rows);

    // Contactar WSAA solo despues de validar la venta; no cambiar sus importes.
    let tokenData;
    try {
      tokenData = await obtenerToken(config);
    } catch (e) {
      throw new Error('Error WSAA: ' + e.message);
    }
    await db.query(
      `UPDATE arca_configuracion SET token_wsaa=$1, sign_wsaa=$2, token_expira=$3 WHERE cliente_id=$4`,
      [tokenData.token, tokenData.sign, tokenData.expira ?? config.token_expira, cliente_id]
    );

    const wsfeUrl = config.modo === 'produccion' ? WSFE_PROD : WSFE_HOMO;
    let ultimoNum = 0;

    const soapUltimo = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soap:Body>
    <ar:FECompUltimoAutorizado>
      <ar:Auth><ar:Token>${tokenData.token}</ar:Token><ar:Sign>${tokenData.sign}</ar:Sign><ar:Cuit>${config.cuit}</ar:Cuit></ar:Auth>
      <ar:PtoVta>${pventa}</ar:PtoVta>
      <ar:CbteTipo>${cbteTipo}</ar:CbteTipo>
    </ar:FECompUltimoAutorizado>
  </soap:Body>
</soap:Envelope>`;

    try {
      const rUltimo = await axios.post(wsfeUrl, soapUltimo, { headers: { 'Content-Type': 'text/xml', 'SOAPAction': '' }, timeout: 10000 });
      ultimoNum = await controles.ultimoAutorizado(rUltimo.data);
    } catch (e) {
      throw new Error('No se pudo consultar el último comprobante autorizado: ' + e.message);
    }

    const nuevoNum = ultimoNum + 1;

    // Llamar FECAESolicitar
    const fechaHoy = fechaComprobanteARCA();

    const alicGravadas = alicuotas.filter(a => a.alicuota > 0);
    const alicExentas  = alicuotas.filter(a => a.alicuota === 0);
    const impOpEx      = alicExentas.reduce((s, a) => s + a.base, 0);
    const impNetoGrav  = alicGravadas.reduce((s, a) => s + a.base, 0);
    const impIVA       = alicGravadas.reduce((s, a) => s + a.iva, 0);

    const esFacturaA = [1, 2, 3].includes(cbteTipo);
    const tieneCuit  = receptor_cuit && receptor_cuit !== '0' && receptor_cuit.replace(/-/g,'').length >= 11;
    const docTipo    = esFacturaA ? 80 : (tieneCuit ? 80 : 99);
    const docNro     = docTipo === 80 ? receptor_cuit.replace(/-/g, '') : '0';
    if (docTipo === 80 && !/^\d{11}$/.test(docNro)) throw new Error('CUIT receptor invalido');

    let alicIvaXml = '';
    for (const a of alicGravadas) {
      alicIvaXml += `
              <ar:AlicIva>
                <ar:Id>${alicuotaAfipId(a.alicuota)}</ar:Id>
                <ar:BaseImp>${a.base.toFixed(2)}</ar:BaseImp>
                <ar:Importe>${a.iva.toFixed(2)}</ar:Importe>
              </ar:AlicIva>`;
    }
    const bloqueIva = alicGravadas.length > 0
      ? `<ar:Iva>${alicIvaXml}
            </ar:Iva>`
      : '';

    const soapCAE = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soap:Body>
    <ar:FECAESolicitar>
      <ar:Auth><ar:Token>${tokenData.token}</ar:Token><ar:Sign>${tokenData.sign}</ar:Sign><ar:Cuit>${config.cuit}</ar:Cuit></ar:Auth>
      <ar:FeCAEReq>
        <ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${pventa}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo></ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>1</ar:Concepto>
            <ar:DocTipo>${docTipo}</ar:DocTipo>
            <ar:DocNro>${docNro}</ar:DocNro>
            <ar:CbteDesde>${nuevoNum}</ar:CbteDesde>
            <ar:CbteHasta>${nuevoNum}</ar:CbteHasta>
            <ar:CbteFch>${fechaHoy}</ar:CbteFch>
            <ar:ImpTotal>${importe_total.toFixed(2)}</ar:ImpTotal>
            <ar:ImpTotConc>0.00</ar:ImpTotConc>
            <ar:ImpNeto>${impNetoGrav.toFixed(2)}</ar:ImpNeto>
            <ar:ImpOpEx>${impOpEx.toFixed(2)}</ar:ImpOpEx>
            <ar:ImpIVA>${impIVA.toFixed(2)}</ar:ImpIVA>
            <ar:ImpTrib>0.00</ar:ImpTrib>
            <ar:MonId>PES</ar:MonId>
            <ar:MonCotiz>1</ar:MonCotiz>
            <ar:CondicionIVAReceptorId>${condicionReceptor}</ar:CondicionIVAReceptorId>
            ${bloqueIva}
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soap:Body>
</soap:Envelope>`;

    let cae = '', cae_vencimiento = null, resultadoOk = false, errorCAE = '';

    // Diario durable ANTES de contactar ARCA, fuera de la transaccion contable.
    // No contiene Token, Sign, certificado ni clave. Un resultado incierto nunca habilita otro CAE.
    const datosIntento = { modo: config.modo, cuit: config.cuit, punto: pventa, tipo: cbteTipo,
        numero: nuevoNum, fecha: fechaHoy, receptor_cuit, receptor_nombre, condicionReceptor,
        neto: importe_neto, iva: importe_iva, total: importe_total, alicuotas,
        emisor: fiscalEmisor.rows[0], items: detalleFiscal.rows.map(it => ({ cantidad: it.cantidad,
          descripcion_libre: it.descripcion_libre, producto_descripcion: it.producto_descripcion,
          precio_unitario: it.precio_unitario, subtotal: it.subtotal, iva_monto: it.iva_monto, alicuota_iva: it.alicuota_iva })) };
    const intento = await pool.query(`INSERT INTO arca_logs (cliente_id,tipo,exitoso,request,response,error)
      VALUES ($1,'factura_intento',false,$2,'','') RETURNING id`, [cliente_id,
      `venta:${ventaId}|${JSON.stringify(datosIntento)}`]);
    intentoId = intento.rows[0].id;

    try {
      const rCAE = await axios.post(wsfeUrl, soapCAE, { headers: { 'Content-Type': 'text/xml', 'SOAPAction': '' }, timeout: 15000 });
      const fiscal = await controles.autorizacion(rCAE.data, nuevoNum, pventa, cbteTipo);
      cae = fiscal.cae;
      autorizado = true;
      resultadoOk = true;
      const v = fiscal.vencimiento;
      cae_vencimiento = `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}`;
      await pool.query('UPDATE arca_logs SET exitoso=true,response=$1 WHERE id=$2 AND cliente_id=$3',
        [JSON.stringify({ cae, cae_vencimiento }), intentoId, cliente_id]);
      await logARCA(cliente_id, 'fecaesolicitar', resultadoOk, 'Solicitud de CAE enviada', 'Respuesta de ARCA recibida', '');
    } catch (e) {
      if (e.rechazoFiscal) await pool.query("UPDATE arca_logs SET response='rechazada' WHERE id=$1 AND cliente_id=$2", [intentoId, cliente_id]);
      errorCAE = e.message;
      await logARCA(cliente_id, 'fecaesolicitar', false, 'Solicitud de CAE enviada', '', e.message);
      throw new Error('Error obteniendo CAE de AFIP: ' + (e.message || 'Sin respuesta del servidor'));
    }

    if (!resultadoOk) throw new Error('ARCA no devolvió CAE; no se registró ningún comprobante');

    const resultado = await require('../../services/arcaConciliacion').guardarFactura(db,cliente_id,ventaId,intentoId,datosIntento,{ cae,cae_vencimiento });
    await db.query('COMMIT');
    res.json(resultado);
  } catch (err) {
    if (db) await db.query('ROLLBACK').catch(() => {});
    console.error('arca facturar:', err.message);
    await logARCA(cliente_id, 'facturar', false, '', '', err.message);
    res.status(500).json({ error: autorizado ? 'ARCA autorizo, pero el guardado quedo pendiente. No reintentar: requiere conciliacion.' : err.message });
  } finally {
    if (db) db.release();
  }
});

// ─── POST /conciliar/:cliente_id/:venta_id — solo consulta, nunca solicita otro CAE ───
router.post('/conciliar/:cliente_id/:venta_id', verificarClienteId, async (req,res) => {
  try {
    const { conciliarFactura } = require('../../services/arcaConciliacion');
    const resultado = await conciliarFactura({ pool,obtenerToken,
      consultar: async (config,token,datos) => {
        const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soap:Body><ar:FECompConsultar><ar:Auth><ar:Token>${token.token}</ar:Token><ar:Sign>${token.sign}</ar:Sign><ar:Cuit>${config.cuit}</ar:Cuit></ar:Auth>
    <ar:FeCompConsReq><ar:CbteTipo>${datos.tipo}</ar:CbteTipo><ar:CbteNro>${datos.numero}</ar:CbteNro><ar:PtoVta>${datos.punto}</ar:PtoVta></ar:FeCompConsReq>
  </ar:FECompConsultar></soap:Body>
</soap:Envelope>`;
        const r = await axios.post(config.modo === 'produccion' ? WSFE_PROD : WSFE_HOMO,soap,
          { headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: 'http://ar.gov.afip.dif.FEV1/FECompConsultar' },timeout: 15000 });
        return r.data;
      },
    },req.params.cliente_id,req.params.venta_id);
    res.json(resultado);
  } catch (error) {
    res.status(409).json({ error: error.message, requiere_revision: true });
  }
});

// ─── GET /pendientes/:cliente_id — ventas sin facturar ───────
router.get('/pendientes/:cliente_id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const result = await pool.query(
      `SELECT id, numero_completo, comprador_nombre, comprador_cuit,
              total, fecha, creado_en
       FROM ventas
       WHERE cliente_id = $1
         AND (facturado = false OR facturado IS NULL)
       ORDER BY creado_en DESC
       LIMIT 50`,
      [cliente_id]
    );
    res.json({ ventas: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('arca pendientes:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /historial/:cliente_id ───────────────────────────────
router.get('/historial/:cliente_id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const { tipo_comprobante, fecha_desde, fecha_hasta, buscar, page = 1, limit = 25 } = req.query;
    const conds = ['cliente_id=$1'];
    const params = [cliente_id];
    if (tipo_comprobante) { params.push(tipo_comprobante); conds.push(`tipo_comprobante=$${params.length}`); }
    if (fecha_desde) { params.push(fecha_desde); conds.push(`fecha_emision >= $${params.length}`); }
    if (fecha_hasta) { params.push(fecha_hasta); conds.push(`fecha_emision <= $${params.length}`); }
    if (buscar) { params.push(`%${buscar}%`); conds.push(`(numero_completo ILIKE $${params.length} OR receptor_nombre ILIKE $${params.length})`); }
    const where = conds.join(' AND ');
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const [rows, tot] = await Promise.all([
      pool.query(`SELECT * FROM arca_comprobantes WHERE ${where} ORDER BY creado_en DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
        [...params, parseInt(limit), offset]),
      pool.query(`SELECT COUNT(*) FROM arca_comprobantes WHERE ${where}`, params),
    ]);
    res.json({ comprobantes: rows.rows, total: parseInt(tot.rows[0].count,10), pagina: parseInt(page) });
  } catch (err) {
    console.error('arca historial:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /logs/:cliente_id ────────────────────────────────────
router.get('/logs/:cliente_id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const { exitoso, fecha_desde, fecha_hasta, page = 1, limit = 25 } = req.query;
    const conds = ['cliente_id=$1'];
    const params = [cliente_id];
    if (exitoso !== undefined) { params.push(exitoso === 'true'); conds.push(`exitoso=$${params.length}`); }
    if (fecha_desde) { params.push(fecha_desde); conds.push(`creado_en::date >= $${params.length}`); }
    if (fecha_hasta) { params.push(fecha_hasta); conds.push(`creado_en::date <= $${params.length}`); }
    const where = conds.join(' AND ');
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const [rows, tot] = await Promise.all([
      pool.query(`SELECT id, tipo, exitoso, error, creado_en FROM arca_logs WHERE ${where} ORDER BY creado_en DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
        [...params, parseInt(limit), offset]),
      pool.query(`SELECT COUNT(*) FROM arca_logs WHERE ${where}`, params),
    ]);
    res.json({ logs: rows.rows, total: parseInt(tot.rows[0].count,10) });
  } catch (err) {
    console.error('arca logs:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /comprobante/:cliente_id/:id/pdf ────────────────────
router.post('/comprobante/:cliente_id/:id/pdf', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id, id } = req.params;
    const r = await pool.query(`SELECT *,fecha_emision::text AS fecha_emision,cae_vencimiento::text AS cae_vencimiento
      FROM arca_comprobantes WHERE id=$1 AND cliente_id=$2`, [id, cliente_id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    const comp = r.rows[0];
    if([3,8].includes(Number(comp.tipo_comprobante))) {
      const snapshot=await require('../../services/arcaPdfNC').snapshotPdfNC(pool,cliente_id,comp);
      const {pdf,qrUrl}=await require('../../services/arcaPdf').generarPdfArca(snapshot.comp,snapshot.emisor,snapshot.items);
      return res.json({ok:true,pdf_base64:pdf.toString('base64'),qr_url:qrUrl,numero_completo:comp.numero_completo});
    }
    const diarios = await pool.query(`SELECT request,response FROM arca_logs WHERE cliente_id=$1
      AND tipo='factura_intento' AND request::text LIKE $2 AND response::text LIKE '%registrada|%'`,
      [cliente_id, `%venta:${comp.venta_id}|%`]);
    const snapshots = diarios.rows.map(row => ({
      datos: JSON.parse(row.request.slice(row.request.indexOf('|') + 1)),
      resultado: JSON.parse(row.response.slice('registrada|'.length)),
    })).filter(row => row.resultado.cae === String(comp.cae));
    if (snapshots.length !== 1) throw new Error('Sin detalle fiscal inmutable; requiere revision antes de generar PDF');
    const snapshot = snapshots[0].datos;
    const { generarPdfArca } = require('../../services/arcaPdf');
    const { pdf, qrUrl } = await generarPdfArca(comp, snapshot.emisor, snapshot.items);
    res.json({ ok: true, pdf_base64: pdf.toString('base64'), qr_url: qrUrl, numero_completo: comp.numero_completo });
  } catch (err) {
    console.error('arca pdf:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── ENDPOINTS SUPERADMIN (alias para Roberto) ────────────────
router.get('/superadmin/arca/:cliente_roberto_id', (req, res, next) => {
  req.params.cliente_id = req.params.cliente_roberto_id;
  verificarClienteId(req, res, next);
}, (req, res) => router.handle(Object.assign(req, { url: `/config/${req.params.cliente_roberto_id}`, method: 'GET' }), res, () => {}));

// Variante directa más simple:
router.get('/:cliente_id/superadmin-config', verificarClienteId, async (req, res) => {
  req.params.cliente_id = req.params.cliente_id;
  // redirigir internamente — usar la lógica de /config
  try {
    const { cliente_id } = req.params;
    const r = await pool.query(
      `SELECT id, cliente_id, cuit, razon_social, condicion_iva, punto_venta, modo,
              emite_factura_a, emite_factura_b, emite_factura_c,
              emite_nota_credito, emite_nota_debito,
              estado_conexion, ultima_conexion, ultimo_error, token_expira,
              (certificado <> '') AS tiene_certificado,
              (clave_privada <> '') AS tiene_clave
       FROM arca_configuracion WHERE cliente_id=$1`,
      [cliente_id]
    );
    if (r.rows.length === 0) return res.json({ configurado: false });
    res.json({ configurado: true, ...r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CONSULTA PADRÓN ARCA ────────────────────────────────────
router.post('/padron/:cliente_id/consultar', verificarClienteId, async (req, res) => {
  const { cliente_id } = req.params;
  const { cuit } = req.body;

  if (!cuit || cuit.replace(/\D/g, '').length !== 11) {
    return res.status(400).json({ error: 'CUIT inválido (debe tener 11 dígitos)' });
  }
  const cuitLimpio = cuit.replace(/\D/g, '');

  try {
    const cfgRes = await pool.query('SELECT * FROM arca_configuracion WHERE cliente_id=$1', [cliente_id]);
    if (cfgRes.rows.length === 0) return res.status(400).json({ error: 'ARCA no configurado para este cliente' });
    const config = cfgRes.rows[0];

    if (!config.certificado || !config.clave_privada) {
      return res.status(400).json({ error: 'Certificado o clave privada no cargados' });
    }

    const { token, sign } = await obtenerTokenPadron(config);

    const padronUrl = config.modo === 'produccion' ? PADRON_PROD : PADRON_HOMO;

    const soapReq = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:a5="http://a5.soap.ws.server.puc.sr/">
  <soapenv:Body>
    <a5:getPersona>
      <token>${token}</token>
      <sign>${sign}</sign>
      <cuitRepresentada>${config.cuit}</cuitRepresentada>
      <idPersona>${cuitLimpio}</idPersona>
    </a5:getPersona>
  </soapenv:Body>
</soapenv:Envelope>`;

    const resp = await axios.post(padronUrl, soapReq, {
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': '' },
      timeout: 15000,
    });

    await logARCA(cliente_id, 'padron_consulta', true, `CUIT: ${cuitLimpio}`, resp.data.slice(0, 2000), '');

    const parsed = await xml2js.parseStringPromise(resp.data, { explicitArray: false });
    const body = parsed?.['soap:Envelope']?.['soap:Body'] ||
                 parsed?.['soapenv:Envelope']?.['soapenv:Body'] ||
                 parsed?.['S:Envelope']?.['S:Body'] || {};
    const personaResp = body?.['ns2:getPersonaResponse'] ||
                        body?.['getPersonaResponse'] || {};
    const persona = personaResp?.personaReturn || {};

    if (persona.errorConstancia) {
      const errMsg = persona.errorConstancia?.error || 'CUIT no encontrado en padrón';
      return res.status(404).json({ error: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg) });
    }

    const dg = persona.datosGenerales || {};
    const dom = dg.domicilioFiscal || {};
    const drg = persona.datosRegimenGeneral || {};
    const dm = persona.datosMonotributo || {};

    let condicion_iva = 'Consumidor Final';
    const impuestosRG = Array.isArray(drg.impuesto) ? drg.impuesto : (drg.impuesto ? [drg.impuesto] : []);
    const impuestosMT = Array.isArray(dm.impuesto) ? dm.impuesto : (dm.impuesto ? [dm.impuesto] : []);

    if (impuestosMT.some(i => String(i.idImpuesto) === '20')) {
      condicion_iva = 'Monotributista';
    } else if (impuestosRG.some(i => String(i.idImpuesto) === '30')) {
      condicion_iva = 'Responsable Inscripto';
    } else if (impuestosRG.some(i => String(i.idImpuesto) === '32')) {
      condicion_iva = 'Exento';
    }

    let razon_social = '';
    if (dg.tipoPersona === 'JURIDICA') {
      razon_social = dg.razonSocial || '';
    } else {
      const apellido = dg.apellido || '';
      const nombre = dg.nombre || '';
      razon_social = apellido && nombre ? `${apellido}, ${nombre}` : (apellido || nombre || '');
    }

    const direccion = dom.direccion || '';
    const ciudad = [dom.localidad, dom.descripcionProvincia].filter(Boolean).join(', ');

    res.json({
      ok: true,
      datos: {
        razon_social,
        condicion_iva,
        direccion,
        ciudad,
        tipo_persona: dg.tipoPersona || '',
        estado_clave: dg.estadoClave || '',
        cod_postal: dom.codPostal || '',
      }
    });
  } catch (err) {
    console.error('padron consulta error:', err.message);
    await logARCA(cliente_id, 'padron_consulta', false, `CUIT: ${cuitLimpio}`, '', err.message);
    res.status(500).json({ error: 'Error al consultar padrón: ' + err.message });
  }
});

// ─── EMITIR NOTA DE CRÉDITO EN ARCA ──────────────────────────
router.post('/emitir-nc/:cliente_id', verificarClienteId, async (req, res) => {
  const { cliente_id } = req.params;
  let db, intentoId, autorizado = false;
  try {
    const { nota_id } = req.body;

    if (!Number.isSafeInteger(Number(nota_id)) || Number(nota_id) <= 0) throw new Error('N/C invalida');
    const controlesNC = require('../../services/arcaEmision');
    db = await controlesNC.iniciarEmision(pool, cliente_id, `nc:${nota_id}`);
    const cfgRes = await db.query('SELECT * FROM arca_configuracion WHERE cliente_id=$1 FOR UPDATE', [cliente_id]);
    if (cfgRes.rows.length === 0) throw new Error('Sin configuración ARCA');
    const config = cfgRes.rows[0];
    if (!['produccion', 'homologacion'].includes(config.modo)) throw new Error('Modo ARCA invalido');
    const notaRes = await db.query('SELECT * FROM notas_credito WHERE id=$1 AND cliente_id=$2 FOR UPDATE', [nota_id, cliente_id]);
    const nota = notaRes.rows[0];
    if (!nota || nota.tipo !== 'emitida' || nota.estado !== 'emitida' || nota.anulada) {
      throw new Error('Se requiere una N/C comercial emitida, vigente y del cliente');
    }
    const diarios = await db.query(`SELECT response FROM arca_logs WHERE cliente_id=$1
      AND tipo='nc_intento' AND request LIKE $2 AND response <> 'rechazada'`,
      [cliente_id, `nc:${nota_id}|%`]);
    if (diarios.rows.length) {
      if (diarios.rows.length === 1 && diarios.rows[0].response?.startsWith('registrada|')) {
        const resultado = await require('../../services/arcaConciliacionNC').registradaNC(db,cliente_id,diarios.rows[0].response);
        await db.query('COMMIT');
        return res.json(resultado);
      }
      throw new Error('N/C con autorizacion pendiente de conciliacion. No volver a emitir');
    }
    if (/^NC[ABC]-/.test(String(nota.numero_completo || ''))) {
      throw new Error('N/C fiscal historica sin diario de control. Revisar antes de volver a emitir');
    }
    const origenRes = await db.query(`SELECT ac.*,v.comprador_cuit FROM arca_comprobantes ac
      JOIN ventas v ON v.id=ac.venta_id AND v.cliente_id=ac.cliente_id
      WHERE ac.cliente_id=$1 AND ac.venta_id=$2`, [cliente_id, nota.venta_id]);
    if (origenRes.rows.length !== 1 || !['1','6'].includes(String(origenRes.rows[0].tipo_comprobante)) ||
        !/^\d{14}$/.test(String(origenRes.rows[0].cae))) throw new Error('Factura de origen local invalida o ambigua');
    const origen = origenRes.rows[0];
    if (!Number.isSafeInteger(Number(origen.numero)) || Number(origen.numero)<1 ||
        !Number.isInteger(Number(origen.punto_venta)) || Number(origen.punto_venta)<1 || Number(origen.punto_venta)>99999) {
      throw new Error('Numeracion del comprobante de origen invalida');
    }
    const condicionReceptorNC = Number(origen.receptor_cond_iva);
    if (![1,4,5,6,7,8,9,10,13,15,16].includes(condicionReceptorNC)) {
      throw new Error('Condicion IVA del receptor original ausente o invalida; requiere revision');
    }
    const itemsRes = await db.query(`SELECT to_jsonb(i) AS item FROM notas_credito_items i
      WHERE COALESCE(to_jsonb(i)->>'nota_id',to_jsonb(i)->>'nota_credito_id')=$1 FOR SHARE`, [String(nota_id)]);
    const guardados = require('../../services/arcaNotaCredito').importesGuardados(nota, itemsRes.rows.map(r => r.item));
    const emisorNC=(await db.query(`SELECT a.cuit,a.razon_social,a.condicion_iva,c.direccion_fiscal,c.ingresos_brutos,
      to_jsonb(c)->>'inicio_actividades' AS inicio_actividades FROM arca_configuracion a
      JOIN clientes_roberto c ON c.id=a.cliente_id WHERE a.cliente_id=$1`,[cliente_id])).rows[0];
    const detalleNC=require('../../services/arcaPdfNC').detalleNC(itemsRes.rows.map(r=>r.item));
    require('../../services/arcaPdf').validarEmisor(emisorNC||{});
    require('../../services/arcaPdf').validarDetalle({importe_neto:guardados.importe_neto,importe_iva:guardados.impIVA},detalleNC);
    if (Number(nota.total) > Number(origen.importe_total)) throw new Error('N/C supera el total de la factura de origen');

    let tokenData;
    try {
      tokenData = await obtenerToken(config);
    } catch (e) {
      throw new Error('Error WSAA: ' + e.message);
    }
    await db.query(
      'UPDATE arca_configuracion SET token_wsaa=$1, sign_wsaa=$2, token_expira=$3 WHERE cliente_id=$4',
      [tokenData.token, tokenData.sign, tokenData.expira ?? config.token_expira, cliente_id]
    );

    const tipoOrigen = Number(origen.tipo_comprobante);
    if (!config.emite_nota_credito) {
      throw new Error('Las notas de crédito no están habilitadas para este cliente');
    }

    let cbteTipo;
    if ([1, 2, 3].includes(tipoOrigen))   cbteTipo = 3;
    else if ([6, 7, 8].includes(tipoOrigen)) cbteTipo = 8;
    else                                     cbteTipo = 13;

    const pventa = Number(config.punto_venta);
    if (!Number.isInteger(pventa) || pventa < 1 || pventa > 99999) throw new Error('Punto de venta invalido');
    await controlesNC.bloquearSerie(db,config.modo,config.cuit,pventa,cbteTipo);
    const pendientesNC = await db.query(`SELECT request FROM arca_logs WHERE cliente_id=$1
      AND tipo='nc_intento' AND response <> 'rechazada' AND response NOT LIKE 'registrada|%'`, [cliente_id]);
    for (const pendiente of pendientesNC.rows) {
      const datos = JSON.parse(pendiente.request.slice(pendiente.request.indexOf('|')+1));
      if (datos.modo===config.modo && datos.cuit===config.cuit && datos.punto===pventa && datos.tipo===cbteTipo) {
        throw new Error('La serie N/C tiene un intento pendiente; requiere conciliacion');
      }
    }
    const wsfeUrl = config.modo === 'produccion' ? WSFE_PROD : WSFE_HOMO;

    const alicuotas = guardados.alicuotas;

    const alicGravadas = alicuotas.filter(a => a.alicuota > 0);
    const alicExentas  = alicuotas.filter(a => a.alicuota === 0);
    const impNetoGrav  = alicGravadas.reduce((s, a) => s + a.base, 0);
    const impIVA       = guardados.impIVA;
    const impOpEx      = alicExentas.reduce((s, a) => s + a.base, 0);
    const importe_total = guardados.importe_total;
    const importe_neto  = guardados.importe_neto;

    const esNCA = cbteTipo === 3;
    const cuitReceptor = String(origen.receptor_cuit || '').replace(/[^0-9]/g,'');
    const tieneCuit = /^\d{11}$/.test(cuitReceptor);
    const docTipo = esNCA ? 80 : (tieneCuit ? 80 : 99);
    const docNro  = docTipo === 80 ? cuitReceptor : '0';
    if (esNCA && !tieneCuit) throw new Error('N/C A requiere CUIT receptor');

    let ultimoNum = 0;
    const soapUltimo = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soap:Body>
    <ar:FECompUltimoAutorizado>
      <ar:Auth><ar:Token>${tokenData.token}</ar:Token><ar:Sign>${tokenData.sign}</ar:Sign><ar:Cuit>${config.cuit}</ar:Cuit></ar:Auth>
      <ar:PtoVta>${pventa}</ar:PtoVta>
      <ar:CbteTipo>${cbteTipo}</ar:CbteTipo>
    </ar:FECompUltimoAutorizado>
  </soap:Body>
</soap:Envelope>`;

    try {
      const rU = await axios.post(wsfeUrl, soapUltimo, { headers: { 'Content-Type': 'text/xml', 'SOAPAction': '' }, timeout: 10000 });
      ultimoNum = await controlesNC.ultimoAutorizado(rU.data);
    } catch (e) {
      throw new Error('No se pudo consultar el último comprobante autorizado: ' + e.message);
    }

    const nuevoNum = ultimoNum + 1;
    const fechaHoy = fechaComprobanteARCA();

    let alicIvaXml = '';
    for (const a of alicGravadas) {
      alicIvaXml += `
              <ar:AlicIva>
                <ar:Id>${alicuotaAfipId(a.alicuota)}</ar:Id>
                <ar:BaseImp>${a.base.toFixed(2)}</ar:BaseImp>
                <ar:Importe>${a.iva.toFixed(2)}</ar:Importe>
              </ar:AlicIva>`;
    }
    const bloqueIva = alicGravadas.length > 0 ? `<ar:Iva>${alicIvaXml}\n            </ar:Iva>` : '';

    const nroOrigen = Number(origen.numero);
    const cbtesAsocXml = `
            <ar:CbtesAsoc>
              <ar:CbteAsoc>
                <ar:Tipo>${tipoOrigen}</ar:Tipo>
                <ar:PtoVta>${Number(origen.punto_venta)}</ar:PtoVta>
                <ar:Nro>${nroOrigen}</ar:Nro>
              </ar:CbteAsoc>
            </ar:CbtesAsoc>`;

    const soapCAE = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soap:Body>
    <ar:FECAESolicitar>
      <ar:Auth><ar:Token>${tokenData.token}</ar:Token><ar:Sign>${tokenData.sign}</ar:Sign><ar:Cuit>${config.cuit}</ar:Cuit></ar:Auth>
      <ar:FeCAEReq>
        <ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${pventa}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo></ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>1</ar:Concepto>
            <ar:DocTipo>${docTipo}</ar:DocTipo>
            <ar:DocNro>${docNro}</ar:DocNro>
            <ar:CbteDesde>${nuevoNum}</ar:CbteDesde>
            <ar:CbteHasta>${nuevoNum}</ar:CbteHasta>
            <ar:CbteFch>${fechaHoy}</ar:CbteFch>
            <ar:ImpTotal>${importe_total.toFixed(2)}</ar:ImpTotal>
            <ar:ImpTotConc>0.00</ar:ImpTotConc>
            <ar:ImpNeto>${impNetoGrav.toFixed(2)}</ar:ImpNeto>
            <ar:ImpOpEx>${impOpEx.toFixed(2)}</ar:ImpOpEx>
            <ar:ImpIVA>${impIVA.toFixed(2)}</ar:ImpIVA>
            <ar:ImpTrib>0.00</ar:ImpTrib>
            <ar:MonId>PES</ar:MonId>
            <ar:MonCotiz>1</ar:MonCotiz>
            <ar:CondicionIVAReceptorId>${condicionReceptorNC}</ar:CondicionIVAReceptorId>
            ${cbtesAsocXml}
            ${bloqueIva}
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soap:Body>
</soap:Envelope>`;

    let cae = '', cae_vencimiento = null, resultadoOk = false;
    const datosNC = { modo:config.modo,cuit:config.cuit,punto:pventa,tipo:cbteTipo,numero:nuevoNum,
      nota_id:Number(nota_id),fecha:fechaHoy,origen_id:origen.id,importes:guardados,
      receptor_cuit:docNro,receptor_nombre:origen.receptor_nombre,condicionReceptor:condicionReceptorNC,
      neto:importe_neto,iva:impIVA,total:importe_total,alicuotas,emisor:emisorNC,items:detalleNC,
      comprobante_asociado:{tipo:Number(origen.tipo_comprobante),punto:Number(origen.punto_venta),numero:Number(origen.numero)} };
    const intento = await pool.query(`INSERT INTO arca_logs (cliente_id,tipo,exitoso,request,response,error)
      VALUES ($1,'nc_intento',false,$2,'','') RETURNING id`, [cliente_id,`nc:${nota_id}|${JSON.stringify(datosNC)}`]);
    intentoId = intento.rows[0].id;

    try {
      const rCAE = await axios.post(wsfeUrl, soapCAE, { headers: { 'Content-Type': 'text/xml', 'SOAPAction': '' }, timeout: 15000 });
      const fiscal = await controlesNC.autorizacion(rCAE.data,nuevoNum,pventa,cbteTipo);
      cae = fiscal.cae; autorizado = true; resultadoOk = true;
      const v = fiscal.vencimiento;
      cae_vencimiento = `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}`;
      await pool.query('UPDATE arca_logs SET exitoso=true,response=$1 WHERE id=$2 AND cliente_id=$3',
        [JSON.stringify({cae,cae_vencimiento}),intentoId,cliente_id]);
      await logARCA(cliente_id, 'emitir_nc', resultadoOk, 'Solicitud de nota de crédito enviada', 'Respuesta de ARCA recibida', '');
    } catch (e) {
      if (e.rechazoFiscal) await pool.query("UPDATE arca_logs SET response='rechazada' WHERE id=$1 AND cliente_id=$2",[intentoId,cliente_id]);
      await logARCA(cliente_id, 'emitir_nc', false, 'Solicitud de nota de crédito enviada', '', e.message);
      throw new Error('Error obteniendo CAE de ARCA: ' + e.message);
    }

    if (!resultadoOk) throw new Error('ARCA no devolvió CAE');

    const resultadoNC = await require('../../services/arcaConciliacionNC').guardarNC(db,cliente_id,intentoId,datosNC,{cae,cae_vencimiento});
    await db.query('COMMIT');
    res.json(resultadoNC);
  } catch (err) {
    if (db) await db.query('ROLLBACK').catch(()=>{});
    console.error('arca emitir-nc:', err.message);
    await logARCA(cliente_id, 'emitir_nc', false, '', '', err.message);
    res.status(409).json({ error: autorizado ? 'ARCA autorizo la N/C, pero falta completar el guardado. No emitir otra: requiere conciliacion.' : err.message,
      nota_comercial_guardada: true, requiere_revision: Boolean(intentoId) });
  } finally {
    if (db) db.release();
  }
});

// ─── CONCILIAR N/C: consulta un CAE existente, nunca solicita una nueva emision.
router.post('/conciliar-nc/:cliente_id/:nota_id', verificarClienteId, async (req,res) => {
  try {
    const resultado = await require('../../services/arcaConciliacionNC').conciliarNC({pool,obtenerToken,
      consultar:async(config,token,datos)=>{
        const xml=`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
<soap:Body><ar:FECompConsultar>
<ar:Auth><ar:Token>${token.token}</ar:Token><ar:Sign>${token.sign}</ar:Sign><ar:Cuit>${config.cuit}</ar:Cuit></ar:Auth>
<ar:FeCompConsReq><ar:CbteTipo>${datos.tipo}</ar:CbteTipo><ar:CbteNro>${datos.numero}</ar:CbteNro><ar:PtoVta>${datos.punto}</ar:PtoVta></ar:FeCompConsReq>
</ar:FECompConsultar></soap:Body></soap:Envelope>`;
        const respuesta=await axios.post(config.modo==='produccion'?WSFE_PROD:WSFE_HOMO,xml,
          {headers:{'Content-Type':'text/xml; charset=utf-8',SOAPAction:'http://ar.gov.afip.dif.FEV1/FECompConsultar'},timeout:15000});
        return respuesta.data;
      }},req.params.cliente_id,req.params.nota_id);
    res.json(resultado);
  } catch(error) {res.status(409).json({error:error.message,requiere_revision:true});}
});

module.exports = router;
