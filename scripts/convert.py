import os
import re
import yaml
from yaml import SafeDumper

# 定义转换规则
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
    # 处理作者格式
    if '[' in value and ']' in value:
        authors = []
        for author in value.split(','):
            author = author.strip()
            name = author.split('[')[0].strip()
            url = author.split('[')[1].split(']')[0].strip()
            authors.append(f"{name}[{url}]")
        return ', '.join(authors)
    return value

def parse_line_to_yaml(line):
    """将单行转换为 YAML 格式，仅调整语法"""
    line = line.strip()
    if not line or line.startswith('#'):
        return None

    # 处理 AND 规则
    if line.startswith("AND"):
        conditions = re.findall(r'\((.*?)\)', line)
        policy = line.split(',')[-1].strip()
        rule = {"and": {"match": [], "policy": policy}}
        for condition in conditions:
            if "URL-REGEX" in condition:
                regex = condition.split(',')[1].strip().strip('"')
                rule["and"]["match"].append({"url_regex": {"match": regex}})
            elif "USER-AGENT" in condition:
                ua = condition.split(',')[1].strip().strip('"')
                rule["and"]["match"].append({"user_agent": {"match": ua}})
        return rule

    # 处理 DOMAIN 规则
    elif "DOMAIN" in line:
        parts = line.split(',')
        domain = parts[1].strip()
        policy = parts[2].strip() if len(parts) > 2 else "REJECT"
        return {"domain": {"match": domain, "policy": policy}}

    # 处理 reject-dict
    elif "reject-dict" in line:
        url = line.split('reject-dict')[0].strip()
        return {"url": {"match": url, "policy": "reject-dict"}}

    # 处理 response-body-json-del
    elif "response-body-json-del" in line:
        parts = line.split(' ', 1)
        url = parts[0].strip('^')
        keys = parts[1].split('response-body-json-del')[1].strip().split()
        return {"url": {"match": url, "response-body-json-del": keys}}

    # 处理 response-body-json-jq
    elif "response-body-json-jq" in line:
        parts = line.split(' ', 1)
        url = parts[0].strip('^')
        jq_filter = parts[1].split('response-body-json-jq')[1].strip()
        return {"url": {"match": url, "response-body-json-jq": jq_filter}}

    # 处理 http-response
    elif "http-response" in line:
        parts = line.split(',')
        url = parts[0].split(' ')[1].strip()
        script_path = parts[1].split('=')[1].strip()
        tag = parts[-1].split('=')[1].strip()
        return {
            "http_response": {
                "match": url,
                "script-path": script_path,
                "requires-body": True,
                "tag": tag
            }
        }

    return None

def convert_plugin_to_yaml(plugin_content):
    yaml_data = {}
    lines = plugin_content.splitlines()
    
    # 按类别存储内容，保留顺序
    meta_lines = []
    rules_lines = []
    scriptings_lines = []
    mitm_lines = []

    # 第一遍：按类别分组
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        if any(line.startswith(key) for key in CONVERSION_RULES):
            meta_lines.append(line)
        elif "hostname =" in line:
            mitm_lines.append(line)
        elif "http-response" in line:
            scriptings_lines.append(line)
        elif line.startswith("AND") or "DOMAIN" in line or "reject-dict" in line or "response-body-json-" in line:
            rules_lines.append(line)

    # 处理元信息
    for line in meta_lines:
        for key, new_key in CONVERSION_RULES.items():
            if line.startswith(key):
                yaml_data[new_key] = clean_value(line)

    # 处理 rules，保持原始顺序
    rules = []
    for line in rules_lines:
        parsed = parse_line_to_yaml(line)
        if parsed:
            rules.append(parsed)
    if rules:
        yaml_data['rules'] = rules

    # 处理 scriptings，保持原始顺序
    scriptings = []
    for line in scriptings_lines:
        parsed = parse_line_to_yaml(line)
        if parsed:
            scriptings.append(parsed)
    if scriptings:
        yaml_data['scriptings'] = scriptings

    # 处理 MITM
    if mitm_lines:
        hosts = mitm_lines[0].split('=')[1].strip().split(',')
        yaml_data['mitm'] = {'hostnames': {'includes': [host.strip() for host in hosts]}}

    return yaml_data

# 自定义 YAML Dumper 以保持顺序
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

                print(f"✅ 转换成功: {filename} → {yaml_filename}")
            except Exception as e:
                print(f"❌ 转换失败: {filename}，错误信息: {e}")

if __name__ == "__main__":
    main()