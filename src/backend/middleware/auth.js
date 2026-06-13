import jwt from 'jsonwebtoken';
import env from '../config/env.js';

export function authMiddleware(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const payload = jwt.verify(token, env.auth.jwtSecret);
    req.user = {
      userId:   payload.userId,
      username: payload.username,
      role:     payload.role,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}