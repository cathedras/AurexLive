module.exports = {
  apps: [
    {
      name: 'show-console',
      script: 'backend/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'cluster',
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
        COREDNS_AUTOSTART_IN_SERVER: '0',
        AI_API_KEY: '',
        AI_API_BASE_URL: 'https://api.openai.com/v1',
        AI_API_MODEL: 'gpt-4o-mini'
      }
    }
    ,
    {
      name: 'monitor-worker',
      script: 'backend/monitorWorker.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'cluster',
      autorestart: true,
      watch: [
        'backend/services/recordingService.js'
      ],
      ignore_watch: [
        'runtime/recordings',
        'uploads',
        'node_modules'
      ],
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'dns-service',
      script: 'backend/dnsService.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: [
        'backend/dnsService.js',
        'backend/utils/startupDnsListener.js',
        'backend/config/coredns/Corefile.template'
      ],
      ignore_watch: [
        'runtime',
        'uploads',
        'show_record',
        'frontend',
        'node_modules'
      ],
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production',
        COREDNS_AUTOSTART_IN_SERVER: '1',
        COREDNS_DOMAIN: 'www.auxm.com',
        COREDNS_START_ON_BOOT: '1'
      }
    },
    // Uncomment below if you really need Vite dev server in production:
    {
      name: 'vite-dev',
      script: 'npm',
      args: 'run client',
      cwd: __dirname,
      autorestart: true,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
