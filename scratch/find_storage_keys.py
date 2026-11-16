import os, re
frontend_dir = r'D:\curser\foodie-push\frontend\src'
keys = set()
pattern = re.compile(r'localStorage\.(?:setItem|getItem|removeItem)\s*\(\s*["\']([^"\']+)["\']')
for root, dirs, files in os.walk(frontend_dir):
    for f in files:
        if f.endswith(('.jsx', '.js')):
            p = os.path.join(root, f)
            with open(p, 'r', encoding='utf-8') as fl:
                try:
                    c = fl.read()
                    for m in pattern.findall(c):
                        keys.add(m)
                except:
                    pass
print('Found keys:', sorted(list(keys)))
