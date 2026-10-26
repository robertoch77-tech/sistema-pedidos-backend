const { aplicarImagenesPropias } = require('../services/ivanImagenesPropias');
const { aplicarTextosCatalogo } = require('../services/ivanTextoCatalogo');
const { aplicarMarcaProducto } = require('../services/ivanMarcaProducto');
const { resolverCampo, seleccionGrupo, identificadorSql } = require('../services/ivanCampoEquivalencias');
const equivalenciasCodigos = require('../services/ivanEquivalenciasCodigos');
const express = require('express');
const router = express.Router();
const pool = require('../db');
const conexionCompartida = require('../services/conexionMayorista');
const jwt = require('jsonwebtoken');
const { obtenerDescuentoItems } = require('../services/descuentoClienteIvan');
const { validarSesionCosto, registrarFalloCosto, crearErrorCosto } = require('../services/ivanSesionCosto');
const descuentosComerciales = require('../services/ivanDescuentosComerciales');
const reglasComerciales = require('../services/ivanDescuentosReglas');
const ivaCatalogo = require('../services/ivanIvaCatalogo');
const condicionesOrigen = require('../services/ivanCondicionesOrigen');
const circuitoCliente = require('../services/ivanCircuitoCliente');
const {
  MODELO_COSTO_MARGEN_IVA,
  asegurarColumnasPrecioMayorista,
  aplicarPreciosCatalogo,
} = require('../services/precioCatalogoMayorista');

const soporteObsProducto = {};
const soporteIvaProducto = {};

async function getConexionMayorista(mayorista_id) {
  return conexionCompartida.getConexionMayorista(mayorista_id);
}

async function getDtoPagoTermino(mayorista_id) {
  try {
    const r = await pool.query(
      'SELECT dto_pago_termino FROM mayoristas WHERE id = $1',
      [mayorista_id]
    );
    return parseFloat(r.rows[0]?.dto_pago_termino) || 0;
  } catch { throw crearErrorCosto(503,'CONFIGURACION_COSTO_NO_DISPONIBLE','No se pudo confirmar la configuración del costo. Reintentá la consulta.'); }
}

async function getConfiguracionPrecio(mayoristaId) {
  try {
    await asegurarColumnasPrecioMayorista(pool);
    const r = await pool.query(
      `SELECT modelo_precio_catalogo, margen_catalogo, iva_catalogo_default,
              usar_iva_producto
       FROM mayoristas WHERE id=$1`,
      [mayoristaId]
    );
    return r.rows[0] || {};
  } catch {
    throw crearErrorCosto(503,'CONFIGURACION_COSTO_NO_DISPONIBLE','No se pudo confirmar la configuración del costo. Reintentá la consulta.');
  }
}

async function aplicarCondicionesPrecio(productos, condiciones) {
  try{
    const actuales=condiciones.origenIvan?await condicionesOrigen.aplicar(productos,condiciones.origenIvan):condiciones.comercial?reglasComerciales.aplicar(productos,condiciones.comercial):aplicarPreciosCatalogo(productos, {
      ...condiciones.configPrecio,
      dto_pago_termino: condiciones.dtoPct,
      descuento_items_pct: condiciones.descuentoItemsPct,
    });
    return await ivaCatalogo.aplicar(actuales,condiciones.ivaCatalogo,productos);
  }catch(e){if(condiciones.origenIvan)e.condiciones_ivan=true;throw e;}
}
function responderFalloOrigen(res,error){
  if(!error.condiciones_ivan&&!error.costo_cliente)return false;
  res.locals.costoErrorControlado=true;
  const sesion=res.locals.costoSesion;
  if(sesion)registrarFalloCosto(sesion.mayorista_id,sesion.cuit,error.codigo||'CONDICIONES_IVAN_REVISAR','No se pudo confirmar el costo y los descuentos del cliente. '+(error.codigo||'CONDICIONES_IVAN_REVISAR'));
  res.set('Cache-Control','no-store');
  res.status(error.status||503).json({mensaje:error.status?error.message:'No se pudieron consultar las condiciones de Iván. No se estimó un precio.',codigo:error.codigo||'CONDICIONES_IVAN_REVISAR'});
  return true;
}

