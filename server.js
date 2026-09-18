import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import dashboardRoutes from './routes/dashboard.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const defaultOrigins = [
  'https://campaign.kwsc.gos.pk',
  'http://campaign.kwsc.gos.pk',
  'http://localhost:5173',
  'http://localhost:3000',
];

const configuredOrigins = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map(o => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([...configuredOrigins, ...defaultOrigins]));

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. curl, server-to-server) or development mode
    if (!origin || process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    const cleanOrigin = origin.replace(/\/$/, '');
    const cleanHost = cleanOrigin.replace(/^https?:\/\//, '');

    const isAllowed = allowedOrigins.some(allowed => {
      const allowedClean = allowed.replace(/\/$/, '');
      const allowedHost = allowedClean.replace(/^https?:\/\//, '');
      return allowedClean === cleanOrigin || allowedHost === cleanHost;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      // Disallow cleanly without throwing unhandled 500 error
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/dashboard', dashboardRoutes);

// Fallback 404 JSON handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Node server running on http://localhost:${PORT}`);
});