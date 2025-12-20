/**
 * ExamEngine: module-agnostic state manager for a single module test JSON.
 * - Handles section navigation, question navigation, and responses.
 * - No DOM work here.
 */
export class ExamEngine {
  constructor(testJson, storageKey) {
    this.test = testJson;
    this.storageKey = storageKey;
    this.sectionIndex = 0;
    this.questionFlat = this._flattenQuestions(testJson);
    this.qIndex = 0;
    this.responses = {};
    this.meta = { startedAt: null, submittedAt: null };
    this._load();
  }

  _flattenQuestions(testJson) {
    const items = [];
    for (const sec of (testJson.sections ?? [])) {
      for (const q of (sec.questions ?? [])) {
        items.push({
          sectionId: sec.id,
          sectionTitle: sec.title,
          ...q
        });
      }
    }
    return items;
  }

  getTotalQuestions() { return this.questionFlat.length; }

  getCurrent() { return this.questionFlat[this.qIndex]; }

  goToIndex(i) {
    const x = Math.max(0, Math.min(this.questionFlat.length - 1, i));
    this.qIndex = x;
    this.sectionIndex = this._findSectionIndexForQuestion(this.getCurrent());
    this._save();
  }

  _findSectionIndexForQuestion(q) {
    const secs = this.test.sections ?? [];
    const idx = secs.findIndex(s => s.id === q.sectionId);
    return idx < 0 ? 0 : idx;
  }

  next() { this.goToIndex(this.qIndex + 1); }
  prev() { this.goToIndex(this.qIndex - 1); }

  setResponse(qKey, value) {
    this.responses[qKey] = value;
    this._save();
  }

  getResponse(qKey) { return this.responses[qKey]; }

  markStarted() {
    if (!this.meta.startedAt) {
      this.meta.startedAt = new Date().toISOString();
      this._save();
    }
  }

  submit() {
    this.meta.submittedAt = new Date().toISOString();
    this._save();
  }

  resetAll() {
    this.responses = {};
    this.meta = { startedAt: null, submittedAt: null };
    this.qIndex = 0;
    this.sectionIndex = 0;
    this._save();
  }

  _save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({
        qIndex: this.qIndex,
        sectionIndex: this.sectionIndex,
        responses: this.responses,
        meta: this.meta
      }));
    } catch { /* ignore */ }
  }

  _load() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return;
      const st = JSON.parse(raw);
      if (st && typeof st === "object") {
        this.qIndex = Math.max(0, Math.min(this.questionFlat.length - 1, st.qIndex ?? 0));
        this.sectionIndex = st.sectionIndex ?? 0;
        this.responses = st.responses ?? {};
        this.meta = st.meta ?? this.meta;
      }
    } catch { /* ignore */ }
  }
}
