#!/bin/bash
# =============================================================================
# Clinic Tracker — Debian VM Setup Script
# Run as root or with sudo: sudo bash setup-server.sh
# =============================================================================
set -euo pipefail

APP_USER="clinicapp"
APP_DIR="/opt/clinic-tracker"
DATA_DIR="/data/clinic-tracker"
REPO_URL="https://github.com/agillam69/aod-tracker-app.git"
DOMAIN=""  # Set your domain here if you have one, e.g. "clinic.example.com"

echo "===== 1. System update ====="
apt update && apt upgrade -y

echo "===== 2. Install essential packages ====="
apt install -y curl git nginx certbot python3-certbot-nginx ufw

echo "===== 3. Install Node.js 20 LTS ====="
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
echo "Node version: $(node -v)"
echo "npm version:  $(npm -v)"

echo "===== 4. Create app user ====="
if ! id "$APP_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$APP_USER"
  echo "Created user: $APP_USER"
else
  echo "User $APP_USER already exists"
fi

echo "===== 5. Create directories ====="
mkdir -p "$APP_DIR" "$DATA_DIR" "$DATA_DIR/backups"
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$DATA_DIR"

echo "===== 6. Clone repository ====="
sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR" || {
  echo "Repo already cloned, pulling latest..."
  cd "$APP_DIR" && sudo -u "$APP_USER" git pull origin main
}

echo "===== 7. Install dependencies + build frontend ====="
cd "$APP_DIR"
sudo -u "$APP_USER" npm install
sudo -u "$APP_USER" npm run build
cd "$APP_DIR/server"
sudo -u "$APP_USER" npm install --production

echo "===== 8. Create environment file ====="
cat > "$APP_DIR/.env" << 'EOF'
PORT=3001
HOST=127.0.0.1
SERVE_FRONTEND=1
DB_PATH=/data/clinic-tracker/aod_tracker.db
NODE_ENV=production
EOF
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
echo "Created $APP_DIR/.env"

echo "===== 9. Create systemd service ====="
cat > /etc/systemd/system/clinic-tracker.service << EOF
[Unit]
Description=Clinic Tracker App
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable clinic-tracker
systemctl start clinic-tracker
echo "Service started"

echo "===== 10. Configure Nginx ====="
cat > /etc/nginx/sites-available/clinic-tracker << 'NGINX'
server {
    listen 80;
    server_name _;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/clinic-tracker /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
echo "Nginx configured"

echo "===== 11. Configure firewall (UFW) ====="
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
echo "Firewall enabled"

echo "===== 12. Create backup script ====="
cat > "$APP_DIR/scripts/backup.sh" << 'BACKUP'
#!/bin/bash
BACKUP_DIR="/data/clinic-tracker/backups"
DB_PATH="/data/clinic-tracker/aod_tracker.db"
TIMESTAMP=$(date +%Y-%m-%d_%H%M)

# SQLite safe backup
sqlite3 "$DB_PATH" ".backup $BACKUP_DIR/aod_tracker_$TIMESTAMP.db"

# Keep only last 14 days
find "$BACKUP_DIR" -name "*.db" -mtime +14 -delete

echo "Backup completed: aod_tracker_$TIMESTAMP.db"
BACKUP
mkdir -p "$APP_DIR/scripts"
chmod +x "$APP_DIR/scripts/backup.sh"
chown "$APP_USER:$APP_USER" "$APP_DIR/scripts/backup.sh"

# Install sqlite3 for backups
apt install -y sqlite3

# Add daily cron
echo "0 2 * * * $APP_USER $APP_DIR/scripts/backup.sh" > /etc/cron.d/clinic-backup
echo "Daily backup cron added (2:00 AM)"

echo "===== 13. Create deploy script ====="
cat > "$APP_DIR/scripts/deploy.sh" << 'DEPLOY'
#!/bin/bash
set -euo pipefail
cd /opt/clinic-tracker
git pull origin main
npm install
npm run build
cd server && npm install --production
sudo systemctl restart clinic-tracker
echo "Deploy complete at $(date)"
DEPLOY
chmod +x "$APP_DIR/scripts/deploy.sh"
chown "$APP_USER:$APP_USER" "$APP_DIR/scripts/deploy.sh"

echo ""
echo "============================================="
echo " Setup complete!"
echo "============================================="
echo ""
echo " App URL:     http://$(hostname -I | awk '{print $1}')"
echo " Service:     systemctl status clinic-tracker"
echo " Logs:        journalctl -u clinic-tracker -f"
echo " Deploy:      sudo -u $APP_USER $APP_DIR/scripts/deploy.sh"
echo " Backup:      sudo -u $APP_USER $APP_DIR/scripts/backup.sh"
echo ""
echo " Next steps:"
echo "   1. Point your domain DNS to this server's IP"
echo "   2. Run: sudo certbot --nginx -d yourdomain.com"
echo "   3. Change admin password on first login!"
echo "============================================="
