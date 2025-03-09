import os
import re
import yaml

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

RULES_SECTION = {
    "DOMAIN": "rules",
    "URL-REGEX": "rules",
    "AND": "rules",
    "302": "rules",
    "mock-response-body": "map_locals",
    "reject-dict": "map_locals",
    "response-body-json-del": "body_rewrites",
    "response-body-json-jq": "body_rewrites",
}

SCRIPT_SECTION = {
    "http-response": "scriptings"
}

MITM_SECTION = {
    "hostname": "mitm"
}

def convert_plugin_to_yaml(plugin_content):
    yaml_data = {}
    
    # 解析元信息
    for line in plugin_content.splitlines():
        for key, new_key in CONVERSION_RULES.items():
            if line.startswith(key):
                yaml_data[new_key] = line.split('»')[-1].strip()

    # 解析规则部分
    rules = []
    for line in plugin_content.splitlines():
        for key, section in RULES_SECTION.items():
            if key in line:
                rules.append(line.strip())
    if rules:
        yaml_data['rules'] = rules

    # 解析脚本部分
    scripts = []
    for line in plugin_content.splitlines():
        for key, section in SCRIPT_SECTION.items():
            if key in line:
                scripts.append(line.strip())
    if scripts:
        yaml_data['scriptings'] = scripts

    # 解析 MITM 部分
    mitm_list = []
    for line in plugin_content.splitlines():
        if "hostname =" in line:
            mitm_list = line.split('=')[-1].strip().split(',')
    if mitm_list:
        yaml_data['mitm'] = {'hostnames': {'includes': mitm_list}}

    return yaml_data

def main():
    plugin_dir = "Loon/Plugin/"
    yaml_dir = "Egern/Module/"
    os.makedirs(yaml_dir, exist_ok=True)

    for filename in os.listdir(plugin_dir):
        if filename.endswith(".plugin"):
            with open(os.path.join(plugin_dir, filename), 'r', encoding='utf-8') as f:
                plugin_content = f.read()

            yaml_data = convert_plugin_to_yaml(plugin_content)
            yaml_filename = filename.replace('.plugin', '.yaml')

            with open(os.path.join(yaml_dir, yaml_filename), 'w', encoding='utf-8') as f:
                yaml.dump(yaml_data, f, allow_unicode=True, default_flow_style=False)

if __name__ == "__main__":
    main()
