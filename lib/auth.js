const jwt = require('jsonwebtoken');

function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    const err = new Error('JWT_SECRET não configurada.');
    err.code = 'NO_JWT_SECRET';
    throw err;
  }
  return 'segredo-apenas-para-desenvolvimento';
}

function sign(payload, options = {}) {
  return jwt.sign(payload, secret(), { expiresIn: '365d', ...options });
}

// auth('barbershop') ou auth('client'): exige token válido com o papel informado.
function auth(role) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Faça login para continuar.' });

    let data;
    try {
      data = jwt.verify(token, secret());
    } catch (err) {
      if (err.code === 'NO_JWT_SECRET') return next(err);
      return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
    }
    if (data.role !== role) return res.status(403).json({ error: 'Acesso não permitido.' });
    req.user = data;
    next();
  };
}

module.exports = { sign, auth };
