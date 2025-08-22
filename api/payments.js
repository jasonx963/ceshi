const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');

const app = express();
const port = 3000;

// 数据库配置
const db = new sqlite3.Database(path.join(__dirname, '../payments.db'));

// 初始化数据库表
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderId TEXT NOT NULL,
      product TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT '待审核',
      screenshot TEXT
    )
  `);

  // 插入测试数据（可选）
  db.run(`
    INSERT OR IGNORE INTO payments (orderId, product, status, screenshot)
    VALUES (?, ?, ?, ?)
  `, ['ORD20250821', 'iPhone 16 128GB', '已支付', '/uploads/screenshot1.jpg']);
});

// 中间件
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads'))); // 静态服务截图文件

// Multer 配置（处理文件上传）
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// 管理员认证中间件
const authenticateToken = (req, res, next) => {
  const token = req.headers['x-admin-token'];
  if (token !== 'ADMIN_TOKEN') { // 替换为你的实际token
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }
  next();
};

// 获取支付记录
app.get('/api/payments', authenticateToken, (req, res) => {
  const { orderId, list } = req.query;
  let query = 'SELECT * FROM payments';
  const params = [];

  if (orderId && !list) {
    query += ' WHERE orderId = ?';
    params.push(orderId);
  }

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ ok: false, message: err.message });
    res.json({ ok: true, items: rows });
  });
});

// 创建支付记录（支持上传截图）
app.post('/api/payments', authenticateToken, upload.single('screenshot'), (req, res) => {
  const { orderId, product, status } = req.body;
  const screenshot = req.file ? `/uploads/${req.file.filename}` : null;

  db.run(
    'INSERT INTO payments (orderId, product, status, screenshot) VALUES (?, ?, ?, ?)',
    [orderId, product, status || '待审核', screenshot],
    function (err) {
      if (err) return res.status(500).json({ ok: false, message: err.message });
      res.json({ ok: true, orderId, screenshot });
    }
  );
});

// 更新支付状态
app.put('/api/payments', authenticateToken, (req, res) => {
  const { orderId, status } = req.body;
  if (!orderId || !status) {
    return res.status(400).json({ ok: false, message: 'Missing orderId or status' });
  }

  db.run(
    'UPDATE payments SET status = ? WHERE orderId = ?',
    [status, orderId],
    function (err) {
      if (err) return res.status(500).json({ ok: false, message: err.message });
      if (this.changes === 0) return res.status(404).json({ ok: false, message: 'Record not found' });
      res.json({ ok: true, orderId, status });
    }
  );
});

// 删除支付记录
app.delete('/api/payments', authenticateToken, (req, res) => {
  const { orderId } = req.body;
  if (!orderId) {
    return res.status(400).json({ ok: false, message: 'Missing orderId' });
  }

  db.run(
    'DELETE FROM payments WHERE orderId = ?',
    [orderId],
    function (err) {
      if (err) return res.status(500).json({ ok: false, message: err.message });
      if (this.changes === 0) return res.status(404).json({ ok: false, message: 'Record not found' });
      res.json({ ok: true, orderId });
    }
  );
});

// 启动服务器
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
