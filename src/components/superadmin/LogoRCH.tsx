import React from 'react';

function LogoRCH() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {['R', 'C', 'H'].map((letra) => (
          <div
            key={letra}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: '#1B2A4A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span style={{ color: '#fff', fontWeight: 700, fontSize: '18px' }}>{letra}</span>
          </div>
        ))}
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontWeight: 700, fontSize: '14px', color: '#2D3748', lineHeight: '1.2', margin: 0 }}>RCH</p>
        <p style={{ fontSize: '11px', color: '#718096', lineHeight: '1.2', margin: 0 }}>SaaS de Gestión Comercial</p>
      </div>
    </div>
  );
}

export default LogoRCH;
