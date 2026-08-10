# PROMPT: Commit + Push — Fix importador: incluir IVA en recálculo de PV

## CAMBIO YA APLICADO (solo commit + push)

### Archivo: `routes/superadmin/importador.js` (líneas 472-487)

La fórmula de recálculo de precios de venta al actualizar costos NO incluía el factor IVA.

**Antes (BUG):**
```sql
precio_venta_1 = costo * (1-dto) * (1+imp) * (1+utilidad)
```

**Ahora (CORRECTO):**
```sql
precio_venta_1 = costo * (1-dto) * (1+imp) * (1+IVA) * (1+utilidad)
```

Se agregó `* (1 + COALESCE(alicuota_iva,21)/100)` a las 4 fórmulas: pvfinal, pv1, pv2, pv3.

### NO SE TOCA:
- db.js, routes/auth.js, routes/mayoristas.js, routes/admin.js
- Ningún archivo frontend
- El endpoint de importación Excel (ese guarda valores del archivo tal cual)
- El endpoint actualizar-precios (recibe PV ya calculados del frontend)

## Ejecutar:

```bash
cd C:\Users\Usuario\sistema-pedidos-backend
git add -A && git commit -m "fix: incluir IVA en recálculo de precios de venta del importador" && git push origin main
```

Render despliega automáticamente con el push.
