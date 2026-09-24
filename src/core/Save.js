// Persistent progress: checkpoint, unlocked chapters, endings, collectibles.
const KEY = 'verity.save.v1';

const EMPTY = {
  checkpoint: null, // { chapter, insanity, tapes:[], notes:[], flags:{}, hard, ngPlus, transformations }
  unlockedChapter: 0,
  endings: [], // ids
  notes: [], // collected note ids (all-time)
  tapes: [], // collected tape ids (all-time)
  facesSeen: [0],
  falsity: false,
  runs: 0,
  lastRunName: '',
  lastRunRude: 0,
};

export class Save {
  constructor() {
    this.data = structuredClone(EMPTY);
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch { /* ignore */ }
  }
  write() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
  }
  get hasCheckpoint() { return !!this.data.checkpoint; }
  get ngPlus() { return this.data.endings.length > 0; }
  setCheckpoint(cp) {
    this.data.checkpoint = structuredClone(cp);
    this.data.unlockedChapter = Math.max(this.data.unlockedChapter, cp.chapter);
    this.write();
  }
  clearCheckpoint() { this.data.checkpoint = null; this.write(); }
  addEnding(id) {
    if (!this.data.endings.includes(id)) this.data.endings.push(id);
    this.write();
  }
  addUnique(list, id) {
    if (!this.data[list].includes(id)) this.data[list].push(id);
    this.write();
  }
  wipe() { this.data = structuredClone(EMPTY); this.write(); }
}
