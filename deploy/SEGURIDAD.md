# Proteger el VPS (Ubuntu) antes de instalar nada

> **Atajo:** el script [preparar-servidor.sh](preparar-servidor.sh) hace los pasos 1 a 4 (y la swap, la zona horaria e instala Coolify) con comprobaciones para que no te quedes fuera:
>
> ```bash
> curl -fsSL https://raw.githubusercontent.com/desarrollosweb2005-apps/acopio/main/deploy/preparar-servidor.sh | sudo bash
> ```
>
> Lo de abajo explica cada paso por si prefieres hacerlo a mano o quieres entender qué cambia.

La mayoría de los VPS que «entran» a los pocos meses caen por lo mismo: **acceso SSH con contraseña** (robots probando contraseñas día y noche), **un panel expuesto o sin actualizar**, o **servicios abiertos a internet que no deberían estarlo**. Estos pasos cierran esas puertas. Hazlos **el primer día**, en este orden.

> Ten a mano la **consola web de tu proveedor** (la «Console» o «VNC» del panel del VPS). Si algo sale mal con SSH, entras por ahí.

## 1. Entrar con llave SSH, no con contraseña

En **tu ordenador** (PowerShell en Windows):

```bash
ssh-keygen -t ed25519 -C "tu-email"        # Enter a todo; crea la llave en ~/.ssh/id_ed25519
```

En el **VPS** (entrando como root la primera vez), crea tu usuario y dale la llave:

```bash
adduser acopio                      # elige una contraseña larga (solo para sudo)
usermod -aG sudo acopio
mkdir -p /home/acopio/.ssh
nano /home/acopio/.ssh/authorized_keys   # pega aquí el contenido de tu id_ed25519.pub
chown -R acopio:acopio /home/acopio/.ssh
chmod 700 /home/acopio/.ssh && chmod 600 /home/acopio/.ssh/authorized_keys
```

**Prueba en otra ventana** que entras con `ssh acopio@IP-DEL-VPS` **sin que te pida la contraseña del servidor**. Solo entonces:

```bash
sudo nano /etc/ssh/sshd_config.d/00-seguridad.conf
```

```
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
```

```bash
sudo systemctl restart ssh
```

Desde ahora nadie puede entrar adivinando contraseñas: sin tu llave no hay acceso.

> Coolify necesita entrar al propio servidor por SSH como root **con llave** (la crea él). `PermitRootLogin no` lo impide; si en la instalación de Coolify el servidor «localhost» no valida, cambia esa línea por `PermitRootLogin prohibit-password` (root solo con llave, nunca con contraseña) y reinicia ssh.

## 2. Actualizaciones de seguridad automáticas

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades     # responde «Sí»
```

## 3. Bloquear a quien insiste (fail2ban)

```bash
sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
```

Bloquea durante un tiempo las IPs que fallan el acceso SSH varias veces.

## 4. Cortafuegos: solo lo necesario abierto

**Importante:** Docker se salta el cortafuegos de Ubuntu (`ufw`) para los puertos de sus contenedores. Por eso lo más fiable es el **cortafuegos del proveedor** (en el panel del VPS: «Firewall», «Security groups»…). Configúralo para permitir solo:

| Puerto | Para qué |
|---|---|
| 22 (TCP) | SSH (si puedes, solo desde tu IP) |
| 80 y 443 (TCP) | Webs con HTTPS (Acopio, Coolify, Nextcloud) |
| 443 (UDP) | HTTP/3 (opcional) |
| 8000 (TCP) | Panel de Coolify **solo durante la instalación**; ciérralo cuando tenga su dominio con HTTPS |

Y además, en el propio servidor:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

## 5. Coolify

- **Crea la cuenta de administrador nada más instalarlo**: el primero que abre el panel se queda como dueño.
- Activa la **verificación en dos pasos (2FA)** en tu perfil.
- Ponle dominio con HTTPS (por ejemplo `panel.tudominio.com`) y **cierra el puerto 8000** en el cortafuegos del proveedor.
- Deja activadas las **actualizaciones automáticas** de Coolify.

## 6. Copias de seguridad

- **Snapshots** del VPS en el panel del proveedor (semanales, como mínimo).
- Los datos de Acopio (links, colecciones…) están en **Supabase**, fuera del VPS: si el servidor se pierde, se reinstala y no se pierde nada. En el plan gratuito de Supabase no hay copias diarias descargables; con clientes de pago, pasa a Pro.
- Nextcloud: copia de sus datos y de su base de datos (Coolify permite programarlas).

## 7. Buenas costumbres

- No instales programas que no vayas a usar; cada servicio abierto es una puerta más.
- Contraseñas únicas y largas (gestor de contraseñas) y 2FA en todo: proveedor del VPS, Coolify, Supabase, GitHub, Nextcloud.
- Una vez al mes: `sudo apt update && sudo apt full-upgrade` y reiniciar si lo pide; revisar que Coolify y Nextcloud estén al día.
- Si algún día ves procesos raros o el servidor muy cargado sin motivo: snapshot, apagar y revisar; con todo en Docker y los datos en Supabase, reinstalar desde cero es rápido.
