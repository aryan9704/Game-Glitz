/**
 * GAMEGLITZ — Entry point
 * All application logic lives in app.js and server/routes/.
 */
const { startServer } = require('./app');

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
  process.exitCode = 1;
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

if (require.main === module) {
  startServer().catch(err => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });
}

module.exports = require('./app');
