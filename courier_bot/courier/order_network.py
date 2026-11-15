"""Equipment fields must come from one consecutive labeled group."""
import re

def parse_network(body):
    lines, odps, groups, valins = body.splitlines(), [], [], []
    def read(index, label):
        m = re.fullmatch(r'\s*' + label + r'\s*:\s*(.*?)\s*', lines[index], re.I) if index < len(lines) else None
        return m[1] if m else None
    for i in range(len(lines)):
        valin = read(i, 'Valins ID')
        if valin and valin != '-': valins.append(valin)
        odp = read(i, r'(?:Summary ODP|ODP)')
        if odp and odp != '-': odps.append(re.sub(r'/(\d)(?=\D|$)', r'/0\1', odp))
        ip = read(i, 'IP OLT')
        if ip is not None:
            slot = read(i+1, 'Slot')
            port = read(i+2, 'Port') if slot is not None else None
            groups.append(dict(ip_olt=ip if re.fullmatch(r'(?:\d{1,3}\.){3}\d{1,3}', ip) and all(int(n)<=255 for n in ip.split('.')) else None, slot=slot if slot and re.fullmatch(r'\d+',slot) else None, port=port if port and re.fullmatch(r'\d+',port) else None))
    return dict(odp=odps[0] if len(odps)==1 else None, valins_id=valins[0] if len(valins)==1 else None, **(groups[0] if len(groups)==1 else dict(ip_olt=None,slot=None,port=None)))
