"""Update docs/board.html's JSON block from a small patch file, so the board never needs hand-editing.

    python tools/board.py patch.json

Patch keys (all optional):
  handoff   {now, next, director_waiting}   replaced field by field
  cards     {"<id>": {status?, ev?, detail?, title?}}  merged into existing cards; unknown ids are added
            (then they need group and title too)
  log       ["line", ...]                   appended as {when, what}, stamped now
  scores    [{...}, ...]                    appended
  decisions ["line", ...]                   appended
"""

import datetime
import json
import re
import sys

PATH = 'docs/board.html'
TAG = re.compile(r'(<script type="application/json" id="board-data">)(.*?)(</script>)', re.S)

def main() -> None:
    patch = json.load(open(sys.argv[1], encoding='utf-8'))
    text = open(PATH, encoding='utf-8').read()
    m = TAG.search(text)
    data = json.loads(m.group(2))
    today = datetime.date.today().isoformat()
    now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
    data['updated'] = today
    data['handoff'].update(patch.get('handoff', {}))
    cards = {str(c['id']): c for c in data['cards']}
    for cid, fields in patch.get('cards', {}).items():
        if cid in cards:
            cards[cid].update(fields)
        else:
            data['cards'].append({'id': cid, **fields})
    data['log'].extend({'when': now, 'what': line} for line in patch.get('log', []))
    data['scores'].extend(patch.get('scores', []))
    data['decisions'].extend({'when': today, 'what': line} for line in patch.get('decisions', []))
    body = json.dumps(data, indent=1, ensure_ascii=False)
    out = text[:m.start(2)] + '\n' + body + '\n' + text[m.end(2):]
    open(PATH, 'w', encoding='utf-8', newline='\n').write(out)
    print('board updated:', len(patch.get('cards', {})), 'cards')

if __name__ == '__main__':
    main()
