#!/usr/bin/env python3
"""Banned reader-facing words over the built HTML of the given blog slugs (visible text, attributes, JSON-LD).
   python3 scripts/qa/banned.py <slug> [<slug> ...]   (run after `npm run build`)"""
import re,sys
slugs=sys.argv[1:]
pat=re.compile(r'Simulator|\bbuilds?\b|iOS 27\.0|screens shown|FamilyActivityPicker|ShieldSettings|webDomains|FamilyControls|Screen Time API',re.I)
tot=0
for s in slugs:
    h=open(f'dist/client/blog/{s}/index.html').read()
    scripts=re.findall(r'<script type="application/ld\+json">(.*?)</script>',h,re.S)
    body=re.sub(r'<script[\s\S]*?</script>|<style[\s\S]*?</style>','',h)
    for src,txt in [('html',body)]+[('jsonld',x) for x in scripts]:
        for m in pat.finditer(txt):
            tot+=1; a=max(0,m.start()-50); print(f"{s} [{src}]: …{txt[a:m.end()+40]}…".replace('\n',' '))
print('TOTAL banned-word hits:',tot)
