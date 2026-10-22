#!/usr/bin/env bash
# =============================================================================
#  Preparar un VPS Ubuntu (22.04 / 24.04) para Acopio y otros servicios
#  - Protege el servidor: usuario propio, SSH solo con llave, fail2ban,
#    actualizaciones de seguridad automáticas, cortafuegos, swap
#  - Instala Coolify (que a su vez instala Docker)
#
#  Uso (como root, recién creado el VPS):
#    curl -fsSL https://raw.githubusercontent.com/desarrollosweb2005-apps/acopio/main/deploy/preparar-servidor.sh | sudo bash
#
#  Es seguro volver a ejecutarlo: cada paso comprueba si ya está hecho.
#  Ten abierta la consola web del proveedor por si algo falla con SSH.
# =============================================================================
set -euo pipefail

VERDE='\033[1;32m'; AMARILLO='\033[1;33m'; ROJO='\033[1;31m'; NORMAL='\033[0m'
paso()  { echo -e "\n${VERDE}==> $*${NORMAL}"; }
aviso() { echo -e "${AMARILLO}AVISO:${NORMAL} $*"; }
error() { echo -e "${ROJO}ERROR:${NORMAL} $*" >&2; exit 1; }
# Las preguntas se leen del teclado aunque el script llegue por «curl | bash»
preguntar() { local texto="$1" defecto="${2:-}" r; read -r -p "$texto${defecto:+ [$defecto]}: " r </dev/tty || true; echo "${r:-$defecto}"; }
confirmar() { local r; read -r -p "$1 [s/N]: " r </dev/tty || true; [[ "$r" =~ ^[sSyY]$ ]]; }
confirmar_si() { local r; read -r -p "$1 [S/n]: " r </dev/tty || true; [[ ! "$r" =~ ^[nN]$ ]]; }

# --- Comprobaciones -----------------------------------------------------------
[[ $EUID -eq 0 ]] || error "Ejecútalo como root (con sudo)."
. /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || error "Este script es para Ubuntu (detectado: ${PRETTY_NAME:-desconocido})."
[[ "${VERSION_ID%%.*}" -ge 22 ]] || error "Hace falta Ubuntu 22.04 o superior."

echo -e "${VERDE}"
cat <<'EOF'
  ┌───────────────────────────────────────────────┐
  │   Preparar servidor · Acopio + Coolify        │
  └───────────────────────────────────────────────┘
EOF
echo -e "${NORMAL}Servidor: $(hostname) · ${PRETTY_NAME} · $(nproc) CPU · $(free -g | awk '/Mem/{print $2}') GB RAM"

# --- Datos ----------------------------------------------------------------------
USUARIO=$(preguntar "Nombre del usuario administrador (no uses root ni admin)" "operador")
[[ "$USUARIO" =~ ^[a-z][a-z0-9_-]{2,31}$ ]] || error "Nombre de usuario no válido (minúsculas, números, - o _)."
ZONA=$(preguntar "Zona horaria" "America/Santiago")
PUERTO_SSH=22

# Llave SSH: la que ya tenga root (muchos proveedores la ponen al crear el VPS) o una pegada ahora
LLAVE=""
if [[ -s /root/.ssh/authorized_keys ]]; then
  echo "root ya tiene llave(s) SSH autorizada(s):"
  awk '{print "   - " $1 " … " $NF}' /root/.ssh/authorized_keys
  confirmar_si "¿Usar esas mismas llaves para $USUARIO?" && LLAVE=$(cat /root/.ssh/authorized_keys)
fi
if [[ -z "$LLAVE" ]]; then
  echo "Pega tu llave PÚBLICA SSH (una línea que empieza por ssh-ed25519 o ssh-rsa)."
  echo "En tu PC: Get-Content \$HOME\\.ssh\\id_ed25519.pub  (Windows)  ·  cat ~/.ssh/id_ed25519.pub  (Mac/Linux)"
  LLAVE=$(preguntar "Llave pública" "")
fi
[[ "$LLAVE" =~ ^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp[0-9]+|sk-ssh-ed25519@openssh.com|sk-ecdsa-sha2-nistp256@openssh.com)\  ]] \
  || error "Eso no parece una llave pública SSH. Genera una con: ssh-keygen -t ed25519"

INSTALAR_COOLIFY=s
confirmar_si "¿Instalar Coolify al final? (recomendado)" || INSTALAR_COOLIFY=n

# --- 1. Sistema al día y herramientas básicas ----------------------------------------
paso "1/8 Actualizando el sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get -o Dpkg::Options::=--force-confold -yq full-upgrade
apt-get install -yq curl ca-certificates git ufw fail2ban unattended-upgrades apt-listchanges htop ncdu jq

# --- 2. Hora y zona horaria -------------------------------------------------------
paso "2/8 Zona horaria: $ZONA"
timedatectl set-timezone "$ZONA" || aviso "Zona horaria no válida; se deja la actual."
timedatectl set-ntp true || true

# --- 3. Swap (evita que el servidor se quede sin memoria al compilar) ----------------
paso "3/8 Memoria de intercambio (swap)"
if swapon --show | grep -q .; then
  echo "Ya hay swap: $(swapon --show --noheadings | awk '{print $1, $3}')"
else
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/90-swappiness.conf && sysctl -q -p /etc/sysctl.d/90-swappiness.conf
  echo "Swap de 4 GB creada."
fi

# --- 4. Usuario administrador con llave SSH ---------------------------------------
paso "4/8 Usuario $USUARIO"
if ! id "$USUARIO" &>/dev/null; then
  adduser --disabled-password --gecos "" "$USUARIO"
  echo "Elige la contraseña de $USUARIO (solo se usa para sudo, no para entrar por SSH):"
  until passwd "$USUARIO" </dev/tty; do echo "Inténtalo de nuevo."; done
