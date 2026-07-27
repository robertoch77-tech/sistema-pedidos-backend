export function getToken(): string {
  try {
    const sa = localStorage.getItem('superadmin_session');
    if (sa) return JSON.parse(sa).token || '';
    const portal = localStorage.getItem('roberto_portal_session');
    return portal ? JSON.parse(portal).token : '';
  } catch { return ''; }
}

export function getClienteId(): number | null {
  try {
    const sa = localStorage.getItem('superadmin_session');
    if (sa) return JSON.parse(sa).clienteId || null;
    const portal = localStorage.getItem('roberto_portal_session');
    return portal ? JSON.parse(portal).cliente?.id : null;
  } catch { return null; }
}
