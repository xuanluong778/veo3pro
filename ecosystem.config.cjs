const nodeBin = '/var/www/automedia_vn_usr635/data/.nvm/versions/node/v22.23.1/bin';

module.exports = {
  apps: [
    {
      name: 'veo3pro',
      cwd: '/var/www/automedia_vn_usr635/data/www/automedia.vn',
      // Chạy trực tiếp bằng Node 22 — tránh npm start bị kéo Node 20 từ PATH hệ thống
      script: 'server/index.js',
      interpreter: `${nodeBin}/node`,
      env: {
        NODE_ENV: 'production',
        PORT: '8788',
        BIND_HOST: '127.0.0.1',
        PATH: `${nodeBin}:/usr/local/bin:/usr/bin:/bin`,
        HOME: '/var/www/automedia_vn_usr635/data',
      },
      autorestart: true,
      max_restarts: 20,
      min_uptime: '5s',
    },
  ],
};
