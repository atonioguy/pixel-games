"""Appends sprites to js/sprites.js. Usage: python3 tools/add-sprites.py file.py
The file defines S = {name: '''rows'''}; rows may be shorter than 16 (padded with '.'),
and a row of just '.' means an empty row."""
import sys, re
ns = {}
exec(open(sys.argv[1]).read(), ns)
S = ns['S']
p = 'js/sprites.js'
src = open(p).read()
out = []
for k, v in S.items():
    rows = v.strip('\n').split('\n')
    rows = ['.' * 16 if r == '.' else r for r in rows]
    for i, r in enumerate(rows):
        if len(r) > 16:
            raise SystemExit(f'{k} row {i} too long ({len(r)})')
    if len(rows) > 16:
        raise SystemExit(f'{k} has {len(rows)} rows')
    rows = [r.ljust(16, '.') for r in rows]
    block = f"  {k}: [\n" + ''.join(f"    '{r}',\n" for r in rows) + "  ],\n"
    pat = re.compile(r"  %s: \[\n.*?\n  \],\n" % re.escape(k), re.S)
    if pat.search(src):
        src = pat.sub(lambda m: block, src, count=1)
    else:
        out.append(block)
anchor = "};\n\n// Wallpaper tile"
assert anchor in src
src = src.replace(anchor, ''.join(out) + anchor, 1)
open(p, 'w').write(src)
print('sprites written:', len(S))
