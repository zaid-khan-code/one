import dotenv from 'dotenv';
dotenv.config();

export const verifyDashboardToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.DASHBOARD_API_SECRET;

  if (!expectedToken) {
    return next();
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token format' });
  }

  const token = authHeader.split(' ')[1];
  if (token !== expectedToken) {
    return res.status(403).json({ error: 'Forbidden: Invalid bearer token' });
  }

  next();
};