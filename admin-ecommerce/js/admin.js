const API_BASE_URL = window.__ADMIN_CONFIG__?.API_BASE_URL || 'http://localhost:3000';

async function fetchOverview() {
  const token = localStorage.getItem('adminToken');
  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  const response = await fetch(`${API_BASE_URL}/api/admin/dashboard/overview`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('adminToken');
    window.location.href = '/login.html';
    return;
  }

  const data = await response.json();
  document.getElementById('overview').textContent = JSON.stringify(data, null, 2);
}

document.getElementById('logout').addEventListener('click', () => {
  localStorage.removeItem('adminToken');
  window.location.href = '/login.html';
});

fetchOverview();
