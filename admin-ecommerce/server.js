const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

app.get('/health', (req, res) => {
    res.json({ status: 'ok', backendUrl: BACKEND_URL });
});

app.get('/config.js', (req, res) => {
    const apiBase = JSON.stringify(BACKEND_URL);
    res.type('application/javascript');
    res.send(`window.__ADMIN_CONFIG__ = { API_BASE_URL: ${apiBase} };`);
});

app.use(express.static(path.join(__dirname)));

app.get('*', (req, res) => {
    if (/\.(html|css|js)$/i.test(req.path)) {
        return res.sendFile(path.join(__dirname, req.path));
    }

    return res.redirect('/login.html');
});

app.listen(PORT, () => {
    console.log(`Admin dashboard running on port ${PORT}`);
});
