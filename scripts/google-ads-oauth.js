#!/usr/bin/env node
/**
 * Google Ads OAuth2 Refresh Token Generator
 *
 * Usage: node scripts/google-ads-oauth.js
 *
 * Opens a browser for Google sign-in, then captures the refresh token
 * needed for the Google Ads API integration.
 */

const http = require('http');
const { exec } = require('child_process');
const url = require('url');

// Read from env vars or Heroku config
const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:8089';
const SCOPE = 'https://www.googleapis.com/auth/adwords';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GOOGLE_ADS_CLIENT_ID or GOOGLE_ADS_CLIENT_SECRET env vars.');
  console.error('Set them first, or run:');
  console.error(
    '  eval $(heroku config -s --app holibob-experiences-demand-gen | grep GOOGLE_ADS)'
  );
  process.exit(1);
}

// Step 1: Start local server to receive the callback
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);

  if (parsedUrl.pathname === '/' && parsedUrl.query.code) {
    const code = parsedUrl.query.code;

    // Step 2: Exchange authorization code for tokens
    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });

      const tokens = await tokenResponse.json();

      if (tokens.refresh_token) {
        console.log('\n✅ Success! Here are your tokens:\n');
        console.log(`GOOGLE_ADS_REFRESH_TOKEN=${tokens.refresh_token}`);
        console.log(`\nAccess Token (temporary): ${tokens.access_token?.substring(0, 30)}...`);
        console.log(`\nSet this on Heroku with:`);
        console.log(
          `  heroku config:set GOOGLE_ADS_REFRESH_TOKEN="${tokens.refresh_token}" --app holibob-experiences-demand-gen`
        );

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html><body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1>✅ Google Ads OAuth Complete</h1>
            <p>Refresh token has been printed to your terminal.</p>
            <p>You can close this window.</p>
          </body></html>
        `);
      } else {
        console.error('\n❌ No refresh token received:', tokens);
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(
          `<html><body><h1>Error</h1><pre>${JSON.stringify(tokens, null, 2)}</pre></body></html>`
        );
      }
    } catch (err) {
      console.error('\n❌ Token exchange failed:', err);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<html><body><h1>Error</h1><pre>${err.message}</pre></body></html>`);
    }

    // Shut down server after handling
    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 1000);
  } else if (parsedUrl.query.error) {
    console.error('\n❌ OAuth error:', parsedUrl.query.error);
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end(`Error: ${parsedUrl.query.error}`);
    server.close();
    process.exit(1);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(8089, () => {
  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPE)}` +
    `&access_type=offline` +
    `&prompt=consent`;

  console.log('🔐 Google Ads OAuth2 Flow');
  console.log('========================\n');
  console.log('Opening browser for Google sign-in...\n');
  console.log(`If it doesn't open automatically, visit:\n${authUrl}\n`);

  // Open browser
  const openCmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${openCmd} "${authUrl}"`);
});
