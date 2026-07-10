module.exports = {
  apps: [
    {
      name: "weather-backend",
      script: "listener.py",
      interpreter: "C:/Users/james/AppData/Local/Python/pythoncore-3.14-64/python.exe",
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
      out_file: "./logs/backend-out.log",
      error_file: "./logs/backend-error.log",
      time: true
    },
    {
      name: "dashboard-frontend",
      script: "C:/Users/james/AppData/Roaming/npm/node_modules/serve/build/main.js",
      args: ["-s", "-l", "tcp://0.0.0.0:3000", "FE/personal_dashboard/build"],
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
      out_file: "./logs/frontend-out.log",
      error_file: "./logs/frontend-error.log",
      time: true
    },
    {
      name: "cloudflared-tunnel",
      script: "C:/Program Files (x86)/cloudflared/cloudflared.exe",
      args: ["--config", "C:/Users/james/.cloudflared/config.yml", "tunnel", "run"],
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      out_file: "./logs/cloudflared-out.log",
      error_file: "./logs/cloudflared-error.log",
      time: true
    }
  ]
};
