import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { API_BASE } from '../../../config/api';

const NAVY = '#1B2A4A';
const BLUE = '#2B6CB0';
const GRAY = '#718096';
const TEXT = '#2D3748';
const BG   = '#F4F6F9';
const ITEMS_POR_HOJA = 30;

function getToken() {
  try { const s = localStorage.getItem('pi_session'); return s ? JSON.parse(s).token : ''; } catch { return ''; }
}
function hdr(): Record<string, string> { return { 'x-pi-token': getToken() }; }

interface PedidoData {
  id: number;
  numero_completo: string;
  fecha_pedido: string;
  cliente_nombre: string;
  total_items: number;
  total_hojas: number;
  estado: string;
}

interface ItemData {
  codigo: string;
  descripcion: string;
  cantidad: number;
  rubro: string | null;
  preparado: boolean;
  facturado: boolean;
}

interface Config {
  empresa_nombre?: string;
  empresa_direccion?: string;
  empresa_telefono?: string;
  empresa_email?: string;
  empresa_logo?: string;
  tamano_hoja?: 'A4' | 'A5';
}

// ── Membrete ─────────────────────────────────────────────────
function Membrete({ config }: { config: Config }) {
  return (
    <div className="pi-membrete" style={{ marginBottom: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {config.empresa_logo && (
          <img src={config.empresa_logo} alt="logo" style={{ height: '40px', objectFit: 'contain' }} />
        )}
        <div>
          <div style={{ fontSize: '14pt', fontWeight: 'bold', color: NAVY }}>
            {config.empresa_nombre || 'DISTRIBUIDORA'}
          </div>
          <div style={{ fontSize: '8pt', color: GRAY }}>
            {[config.empresa_direccion, config.empresa_telefono ? 'Tel: ' + config.empresa_telefono : '', config.empresa_email]
              .filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
      <hr style={{ border: 'none', borderTop: '1px solid #999', margin: '6px 0 0' }} />
    </div>
  );
}

// ── Checkbox visual ───────────────────────────────────────────
function Checkbox() {
  return (
    <span style={{ display: 'inline-block', width: '12px', height: '12px',
      border: '1px solid #555', borderRadius: '2px', flexShrink: 0 }} />
  );
}

// ── Grupo de rubro ────────────────────────────────────────────
function GrupoRubro({ rubro, items }: { rubro: string; items: ItemData[] }) {
  return (
    <div style={{ marginTop: '10px' }}>
      <div style={{ fontWeight: 'bold', fontSize: '9pt', backgroundColor: NAVY, color: '#fff',
        padding: '3px 6px' }}>
        {rubro || 'SIN RUBRO'}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
        <thead>
          <tr style={{ backgroundColor: '#EEE' }}>
            <th style={thStyle('70px')}>Código</th>
            <th style={thStyle('22px', 'center')}>P</th>
            <th style={thStyle('22px', 'center')}>F</th>
            <th style={thStyle('44px', 'center')}>Cant.</th>
            <th style={thStyle()}>Descripción</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => (
            <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F0F0F0' }}>
              <td style={tdStyle('70px')}>{it.codigo || ''}</td>
              <td style={tdStyle('22px', 'center')}><Checkbox /></td>
              <td style={tdStyle('22px', 'center')}><Checkbox /></td>
              <td style={tdStyle('44px', 'center')}>{it.cantidad}</td>
              <td style={tdStyle()}>{it.descripcion}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function thStyle(w?: string, align?: string): React.CSSProperties {
  return { width: w, textAlign: (align as any) || 'left', padding: '3px 5px',
    border: '1px solid #CCC', fontSize: '8pt', fontWeight: 600 };
}
function tdStyle(w?: string, align?: string): React.CSSProperties {
  return { width: w, textAlign: (align as any) || 'left', padding: '2px 5px', border: '1px solid #DDD' };
}

// ── Hoja ─────────────────────────────────────────────────────
function Hoja({ pedido, grupos, hoja, totalHojas, config, fecha }:
  { pedido: PedidoData; grupos: { rubro: string; items: ItemData[] }[];
    hoja: number; totalHojas: number; config: Config; fecha: string }) {
  return (
    <div className="pi-hoja" style={{ backgroundColor: '#fff', padding: '1cm',
      marginBottom: hoja < totalHojas ? '24px' : '0', pageBreakAfter: hoja < totalHojas ? 'always' : 'auto' }}>

      <Membrete config={config} />

      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
        <div>
          <span style={{ fontSize: '11pt', fontWeight: 'bold' }}>NOTA DE PEDIDO</span>
          <span style={{ fontSize: '11pt', fontWeight: 'bold', marginLeft: '12px', color: BLUE }}>
            N° {pedido.numero_completo}
          </span>
        </div>
        <div style={{ fontSize: '8pt', color: GRAY }}>Página {hoja} de {totalHojas}</div>
      </div>

      <div style={{ display: 'flex', gap: '24px', fontSize: '9pt', marginBottom: '8px', color: TEXT }}>
        <span>Fecha: <strong>{fecha}</strong></span>
        <span>Cliente: <strong>{pedido.cliente_nombre || '—'}</strong></span>
      </div>

      {/* Items agrupados por rubro */}
      {grupos.map(g => <GrupoRubro key={g.rubro} rubro={g.rubro} items={g.items} />)}

      {/* Pie de página */}
      <div style={{ marginTop: '18px' }}>
        <div style={{ borderTop: '1px dashed #999', marginBottom: '8px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9pt', color: TEXT }}>
          <span>Preparó: ________________________</span>
          <span>Observaciones: _______________________________</span>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────
function PiNotaPedido() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [pedido, setPedido]   = useState<PedidoData | null>(null);
  const [items, setItems]     = useState<ItemData[]>([]);
  const [config, setConfig]   = useState<Config>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError]     = useState('');
  const [tamano, setTamano]   = useState<'A4' | 'A5'>('A4');

  useEffect(() => {
    if (!id) return;
    (async () => {
      setCargando(true);
      try {
        const r = await fetch(`${API_BASE}/api/pi/pedidos/${id}`, { headers: hdr() });
        const d = await r.json();
        if (!r.ok || !d.ok) { setError(d.error || 'Error al cargar'); return; }
        setPedido(d.pedido);
        setItems(d.items);
      } catch { setError('Error de conexión'); } finally { setCargando(false); }

      // Cargar config empresa (best-effort)
      try {
        const rc = await fetch(`${API_BASE}/api/pi/auth/config`, { headers: hdr() });
        if (rc.ok) { const dc = await rc.json(); setConfig(dc.config || {}); if (dc.config?.tamano_hoja) setTamano(dc.config.tamano_hoja); }
      } catch { /* sin config extendida */ }
    })();
  }, [id]);

  // ── Agrupar items en hojas ────────────────────────────────
  const hojas: { rubro: string; items: ItemData[] }[][] = (() => {
    if (!items.length) return [[]];

    // Agrupar por rubro (orden de aparición preservado)
    const rubrosOrden: string[] = [];
    const mapaRubros: Record<string, ItemData[]> = {};
    for (const it of items) {
      const r = it.rubro || 'SIN RUBRO';
      if (!mapaRubros[r]) { mapaRubros[r] = []; rubrosOrden.push(r); }
      mapaRubros[r].push(it);
    }

    // Dividir en hojas de máx 30 items (respetando rubros cuando es posible)
    const todasHojas: { rubro: string; items: ItemData[] }[][] = [];
    let hojaActual: { rubro: string; items: ItemData[] }[] = [];
    let countActual = 0;

    for (const rubro of rubrosOrden) {
      const ritems = mapaRubros[rubro];
      // Si este rubro no cabe completo, abrimos nueva hoja
      if (countActual > 0 && countActual + ritems.length > ITEMS_POR_HOJA) {
        todasHojas.push(hojaActual);
        hojaActual = []; countActual = 0;
      }
      // Si el rubro en sí supera 30, lo partimos
      let start = 0;
      while (start < ritems.length) {
        const slice = ritems.slice(start, start + (ITEMS_POR_HOJA - countActual));
        hojaActual.push({ rubro, items: slice });
        countActual += slice.length;
        start += slice.length;
        if (countActual >= ITEMS_POR_HOJA && start < ritems.length) {
          todasHojas.push(hojaActual);
          hojaActual = []; countActual = 0;
        }
      }
    }
    if (hojaActual.length) todasHojas.push(hojaActual);
    return todasHojas;
  })();

  const totalHojas = hojas.length;

  const fecha = pedido?.fecha_pedido
    ? new Date(pedido.fecha_pedido).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const imprimir = (t: 'A4' | 'A5') => {
    setTamano(t);
    setTimeout(() => window.print(), 120);
  };

  if (cargando) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: BG }}>
      <div style={{ textAlign: 'center', color: GRAY }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
        <p>Cargando nota de pedido...</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#E53E3E' }}>
      <p>{error}</p>
      <button onClick={() => navigate(-1)} style={{ marginTop: '12px', padding: '8px 16px', cursor: 'pointer' }}>← Volver</button>
    </div>
  );

  return (
    <>
      {/* CSS global */}
      <style>{`
        @media print {
          .pi-no-print { display: none !important; }
          body { background: #fff !important; margin: 0; }
          @page { size: ${tamano}; margin: 1cm; }
        }
        @media screen {
          .pi-hoja { box-shadow: 0 2px 12px rgba(0,0,0,0.12); max-width: 794px; margin: 0 auto; }
        }
      `}</style>

      {/* Barra de botones — NO se imprime */}
      <div className="pi-no-print" style={{ backgroundColor: NAVY, padding: '12px 24px',
        display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 50 }}>
        <button onClick={() => navigate(-1)}
          style={{ padding: '7px 14px', backgroundColor: 'transparent', color: '#fff',
            border: '1px solid rgba(255,255,255,0.4)', borderRadius: '7px', cursor: 'pointer', fontSize: '13px' }}>
          ← Volver
        </button>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '14px', marginRight: 'auto' }}>
          {pedido?.numero_completo} — {pedido?.cliente_nombre}
        </span>
        <button onClick={() => imprimir('A4')}
          style={{ padding: '8px 16px', backgroundColor: BLUE, color: '#fff', border: 'none',
            borderRadius: '7px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
          🖨️ Imprimir
        </button>
        <button onClick={() => imprimir('A4')}
          style={{ padding: '8px 16px', backgroundColor: '#2F855A', color: '#fff', border: 'none',
            borderRadius: '7px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
          📄 PDF A4
        </button>
        <button onClick={() => imprimir('A5')}
          style={{ padding: '8px 16px', backgroundColor: '#744210', color: '#fff', border: 'none',
            borderRadius: '7px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
          📄 PDF A5
        </button>
      </div>

      {/* Contenido imprimible */}
      <div style={{ backgroundColor: BG, padding: '24px' }}>
        {hojas.map((grupos, i) => (
          <Hoja key={i} pedido={pedido!} grupos={grupos} hoja={i + 1}
            totalHojas={totalHojas} config={config} fecha={fecha} />
        ))}
      </div>
    </>
  );
}

export default PiNotaPedido;
