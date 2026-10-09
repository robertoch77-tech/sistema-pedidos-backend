function estadoStock(valor) {
  if(valor===null || valor===undefined || (typeof valor!=='number' && typeof valor!=='string') || (typeof valor==='string' && !valor.trim()))return {estado:'sin_dato',cantidad:null};
  const cantidad=Number(valor);
  if(!Number.isFinite(cantidad))return {estado:'sin_dato',cantidad:null};
  return {estado:cantidad>0?'disponible':'sin_stock',cantidad};
}
module.exports={estadoStock};
