import http from 'node:http';
import { existsSync, createWriteStream, readFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { exec } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import Busboy from 'busboy';
import { runPipeline } from './pipeline.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GUI_HTML_PATH = path.join(__dirname, 'gui', 'index.html');
const GUI_CSS_PATH = path.join(__dirname, 'gui', 'style.css');

export async function startServer() {
  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && parsedUrl.pathname === '/') {
      try {
        const html = readFileSync(GUI_HTML_PATH, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Помилка завантаження інтерфейсу: ${err.message}`);
      }
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/style.css') {
      try {
        const css = readFileSync(GUI_CSS_PATH, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
        res.end(css);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Помилка завантаження стилів: ${err.message}`);
      }
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/exists') {
      const id = parsedUrl.searchParams.get('id');
      if (!id || !/^[a-z0-9-]+$/.test(id)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid ID' }));
        return;
      }
      const toyDir = path.join('src', 'content', 'igrashky', id);
      const exists = existsSync(toyDir);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ exists }));
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/shutdown') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      process.stdout.write('🔌 Отримано запит на зупинку сервера. Вимкнення...\n');
      setTimeout(() => {
        process.exit(0);
      }, 500);
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/build') {
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const writeLog = (msg) => {
        res.write(`${msg}\n`);
        process.stdout.write(`${msg}\n`);
      };

      const tempUploadDir = path.join('src', 'content', 'igrashky', `.temp-upload-${Date.now()}`);
      await mkdir(tempUploadDir, { recursive: true });

      let id = '';
      let spinFramesCount = 36;
      let spinType = 'none';
      const galleryFiles = [];
      const spinFiles = [];
      let videoFile = null;

      const busboy = Busboy({ headers: req.headers });
      const filePromises = [];

      busboy.on('file', (name, file, info) => {
        const { filename } = info;
        const promise = new Promise((resolve, reject) => {
          if (name.startsWith('gallery[')) {
            const idxStr = name.match(/gallery\[(\d+)\]/)?.[1];
            const idx = idxStr ? parseInt(idxStr, 10) : galleryFiles.length;
            const tempPath = path.join(tempUploadDir, `photo-${idx}${path.extname(filename)}`);
            const writeStream = createWriteStream(tempPath);
            file.pipe(writeStream);
            writeStream.on('finish', () => {
              galleryFiles.push({ tempPath, idx, filename });
              resolve();
            });
            writeStream.on('error', reject);
          } else if (name === 'spinVideo') {
            const tempPath = path.join(tempUploadDir, `spin-video${path.extname(filename)}`);
            const writeStream = createWriteStream(tempPath);
            file.pipe(writeStream);
            writeStream.on('finish', () => {
              videoFile = tempPath;
              resolve();
            });
            writeStream.on('error', reject);
          } else if (name.startsWith('spinFrames[')) {
            const idxStr = name.match(/spinFrames\[(\d+)\]/)?.[1];
            const idx = idxStr ? parseInt(idxStr, 10) : spinFiles.length;
            const tempPath = path.join(tempUploadDir, `spin-frame-${idx}${path.extname(filename)}`);
            const writeStream = createWriteStream(tempPath);
            file.pipe(writeStream);
            writeStream.on('finish', () => {
              spinFiles.push({ tempPath, idx, filename });
              resolve();
            });
            writeStream.on('error', reject);
          } else {
            file.resume();
            resolve();
          }
        });
        filePromises.push(promise);
      });

      busboy.on('field', (name, val) => {
        if (name === 'id') id = val;
        if (name === 'spinFramesCount') spinFramesCount = parseInt(val, 10) || 36;
        if (name === 'spinType') spinType = val;
      });

      busboy.on('finish', async () => {
        try {
          await Promise.all(filePromises);
          
          const manifest = await runPipeline({
            id,
            spinType,
            spinFramesCount,
            tempUploadDir,
            galleryFiles,
            videoFile,
            spinFiles,
            writeLog,
          });

          writeLog('---MANIFEST_START---');
          writeLog(manifest);
          writeLog('---MANIFEST_END---');
          res.end();
        } catch (err) {
          writeLog(`❌ Помилка збірки: ${err.message}`);
          try {
            await rm(tempUploadDir, { recursive: true, force: true });
          } catch {}
          res.end();
        }
      });

      req.pipe(busboy);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    const url = `http://127.0.0.1:${port}`;
    console.log(`\n🚀 Локальний сервер запущено: ${url}`);
    console.log('Для завершення роботи сервера натисніть Ctrl+C.');
    
    const start = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${start} ${url}`);
  });
}
