// Zero-dependency development server for the JavaScript browser simulator.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../web');
const port = Number(process.argv[2] || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Usage: node scripts/serve-web.cjs [port: 1–65535]');
  process.exit(1);
}
const types = {html:'text/html; charset=utf-8', js:'text/javascript; charset=utf-8', css:'text/css; charset=utf-8'};
const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, {Allow:'GET, HEAD'}); res.end(); return;
  }
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const name = pathname === '/' ? 'index.html' : pathname === '/bombe' ? 'bombe.html' : pathname.slice(1);
  // Serve only the public top-level HTML, JS, and CSS; no filesystem traversal.
  if (!/^[a-z-]+\.(html|js|css)$/.test(name)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  fs.readFile(path.join(root, name), (error, data) => {
    if (error) {res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200, {'Content-Type':types[name.split('.').pop()], 'Content-Length':data.length});
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});
server.on('error', error => {console.error(error.message);process.exitCode=1;});
server.listen(port, '127.0.0.1', () => console.log(`JavaScript simulator: http://127.0.0.1:${port}`));
