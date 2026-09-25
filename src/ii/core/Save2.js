// VERITY II progress: checkpoint, chapters, endings, collectibles, and a
// read-only peek at part one's save for callbacks.
const KEY = 'verity2.save.v1';
const PART1 = 'verity.save.v1';

const EMPTY = {
  checkpoint: null,
  unlockedChapter: 0,
  endings: [],
  tapes: [],
  docs: [],
  figures: [],
  facesSeen: [0],
  runs: 0,
  bestTime: 0,
  lastRunName: '',
  askedVera: false,
  falsityMet: false,
};

export class Save2 {
  constructor() {
    this.data = structuredClone(EMPTY);
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch { /* ignore */ }
    this.part1 = null;
    try { this.part1 = JSON.parse(localStorage.getItem(PART1) || 'null'); } catch { /* ignore */ }
  }
  write() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ } }
  get hasCheckpoint() { return !!this.data.checkpoint; }
  get ngPlus() { return this.data.endings.length > 0; }
  setCheckpoint(cp) {
    this.data.checkpoint = structuredClone(cp);
    this.data.unlockedChapter = Math.max(this.data.unlockedChapter, cp.chapter);
    this.write();
  }
  clearCheckpoint() { this.data.checkpoint = null; this.write(); }
  addEnding(id) { if (!this.data.endings.includes(id)) this.data.endings.push(id); this.write(); }
  addUnique(list, id) { if (!this.data[list].includes(id)) { this.data[list].push(id); this.write(); return true; } return false; }
  wipe() { this.data = structuredClone(EMPTY); this.write(); }

  // What part one's save says about the player.
  get memories() {
    const p = this.part1;
    if (!p) return { played: false, endings: [], name: '', rude: 0 };
    return { played: (p.endings?.length || 0) > 0 || !!p.checkpoint, endings: p.endings || [], name: p.lastRunName || '', rude: p.lastRunRude || 0, falsity: !!p.falsity };
  }
}
