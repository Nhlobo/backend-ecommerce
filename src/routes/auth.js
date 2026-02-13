const express = require('express');

// Compatibility routes for admin dashboards expecting /api/auth/* endpoints.
const router = express.Router();

router.use('/', require('./admin'));

module.exports = router;
