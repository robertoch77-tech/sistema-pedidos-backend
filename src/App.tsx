import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Catalogo from './pages/Catalogo';
import MisPedidos from './pages/MisPedidos';
import MisPrecios from './pages/MisPrecios';
import CtasCtes from './pages/CtasCtes';
import ClienteHome from './pages/ClienteHome';
import Admin from './pages/Admin';
import MisMensajes from './pages/MisMensajes';
import MisPromociones from './pages/MisPromociones';
import MisTickets from './pages/MisTickets';
import MisNotificaciones from './pages/MisNotificaciones';
import CalculadoraVenta from './pages/CalculadoraVenta';
import MiHistorial from './pages/MiHistorial';
import Presupuesto from './pages/Presupuesto';
import MisNovedades from './pages/MisNovedades';
import Bienvenida from './pages/Bienvenida';
import SuperAdminLogin from './pages/superadmin/SuperAdminLogin';
import SuperAdminDashboard from './pages/superadmin/SuperAdminDashboard';
import NuevoCliente from './pages/superadmin/clientes/NuevoCliente';
import DetalleCliente from './pages/superadmin/clientes/DetalleCliente';
import RobertoLogin from './pages/roberto/RobertoLogin';
import RobertoDashboard from './pages/roberto/RobertoDashboard';
import RobertoConfig from './pages/roberto/RobertoConfig';
import RobertoProductos from './pages/roberto/productos/RobertoProductos';
import RobertoVentas from './pages/roberto/ventas/RobertoVentas';
import RobertoCompras from './pages/roberto/compras/RobertoCompras';
import RobertoStock from './pages/roberto/stock/RobertoStock';
import RobertoClientes from './pages/roberto/clientes/RobertoClientes';
import RobertoPresupuestos from './pages/roberto/presupuestos/RobertoPresupuestos';
import RobertoRemitos from './pages/roberto/remitos/RobertoRemitos';
import RobertoProveedores from './pages/roberto/proveedores/RobertoProveedores';
import RobertoGastos from './pages/roberto/gastos/RobertoGastos';
import RobertoCuentaCorriente from './pages/roberto/cuentacorriente/RobertoCuentaCorriente';
import RobertoCaja from './pages/roberto/caja/RobertoCaja';
import RobertoCheques from './pages/roberto/cheques/RobertoCheques';
import RobertoNotas from './pages/roberto/notas/RobertoNotas';
import RobertoArca from './pages/roberto/arca/RobertoArca';
import RobertoReportes from './pages/roberto/reportes/RobertoReportes';
import RobertoAutos from './pages/roberto/autos/RobertoAutos';
import CatalogoPublico from './pages/catalogo/CatalogoPublico';
import CatalogoAutos from './pages/catalogo/CatalogoAutos';
import RobertoCatalogo from './pages/roberto/catalogo/RobertoCatalogo';
import GestionClaves from './pages/roberto/configuracion/GestionClaves';
import PiLogin from './pages/pedidos-inteligentes/PiLogin';
import PiDashboard from './pages/pedidos-inteligentes/PiDashboard';
import PiProductos from './pages/pedidos-inteligentes/productos/PiProductos';
import PiClientes  from './pages/pedidos-inteligentes/clientes/PiClientes';
import PiNuevoPedido from './pages/pedidos-inteligentes/pedido/PiNuevoPedido';
import PiNotaPedido  from './pages/pedidos-inteligentes/pedido/PiNotaPedido';
import PiPedidos     from './pages/pedidos-inteligentes/pedido/PiPedidos';
import PiConfig      from './pages/pedidos-inteligentes/PiConfig';

function RedirectToLogin() {
  const location = useLocation();
  return <Navigate to={`/login${location.search}`} replace />;
}

function RootRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const m = params.get('m');
  if (m) {
    return <Navigate to={`/login?m=${m}`} replace />;
  }
  return <Navigate to="/login" replace />;
}

