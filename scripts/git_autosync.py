"""Local code auto-sync. No force-push, pull, reset or credential storage."""
import argparse
import hashlib
import json
import logging
from logging.handlers import RotatingFileHandler
import msvcrt
import os
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
GIT = ROOT.parent / 'tools' / 'git' / 'cmd' / 'git.exe'
PYTHON = ROOT / '.venv' / 'Scripts' / 'python.exe'
CACHE = ROOT / '.cache' / 'autosync'
STOP = CACHE / 'stop'
ALLOWED = {'.py', '.ps1', '.md', '.txt', '.toml', '.json', '.jsonc', '.yaml', '.yml',
           '.js', '.mjs', '.jsx', '.ts', '.tsx', '.css', '.html', '.ini', '.cfg', '.sh'}
SPECIAL = {'.gitignore', '.gitattributes', '.dockerignore', '.npmrc', '.env.example',
           '.node-version', 'Dockerfile'}
PRIVATE = {'data', 'output', 'uploads', 'resumes', 'reports', '.git', '.venv',
           '.cache', '__pycache__', '.pytest_cache', 'node_modules'}


def safe_code(name):
    path = Path(name)
    parts = {p.lower() for p in path.parts}
    # Synthetic examples already in the repository are allowed.
    if parts & PRIVATE or path.is_absolute() or '..' in path.parts:
        return False
    lower = path.name.lower()
    if lower.startswith('.env') and lower != '.env.example':
        return False
    # Permit checked-in demo text only; never sync newly uploaded candidate text.
    if path.suffix.lower() == '.txt' and not (ROOT / name).exists():
        return False
    if path.suffix.lower() == '.txt' and path.parts[0].lower() == 'examples':
        return False
    if path.suffix.lower() == '.txt' and ROOT.joinpath('.git', 'index').exists():
        tracked = subprocess.run([str(GIT), '-C', str(ROOT), 'ls-files', '--error-unmatch', '--', name],
                                 capture_output=True)
        if tracked.returncode:
            return False
    if lower in {'secrets.toml', 'credentials.json'} or path.suffix.lower() in {'.pem', '.key'}:
        return False
    return path.name in SPECIAL or path.suffix.lower() in ALLOWED


def run(*args, timeout=120):
    result = subprocess.run([str(GIT), '-C', str(ROOT), *args],
                            capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(result.stderr.decode('utf-8', errors='replace').strip())
    return result.stdout.decode('utf-8', errors='replace').strip()


def changes():
    names = run('ls-files', '-m', '-d', '-o', '--exclude-standard', '-z').split('\0')
    return sorted({name for name in names if name and safe_code(name)})


def fingerprint(names):
    digest = hashlib.sha256()
    for name in names:
        path = ROOT / name
        digest.update(name.encode('utf-8'))
        digest.update(path.read_bytes() if path.is_file() else b'<deleted>')
    return digest.hexdigest()


def sync(names, snapshot):
    if run('branch', '--show-current') != 'main':
        raise RuntimeError('Paused: checkout main to resume auto-sync')
    if run('diff', '--cached', '--name-only'):
        raise RuntimeError('Paused: manually staged changes exist; commit or unstage them first')
    for marker in ('MERGE_HEAD', 'CHERRY_PICK_HEAD', 'rebase-merge', 'rebase-apply'):
        if (ROOT / '.git' / marker).exists():
            raise RuntimeError('Paused: Git merge/rebase operation is in progress')
    if names:
        test_temp = ROOT / '.cache' / 'tmp'
        test_temp.mkdir(parents=True, exist_ok=True)
        test_env = {**os.environ, 'TEMP': str(test_temp), 'TMP': str(test_temp),
                    'npm_config_cache': str(ROOT / '.cache' / 'npm'),
                    'PYTHONDONTWRITEBYTECODE': '1'}
        web_test = subprocess.run(['cmd.exe', '/c', 'npm.cmd', 'test'], cwd=ROOT,
                                  capture_output=True, timeout=180, env=test_env)
        if web_test.returncode:
            raise RuntimeError('Web tests failed; changes remain local. ' + web_test.stdout.decode('utf-8', errors='replace')[-3000:])
        test = subprocess.run([str(PYTHON), '-m', 'pytest', '-q'], cwd=ROOT,
                              capture_output=True, timeout=180, env=test_env)
        if test.returncode:
            raise RuntimeError('Tests failed; changes remain local. ' + test.stdout.decode('utf-8', errors='replace')[-3000:])
        if changes() != names or fingerprint(names) != snapshot:
            raise RuntimeError('Files changed during tests; waiting for another quiet period')
        run('add', '--all', '--', *names)
        if run('diff', '--cached', '--name-only'):
            run('commit', '-m', 'Auto-sync code updates ' + time.strftime('%Y-%m-%d %H:%M:%S'))
    # Normal push refuses remote divergence; never overwrite remote work.
    run('push', 'origin', 'main')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(CACHE / 'autosync.log', maxBytes=1_000_000, backupCount=2, encoding='utf-8')
    logging.basicConfig(level=logging.INFO, handlers=[handler], format='%(asctime)s %(levelname)s %(message)s')
    lock = (CACHE / 'worker.lock').open('a+b')
    lock.seek(0)
    try:
        msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        return
    previous = None
    quiet_since = time.monotonic()
    last_attempt = 0
    logging.info('Started; watching %s; quiet period 40 seconds', ROOT)
    while not STOP.exists():
        try:
            names = changes()
            current = fingerprint(names)
            now = time.monotonic()
            if current != previous:
                previous, quiet_since = current, now
            if args.once or (names and now - quiet_since >= 40 and now - last_attempt >= 60) or (
                    (CACHE / 'status.json').exists()
                    and json.loads((CACHE / 'status.json').read_text()).get('state') == 'retry_pending'
                    and now - last_attempt >= 60):
                last_attempt = now
                sync(names, current)
                logging.info('Sync successful; %s changed code files', len(names))
                (CACHE / 'status.json').write_text(json.dumps({'state': 'synced', 'at': time.strftime('%Y-%m-%d %H:%M:%S')}))
        except Exception as exc:
            logging.error('%s', exc)
            (CACHE / 'status.json').write_text(json.dumps({'state': 'retry_pending', 'error': str(exc), 'at': time.strftime('%Y-%m-%d %H:%M:%S')}))
            if args.once:
                raise
        if args.once:
            break
        time.sleep(10)


if __name__ == '__main__':
    main()
