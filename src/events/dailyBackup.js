const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const BACKUP_DIR = path.join(ROOT, 'data', 'backups');
const KEEP = 7;
const DAY_MS = 86_400_000;

function backup() {
  const target = path.join(BACKUP_DIR, new Date().toISOString().slice(0, 10));
  fs.mkdirSync(target, { recursive: true });
  const sources = [path.join(ROOT, 'config.json'), path.join(ROOT, 'warns.json')];
  for (const name of fs.readdirSync(path.join(ROOT, 'data'))) {
    if (name.endsWith('.json')) sources.push(path.join(ROOT, 'data', name));
  }
  for (const file of sources) {
    if (fs.existsSync(file)) fs.copyFileSync(file, path.join(target, path.basename(file)));
  }
  const old = fs.readdirSync(BACKUP_DIR).sort().reverse().slice(KEEP);
  for (const name of old) fs.rmSync(path.join(BACKUP_DIR, name), { recursive: true, force: true });
}

module.exports = {
  name: 'clientReady',
  once: true,
  async execute() {
    const run = () => {
      try { backup(); } catch (err) { console.error('[BACKUP]', err.message); }
    };
    run();
    setInterval(run, DAY_MS);
  },
};
