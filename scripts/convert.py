import os
import re
import yaml
from yaml import SafeDumper

# 定义元信息转换规则
CONVERSION_RULES = {
    "#!name": "name",
    "#desc": "description",
    "#lopenUrl": "open_url",
    "#!author": "author",
    "#!tag": "tag",
    "#licon": "icon",
    "#!date": "date",
}

def clean_value(value):
    """清理值，去除多余的标记和格式化作者信息"""
    value = value.strip()
    if value.startswith('#'):
        value = value[1:].strip()
    if '»' in value:
        value = value.split('»')[-1].strip()
    if '[' in value and ']' in value:
        authors = []
        for author in value.split(','):
            author = author.strip()
            name = author.split('[')[0].strip()
            url = author.split('[')[1].split(']')[0].strip()
            authors.append(f"{name}[{url}]")
        return ', '.join(authors)
    return value

def parse_rule(line):
    """解析规则部分 [Rule]"""
    line = line.strip()
    if not line or line.startswith('#'):
        return None

    # DOMAIN
    if "DOMAIN" in line:
        parts = line.split(',')
        domain = parts[1].strip()
        policy = parts[2].strip() if len(parts) > 2 else "REJECT"
        return {"domain": {"match": domain, "policy": policy.upper()}}

    # URL-REGEX ... REJECT-DICT
    elif "URL-REGEX" in line and "REJECT-DICT" in line:
        regex = re.search(r'URL-REGEX,\s*"([^"]+)"', line).group(1)
        return {"url_regex": {"match": regex, "policy": "REJECT"}}

    # AND - 转换为脚本
    elif line.startswith("AND"):
        conditions = re.findall(r'\((.*?)\)', line)
        policy = line.split(',')[-1].strip().upper()
        script_content = []
        match_url = ".*"  # 默认匹配所有 URL
        for condition in conditions:
            if "URL-REGEX" in condition:
                regex = condition.split(',')[1].strip().strip('"')
                match_url = regex
                script_content.append(f'request.url.match(/{regex}/)')
            elif "USER-AGENT" in condition:
                ua = condition.split(',')[1].strip().strip('"')
                script_content.append(f'request.userAgent.match(/{ua}/)')
        if not script_content:
            return None
        script_logic = " && ".join(script_content)
        script_body = f"if ({script_logic}) {{ return {{ status: {(403 if policy == 'REJECT' else 200)} }} }}"
        return {
            "http_response": {
                "name": f"and_rule_{hash(line) % 1000}",
                "match": match_url,
                "script": script_body,
                "update_interval": 86400,
                "timeout": 30,
                "max_size": 131072,
                "debug": False,
                "body_required": False,
                "binary_mode": False
            }
        }

    # URL-REGEX ... 302
    elif "302" in line:
        regex = re.search(r'URL-REGEX,\s*"([^"]+)"', line)
        if regex:
            regex = regex.group(1)
            target = line.split('302')[-1].strip()
            return {
                "match": regex,
                "status_code": 302,
                "headers": {"Location": target}
            }, "map_locals"
    return None

def parse_rewrite(line):
    """解析重写部分 [Rewrite]"""
    line = line.strip()
    if not line or line.startswith('#'):
        return None, None

    # mock-response-body
    if "mock-response-body" in line:
        regex = line.split(' ')[0].strip()
        status_code = re.search(r'status-code=(\d+)', line)
        body = re.search(r'data="([^"]+)"', line)
        status_code = int(status_code.group(1)) if status_code else 200
        body = body.group(1) if body else ""
        return {"match": regex, "status_code": status_code, "body": body}, "map_locals"

    # reject-dict
    elif "reject-dict" in line:
        url = line.split('reject-dict')[0].strip()
        return {"match": url, "status_code": 200, "body": "{}"}, "map_locals"

    # response-body-json-del
    elif "response-body-json-del" in line:
        parts = line.split(' ', 1)
        url = parts[0].strip('^')
        fields = parts[1].split('response-body-json-del')[1].strip().split()
        return {"response_jq": {"match": url, "filter": f"del({' '.join(fields)})"}}, "body_rewrites"

    # response-body-json-jq
    elif "response-body-json-jq" in line:
        parts = line.split(' ', 1)
        url = parts[0].strip('^')
        jq_filter = parts[1].split('response-body-json-jq')[1].strip().strip("'")
        return {"response_jq": {"match": url, "filter": jq_filter}}, "body_rewrites"

    return None, None

