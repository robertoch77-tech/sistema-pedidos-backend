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

function RedirectToLogin() {
  const location = useLocation();
  return <Navigate to={`/login${location.search}`} replace />;
}

function App() {
  const mayorista = localStorage.getItem('mayorista');
  const cliente = localStorage.getItem('cliente');

  return (
    <BrowserRouter>
      <Routes>
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
        <Route path="*" element={<RedirectToLogin />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;