function App() {
  const mayorista = localStorage.getItem('mayorista');
  const cliente = localStorage.getItem('cliente');

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={
          mayorista ? <Dashboard /> : <Navigate to="/login" />
        } />
        <Route path="/cliente" element={
          cliente ? <ClienteHome /> : <Navigate to="/login" />
        } />
        <Route path="/catalogo" element={
          cliente ? <Catalogo /> : <Navigate to="/login" />
        } />
        <Route path="/mis-pedidos" element={
          cliente ? <MisPedidos /> : <Navigate to="/login" />
        } />
        <Route path="/mis-precios" element={
          cliente ? <MisPrecios /> : <Navigate to="/login" />
        } />
        <Route path="/ctas-ctes" element={
          cliente ? <CtasCtes /> : <Navigate to="/login" />
        } />
        <Route path="/mis-mensajes" element={
          cliente ? <MisMensajes onVolver={() => { window.location.href = '/cliente'; }} /> : <Navigate to="/login" />
        } />
        <Route path="/mis-promociones" element={
          cliente ? <MisPromociones mayorista_id={JSON.parse(cliente).mayorista_id} onVolver={() => { window.location.href = '/cliente'; }} /> : <Navigate to="/login" />
        } />
        <Route path="/mis-tickets" element={
          cliente ? <MisTickets /> : <Navigate to="/login" />
        } />
        <Route path="/mis-notificaciones" element={
          cliente ? <MisNotificaciones /> : <Navigate to="/login" />
        } />
        <Route path="/calculadora-venta" element={
          cliente ? <CalculadoraVenta /> : <Navigate to="/login" />
        } />
        <Route path="/mi-historial" element={
          cliente ? <MiHistorial /> : <Navigate to="/login" />
        } />
        <Route path="/presupuesto" element={
          cliente ? <Presupuesto /> : <Navigate to="/login" />
        } />
        <Route path="/mis-novedades" element={
          cliente ? <MisNovedades /> : <Navigate to="/login" />
        } />
        <Route path="/bienvenida" element={
          cliente ? <Bienvenida /> : <Navigate to="/login" />
        } />
        {/* SuperAdmin Roberto — completamente separado de Ivan */}
        <Route path="/superadmin/login" element={<SuperAdminLogin />} />
        <Route path="/superadmin/dashboard" element={<SuperAdminDashboard />} />
        <Route path="/superadmin/clientes" element={<SuperAdminDashboard />} />
        <Route path="/superadmin/clientes/nuevo" element={<NuevoCliente />} />
        <Route path="/superadmin/clientes/:id" element={<DetalleCliente />} />
        {/* Panel cliente Roberto — separado de Ivan */}
        <Route path="/roberto/login" element={<RobertoLogin />} />
        <Route path="/roberto/dashboard" element={<RobertoDashboard />} />
        <Route path="/roberto/config" element={<RobertoConfig />} />
        <Route path="/roberto/productos" element={<RobertoProductos />} />
        <Route path="/roberto/ventas" element={<RobertoVentas />} />
        <Route path="/roberto/compras" element={<RobertoCompras />} />
        <Route path="/roberto/stock" element={<RobertoStock />} />
        <Route path="/roberto/clientes" element={<RobertoClientes />} />
        <Route path="/roberto/presupuestos" element={<RobertoPresupuestos />} />
        <Route path="/roberto/remitos" element={<RobertoRemitos />} />
        <Route path="/roberto/proveedores" element={<RobertoProveedores />} />
        <Route path="/roberto/gastos" element={<RobertoGastos />} />
        <Route path="/roberto/cuenta-corriente" element={<RobertoCuentaCorriente />} />
        <Route path="/roberto/caja" element={<RobertoCaja />} />
        <Route path="/roberto/cheques" element={<RobertoCheques />} />
        <Route path="/roberto/notas" element={<RobertoNotas />} />
        <Route path="/roberto/arca" element={<RobertoArca />} />
        <Route path="/roberto/reportes" element={<RobertoReportes />} />
        <Route path="/roberto/autos" element={<RobertoAutos />} />
        <Route path="/catalogo/productos/:codigo" element={<CatalogoPublico />} />
        <Route path="/catalogo/autos/:codigo"     element={<CatalogoAutos />} />
        <Route path="/roberto/catalogo"           element={<RobertoCatalogo />} />
        <Route path="/roberto/gestion-claves"     element={<GestionClaves />} />
        <Route path="/pedidos-inteligentes/login"     element={<PiLogin />} />
        <Route path="/pedidos-inteligentes/dashboard"  element={<PiDashboard />} />
        <Route path="/pedidos-inteligentes/productos"  element={<PiProductos />} />
        <Route path="/pedidos-inteligentes/clientes"   element={<PiClientes />} />
        <Route path="/pedidos-inteligentes/nuevo-pedido" element={<PiNuevoPedido />} />
        <Route path="/pedidos-inteligentes/nota/:id"    element={<PiNotaPedido />} />
        <Route path="/pedidos-inteligentes/pedidos"         element={<PiPedidos />} />
        <Route path="/pedidos-inteligentes/configuracion"  element={<PiConfig />} />
        <Route path="*" element={<RedirectToLogin />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;