def parse_script(line):
    """解析脚本部分 [Script]"""
    if "http-response" in line:
        parts = line.split(',')
        url = parts[0].split(' ')[1].strip()
        script_path = parts[1].split('=')[1].strip()
        requires_body = "requires-body=true" in line
        binary_mode = "binary-body-mode=true" in line
        tag = parts[-1].split('=')[1].strip() if "tag=" in line else f"script_{hash(url) % 100}"
        return {
            "http_response": {
                "name": tag,
                "match": url,
                "script_url": script_path,
                "update_interval": 86400,
                "timeout": 30,
                "max_size": 131072,
                "debug": False,
                "body_required": requires_body,
                "binary_mode": binary_mode
            }
        }
    return None

def convert_plugin_to_yaml(plugin_content):
    yaml_data = {}
    lines = plugin_content.splitlines()
    
    meta_lines = []
    rules_lines = []
    rewrite_lines = []
    script_lines = []
    mitm_lines = []

    for line in lines:
        line = line.strip()
        if not line:
            continue
        if any(line.startswith(key) for key in CONVERSION_RULES):
            meta_lines.append(line)
        elif "hostname =" in line:
            mitm_lines.append(line)
        elif "http-response" in line:
            script_lines.append(line)
        elif "mock-response-body" in line or "reject-dict" in line or "response-body-json-" in line:
            rewrite_lines.append(line)
        elif line.startswith("AND") or "DOMAIN" in line or "URL-REGEX" in line:
            rules_lines.append(line)

    # 元信息
    for line in meta_lines:
        for key, new_key in CONVERSION_RULES.items():
            if line.startswith(key):
                yaml_data[new_key] = clean_value(line)

    # 规则
    rules = []
    map_locals_from_rules = []
    for line in rules_lines:
        parsed = parse_rule(line)
        if isinstance(parsed, tuple):  # 302 重定向
            map_locals_from_rules.append(parsed[0])
        elif parsed:
            if "http_response" in parsed:
                yaml_data.setdefault("scriptings", []).append(parsed)
            else:
                rules.append(parsed)
    if rules:
        yaml_data["rules"] = rules
    if map_locals_from_rules:
        yaml_data.setdefault("map_locals", []).extend(map_locals_from_rules)

    # 重写
    map_locals = []
    body_rewrites = []
    for line in rewrite_lines:
        parsed, section = parse_rewrite(line)
        if parsed and section == "map_locals":
            map_locals.append(parsed)
        elif parsed and section == "body_rewrites":
            body_rewrites.append(parsed)
    if map_locals:
        yaml_data.setdefault("map_locals", []).extend(map_locals)
    if body_rewrites:
        yaml_data["body_rewrites"] = body_rewrites

    # 脚本
    for line in script_lines:
        parsed = parse_script(line)
        if parsed:
            yaml_data.setdefault("scriptings", []).append(parsed)

    # MITM
    if mitm_lines:
        hosts = mitm_lines[0].split('=')[1].strip().split(',')
        yaml_data["mitm"] = {"hostnames": {"includes": [host.strip() for host in hosts]}}

    return yaml_data

class OrderedDumper(SafeDumper):
    pass

def represent_dict_order(self, data):
    return self.represent_mapping('tag:yaml.org,2002:map', data.items())

OrderedDumper.add_representer(dict, represent_dict_order)

def main():
    plugin_dir = "Loon/Plugin/"
    yaml_dir = "Egern/Module/"
    os.makedirs(yaml_dir, exist_ok=True)

    for filename in os.listdir(plugin_dir):
        if filename.endswith(".plugin"):
            plugin_path = os.path.join(plugin_dir, filename)
            yaml_filename = filename.replace('.plugin', '.yaml')
            yaml_path = os.path.join(yaml_dir, yaml_filename)

            try:
                with open(plugin_path, 'r', encoding='utf-8') as f:
                    plugin_content = f.read()

                yaml_data = convert_plugin_to_yaml(plugin_content)

                with open(yaml_path, 'w', encoding='utf-8') as f:
                    yaml.dump(yaml_data, f, Dumper=OrderedDumper, allow_unicode=True, default_flow_style=False, indent=2)

                print(f"✅ Converted: {filename} → {yaml_filename}")
            except Exception as e:
                print(f"❌ Failed to convert: {filename}, Error: {str(e)}")

if __name__ == "__main__":
    main()