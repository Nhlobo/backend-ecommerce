require('dotenv').config();
const { initializeDatabase } = require('./database');

initializeDatabase()
    .then(() => {
        console.log('✅ Database initialization complete');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Database initialization failed:', error);
        process.exit(1);
    });
