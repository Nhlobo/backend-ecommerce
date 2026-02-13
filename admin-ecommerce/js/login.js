const API_BASE_URL = window.__ADMIN_CONFIG__?.API_BASE_URL || 'http://localhost:3000';

async function login(email, password) {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Login failed');
  }

  localStorage.setItem('adminToken', data.data.token);
  localStorage.setItem('adminUser', JSON.stringify(data.data.admin));
  window.location.href = '/index.html';
}

function redirectIfAlreadyAuthenticated() {
  const token = localStorage.getItem('adminToken');
  if (token) {
    window.location.href = '/index.html';
  }
}

document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const errorNode = document.getElementById('error');
  errorNode.textContent = '';

  try {
    await login(
      document.getElementById('email').value.trim(),
      document.getElementById('password').value
    );
  } catch (error) {
    errorNode.textContent = error.message;
  }
});

redirectIfAlreadyAuthenticated();
