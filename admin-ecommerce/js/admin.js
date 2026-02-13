const API_BASE_URL = window.__ADMIN_CONFIG__?.API_BASE_URL || 'http://localhost:3000';

async function apiGet(path) {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    window.location.href = '/login.html';
    return null;
  }

  return response.json();
}

async function fetchOverview() {
  const token = localStorage.getItem('adminToken');
  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  const [overview, orders] = await Promise.all([
    apiGet('/api/admin/dashboard/overview'),
    apiGet('/api/admin/orders')
  ]);

  if (!overview || !orders) return;

  const payload = {
    overview: overview.data,
    orders: orders.data?.slice(0, 5) || []
  };

  document.getElementById('overview').textContent = JSON.stringify(payload, null, 2);
}

async function logout() {
  const token = localStorage.getItem('adminToken');
  if (token) {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminUser');
  window.location.href = '/login.html';
}

document.getElementById('logout').addEventListener('click', logout);

fetchOverview();
