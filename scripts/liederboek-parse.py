import re, glob, json, html, sys, os
RAW = sys.argv[1]; OUT = sys.argv[2]

def clean(t):
    t = re.sub(r'<[^>]+>', '', t)
    return html.unescape(t).replace('\xa0', ' ')

def parse_line(raw):
    """One line of a verse -> list of [kind, text]. kinds: t text, r repeat, n repeat number, s substitute, c inline chorus."""
    segs = []
    pos = 0
    pat = re.compile(r'<span class="(repeat|repeat-number|substitute|inline-chorus|verse-hash)">')
    def walk(fragment, kind):
        out = []
        i = 0
        while i < len(fragment):
            m = pat.search(fragment, i)
            if not m:
                out.append([kind, fragment[i:]]); break
            if m.start() > i: out.append([kind, fragment[i:m.start()]])
            # find matching </span>
            depth = 1; j = m.end()
            while depth and j < len(fragment):
                o = fragment.find('<span', j); c = fragment.find('</span>', j)
                if c == -1: j = len(fragment); break
                if o != -1 and o < c: depth += 1; j = o + 5
                else: depth -= 1; j = c + 7
            inner = fragment[m.end():j - 7]
            k = {'repeat': 'r', 'repeat-number': 'n', 'substitute': 's', 'inline-chorus': 'c', 'verse-hash': None}[m.group(1)]
            if k: out.extend(walk(inner, k if kind == 't' else kind if k == 'r' and kind != 't' else k))
            i = j
        return out
    for kind, text in walk(raw, 't'):
        text = re.sub(r'\s+', ' ', clean(text))
        if not text: continue
        if segs and segs[-1][0] == kind: segs[-1][1] += text
        else: segs.append([kind, text])
    if segs: segs[0][1] = segs[0][1].lstrip()
    if segs: segs[-1][1] = segs[-1][1].rstrip()
    return [seg for seg in segs if seg[1]]

def parse_block(inner):
    lines = [parse_line(l) for l in re.split(r'<br\s*/?>', inner)]
    while lines and not lines[-1]: lines.pop()
    while lines and not lines[0]: lines.pop(0)
    return [l if l else [] for l in lines]

songs = []
for f in sorted(glob.glob(os.path.join(RAW, '*.html')), key=lambda p: int(os.path.basename(p)[:-5])):
    s = open(f, encoding='utf-8').read()
    if len(s) < 2000: continue
    sid = int(os.path.basename(f)[:-5])
    title = clean(re.search(r'<h1 class="song-title">([\s\S]*?)</h1>', s).group(1)).strip()
    credits = {}
    for dt, dd in re.findall(r'<dt>([^<]+)</dt>\s*<dd>([\s\S]*?)</dd>', s):
        dt = clean(dt).strip()
        if dt == "Pagina's": continue
        credits[dt] = re.sub(r'\s+', ' ', clean(dd)).strip()
    pages = {}
    box = re.search(r'<div class="song-pages[\s\S]*?</div>', s)
    if box:
        for book, items in re.findall(r'<li>\s*([^<]+?)\s*<ul>([\s\S]*?)</ul>', box.group(0)):
            entries = []
            for years, btn in re.findall(r'<strong>([^<]+)</strong>:\s*([\s\S]*?)</li>', items):
                ps = re.findall(r'>\s*([0-9A-Za-z]+)\s*</button>', btn)
                if ps: entries.append({'years': html.unescape(years).strip(), 'page': ps[0]})
            pages[book.strip()] = entries
    leuven = None
    for e in pages.get('Leuvens Liedboek', []):
        y = re.findall(r'\d{4}', e['years'])
        if leuven is None or (y and int(y[-1]) > leuven[1]): leuven = (e['page'], int(y[-1]) if y else 0)
    kvhv = None
    for e in pages.get('KVHV Groene Codex', []):
        if e['years'].startswith('2020'): kvhv = e['page']
    yt = re.search(r'youtube\.com/embed/([A-Za-z0-9_-]{6,})', s)
    copyright_ = re.search(r'<p class="song-copyright">[\s\S]*?<span>([^<]+)</span>', s)
    start = s.find('<div class="general"') if False else s.find('<div class="cotex">')
    stanzas = []
    if start >= 0:
        ends = [i for i in (s.find('<p class="song-copyright"', start), s.find('<div class="tab-pane" id="page-codex"', start)) if i > 0]
        body = s[start + len('<div class="cotex">'):min(ends) if ends else len(s)]
        lis = re.findall(r'<li>([\s\S]*?)</li>', body)
        if not lis: lis = [body]
        for li in lis:
            blocks = []
            for kind, inner in re.findall(r'<div class="(verse|chorus)">([\s\S]*?)</div>', li):
                blocks.append({'k': 'c' if kind == 'chorus' else 'v', 'l': parse_block(inner)})
            if blocks: stanzas.append(blocks)
    song = {'id': sid, 't': title, 's': stanzas}
    if credits: song['cr'] = credits
    if leuven: song['lp'] = leuven[0].lstrip('0') or leuven[0]
    if kvhv: song['kp'] = kvhv.lstrip('0') or kvhv
    if yt: song['yt'] = yt.group(1)
    if copyright_: song['src'] = html.unescape(copyright_.group(1)).strip()
    songs.append(song)

songs.sort(key=lambda x: x['t'].lower())
json.dump({'source': 'codex.rondgezang.be', 'leuvenEdition': max([0]), 'songs': songs}, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(songs), 'songs', sum(1 for x in songs if 'lp' in x), 'lelie', sum(1 for x in songs if 'kp' in x), 'kvhv', sum(1 for x in songs if 'yt' in x), 'yt', sum(1 for x in songs if not x['s']), 'zonder tekst', os.path.getsize(OUT))
