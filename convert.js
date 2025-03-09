const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function convertPluginToModule(pluginContent) {
    const result = {
        meta: {},
        rules: [],
        map_locals: [],
        body_rewrites: [],
        scriptings: [],
        mitm: { hostnames: { includes: [] } }
    };

    // Split content into lines
    const lines = pluginContent.split('\n');

    let currentSection = '';
    
    lines.forEach(line => {
        line = line.trim();
        if (!line) return;

        // Meta section
        if (line.startsWith('#!')) {
            const [key, value] = line.slice(2).split(' » ');
            switch(key) {
                case 'name': result.meta.name = value; break;
                case 'desc': result.meta.description = value; break;
                case 'lopenUrl': result.meta.open_url = value; break;
                case 'author': result.meta.author = value; break;
                case 'tag': result.meta.tag = value; break;
                case 'licon': result.meta.icon = value; break;
                case 'date': result.meta.date = value; break;
            }
        }
        // Section headers
        else if (line.startsWith('[') && line.endsWith(']')) {
            currentSection = line.slice(1, -1);
        }
        // Rules
        else if (currentSection === 'Rule') {
            if (line.startsWith('DOMAIN,')) {
                const domain = line.split(',')[1].trim();
                result.rules.push({
                    domain: { match: domain, policy: 'REJECT' }
                });
            }
            else if (line.startsWith('URL-REGEX')) {
                const regex = line.match(/<([^>]+)>/)[1];
                result.rules.push({
                    url_regex: { match: regex, policy: 'REJECT-DICT' }
                });
            }
            else if (line.startsWith('AND,')) {
                const conditions = line.match(/\(\((.+?)\),\((.+?)\)\)/);
                result.rules.push({
                    and: {
                        match: [conditions[1], conditions[2]],
                        policy: 'REJECT'
                    }
                });
            }
            else if (line.includes('302')) {
                const [regex, target] = line.split('302');
                result.rules.push({
                    url_regex: {
                        match: regex.match(/<([^>]+)>/)[1],
                        rewrite: {
                            status_code: 302,
                            location: target.match(/<([^>]+)>/)[1]
                        }
                    }
                });
            }
        }
        // Rewrite section
        else if (currentSection === 'Rewrite') {
            if (line.includes('mock-response-body')) {
                const regex = line.match(/<([^>]+)>/)[1];
                const status = line.match(/status-code=(\d+)/)[1];
                const data = line.match(/data="(.+?)"/)[1];
                result.map_locals.push({
                    match: regex,
                    status_code: parseInt(status),
                    body: data
                });
            }
            else if (line.includes('reject-dict')) {
                const regex = line.match(/<([^>]+)>/)[1];
                result.map_locals.push({
                    match: regex,
                    status_code: 200,
                    body: "0"
                });
            }
            else if (line.includes('response-body-json-del')) {
                const regex = line.match(/<([^>]+)>/)[1];
                const field = line.match(/json-del<([^>]+)>/)[1];
                result.body_rewrites.push({
                    response_jq: {
                        match: regex,
                        filter: `del(${field})`
                    }
                });
            }
            else if (line.includes('response-body-json-jq')) {
                const regex = line.match(/<([^>]+)>/)[1];
                const jq = line.match(/'([^']+)'/)[1];
                result.body_rewrites.push({
                    response_jq: {
                        match: regex,
                        filter: jq
                    }
                });
            }
        }
        // Script section
        else if (currentSection === 'Script') {
            if (line.startsWith('http-response')) {
                const regex = line.match(/<([^>]+)>/)[1];
                const scriptPath = line.match(/script-path=([^,]+)/)[1];
                const bodyRequired = line.match(/requires-body=(true|false)/)[1] === 'true';
                const binaryMode = line.match(/binary-body-mode=(true|false)/)[1] === 'true';
                const tag = line.match(/tag=([^,]+)/)[1];
                
                result.scriptings.push({
                    http_response: {
                        name: tag,
                        match: regex,
                        script_url: scriptPath,
                        update_interval: 86400,
                        timeout: 30,
                        max_size: 131072,
                        debug: false,
                        body_required: bodyRequired,
                        binary_mode: binaryMode
                    }
                });
            }
        }
        // MITM section
        else if (currentSection === 'MitM') {
            if (line.startsWith('hostname =')) {
                const hosts = line.split('=')[1].trim().split(',');
                result.mitm.hostnames.includes = hosts.map(h => h.trim());
            }
        }
    });

    return result;
}

function main() {
    const inputDir = 'Loon/Plugin';
    const outputDir = 'Egern/Moudle';
    
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.plugin'));
    
    files.forEach(file => {
        const content = fs.readFileSync(path.join(inputDir, file), 'utf8');
        const converted = convertPluginToModule(content);
        const outputFile = path.join(outputDir, file.replace('.plugin', '.yaml'));
        fs.writeFileSync(outputFile, yaml.dump(converted, { lineWidth: -1 }));
        console.log(`Converted ${file} to ${path.basename(outputFile)}`);
    });
}

main();
