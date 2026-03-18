module.exports = {
  apps: [
    {
      name: 'show-console',
      script: 'backend/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: [
        'backend/server.js',
        'backend/routes',
        'backend/services',
        'backend/middleware',
        'backend/utils',
        'backend/views',
        'backend/config/openapi.js',
        'backend/config/paths.js'
      ],
      ignore_watch: [
        'runtime',
        'uploads',
        'show_record',
        'frontend',
        'node_modules'
      ],
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production',
        AI_API_KEY: '',
        AI_API_BASE_URL: 'https://api.openai.com/v1',
        AI_API_MODEL: 'gpt-4o-mini'
      }
    }
  ]
};
