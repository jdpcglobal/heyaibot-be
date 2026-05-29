const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'localKnowledge.json');

const ensureStore = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({ pdfDocuments: [], updatedAt: null }, null, 2),
      'utf8'
    );
  }
};

const readStore = () => {
  ensureStore();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
};

const writeStore = (data) => {
  ensureStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
};

const savePdfDocument = (document) => {
  const store = readStore();
  const nextStore = {
    ...store,
    pdfDocuments: [document],
    updatedAt: new Date().toISOString(),
  };

  writeStore(nextStore);
  return nextStore;
};

const getKnowledge = () => readStore();

const clearKnowledge = () => {
  const emptyStore = { pdfDocuments: [], updatedAt: new Date().toISOString() };
  writeStore(emptyStore);
  return emptyStore;
};

module.exports = {
  savePdfDocument,
  getKnowledge,
  clearKnowledge,
};
