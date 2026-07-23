const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes pages
app.get('/',           (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/historique', (req, res) => res.sendFile(path.join(__dirname, 'public/historique.html')));
app.get('/recharge',   (req, res) => res.sendFile(path.join(__dirname, 'public/recharge.html')));
app.get('/api-doc',    (req, res) => res.sendFile(path.join(__dirname, 'public/api-doc.html')));
app.get('/profil',     (req, res) => res.sendFile(path.join(__dirname, 'public/profil.html')));
app.get('/login',      (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.get('/admin',      (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Direct API server running on port ${PORT}`);
});
