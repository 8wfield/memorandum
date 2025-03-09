import os
import re
import yaml
from urllib.parse import quote

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

def parse_and_rule(line):
    """解析 AND 规则为嵌套结构"""
    # 提取 AND 规则中的条件和策略
    conditions = re.findall(r'\((.*?)\)', line)
    policy = line.split(',')[-1].strip()
    
    and_rule = {"and": {"match": [], "policy": policy}}
    for condition in conditions:
        if "URL-REGEX" in condition:
            regex = condition.split(',')[1].strip().strip('"')
            and_rule["and"]["match"].append({"url_regex": {"match": regex}})
        elif "USER-AGENT" in condition:
            ua = condition.split(',')[1].strip().strip('"')
            and_rule["and"]["match"].append({"user_agent": {"match": ua}})
    return and_rule

def parse_domain_rule(line):
    """解析 DOMAIN 规则"""
    parts = line.split(',')
    domain = parts[1].strip()
    policy = parts[2].strip() if len(parts) > 2 else "REJECT"
    return {"domain": {"match": domain, "policy": policy}}

def parse_map_local(line):
    """解析 reject-dict 为 map_locals"""
    url = line.split('reject-dict')[0].strip()
    return {"match": url, "status_code": 200, "body": "{}"}

def parse_body_rewrite(line, is_jq=False):
    """解析 response-body-json-del 或 response-body-json-jq"""
    parts = line.split(' ', 1)
    url = parts[0].strip('^')
    if is_jq:
        jq_filter = parts[1].split('response-body-json-jq')[1].strip()
        args = quote(f'[["jq","{jq_filter}"]]')
    else:
        keys = parts[1].split('response-body-json-del')[1].strip().split()
        args = quote(f'[["json-del",{str(keys)}]]')
    
    return {
        "http_response": {
            "name": f"body_rewrite_{hash(url) % 100}",  # 生成唯一名称
            "match": url,
            "script_url": "https://raw.githubusercontent.com/Script-Hub-Org/Script-Hub/main/scripts/body-rewrite.js",
            "arguments": {"_compat.$argument": args},
            "timeout": 30,
            "body_required": True
        }
    }

def convert_plugin_to_yaml(plugin_content):
    yaml_data = {}

    # 解析元信息
    for line in plugin_content.splitlines():
        line = line.strip()
        for key, new_key in CONVERSION_RULES.items():
            if line.startswith(key):
                yaml_data[new_key] = clean_value(line)

    # 解析规则部分
    rules = []
    map_locals = []
    scriptings = []

    for line in plugin_content.splitlines():
        line = line.strip()
        if not line:
            continue

        # 处理 AND 规则
        if line.startswith("AND"):
            rules.append(parse_and_rule(line))
        # 处理 DOMAIN 规则
        elif "DOMAIN" in line:
            rules.append(parse_domain_rule(line))
        # 处理 reject-dict
        elif "reject-dict" in line:
            map_locals.append(parse_map_local(line))
        # 处理 response-body-json-del
        elif "response-body-json-del" in line:
            scriptings.append(parse_body_rewrite(line))
        # 处理 response-body-json-jq
        elif "response-body-json-jq" in line:
            scriptings.append(parse_body_rewrite(line, is_jq=True))
        # 处理 http-response
        elif "http-response" in line:
            parts = line.split(',')
            url = parts[0].split(' ')[1].strip()
            script_path = parts[1].split('=')[1].strip()
            tag = parts[-1].split('=')[1].strip()
            scriptings.append({
                "http_response": {
                    "name": tag,
                    "match": url,
                    "script_url": script_path,
                    "body_required": True
                }
            })

    # 处理 MITM
    mitm_list = re.findall(r'hostname\s*=\s*(.+)', plugin_content)
    if mitm_list:
        hosts = mitm_list[0].split(',')
        yaml_data['mitm'] = {'hostnames': {'includes': [host.strip() for host in hosts]}}

    # 添加清理后的 description 和 icon（示例值）
    yaml_data['description'] = "移除开屏广告、底栏多多视频、会场入口、聊天页面精选推荐及推广，精简首页和个人中心。"
    yaml_data['icon'] = "https://raw.githubusercontent.com/luestr/IconResource/main/App_icon/120px/PinDuoDuo.png"
    yaml_data['open_url'] = "https://apps.apple.com/app/id1044283059"

    # 合并结果
    if rules:
        yaml_data['rules'] = rules
    if map_locals:
        yaml_data['map_locals'] = map_locals
    if scriptings:
        yaml_data['scriptings'] = scriptings

    return yaml_data

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
                    yaml.dump(yaml_data, f, allow_unicode=True, default_flow_style=False, indent=2)

                print(f"✅ 转换成功: {filename} → {yaml_filename}")
            except Exception as e:
                print(f"❌ 转换失败: {filename}，错误信息: {e}")

if __name__ == "__main__":
    main()