// Persistencia local en un único archivo JSON (escritura atómica). Sin base de datos externa:
// para el MVP los datos del niño viven solo en este dispositivo/servidor y el adulto puede borrarlos.
import fs from 'node:fs';
import path from 'node:path';

const VERSION = 1;

const empty = () => ({
  meta: { version: VERSION, clockOffsetDays: 0, settings: { llmEnabled: false }, adult: null },
  profiles: {},
  sessions: {},
  lessons: {},
  exams: {},
});

export class Store {
  constructor(file = null) {
    this.file = file;
    this.db = empty();
    if (file) this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.db = { ...empty(), ...parsed, meta: { ...empty().meta, ...parsed.meta } };
    } catch (e) {
      if (e.code !== 'ENOENT') console.error('No se pudo leer la base de datos, se empieza vacía:', e.message);
      this.db = empty();
    }
  }

  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  /** "Ahora" del tutor; el adulto puede simular el paso de días para probar los repasos. */
  now() {
    return Date.now() + (this.db.meta.clockOffsetDays || 0) * 86400000;
  }
}
