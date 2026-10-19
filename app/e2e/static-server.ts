// Petit serveur statique de test : sert dist/ sous un sous-dossier (/presidentielle-2027/, chemin du site GitHub Pages) pour vérifier
// que le build fonctionne hors de la racine d'un domaine, comme sur GitHub Pages.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', 'dist');
const PREFIX = '/presidentielle-2027/';
const PORT = Number(process.env.PORT ?? 4173);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith(PREFIX)) {
    res.writeHead(404).end('hors du sous-dossier');
    return;
  }
  const rel = normalize(decodeURIComponent(url.pathname.slice(PREFIX.length)) || 'index.html');
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end('introuvable');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`dist/ servi sur http://localhost:${PORT}${PREFIX}`);
});
