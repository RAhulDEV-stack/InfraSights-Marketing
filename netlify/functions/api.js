/**
 * Netlify Serverless Function — Infrasights v2.10 REST API
 * Wraps the Express application using serverless-http to run seamlessly
 * on Netlify's serverless infrastructure without requiring an external server.
 */

const serverless = require('serverless-http');
const { app, getDatabase } = require('../../server/index');

const db = getDatabase();
let dbReady = false;

const expressHandler = serverless(app);

module.exports.handler = async (event, context) => {
  // Allow function to return immediately without waiting for open connections
  context.callbackWaitsForEmptyEventLoop = false;

  // Initialize resilient database tier if not yet connected
  if (!dbReady) {
    try {
      await db.init();
      dbReady = true;
    } catch (e) {
      console.warn('[Netlify Function] Database init notice:', e.message);
    }
  }

  // Normalize incoming event path so Express routes match /api/*
  if (event.path) {
    if (event.path.startsWith('/.netlify/functions/api')) {
      event.path = event.path.replace(/^\/\.netlify\/functions\/api/, '') || '/';
    }
    if (!event.path.startsWith('/api')) {
      event.path = '/api' + event.path;
    }
  }

  return expressHandler(event, context);
};
