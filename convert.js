const fs = require('fs');
const path = require('path');

function convertPluginToModule(pluginContent) {
    const lines = pluginContent.split('\n').map(line => line.trim()).filter(line => line);
    const outputLines = [];
    let currentSection = '';

    lines.forEach(line => {
        // Section headers
        if (line.startsWith('[') && line.endsWith(']')) {
            currentSection = line.slice(1, -1);
            if (currentSection === 'Argument') return; // 跳过 [Argument]
            outputLines.push(line); // 保留节标题
            return;
        }

        // Meta section
        if (line.startsWith('#!')) {
            const [key, value] = line.slice(2).split('=');
            const mappedKey = {
                'name': 'name',
                'desc': 'description',
                'openUrl': 'open_url',
                'author': 'author',
                'tag': 'tag',
                'system': 'system',
                'system_version': 'system_version',
                'loon_version': 'loon_version',
                'homepage': 'homepage',
                'icon': 'icon',
                'date': 'date'
            }[key] || key; // 如果未定义的字段，保留原样
            outputLines.push(`${mappedKey}: ${value}`);
            return;
        }

        // 根据不同 section 转换规则
        switch (currentSection) {
            case 'Rule': {
                if (line.startsWith('DOMAIN,')) {
                    const parts = line.split(',');
                    const domain = parts[1].trim().replace(/<([^>]+)>/g, '$1');
                    const policy = parts[2].trim();
                    outputLines.push(`rules:`);
                    outputLines.push(`  - domain: { match: ${domain}, policy: ${policy} }`);
                }
                else if (line.startsWith('URL-REGEX')) {
                    const parts = line.split(',');
                    const regex = parts[1].trim().replace(/^"(.+)"$/, '$1');
                    const policy = parts[2].trim();
                    outputLines.push(`rules:`);
                    outputLines.push(`  - url_regex: { match: "${regex}", policy: ${policy} }`);
                }
                else if (line.startsWith('AND,')) {
                    const conditionsMatch = line.match(/AND,\(\((.+?)\),\((.+?)\)\),(.*)/);
                    const cond1 = conditionsMatch[1];
                    const cond2 = conditionsMatch[2];
                    const policy = conditionsMatch[3].trim();
                    const cond1Parts = cond1.split(',').map(p => p.trim());
                    const cond2Parts = cond2.split(',').map(p => p.trim());
                    outputLines.push(`rules:`);
                    outputLines.push(`  - and:`);
                    outputLines.push(`      match:`);
                    if (cond1Parts[0] === 'URL-REGEX') {
                        outputLines.push(`        - { url_regex: "${cond1Parts[1].replace(/^"(.+)"$/, '$1')}" }`);
                    }
                    if (cond2Parts[0] === 'USER-AGENT') {
                        outputLines.push(`        - { user_agent: "${cond2Parts[1].replace(/^"(.+)"$/, '$1')}" }`);
                    }
                    outputLines.push(`      policy: ${policy}`);
                }
                else if (line.includes('302')) {
                    const [regex, target] = line.split('302');
                    const regexMatch = regex.match(/^(.+)$/)[1].trim();
                    const targetMatch = target.match(/^(.+)$/)[1].trim();
                    outputLines.push(`rules:`);
                    outputLines.push(`  - url_regex: { match: "${regexMatch}", rewrite: { status_code: 302, location: ${targetMatch} } }`);
                }
                break;
            }
            case 'Rewrite': {
                if (line.includes('mock-response-body')) {
                    const regex = line.match(/^(.+?) mock-response-body/)[1].trim();
                    const status = line.match(/status-code=(\d+)/)[1];
                    const data = line.match(/data="(.+?)"/)[1];
                    outputLines.push(`map_locals:`);
                    outputLines.push(`  - match: "${regex}"`);
                    outputLines.push(`    status_code: ${status}`);
                    outputLines.push(`    body: "${data}"`);
                }
                else if (line.includes('reject-dict')) {
                    const regex = line.match(/^(.+?) reject-dict/)[1].trim();
                    outputLines.push(`map_locals:`);
                    outputLines.push(`  - match: "${regex}"`);
                    outputLines.push(`    status_code: 200`);
                    outputLines.push(`    body: "{}"`);
                }
                else if (line.includes('response-body-json-del')) {
                    const regex = line.match(/^(.+?) response-body-json-del/)[1].trim();
                    const field = line.match(/response-body-json-del (.+)$/)[1].trim();
                    outputLines.push(`body_rewrites:`);
                    outputLines.push(`  - response_jq:`);
                    outputLines.push(`      match: "${regex}"`);
                    outputLines.push(`      filter: del(.${field})`);
                }
                else if (line.includes('response-body-json-jq')) {
                    const regex = line.match(/^(.+?) response-body-json-jq/)[1].trim();
                    const jq = line.match(/'(.+?)'/)[1];
                    outputLines.push(`body_rewrites:`);
                    outputLines.push(`  - response_jq:`);
                    outputLines.push(`      match: "${regex}"`);
                    outputLines.push(`      filter: ${jq}`);
                }
                break;
            }
            case 'Script': {
                if (line.startsWith('http-response')) {
                    const parts = line.split(',').reduce((acc, part) => {
                        const [key, value] = part.split('=');
                        acc[key.trim()] = value ? value.trim() : part.trim();
                        return acc;
                    }, {});
                    const regex = parts['http-response'].match(/^(.+)$/)[1];
                    const scriptPath = parts['script-path'];
                    const bodyRequired = parts['requires-body'] || 'true';
                    const binaryMode = parts['binary-body-mode'] || 'false';
                    const tag = parts['tag'];
                    const args = parts['argument'] || '';

                    outputLines.push(`scriptings:`);
                    outputLines.push(`  - http_response:`);
                    outputLines.push(`      name: "${tag}"`);
                    outputLines.push(`      match: "${regex}"`);
                    outputLines.push(`      script_url: ${scriptPath}`);
                    outputLines.push(`      update_interval: 86400`);
                    outputLines.push(`      timeout: 30`);
                    outputLines.push(`      max_size: 131072`);
                    outputLines.push(`      debug: false`);
                    outputLines.push(`      body_required: ${bodyRequired}`);
                    outputLines.push(`      binary_mode: ${binaryMode}`);
                    if (args) outputLines.push(`      argument: ${args}`);
                }
                break;
            }
            case 'MitM': {
                if (line.startsWith('hostname =')) {
                    const hosts = line.split('=')[1].trim().split(',').map(h => h.trim());
                    outputLines.push(`mitm:`);
                    outputLines.push(`  hostnames:`);
                    outputLines.push(`    includes:`);
                    hosts.forEach(host => outputLines.push(`      - ${host}`));
                }
                break;
            }
        }
    });

    return outputLines.join('\n');
}

function main() {
    const inputDir = 'Loon/Plugin';
    const outputDir = 'Egern/Module';
    
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.plugin'));
    
    files.forEach(file => {
        const content = fs.readFileSync(path.join(inputDir, file), 'utf8');
        const converted = convertPluginToModule(content);
        const outputFile = path.join(outputDir, file.replace('.plugin', '.yaml'));
        fs.writeFileSync(outputFile, converted);
        console.log(`Converted ${file} to ${path.basename(outputFile)}`);
    });
}

main();