fi
usermod -aG sudo "$USUARIO"
install -d -m 700 -o "$USUARIO" -g "$USUARIO" "/home/$USUARIO/.ssh"
touch "/home/$USUARIO/.ssh/authorized_keys"
while IFS= read -r linea; do
  [[ -n "$linea" ]] && ! grep -qxF "$linea" "/home/$USUARIO/.ssh/authorized_keys" && echo "$linea" >> "/home/$USUARIO/.ssh/authorized_keys"
done <<< "$LLAVE"
chown "$USUARIO:$USUARIO" "/home/$USUARIO/.ssh/authorized_keys" && chmod 600 "/home/$USUARIO/.ssh/authorized_keys"
# root también con la llave (Coolify entra al propio servidor por SSH como root, siempre con llave)
install -d -m 700 /root/.ssh && touch /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys
while IFS= read -r linea; do
  [[ -n "$linea" ]] && ! grep -qxF "$linea" /root/.ssh/authorized_keys && echo "$linea" >> /root/.ssh/authorized_keys
done <<< "$LLAVE"

# --- 5. SSH: sin contraseñas ----------------------------------------------------
paso "5/8 SSH solo con llave"
cat > /etc/ssh/sshd_config.d/00-acopio-seguridad.conf <<EOF
# Generado por preparar-servidor.sh
Port $PUERTO_SSH
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
# root solo con llave (lo necesita Coolify); nunca con contraseña
PermitRootLogin prohibit-password
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
EOF
# Algunas imágenes traen un 50-cloud-init.conf con PasswordAuthentication yes que tendría prioridad
for f in /etc/ssh/sshd_config.d/*.conf; do
  [[ "$f" == */00-acopio-seguridad.conf ]] && continue
  sed -i -E 's/^\s*(PasswordAuthentication|KbdInteractiveAuthentication)\s+yes/# &  (desactivado por preparar-servidor.sh)/I' "$f"
done
sshd -t || error "La configuración de SSH tiene un error; no se aplica. Revisa /etc/ssh/sshd_config.d/00-acopio-seguridad.conf"
systemctl reload ssh 2>/dev/null || systemctl reload sshd
echo "Hecho. La sesión actual sigue abierta."

# --- 6. fail2ban -----------------------------------------------------------------
paso "6/8 fail2ban (bloquea IPs que insisten)"
cat > /etc/fail2ban/jail.d/acopio.local <<EOF
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd

[sshd]
enabled = true
port    = $PUERTO_SSH

# Reincidentes: una semana fuera
[recidive]
enabled  = true
bantime  = 1w
findtime = 1d
EOF
systemctl enable --now fail2ban >/dev/null && systemctl restart fail2ban

# --- 7. Actualizaciones de seguridad automáticas ---------------------------------------
paso "7/8 Actualizaciones de seguridad automáticas"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat > /etc/apt/apt.conf.d/52acopio-unattended <<'EOF'
// Reinicia solo si una actualización lo exige, de madrugada
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
EOF
systemctl enable --now unattended-upgrades >/dev/null

# Pequeños ajustes de red recomendados
cat > /etc/sysctl.d/90-acopio-red.conf <<'EOF'
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.tcp_syncookies = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
EOF
sysctl -q --system

# --- 8. Cortafuegos ---------------------------------------------------------------
paso "8/8 Cortafuegos (ufw)"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw limit "$PUERTO_SSH/tcp" comment 'SSH' >/dev/null
ufw allow 80/tcp comment 'HTTP' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw allow 443/udp comment 'HTTP/3' >/dev/null
if [[ "$INSTALAR_COOLIFY" == s ]]; then
  # Solo para la instalación; se cierran cuando Coolify tenga su dominio
  ufw allow 8000/tcp comment 'Coolify (temporal)' >/dev/null
  ufw allow 6001:6002/tcp comment 'Coolify realtime/terminal (temporal)' >/dev/null
fi
ufw --force enable >/dev/null
ufw status verbose | sed -n '1,30p'

# --- Coolify --------------------------------------------------------------------
if [[ "$INSTALAR_COOLIFY" == s ]]; then
  paso "Instalando Coolify (incluye Docker). Tarda unos minutos…"
  curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
fi

# --- Resumen ----------------------------------------------------------------------
IP=$(curl -fsS4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
echo -e "\n${VERDE}════════════════════  LISTO  ════════════════════${NORMAL}"
cat <<EOF

 1) ANTES DE CERRAR ESTA SESIÓN, abre otra terminal y comprueba que entras:
        ssh $USUARIO@$IP
    Si no entras, NO cierres esta ventana: revisa la llave o usa la consola del proveedor.

 2) Cortafuegos del PROVEEDOR (panel del VPS): deja abiertos solo 22, 80 y 443
    (y 8000, 6001, 6002 mientras configuras Coolify). Docker se salta ufw en los
    puertos de sus contenedores, así que ese cortafuegos externo es el que manda.
EOF
if [[ "$INSTALAR_COOLIFY" == s ]]; then
cat <<EOF

 3) Abre YA  http://$IP:8000  y crea la cuenta de administrador
    (el primero que entra se queda como dueño). Después:
      - Settings → Instance Domain: https://panel.tudominio.com
      - Perfil → activa 2FA
      - Cierra 8000, 6001 y 6002:  sudo ufw delete allow 8000/tcp && sudo ufw delete allow 6001:6002/tcp
        (y también en el cortafuegos del proveedor)

 4) Sigue con deploy/COOLIFY.md para Acopio, n8n, PostgreSQL, Redis y WhatsApp.
EOF
fi
echo
