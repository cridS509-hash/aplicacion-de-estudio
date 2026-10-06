import { Store } from '../server/store.js';
import { createService } from '../server/service.js';

export function makeService() {
  const store = new Store(null);
  return createService(store);
}
export const lastTutor = (v, n = 1) => v.transcript.filter((t) => t.role === 'tutor').slice(-n).map((t) => t.text).join(' | ');
