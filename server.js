const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Ensure upload directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const dbFile = path.join(__dirname, 'documents.json');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(dbFile)) {
  fs.writeFileSync(dbFile, JSON.stringify([]));
}

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not supported'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Helpers
function readDB() {
  try {
    return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  } catch {
    return [];
  }
}

function writeDB(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

function getFileType(mimetype) {
  if (mimetype === 'application/pdf') return 'pdf';
  if (mimetype.includes('word')) return 'docx';
  if (mimetype.includes('sheet') || mimetype.includes('excel')) return 'xlsx';
  return 'unknown';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Routes

// Upload document
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const docs = readDB();
    const doc = {
      id: uuidv4(),
      name: req.file.originalname,
      filename: req.file.filename,
      type: getFileType(req.file.mimetype),
      mimetype: req.file.mimetype,
      size: req.file.size,
      sizeFormatted: formatSize(req.file.size),
      uploadedAt: new Date().toISOString(),
      path: req.file.path
    };

    docs.unshift(doc);
    writeDB(docs);

    res.json({ success: true, document: doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all documents
app.get('/api/documents', (req, res) => {
  const docs = readDB();
  const { search, sort, type } = req.query;

  let filtered = [...docs];

  if (search) {
    filtered = filtered.filter(d =>
      d.name.toLowerCase().includes(search.toLowerCase())
    );
  }

  if (type && type !== 'all') {
    filtered = filtered.filter(d => d.type === type);
  }

  if (sort === 'name') {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === 'size') {
    filtered.sort((a, b) => b.size - a.size);
  } else {
    filtered.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  }

  res.json(filtered);
});

// Get single document info
app.get('/api/documents/:id', (req, res) => {
  const docs = readDB();
  const doc = docs.find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json(doc);
});

// Serve file for viewing
app.get('/api/view/:id', (req, res) => {
  const docs = readDB();
  const doc = docs.find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });

  const filePath = path.join(uploadsDir, doc.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  res.setHeader('Content-Type', doc.mimetype);
  res.setHeader('Content-Disposition', `inline; filename="${doc.name}"`);
  res.sendFile(filePath);
});

// Download file
app.get('/api/download/:id', (req, res) => {
  const docs = readDB();
  const doc = docs.find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });

  const filePath = path.join(uploadsDir, doc.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  res.download(filePath, doc.name);
});

// Delete document
app.delete('/api/documents/:id', (req, res) => {
  const docs = readDB();
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const doc = docs[idx];
  const filePath = path.join(uploadsDir, doc.filename);

  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  docs.splice(idx, 1);
  writeDB(docs);

  res.json({ success: true });
});

// PWA manifest
app.get('/manifest.json', (req, res) => {
  res.json({
    name: 'DocView',
    short_name: 'DocView',
    description: 'View PDF, Word, and Excel documents online',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#2563eb',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
    ]
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 DocView running at http://localhost:${PORT}\n`);
});
