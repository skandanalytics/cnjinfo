#!/usr/bin/env python
import os
import sys


def _ensure_venv():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    venv_python = os.path.join(base_dir, ".venv", "Scripts", "python.exe")
    if os.path.exists(venv_python) and sys.executable.lower() != os.path.abspath(venv_python).lower():
        import subprocess
        res = subprocess.run([venv_python] + sys.argv, cwd=base_dir)
        sys.exit(res.returncode)
    venv_site = os.path.join(base_dir, ".venv", "Lib", "site-packages")
    if os.path.isdir(venv_site) and venv_site not in sys.path:
        sys.path.insert(0, venv_site)


_ensure_venv()


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()

