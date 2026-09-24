// PM2 process file. Start with: pm2 start ecosystem.config.cjs --env production
module.exports = {
  apps: [
    {
      name: 'phi-blueprint',
      cwd: __dirname,
      script: 'server/src/index.js',
      exec_mode: 'cluster',
      instances: 2,            // stateless (JWT cookies), so cluster mode is safe
      max_memory_restart: '400M',
      kill_timeout: 10000,
      time: true,
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      merge_logs: true,
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
