"""Shared workspace format validation only; no network or workflow decisions."""
import json
import re
from pathlib import Path
SPECS = json.loads((Path(__file__).resolve().parents[2] / 'contracts/workspace-commands.json').read_text())


def parse_workspace_command(text, profile, bot_username=None):
    def bad(errors=None, command=None):
        result = {'valid': False, 'errors': errors or ['format atau profil workspace']}
        if command:
            result['command'] = command
        return result

    if not isinstance(text, str):
        return bad()
    head = re.match(r'^\s*/(assuren|b2b|replacement)(?:@([A-Za-z0-9_]{5,32}))?(?=\s|$)', text, re.I)
    if not head or (head[2] and head[2].lower() != (bot_username or '').lower()):
        return bad()
    command = head[1].lower()
    spec = SPECS[command]
    if spec['module'] != profile:
        return bad()
    if len(text) > 16384 or re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', text):
        return bad(['format pesan'], command)
    fields, errors = {}, []
    for line in text[head.end():].splitlines():
        if ':' not in line:
            continue
        label, value = line.split(':', 1)
        label = re.sub(r'\s*/\s*', '/', re.sub(r'\s+', ' ', label.strip()).upper())
        if label in ('NO INET', 'NO INTERNET', 'INET', 'TELP'):
            label = 'NO INET/TELP'
        if label == 'TIPE TRANSAKSI':
            label = 'TRANSAKSI'
        if label not in spec['required'] + spec['optional']:
            continue
        if label in fields:
            errors.append(label + ' berulang')
            continue
        fields[label] = value.strip()
    for name in spec['required']:
        if not fields.get(name) or fields[name] == '-':
            errors.append(name)
    for name, kind in spec.get('formats', {}).items():
        value = fields.get(name)
        if value is not None and value != '-' and not re.fullmatch(SPECS['_formats'][kind], value):
            errors.append(name + ' (format)')
    if errors:
        return bad(errors, command)
    for k in spec['optional']:
        fields[k] = fields.get(k) or None
    return {'valid': True, 'command': command, 'sc_in': fields['SC/IN'].upper(), 'fields': fields, 'original': text}
