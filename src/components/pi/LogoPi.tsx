import React from 'react';

type Size = 'sm' | 'md' | 'lg';

interface LogoPiProps {
  size?: Size;
  showText?: boolean;
}

const SIZE_MAP: Record<Size, { svg: number; r: number; fontSize1: number; fontSize2: number }> = {
  sm: { svg: 40,  r: 4,  fontSize1: 8,  fontSize2: 6  },
  md: { svg: 60,  r: 6,  fontSize1: 10, fontSize2: 8  },
  lg: { svg: 80,  r: 8,  fontSize1: 12, fontSize2: 10 },
};

// Cubo isométrico formado por círculos:
// Cara frontal (4 círculos) — azul medio #2B6CB0
// Cara superior (3 círculos) — azul claro #63B3ED
// Cara lateral derecha (3 círculos) — azul oscuro #1B2A4A
function LogoPi({ size = 'md', showText = true }: LogoPiProps) {
  const { svg, r, fontSize1, fontSize2 } = SIZE_MAP[size];
  const cx = svg / 2;
  const cy = svg * 0.52;

  // Paso horizontal e inclinación para perspectiva isométrica
  const dx = svg * 0.18;   // paso horizontal entre círculos en la cara frontal
  const dy = svg * 0.18;   // paso vertical entre filas (cara frontal)
  const tx = svg * 0.20;   // traslación horizontal cara superior
  const ty = svg * 0.12;   // traslación vertical cara superior

  // Cara frontal: 2×2 = 4 círculos (abajo-izquierda)
  const frontal = [
    { x: cx - dx * 0.5, y: cy - dy * 0.5 },
    { x: cx + dx * 0.5, y: cy - dy * 0.5 },
    { x: cx - dx * 0.5, y: cy + dy * 0.5 },
    { x: cx + dx * 0.5, y: cy + dy * 0.5 },
  ];

  // Cara superior: 3 círculos en diagonal hacia arriba-derecha
  const yTopBase = cy - dy * 0.5 - ty;
  const superior = [
    { x: cx - dx * 0.5 + tx * 0.5, y: yTopBase - ty * 0.5 },
    { x: cx + dx * 0.5 + tx * 0.5, y: yTopBase - ty * 0.5 },
    { x: cx + dx * 0.5 + tx,       y: yTopBase - ty        },
  ];

  // Cara lateral derecha: 3 círculos en diagonal hacia abajo-derecha
  const lateral = [
    { x: cx + dx * 0.5 + tx * 0.5, y: cy - dy * 0.5 + ty * 0.5 },
    { x: cx + dx * 0.5 + tx,       y: cy - dy * 0.5              },
    { x: cx + dx * 0.5 + tx,       y: cy + dy * 0.5              },
  ];

  const shadow = 'drop-shadow(0px 1px 2px rgba(0,0,0,0.25))';

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      <svg width={svg} height={svg} viewBox={`0 0 ${svg} ${svg}`} xmlns="http://www.w3.org/2000/svg"
        style={{ filter: shadow, display: 'block' }}>
        {/* Cara frontal — azul medio */}
        {frontal.map((p, i) => (
          <circle key={`f${i}`} cx={p.x} cy={p.y} r={r} fill="#2B6CB0"
            style={{ filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.2))' }} />
        ))}
        {/* Cara superior — azul claro */}
        {superior.map((p, i) => (
          <circle key={`s${i}`} cx={p.x} cy={p.y} r={r} fill="#63B3ED"
            style={{ filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.15))' }} />
        ))}
        {/* Cara lateral — azul oscuro */}
        {lateral.map((p, i) => (
          <circle key={`l${i}`} cx={p.x} cy={p.y} r={r} fill="#1B2A4A"
            style={{ filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.3))' }} />
        ))}
      </svg>

      {showText && (
        <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
          <div style={{ fontSize: `${fontSize1}px`, fontWeight: 700, color: '#1B2A4A', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
            PEDIDOS INTELIGENTES
          </div>
          <div style={{ fontSize: `${fontSize2}px`, color: '#718096', whiteSpace: 'nowrap' }}>
            Sistema de Gestión
          </div>
        </div>
      )}
    </div>
  );
}

export default LogoPi;
