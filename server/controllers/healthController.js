/**
 * Health Controller
 * Provides system readiness, version, and database connectivity diagnostic probe.
 */

const db = require('../config/database');

const startTime = Date.now();

async function getHealth(req, res) {
  try {
    const dbHealth = db.getHealth();

    res.status(200).json({
      status: 'HEALTHY',
      product: 'Infrasights',
      version: '2.10.4',
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      database: dbHealth
    });
  } catch (error) {
    res.status(503).json({
      status: 'UNHEALTHY',
      product: 'Infrasights',
      version: '2.10.4',
      error: error.message
    });
  }
}

module.exports = {
  getHealth
};
