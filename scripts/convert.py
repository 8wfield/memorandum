import re
import yaml
import os
import sys
from pathlib import Path

# 增强正则表达式处理
def sanitize_regex(pattern):
    special_chars = r'\.*+?^${}()|[]'
    return ''.join([f'\\{c}' if c in special_chars else c for c in pattern])

# 复合规则解析器
def parse_complex_rule(line):
    # AND逻辑处理[1](@ref)
    if 'AND.' in line:
        conditions = re.findall(r'\(([^)]+)\)', line)
        return {
            'logical': {
                'and': [{'match': cond.strip()} for cond in conditions],
                'policy': 'REJECT'.lower()
            }
        }
    # 302重定向处理
    elif '302' in line:
        regex, target = re.search(r'<(.+?)>302<(.+?)>', line).groups()
        return {
            'url_regex': {
                'match': sanitize_regex(regex),
                'rewrite': {'status_code': 302, 'location': target}
            }
        }
    return None

def parse_loon(content):
    sections = {
        'meta': {},
        'rules': [],
        'rewrites': {'map_locals': [], 'body_rewrites': []},
        'scriptings': [],
        'mitm': {'hostnames': {'includes': []}}
    }
    
    current_section = None
    
    for line in content.split('\n'):
        line = line.strip()
        if not line: continue
        
        # 段落检测
        if line.startswith('['):
            current_section = line.strip('[]').lower()
            continue
            
        # 元信息处理
        if line.startswith('#!'):
            key, _, value = line[2:].partition('»')
            key = key.strip().lower()
            if key == 'tag':
                sections['meta']['tags'] = [t.strip() for t in value.split(',')]
            else:
                sections['meta'][key] = value.strip()
            continue
                
        # 规则解析增强
        if current_section == 'rule':
            # 复合规则处理
            if complex_rule := parse_complex_rule(line):
                sections['rules'].append(complex_rule)
                continue
                
            # DOMAIN规则（支持REJECT-DICT）[1](@ref)
            domain_pattern = re.compile(r'DOMAIN\s*,\s*"?([^",]+)"?\s*,\s*(REJECT|REJECT-DICT)')
            if match := domain_pattern.match(line):
                sections['rules'].append({
                    'domain': {
                        'match': match[1].strip(),
                        'policy': match[2].lower().replace('-', '_')
                    }
                })
            
            # URL-REGEX规则
            elif 'URL-REGEX' in line:
                regex = re.search(r'<(.+?)>', line).group(1)
                sections['rules'].append({
                    'url_regex': {
                        'match': sanitize_regex(regex),
                        'policy': 'reject_dict'
                    }
                })
        
        # 重写规则处理（支持网易蜗牛案例）[1](@ref)
        elif current_section == 'rewrite':
            if 'mock-response-body' in line:
                match = re.search(r'<(.+?)>.*status-code=(\d+).*data="(.+?)"', line)
                if match:
                    sections['rewrites']['map_locals'].append({
                        'match': sanitize_regex(match[1]),
                        'status_code': int(match[2]),
                        'body': match[3]
                    })
            elif 'response-body-json-del' in line:
                field = re.search(r'<(.+?)>', line).group(1)
                sections['rewrites']['body_rewrites'].append({
                    'response_jq': {
                        'match': sanitize_regex('<1M>'),
                        'filter': f'del(.{field})'
                    }
                })
        
        # MITM处理（支持主机名列表）[1](@ref)
        elif current_section == 'mitm':
            if 'hostname' in line:
                hosts = re.search(r'=([^»]+)', line).group(1).split(',')
                sections['mitm']['hostnames']['includes'] = [h.strip() for h in hosts]

    return sections

# YAML生成优化
def generate_egern_yaml(data):
    yaml.add_representer(dict, lambda dumper, data: dumper.represent_mapping(
        'tag:yaml.org,2002:map', data.items(), flow_style=False))
    
    # 清理空值
    def clean_nulls(d):
        if isinstance(d, dict):
            return {k: clean_nulls(v) for k, v in d.items() if v not in (None, [], {})}
        return d
    
    return yaml.dump(clean_nulls({
        'name': data['meta'].get('name', 'Unnamed'),
        'author': data['meta'].get('author', 'Unknown'),
        'desc': data['meta'].get('description', ''),
        'rules': data['rules'],
        'rewrites': data['rewrites'],
        'scriptings': data['scriptings'],
        'mitm': data['mitm']
    }), allow_unicode=True, sort_keys=False)

def convert_file(input_path, output_path):
    with open(input_path, 'r') as f:
        data = parse_loon(f.read())
    
    with open(output_path, 'w') as f:
        f.write(generate_egern_yaml(data))

if __name__ == '__main__':
    input_dir, output_dir = Path(sys.argv[1]), Path(sys.argv[2])
    output_dir.mkdir(exist_ok=True)
    
    for input_file in input_dir.glob('*.conf'):
        output_file = output_dir / f'{input_file.stem}.yaml'
        convert_file(input_file, output_file)
        print(f'Converted {input_file.name} => {output_file.name}')
