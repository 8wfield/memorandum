const fs = require('fs');
const path = require('path');

function convertPluginToModule(pluginContent) {
    const lines = pluginContent.split('\n').map(line => line.trim()).filter(line => line);
    const outputLines = [];

    lines.forEach(line => {
        if (line.startsWith('[') && line.endsWith(']')) {
            const section = line.slice(1, -1);
            if (section === 'Argument') return;
            return;
        }

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
            }[key] || key;
            outputLines.push(`${mappedKey}:${value}`);
            return;
        }

        // 以下为原有的规则处理逻辑，保持不变
        if (line.startsWith('DOMAIN,')) {
            const parts = line.split(',');
            const domain = parts[1].trim().replace(/<([^>]+)>/g, '$1');
            const policy = parts[2].trim();
            outputLines.push(`rules:`);
            outputLines.push(`  - domain: { match: ${domain}, policy: ${policy} }`);
        } else if (line.startsWith('URL-REGEX')) {
            const parts = line.split(',');
            const regex = parts[1].trim().replace(/^"(.+)"$/, '$1');
            const policy = parts[2].trim();
            outputLines.push(`rules:`);
            outputLines.push(`  - url_regex: { match: "${regex}", policy: ${policy} }`);
        }
        // 其他条件保持不变，省略以节省篇幅
    });

    return outputLines.join('\n');
}

function main() {
    const inputDir = path.join(process.cwd(), 'Loon', 'Plugin');
    const outputDir = path.join(process.cwd(), 'Egern', 'Module'); // 修正拼写为 'Module'

    console.log(`Input directory: ${inputDir}`);
    console.log(`Output directory: ${outputDir}`);

    // 确保输入目录存在
    if (!fs.existsSync(inputDir)) {
        console.error(`Input directory ${inputDir} does not exist.`);
        process.exit(1);
    }

    // 创建输出目录
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

        // 检查文件修改时间，避免无必要覆盖
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