async function aplicarImagenesMejoradas(productos, mayoristaId) {
  if (!productos.length) return productos;
  try {
    const ids = productos.map(p => p.id_producto);
    const result = await pool.query(
      `SELECT producto_id, imagen_mejorada_url
       FROM ivan_imagen_producto_procesos
       WHERE mayorista_id=$1 AND producto_id=ANY($2::bigint[]) AND estado='aprobada'`,
      [mayoristaId, ids]
    );
    const porProducto = new Map(result.rows.map(r => [String(r.producto_id), r.imagen_mejorada_url]));
    return productos.map(p => {
      const mejorada = porProducto.get(String(p.id_producto));
      return mejorada ? { ...p, imagen_producto: mejorada } : p;
    });
  } catch (error) {
    // Si la migración todavía no se ejecutó, el catálogo conserva las imágenes de origen.
    if (error.code !== '42P01') console.error('No se pudo aplicar imagen mejorada:', error.message);
    return productos;
  }
}

async function aplicarImagenesCatalogo(productos, mayoristaId) {
  const actuales = await aplicarImagenesMejoradas(productos, mayoristaId);
  const conImagenes = await aplicarImagenesPropias(actuales, mayoristaId, productos);
  const conTextos = await aplicarTextosCatalogo(conImagenes, mayoristaId);
  return aplicarMarcaProducto(conTextos, mayoristaId);
}

async function getCondicionesGestionMayorista(req, mayoristaId) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  let sesion;
  try {
    sesion = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (_) {
    throw Object.assign(new Error('Volvé a iniciar sesión como mayorista para consultar productos.'), { status: 401 });
  }
  if (sesion.tipo !== undefined || sesion.mayorista_id !== undefined || !sesion.email ||
      !Number.isSafeInteger(Number(sesion.id)) || Number(sesion.id) <= 0 || Number(sesion.id) !== Number(mayoristaId)) {
    throw Object.assign(new Error('No tenés acceso a los productos de este mayorista.'), { status: 403 });
  }
  const cuenta = await pool.query(
    "SELECT id FROM mayoristas WHERE id=$1 AND email=$2 AND activo=true AND COALESCE(tipo_fuente,'ivan')<>'roberto'",
    [Number(sesion.id), sesion.email]
  );
  if (!cuenta.rowCount) throw Object.assign(new Error('La cuenta mayorista no está activa.'), { status: 403 });
  // Gestión no representa un CUIT: conserva el listado general anterior, sin
  // condiciones particulares ni el IVA opcional del catálogo de un cliente.
  const [dtoPct, configPrecio] = await Promise.all([
    getDtoPagoTermino(mayoristaId), getConfiguracionPrecio(mayoristaId),
  ]);
  return { ivaCatalogo: null, dtoPct, descuentoItemsPct: 0, configPrecio };
}

async function getCondicionesPrecio(req, poolExterno, mayoristaId, gestionMayorista = false) {
  const sesionIva=validarSesionCosto(req,mayoristaId);
  const configComercial = await descuentosComerciales.leer(mayoristaId);
  if (gestionMayorista && circuitoCliente.activo(configComercial)) {
    req.res?.set('Cache-Control', 'no-store');
    try { return await getCondicionesGestionMayorista(req, mayoristaId); }
    catch (e) { e.condiciones_ivan = true; throw e; }
  }
  const iva=await ivaCatalogo.contexto(mayoristaId,poolExterno,sesionIva?.cuit||'',configComercial);
  if(iva)req.res?.set('Cache-Control','no-store');
  if(circuitoCliente.activo(configComercial)){
    try{
      if(!sesionIva?.cuit)throw Object.assign(new Error('Ingresá con el CUIT del cliente para consultar su precio.'),{status:401});
      const origenIvan=await circuitoCliente.contexto(mayoristaId,poolExterno,sesionIva.cuit,configComercial);
      req.res?.set('Cache-Control','no-store');
      return {origenIvan,ivaCatalogo:iva,dtoPct:0,descuentoItemsPct:0,configPrecio:{modelo_precio_catalogo:'precio_recibido'}};
    }catch(e){e.condiciones_ivan=true;throw e;}
  }
  const fuente = condicionesOrigen.desdeConfig(configComercial);
  if(fuente.permiso&&fuente.origen.habilitado&&fuente.origen.aplicar_catalogo){
    try{
    if(!sesionIva?.cuit)throw Object.assign(new Error('Ingresá con el CUIT del cliente para consultar su precio de Iván.'),{status:401});
    const configPrecio=await getConfiguracionPrecio(mayoristaId);
    if(configPrecio.modelo_precio_catalogo!=='precio_recibido')throw Object.assign(new Error('El modelo del precio cambió. Revisá la cascada de Iván en admin.'),{status:409});
    if(iva&&iva.modo!=='agregar')throw Object.assign(new Error('La cascada de origen parte de precio sin IVA. Revisá el modo de IVA configurado.'),{status:409});
    const origenIvan=await condicionesOrigen.contexto(mayoristaId,poolExterno,sesionIva.cuit,false,fuente);
    req.res?.set('Cache-Control','no-store');
    return {origenIvan,ivaCatalogo:iva,dtoPct:0,descuentoItemsPct:0,configPrecio};
    }catch(e){e.condiciones_ivan=true;throw e;}
  }
  const comercial = await descuentosComerciales.condicion(req, mayoristaId,configComercial);
  if (comercial) { req.res?.set('Cache-Control','no-store'); return {comercial,ivaCatalogo:iva, dtoPct:0, descuentoItemsPct:0, configPrecio:{modelo_precio_catalogo:'precio_recibido'}}; }
  const [dtoPct, configPrecio] = await Promise.all([
    getDtoPagoTermino(mayoristaId),
    getConfiguracionPrecio(mayoristaId),
  ]);
  if (!sesionIva) return { ivaCatalogo:iva, dtoPct, descuentoItemsPct: 0, configPrecio };
  if (configPrecio.modelo_precio_catalogo === MODELO_COSTO_MARGEN_IVA) {
    return { ivaCatalogo:iva, dtoPct: 0, descuentoItemsPct: 0, configPrecio };
  }
  const descuentoItemsPct = await obtenerDescuentoItems(poolExterno, mayoristaId, sesionIva.cuit);
  return { ivaCatalogo:iva, dtoPct, descuentoItemsPct, configPrecio };
}

