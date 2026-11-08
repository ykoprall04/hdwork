"""Pure validation; no workflow/status decision and no network at import."""
import json
import re
from pathlib import Path
SPEC = json.loads((Path(__file__).resolve().parents[2] / 'contracts' / 'b2c-commands.json').read_text())

def parse_command(text, profile, bot_username=None):
    def reject(fields): return {'valid': False, 'errors': fields}
    if not isinstance(text, str) or len(text) > 16384: return reject(['format'])
    head = re.match(r'^\s*/(order|config_psb|mo|req)(?:@([A-Za-z0-9_]{5,32}))?(?=\s|$)', text, re.I)
    if not head: return reject(['perintah'])
    if head[2] and (not bot_username or head[2].lower() != bot_username.lower()): return reject(['perintah'])
    command, body = head[1].lower(), text[head.end():]
    if profile not in ('TIAL1', 'TIAL2', 'SOLVER1') or (profile == 'SOLVER1' and command == 'order'):
        return reject(['perintah tidak diizinkan di grup ini'])
    if command == 'req':
        return {'valid': True, 'command': command, 'sc_in': None, 'fields': {}, 'request': body, 'original': text} if body.strip() else reject(['teks permintaan'])
    rule, fields, errors = SPEC[command], {}, []
    for line in body.splitlines():
        if ':' not in line: continue
        label, value = line.split(':', 1)
        label = re.sub(r'\s*/\s*', '/', re.sub(r'\s+', ' ', label.strip()).upper())
        if label == 'ORDER ID DSC': label = 'ORDER ID'
        if label not in rule['required'] + rule['optional']: continue
        if label in fields: errors.append(label + ' berulang')
        value = value.strip()
        fields[label] = value if value and value != '-' else None
    for name in rule['required']:
        if not fields.get(name): errors.append(name)
    if fields.get('SERVICE') and fields['SERVICE'].upper() not in ('1P','2P','3P','1P-VOICE'): errors.append('SERVICE')
    code = None
    if fields.get(rule['identity']):
        matches = re.findall(r'\b([A-Za-z0-9]+)-((?:PDA|AO|MO|DO)[A-Za-z0-9]*)(?=_|\s|$)', fields[rule['identity']].split('_')[0], re.I)
        if len(matches) == 1 and any(matches[0][1].upper().startswith(c) for c in rule['codes']):
            code = (matches[0][1] if command == 'mo' else matches[0][0] + '-' + matches[0][1])
        if not code or len(code) > 100: errors.append(rule['identity'] + ' (kode transaksi)')
    for name in rule['optional']: fields.setdefault(name, None)
    return reject(errors) if errors else {'valid': True, 'command': command, 'sc_in': code, 'fields': fields, 'original': text}
