import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  retryStrategy: () => null, // Don't retry
});

redis.on('connect', () => {
  console.log('✅ Redis connected successfully!');
  console.log(`Host: ${process.env.REDIS_HOST}`);
  console.log(`Port: ${process.env.REDIS_PORT}`);
  console.log(`DB: ${process.env.REDIS_DB}`);
  redis.disconnect();
  process.exit(0);
});

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
  redis.disconnect();
  process.exit(1);
});

// Timeout after 5 seconds
setTimeout(() => {
  console.error('⏱️  Connection timeout after 5 seconds');
  redis.disconnect();
  process.exit(1);
}, 5000);