// Reemplaza ñ, acentos y el caracter roto (�) por comodin _ (1 caracter cualquiera).
function normalizar(texto) {
  return texto.replace(/[ñÑáéíóúÁÉÍÓÚ\uFFFD]/g, '_');
}

function verificarClientePrecios(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ mensaje: 'Sesión requerida' });
  try {
    const sesion = jwt.verify(token, process.env.JWT_SECRET);
    if (sesion.tipo !== 'cliente' || Number(sesion.mayorista_id) !== Number(req.params.mayorista_id)) {
      return res.status(403).json({ mensaje: 'No tenés acceso a estos precios' });
    }
    req.clienteSesion = sesion;
    next();
  } catch (_) {
    return res.status(401).json({ mensaje: 'Sesión inválida o vencida' });
  }
}

// Validar una vez al entrar, antes de leer productos o descuentos del proveedor.
router.use('/:mayorista_id',(req,res,next)=>{
  try{
    const id=Number(req.params.mayorista_id);
    const cliente=validarSesionCosto(req,id);
    req.ivanSesionCosto={mayoristaId:id,cliente};
    res.locals.costoSesion=cliente;
    res.on('finish',()=>{
      if(cliente&&(res.statusCode>=500||res.statusCode===404)&&!res.locals.costoErrorControlado){
        registrarFalloCosto(id,cliente.cuit,'CONSULTA_COSTOS_FALLO','Falló la consulta de costos de productos. Requiere reintentar o revisar la conexión del proveedor.');
      }
    });
    next();
  }catch(e){if(!responderFalloOrigen(res,e))next(e);}
});

// Ivan todavía no expone obs_producto en todos los clientes. Se detecta una
// vez por conexión y el catálogo continúa funcionando aunque la columna falte.
async function tieneObsProducto(poolExterno, mayorista_id) {
  const cache = soporteObsProducto[mayorista_id];
  if (cache && (cache.disponible || Date.now() - cache.verificado_en < 5 * 60 * 1000)) {
    return cache.disponible;
  }
  try {
    const r = await poolExterno.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'viewProductos' AND column_name = 'obs_producto'
       LIMIT 1`
    );
    soporteObsProducto[mayorista_id] = { disponible: r.rows.length > 0, verificado_en: Date.now() };
  } catch {
    soporteObsProducto[mayorista_id] = { disponible: false, verificado_en: Date.now() };
  }
  return soporteObsProducto[mayorista_id].disponible;
}

async function campoIvaProducto(poolExterno, mayorista_id) {
  const cache = soporteIvaProducto[mayorista_id];
  if (cache && Date.now() - cache.verificado_en < 5 * 60 * 1000) return cache.campo;
  const candidatos = ['porc_iva_producto', 'alicuota_iva', 'iva_producto', 'porcentaje_iva', 'porc_iva'];
  try {
    const r = await poolExterno.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='viewProductos' AND column_name=ANY($1::text[])`,
      [candidatos]
    );
    const disponibles = new Set(r.rows.map(row => row.column_name));
    const campo = candidatos.find(nombre => disponibles.has(nombre)) || null;
    soporteIvaProducto[mayorista_id] = { campo, verificado_en: Date.now() };
    return campo;
  } catch {
    soporteIvaProducto[mayorista_id] = { campo: null, verificado_en: Date.now() };
    return null;
  }
}

