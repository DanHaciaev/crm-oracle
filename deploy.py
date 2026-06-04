"""
Deploy CRM to 192.168.0.173
Usage: python deploy.py
"""
import paramiko, zipfile, os, sys, time

sys.stdout.reconfigure(encoding='utf-8')

HOST     = '192.168.0.173'
USER     = 'unisim'
PASSWORD = 'Uni#demo$bomba'
REMOTE   = '/home/unisim/crm-oracle'
ZIP_PATH = '/tmp/crm-oracle-deploy.zip'

SKIP_DIRS  = {'node_modules', '.next', '.git', '__pycache__', '.turbo', 'out'}
SKIP_FILES = {'.env', 'deploy.py', '_deploy_tmp.zip'}

def pack():
    local = os.path.dirname(os.path.abspath(__file__))
    tmp   = os.path.join(local, '_deploy_tmp.zip')
    count = 0
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(local):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for f in files:
                full = os.path.join(root, f)
                rel  = os.path.relpath(full, local)
                if os.path.basename(full) not in SKIP_FILES:
                    zf.write(full, rel)
                    count += 1
    size = os.path.getsize(tmp) / (1024*1024)
    print(f"  Packed {count} files ({size:.1f} MB)")
    return tmp

def run(client, cmd, timeout=300):
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    code = stdout.channel.recv_exit_status()
    if out:
        for line in out.splitlines():
            print(f"    {line}")
    if err and code != 0:
        for line in err.splitlines()[-5:]:
            print(f"  ERR {line}")
    return code

def main():
    print("\n=== CRM Deploy ===\n")

    print("1. Packaging project...")
    tmp_zip = pack()

    print("2. Connecting to server...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=20)
    print("   Connected.")

    print("3. Uploading zip...")
    sftp = client.open_sftp()
    sftp.put(tmp_zip, ZIP_PATH)
    sftp.close()
    os.remove(tmp_zip)
    print("   Uploaded.")

    print("4. Extracting on server...")
    # Backup .env, extract, restore .env
    run(client, f"cp {REMOTE}/.env /tmp/crm_env_backup 2>/dev/null || true")
    run(client, f"rm -rf {REMOTE} && mkdir -p {REMOTE}")
    run(client, f"unzip -q {ZIP_PATH} -d {REMOTE} && rm {ZIP_PATH}")
    run(client, f"cp /tmp/crm_env_backup {REMOTE}/.env 2>/dev/null || true")
    print("   Done.")

    print("5. Installing dependencies...")
    code = run(client, f"cd {REMOTE} && npm install --legacy-peer-deps 2>&1 | tail -3", timeout=180)
    if code != 0:
        print("   ERROR: npm install failed")
        client.close(); sys.exit(1)
    print("   Done.")

    print("6. Building...")
    code = run(client, f"cd {REMOTE} && npm run build 2>&1 | tail -10", timeout=300)
    if code != 0:
        print("   ERROR: build failed")
        client.close(); sys.exit(1)
    print("   Done.")

    print("7. Restarting app...")
    run(client, "pm2 restart crm-oracle", timeout=30)
    time.sleep(2)

    print("8. Checking status...")
    _, stdout, _ = client.exec_command("curl -s -o /dev/null -w '%{http_code}' http://localhost:8088/crm")
    status = stdout.read().decode().strip()
    print(f"   http://una.md:8088/crm → HTTP {status}")

    client.close()

    if status == "200":
        print("\n  Deploy successful! http://una.md:8088/crm\n")
    else:
        print(f"\n  WARNING: got HTTP {status}, check pm2 logs crm-oracle\n")

if __name__ == '__main__':
    main()
