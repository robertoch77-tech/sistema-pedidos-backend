const crypto = require('crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function errorCliente(mensaje, status = 400) { return Object.assign(new Error(mensaje), { status }); }
function idSeguro(valor) {
  const id = Number(valor);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) throw errorCliente('Identificador inválido.');
  return id;
}
function productosSeguros(valor) {
  let items = valor;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch { throw errorCliente('Selección inválida.'); } }
  if (!Array.isArray(items) || !items.length || items.length > 100) throw errorCliente('Seleccioná entre 1 y 100 productos.');
  const ids = new Set();
  return items.map(p => {
    const id = idSeguro(p?.id);
    const codigo = String(p?.codigo ?? '').trim();
    if (!codigo || codigo.length > 200 || ids.has(id)) throw errorCliente('Productos repetidos o códigos inválidos.');
    ids.add(id);
    return { id, codigo };
  }).sort((a,b) => a.id - b.id);
}
function principalSeguro(valor) {
  if (!['original','propia'].includes(valor)) throw errorCliente('Elegí la imagen principal.');
  return valor;
}
function imagenSegura(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 8*1024*1024) throw errorCliente('Usá una imagen de hasta 8 MB.');
  let mime;
  if (buffer.length >= 8 && buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime='image/png';
  else if (buffer.length >= 3 && buffer[0]===255 && buffer[1]===216 && buffer[2]===255) mime='image/jpeg';
  else if (buffer.length >= 12 && buffer.toString('ascii',0,4)==='RIFF' && buffer.toString('ascii',8,12)==='WEBP') mime='image/webp';
  else throw errorCliente('Formato no compatible. Usá JPG, PNG o WebP.');
  return { file:`data:${mime};base64,${buffer.toString('base64')}`, sha256:crypto.createHash('sha256').update(buffer).digest('hex') };
}
function combinarImagenes(actuales, originales, enlaces, mayoristaId) {
  const origen = new Map(originales.map(p=>[String(p.id_producto),p]));
  const propios = new Map(enlaces.filter(e=>String(e.mayorista_id)===String(mayoristaId)).map(e=>[String(e.producto_id),e]));
  return actuales.map(p=>{
    const e=propios.get(String(p.id_producto));
    if (!e || String(e.codigo_producto).trim()!==String(p.cod_producto).trim() || !e.url) return p;
    const original=origen.get(String(p.id_producto))?.imagen_producto || '';
    const principal=e.principal==='propia' || !original ? e.url : original;
    return { ...p, imagen_producto:principal, imagen_original_ivan:original,
      imagenes_producto:[...new Set([principal,original,e.url].filter(Boolean))].slice(0,2) };
  });
}
module.exports={UUID,errorCliente,idSeguro,productosSeguros,principalSeguro,imagenSegura,combinarImagenes};