function seleccionIva(campo) {
  return campo ? `, "${campo}" AS iva_producto` : ', NULL::numeric AS iva_producto';
}

// Opciones para los selectores de marca / rubro / tipo
// Acepta ?marca=X para filtrar rubros, y ?marca=X&rubro=Y para filtrar tipos
router.get('/:mayorista_id/opciones', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const marca = req.query.marca || '';
    const rubro = req.query.rubro || '';
    const poolExterno = await getConexionMayorista(mayorista_id);
    if (!poolExterno) return res.status(404).json({ mensaje: 'Sin conexión configurada' });

    const distinct = async (campo, extraConds = [], extraParams = []) => {
      const baseCond = `${campo} IS NOT NULL AND ${campo} <> ''`;
      const allConds = extraConds.length ? `${baseCond} AND ${extraConds.join(' AND ')}` : baseCond;
      const r = await poolExterno.query(
        `SELECT DISTINCT ${campo} AS valor FROM "viewProductos" WHERE ${allConds} ORDER BY ${campo}`,
        extraParams
      );
      return r.rows.map(x => x.valor);
    };

    // Marcas: siempre la lista completa
    const marcas = await distinct('des_producto_marca');

    // Rubros: filtrados por marca si viene ?marca
    const rubrosConds = marca ? [`des_producto_marca ILIKE $1`] : [];
    const rubrosParams = marca ? [normalizar(marca)] : [];
    const rubros = await distinct('des_producto_rubro', rubrosConds, rubrosParams);

    // Tipos: filtrados por marca y/o rubro si vienen esos parámetros
    const tiposConds = [];
    const tiposParams = [];
    if (marca) { tiposConds.push(`des_producto_marca ILIKE $${tiposParams.length + 1}`); tiposParams.push(normalizar(marca)); }
    if (rubro) { tiposConds.push(`des_producto_rubro ILIKE $${tiposParams.length + 1}`); tiposParams.push(normalizar(rubro)); }
    const tipos = await distinct('des_producto_tipo', tiposConds, tiposParams);

    res.json({ marcas, rubros, tipos });
  } catch (error) {
    console.error('Error opciones:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// Todos los productos sin paginación — solo para la descarga de listas (PDF/Excel) en MisPrecios.
// Misma query base, misma conexión Ivan (LATIN1), mismo normalizar() que el endpoint paginado.
router.get('/:mayorista_id/todos', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const busqueda = req.query.busqueda || '';
    const poolExterno = await getConexionMayorista(mayorista_id);
    if (!poolExterno) return res.status(404).json({ mensaje: 'Sin conexión configurada' });
    const conObsProducto = await tieneObsProducto(poolExterno, mayorista_id);
    const campoEquivalencias = await resolverCampo(poolExterno, mayorista_id, conObsProducto);
    const campoIva = await campoIvaProducto(poolExterno, mayorista_id);

    const condiciones = [];
    const params = [];
    let i = 1;
    if (busqueda.trim() !== '') {
      const palabras = normalizar(busqueda).trim().split(/\s+/).filter(p => p);
      for (const palabra of palabras) {
        condiciones.push(`(cod_producto ILIKE $${i}
          OR des_producto ILIKE $${i}
          OR des_producto_marca ILIKE $${i}
          OR des_producto_rubro ILIKE $${i}
          ${conObsProducto ? `OR obs_producto ILIKE $${i}` : ''})`);
        params.push(`%${palabra}%`);
        i++;
      }
    }
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const resultado = await poolExterno.query(
      `SELECT id_producto, cod_producto, des_producto, imagen_producto,
              precio_producto, stock_temporal, des_producto_marca,
              des_producto_rubro, des_producto_tipo
              ${conObsProducto ? ', obs_producto' : ''}
              ${seleccionGrupo(campoEquivalencias)}
              ${seleccionIva(campoIva)}
       FROM "viewProductos"
       ${where}
       ORDER BY des_producto`,
      params
    );

    const condicionesPrecio = await getCondicionesPrecio(req, poolExterno, mayorista_id);
    const productosConDto = await aplicarImagenesCatalogo(await aplicarCondicionesPrecio(resultado.rows, condicionesPrecio), mayorista_id);

    res.json({ productos: productosConDto, total: productosConDto.length });
  } catch (error) {
    console.error('Error productos todos:', error.message);
    if(responderFalloOrigen(res,error))return;
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// === NUEVO (Mejora 1 — lector de código de barras, modo EAN) ===
// Busca un producto por EAN exacto. Si "viewProductos" de Ivan no tiene la
// columna ean (no todos los mayoristas la exponen), la query falla y acá lo
// atrapamos devolviendo ean_no_soportado — el frontend cae al modo texto
// (escribe el código escaneado en el buscador) sin romper nada.
router.get('/:mayorista_id/buscar-ean/:ean', async (req, res) => {
  try {
    const { mayorista_id, ean } = req.params;
    const poolExterno = await getConexionMayorista(mayorista_id);
    if (!poolExterno) return res.status(404).json({ mensaje: 'Sin conexión configurada' });
    const campoIva = await campoIvaProducto(poolExterno, mayorista_id);
    try {
      const resultado = await poolExterno.query(
        `SELECT id_producto, cod_producto, des_producto, imagen_producto,
                precio_producto, stock_temporal, des_producto_marca,
                des_producto_rubro, des_producto_tipo
                ${seleccionIva(campoIva)}
         FROM "viewProductos" WHERE ean = $1 LIMIT 1`,
        [ean]
      );
      const condicionesPrecio = await getCondicionesPrecio(req, poolExterno, mayorista_id);
      const prod = resultado.rows[0] || null;
      if (prod) Object.assign(prod, (await aplicarCondicionesPrecio([prod], condicionesPrecio))[0]);
      res.json({ producto: prod ? (await aplicarImagenesCatalogo([prod], mayorista_id))[0] : prod });
    } catch (errCampo) {
      if(responderFalloOrigen(res,errCampo))return;
      // La vista no tiene columna "ean" en este mayorista — modo EAN no disponible.
      res.json({ producto: null, ean_no_soportado: true });
    }
  } catch (error) {
    console.error('Error buscar-ean:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// === NUEVO (Mejora 3 — cross selling) ===
// Códigos que suelen comprarse junto con los del carrito actual, calculado
// sobre el historial de pedidos en Supabase (pedidos_web/pedidos_web_items),
// cruzado con Ivan para precio/imagen vigentes. Si Ivan ya no tiene el
// producto, simplemente no aparece en el resultado.
router.get('/:mayorista_id/cross-selling', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const codigos = (req.query.codigos || '').split(',').map(c => c.trim()).filter(Boolean);
    if (codigos.length === 0) return res.json([]);

    const relacionados = await pool.query(
      `SELECT pi2.codigo, COUNT(*) AS coocurrencias
       FROM pedidos_web_items pi1
       JOIN pedidos_web p ON p.id = pi1.pedido_id
       JOIN pedidos_web_items pi2 ON pi2.pedido_id = pi1.pedido_id
       WHERE p.mayorista_id = $1
         AND pi1.codigo = ANY($2::text[])
         AND pi2.codigo IS NOT NULL AND pi2.codigo != ''
         AND pi2.codigo != ALL($2::text[])
       GROUP BY pi2.codigo
       ORDER BY coocurrencias DESC
       LIMIT 20`,
      [mayorista_id, codigos]
    );
    if (relacionados.rows.length === 0) return res.json([]);

    const poolExterno = await getConexionMayorista(mayorista_id);
    if (!poolExterno) return res.json([]);
    const campoIva = await campoIvaProducto(poolExterno, mayorista_id);

    const codigosRelacionados = relacionados.rows.map(r => r.codigo);
    const ivanRes = await poolExterno.query(
      `SELECT id_producto, cod_producto, des_producto, imagen_producto,
              precio_producto, stock_temporal, des_producto_marca,
              des_producto_rubro, des_producto_tipo
              ${seleccionIva(campoIva)}
       FROM "viewProductos" WHERE cod_producto = ANY($1::text[])`,
      [codigosRelacionados]
    );
    const porCodigo = new Map(ivanRes.rows.map(p => [p.cod_producto, p]));

    const resultado = [];
    for (const r of relacionados.rows) {
      const prod = porCodigo.get(r.codigo);
      if (prod) resultado.push(prod);
      if (resultado.length >= 5) break;
    }
    const condicionesPrecio = await getCondicionesPrecio(req, poolExterno, mayorista_id);
    res.json(await aplicarImagenesCatalogo(await aplicarCondicionesPrecio(resultado, condicionesPrecio), mayorista_id));
  } catch (error) {
    console.error('Error cross-selling:', error.message);
    if(responderFalloOrigen(res,error))return;
    res.json([]);
  }
});

// Alternativas por el campo configurado; obs_producto continúa siendo el valor por defecto. Si la columna
// todavía no fue conectada, responde [] y no afecta catálogo, precios ni stock.
router.get('/:mayorista_id/equivalentes', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const codigos = String(req.query.codigos || '').split(',').map(c => c.trim()).filter(Boolean);
    if (codigos.length === 0) return res.json([]);

    const poolExterno = await getConexionMayorista(mayorista_id);
    if (!poolExterno) return res.json([]);
    const conObsProducto = await tieneObsProducto(poolExterno, mayorista_id);
    const campoEquivalencias = await resolverCampo(poolExterno, mayorista_id, conObsProducto);
    if (!campoEquivalencias) return res.json([]);
    const columnaGrupo = identificadorSql(campoEquivalencias);
    const campoIva = await campoIvaProducto(poolExterno, mayorista_id);

    if ((await equivalenciasCodigos.configuracion(mayorista_id)).equivalencias_modo === 'codigos') {
      if (codigos.length > 200) return res.status(400).json({ mensaje: 'Consultá hasta 200 productos para sus equivalencias.' });
      const origenes = await poolExterno.query(
        `SELECT cod_producto, ${columnaGrupo} AS equivalencia_grupo FROM "viewProductos"
         WHERE UPPER(BTRIM(cod_producto))=ANY($1::text[])`,
        [codigos.map(equivalenciasCodigos.normalizarCodigo)]
      );
      const referencias = equivalenciasCodigos.referencias(origenes.rows);
      if (!referencias.codigos.length) return res.json([]);
      const alternativas = await poolExterno.query(
        `SELECT id_producto, cod_producto, des_producto, imagen_producto,
                precio_producto, stock_temporal, des_producto_marca,
                des_producto_rubro, des_producto_tipo
                ${conObsProducto ? ', obs_producto' : ''}
                ${seleccionGrupo(campoEquivalencias)}
                ${seleccionIva(campoIva)}
         FROM "viewProductos"
         WHERE UPPER(BTRIM(cod_producto))=ANY($1::text[])
           AND UPPER(BTRIM(cod_producto))<>ALL($2::text[])
         ORDER BY des_producto_marca, precio_producto
         LIMIT 1000`,
        [referencias.codigos, codigos.map(equivalenciasCodigos.normalizarCodigo)]
      );
      const vinculadas = alternativas.rows.map(p => ({ ...p, equivalencia_origenes: referencias.origenesDe(p.cod_producto) }));
      const condicionesPrecio = await getCondicionesPrecio(req, poolExterno, mayorista_id);
      const transformadas = await aplicarCondicionesPrecio(vinculadas, condicionesPrecio);
      transformadas.sort((a, b) => (Number(a.precio_producto) || 0) - (Number(b.precio_producto) || 0));
      return res.json(await aplicarImagenesCatalogo(transformadas, mayorista_id));
    }

    const origen = await poolExterno.query(
      `SELECT DISTINCT ${columnaGrupo} AS grupo_equivalencia
       FROM "viewProductos"
       WHERE cod_producto = ANY($1::text[])
         AND ${columnaGrupo} IS NOT NULL AND trim(${columnaGrupo}) <> ''`,
      [codigos]
    );
    const observaciones = origen.rows.map(r => r.grupo_equivalencia).filter(Boolean);
    if (observaciones.length === 0) return res.json([]);

    const alternativas = await poolExterno.query(
      `SELECT id_producto, cod_producto, des_producto, imagen_producto,
              precio_producto, stock_temporal, des_producto_marca,
              des_producto_rubro, des_producto_tipo
              ${conObsProducto ? ", obs_producto" : ""}
              ${seleccionGrupo(campoEquivalencias)}
              ${seleccionIva(campoIva)}
       FROM "viewProductos"
       WHERE ${columnaGrupo} = ANY($1::text[])
         AND cod_producto <> ALL($2::text[])
       ORDER BY ${columnaGrupo}, des_producto_marca, precio_producto
       LIMIT 30`,
      [observaciones, codigos]
    );
    const condicionesPrecio = await getCondicionesPrecio(req, poolExterno, mayorista_id);
    const transformadas = await aplicarCondicionesPrecio(alternativas.rows, condicionesPrecio);
    transformadas.sort((a, b) => (Number(a.precio_producto) || 0) - (Number(b.precio_producto) || 0));
    res.json(await aplicarImagenesCatalogo(transformadas, mayorista_id));
  } catch (error) {
    console.error('Error equivalentes:', error.message);
    if(responderFalloOrigen(res,error))return;
    res.json([]);
  }
});

// GET — precios custom del cliente logueado
router.get('/:mayorista_id/mis-precios-custom', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    let cuit = req.query.cuit;
    if (token) {
      let sesion;
      try { sesion = jwt.verify(token, process.env.JWT_SECRET); }
      catch (_) { return res.status(401).json({ mensaje: 'Sesión inválida o vencida' }); }
      if (sesion.tipo !== 'cliente' || Number(sesion.mayorista_id) !== Number(mayorista_id)) {
        return res.status(403).json({ mensaje: 'No tenés acceso a estos precios' });
      }
      cuit = sesion.cuit;
    }
    // Compatibilidad transitoria con el frontend anterior al despliegue actual.
    // El frontend nuevo siempre deriva el CUIT de la sesión firmada.
    if (!cuit) return res.status(401).json({ mensaje: 'Sesión requerida' });
    const result = await pool.query(
      'SELECT producto_id, precio_venta FROM precios_cliente_custom WHERE mayorista_id = $1 AND cliente_cuit = $2',
      [mayorista_id, cuit]
    );
    const mapa = {};
    for (const row of result.rows) {
      mapa[row.producto_id] = parseFloat(row.precio_venta);
    }
    res.json(mapa);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

router.put('/:mayorista_id/mis-precios-custom/:productoId', verificarClientePrecios, async (req, res) => {
  try {
    const { mayorista_id, productoId } = req.params;
    const precio = Number(req.body.precio_venta);
    if (!Number.isFinite(precio) || precio < 0) return res.status(400).json({ mensaje: 'Precio inválido' });
    const { rows } = await pool.query(`
      INSERT INTO precios_cliente_custom (mayorista_id, cliente_cuit, producto_id, precio_venta)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (mayorista_id, cliente_cuit, producto_id)
      DO UPDATE SET precio_venta=EXCLUDED.precio_venta, modificado_en=NOW()
      RETURNING producto_id, precio_venta
    `, [mayorista_id, String(req.clienteSesion.cuit), productoId, precio]);
    res.json(rows[0]);
  } catch (error) {
    console.error('Guardar precio personalizado:', error.message);
    res.status(500).json({ mensaje: 'Error al guardar el precio' });
  }
});

router.delete('/:mayorista_id/mis-precios-custom/:productoId', verificarClientePrecios, async (req, res) => {
  try {
    await pool.query('DELETE FROM precios_cliente_custom WHERE mayorista_id=$1 AND cliente_cuit=$2 AND producto_id=$3',
      [req.params.mayorista_id, String(req.clienteSesion.cuit), req.params.productoId]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al quitar el precio' });
  }
});

router.get('/:mayorista_id', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const busqueda = req.query.busqueda || '';
    const marca = req.query.marca || '';
    const rubro = req.query.rubro || '';
    const tipo = req.query.tipo || '';
    const ordenPrecio = req.query.orden_precio === 'asc' || req.query.orden_precio === 'desc'
      ? req.query.orden_precio
      : '';
    const pagina = parseInt(req.query.pagina) || 1;
    const porPagina = 50;
    const desde = (pagina - 1) * porPagina;

    const poolExterno = await getConexionMayorista(mayorista_id);
    if (!poolExterno) return res.status(404).json({ mensaje: 'Sin conexión configurada' });
    const conObsProducto = await tieneObsProducto(poolExterno, mayorista_id);
    const campoEquivalencias = await resolverCampo(poolExterno, mayorista_id, conObsProducto);
    const campoIva = await campoIvaProducto(poolExterno, mayorista_id);
    const condicionesPrecio = await getCondicionesPrecio(req, poolExterno, mayorista_id, req.query.vista === 'gestion');

    const condiciones = [];
    const params = [];
    let i = 1;

    if (busqueda.trim() !== '') {
      const palabras = normalizar(busqueda).trim().split(/\s+/).filter(p => p);
      for (const palabra of palabras) {
        condiciones.push(`(cod_producto ILIKE $${i}
          OR des_producto ILIKE $${i}
          OR des_producto_marca ILIKE $${i}
          OR des_producto_rubro ILIKE $${i}
          ${conObsProducto ? `OR obs_producto ILIKE $${i}` : ''})`);
        params.push(`%${palabra}%`);
        i++;
      }
    }
    if (marca) { condiciones.push(`des_producto_marca ILIKE $${i}`); params.push(normalizar(marca)); i++; }
    if (rubro) { condiciones.push(`des_producto_rubro ILIKE $${i}`); params.push(normalizar(rubro)); i++; }
    if (tipo)  { condiciones.push(`des_producto_tipo ILIKE $${i}`);  params.push(normalizar(tipo));  i++; }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const totalResultado = await poolExterno.query(
      `SELECT COUNT(*) FROM "viewProductos" ${where}`,
      params
    );
    const total = parseInt(totalResultado.rows[0].count);

    const configPrecio = condicionesPrecio.configPrecio || {};
    const margenCatalogo = Number(configPrecio.margen_catalogo) || 0;
    const ivaCatalogoDefault = Number(configPrecio.iva_catalogo_default) || 0;
    const ivaParaOrden = campoIva && configPrecio.usar_iva_producto !== false
      ? `COALESCE("${campoIva}", ${ivaCatalogoDefault})`
      : `${ivaCatalogoDefault}`;
    let expresionPrecioOrden = condicionesPrecio.origenIvan && ordenPrecio
      ? condicionesOrigen.ordenarSql(condicionesPrecio.origenIvan,params)
      : condicionesPrecio.comercial && ordenPrecio
      ? reglasComerciales.ordenSql(condicionesPrecio.comercial, params)
      : configPrecio.modelo_precio_catalogo === MODELO_COSTO_MARGEN_IVA
      ? `(precio_producto * ${1 + margenCatalogo / 100} * (1 + (${ivaParaOrden}) / 100.0))`
      : 'precio_producto';
    if(ordenPrecio&&condicionesPrecio.ivaCatalogo){
      if(!condicionesPrecio.comercial&&!condicionesPrecio.origenIvan){const pct=v=>Math.min(100,Math.max(0,Number(v)||0));const factor=(1-pct(condicionesPrecio.dtoPct)/100)*(1-pct(condicionesPrecio.descuentoItemsPct)/100);if(factor!==1){params.push(factor);expresionPrecioOrden=`ROUND(precio_producto::numeric*$${params.length}::numeric,2)`;}}
      expresionPrecioOrden=ivaCatalogo.ordenarSql(expresionPrecioOrden,condicionesPrecio.ivaCatalogo,params);
    }
    const orderBy = ordenPrecio
      ? `${expresionPrecioOrden} ${ordenPrecio === 'asc' ? 'ASC NULLS LAST' : 'DESC NULLS LAST'}, des_producto ASC`
      : 'des_producto ASC';

    const productosResultado = await poolExterno.query(
      `SELECT id_producto, cod_producto, des_producto, imagen_producto,
              precio_producto, stock_temporal, des_producto_marca,
              des_producto_rubro, des_producto_tipo
              ${seleccionIva(campoIva)}
              ${conObsProducto ? ', obs_producto' : ''}
              ${seleccionGrupo(campoEquivalencias)}
       FROM "viewProductos"
       ${where}
       ORDER BY ${orderBy}
       LIMIT ${porPagina} OFFSET ${desde}`,
      params
    );

    const productosConDto = await aplicarCondicionesPrecio(productosResultado.rows, condicionesPrecio);
    const productosConImagen = await aplicarImagenesCatalogo(productosConDto, mayorista_id);

    res.json({
      productos: productosConImagen,
      total,
      pagina,
      totalPaginas: Math.ceil(total / porPagina)
    });
  } catch (error) {
    console.error('Error productos:', error.message);
    if(responderFalloOrigen(res,error))return;
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

module.exports = router;
