require('dotenv').config();

module.exports = {
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  db: {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    user: process.env.DB_USER || 'user',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'task_scheduler',
  },
  redis: {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  },
  etcd: {
    hosts: (process.env.ETCD_HOSTS || 'etcd:2379').split(','),
  },
  scheduler: {
    leaderTTL: parseInt(process.env.LEADER_ELECTION_TTL, 10) || 15,
    dispatchInterval: parseInt(process.env.DISPATCH_INTERVAL_MS, 10) || 1000,
  },
};
