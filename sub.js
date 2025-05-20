async function operator(proxies = [], targetPlatform, context) {
    const SUBS_KEY = 'subs';
    const $ = $substore;
    const { source } = context;

    if (source._collection)
        throw new Error('不支持组合订阅, 请在单条订阅中使用此脚本');

    // const plan = proxies .find((p) => /^当前等级/.test(p.name))?.name?.replace(/^当前等级(：|:)/, '') || '';
    const plan = proxies.find((p) => /^当前等级/.test(p.name))?.name || '';

    function convertToBytes(trafficStr) {
        const match = trafficStr.match(
            /预计可用[：:]\s*([\d,\.]+)\s*(B|KB|MB|GB|TB)/i,
        );
        if (!match) return '0';

        const [, value, unit] = match;
        const num = parseFloat(value.replace(/,/g, ''));
        const multipliers = {
            B: 1,
            KB: 1024,
            MB: 1024 * 1024,
            GB: 1024 * 1024 * 1024,
            TB: 1024 * 1024 * 1024 * 1024,
        };

        return (num * multipliers[unit]).toString();
    }

    const totalStr = proxies.find((p) => /^预计可用/.test(p.name))?.name || '';
    const total = convertToBytes(totalStr);

    const allSubs = $.read(SUBS_KEY) || [];
    for (const name in source) {
        const sub = source[name];
        if (sub.name && (sub.url || sub.content)) {
            // 确定是订阅
            for (var index = 0; index < allSubs.length; index++) {
                if (sub.name === allSubs[index].name) {
                    // 写入订阅流量信息
                    allSubs[
                        index
                    ].subUserinfo = `total=${total};plan_name=${encodeURIComponent(
                        plan,
                    )}`;
                    console.log(
                        `total=${total};plan_name=${encodeURIComponent(plan)}`,
                    );
                    break;
                }
            }
            break;
        }
    }
    $.write(allSubs, SUBS_KEY);

    return proxies;
}
