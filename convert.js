const fs = require('fs');
const path = require('path');

function convertPluginToModule(pluginContent) {
    const lines = pluginContent.split('\n').map(line => line.trim()).filter(line => line);
    const outputLines = [];

    lines.forEach(line => {
        // 跳过 section headers
        if (line.startsWith('[') && line.endsWith(']')) {
            const section = line.slice(1, -1);
            if (section === 'Argument') return;
            return;
        }

        // 处理 Meta 部分，排除 system 和 loon_version
        if (line.startsWith('#!')) {
            const [key, value] = line.slice(2).split('=');
            if (key === 'system' || key === 'loon_version') return; // 跳过 system 和 loon_version
            const mappedKey = {
                'name': 'name',
                'desc': 'description',
                'openUrl': 'open_url',
                'author': 'author',
                'tag': 'tag',
                'homepage': 'homepage',
                'icon': 'icon',
                'date': 'date'
            }[key] || key;
            outputLines.push(`${mappedKey}:${value}`);
            return;
        }

        // 处理规则 (Rules)
        if (line.startsWith('DOMAIN,')) {
            const parts = line.split(',');
            const domain = parts[1].trim().replace(/<([^>]+)>/g, '$1');
            const policy = parts[2].trim();
            outputLines.push(`rules:`);
            outputLines.push(`  - domain: { match: ${domain}, policy: ${policy} }`);
        } else if (line.startsWith('URL-REGEX,')) {
            const parts = line.split(',');
            const regex = parts[1].trim().replace(/^"(.+)"$/, '$1');
            const policy = parts[2].trim();
            outputLines.push(`rules:`);
            outputLines.push(`  - url_regex: { match: "${regex}", policy: ${policy} }`);
        } else if (line.startsWith('AND,')) {
            const conditionsMatch = line.match(/AND,\(\((.+?)\),\((.+?)\)\),(.*)/);
            if (conditionsMatch) {
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
        }

        // 处理重写 (Rewrites)
        else if (line.includes('302') && !line.includes('mock-response-body')) {
            const [regex, target] = line.split('302');
            const regexMatch = regex.match(/^(.+)$/)[1].trim();
            const targetMatch = target.match(/^(.+)$/)[1].trim();
            outputLines.push(`rules:`);
            outputLines.push(`  - url_regex: { match: "${regexMatch}", rewrite: { status_code: 302, location: ${targetMatch} } }`);
        } else if (line.includes('mock-response-body')) {
            const regex = line.match(/^(.+?) mock-response-body/)[1].trim();
            const status = line.match(/status-code=(\d+)/)?.[1] || '200';
            const data = line.match(/data="(.+?)"/)?.[1] || '';
            outputLines.push(`map_locals:`);
            outputLines.push(`  - match: "${regex}"`);
            outputLines.push(`    status_code: ${status}`);
            outputLines.push(`    body: "${data}"`);
        } else if (line.includes('reject-dict')) {
            const regex = line.match(/^(.+?) reject-dict/)[1].trim();
            outputLines.push(`map_locals:`);
            outputLines.push(`  - match: "${regex}"`);
            outputLines.push(`    status_code: 200`);
            outputLines.push(`    body: "{}"`);
        } else if (line.includes('response-body-json-del')) {
            const regex = line.match(/^(.+?) response-body-json-del/)[1].trim();
            const field = line.match(/response-body-json-del (.+)$/)[1].trim();
            outputLines.push(`body_rewrites:`);
            outputLines.push(`  - response_jq:`);
            outputLines.push(`      match: "${regex}"`);
            outputLines.push(`      filter: del(.${field})`);
        } else if (line.includes('response-body-json-jq')) {
            const regex = line.match(/^(.+?) response-body-json-jq/)[1].trim();
            const jq = line.match(/'(.+?)'/)[1];
            outputLines.push(`body_rewrites:`);
            outputLines.push(`  - response_jq:`);
            outputLines.push(`      match: "${regex}"`);
            outputLines.push(`      filter: ${jq}`);
        }

        // 处理脚本 (Scripting)
        else if (line.startsWith('http-response')) {
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

        // 处理 MITM
        else if (line.startsWith('hostname =')) {
            const hosts = line.split('=')[1].trim().split(',').map(h => h.trim());
            outputLines.push(`mitm:`);
            outputLines.push(`  hostnames:`);
            outputLines.push(`    includes:`);
            hosts.forEach(host => outputLines.push(`      - ${host}`));
        }
    });

    return outputLines.join('\n');
}

function main() {
    const inputDir = path.join(process.cwd(), 'Loon', 'Plugin');
    const outputDir = path.join(process.cwd(), 'Egern', 'Module');

    console.log(`Input directory: ${inputDir}`);
    console.log(`Output directory: ${outputDir}`);

    if (!fs.existsSync(inputDir)) {
        console.error(`Input directory ${inputDir} does not exist.`);
        process.exit(1);
    }

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(`Created output directory: ${outputDir}`);
    }

    const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.plugin'));
    if (files.length === 0) {
        console.log(`No .plugin files found in ${inputDir}`);
        return;
    }

    files.forEach(file => {
        const inputPath = path.join(inputDir, file);
        const outputFile = path.join(outputDir, file.replace('.plugin', '.yaml'));

        const inputStat = fs.statSync(inputPath);
        let shouldConvert = true;
        if (fs.existsSync(outputFile)) {
            const outputStat = fs.statSync(outputFile);
            if (inputStat.mtime <= outputStat.mtime) {
                console.log(`${file} is up-to-date, skipping...`);
                shouldConvert = false;
            }
        }

        if (shouldConvert) {
            try {
                const content = fs.readFileSync(inputPath, 'utf8');
                const converted = convertPluginToModule(content);
                fs.writeFileSync(outputFile, converted);
                console.log(`Converted ${file} to ${path.basename(outputFile)}`);
            } catch (error) {
                console.error(`Failed to convert ${file}: ${error.message}`);
            }
        }
    });
}

main();