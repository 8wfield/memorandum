async function operator(proxies) {
  // 第一步：统一处理每个 proxy 的显示名称
  // 格式：(子服名 - ) + 主服务器名
  for (const proxy of proxies) {
    const subPart = (proxy._subDisplayName || proxy._subName)
      ? (proxy._subDisplayName || proxy._subName) + ' - '
      : '';
    proxy.name = subPart + proxy.name;
  }

  // 第二步：按 “子服名 - 主服务器地区” 或 “主服务器地区” 分组并重命名
  const groups = {};

  for (const proxy of proxies) {
    // 现在 proxy.name 已经是处理后的格式，例如：
    // "生存 - 香港01"、 "生存 - 新加坡02"、 "香港03"（无子服）
    const match = proxy.name.match(/^(.+?)\s*-\s*(.+?)(\d*)$/);

    let key;

    if (match) {
      const leftPart = match[1].trim();      // 可能为子服名，如 "生存"
      const rightPart = match[2].trim();     // "香港01" 或 "香港"
      const digits = match[3];               // 结尾数字，如 "01"

      // 判断是否有子服名：如果原始 proxy 有 _subDisplayName 或 _subName，说明有子服
      if (proxy._subDisplayName || proxy._subName) {
        const subName = proxy._subDisplayName || proxy._subName;
        // 右边去掉结尾数字的部分作为地区+主服务器名
        const regionNamePart = rightPart.replace(/\d*$/, '').trim();
        key = `${subName} - ${regionNamePart}`;
      } else {
        // 无子服，直接用去掉结尾数字的完整名称作为 key
        const cleanName = proxy.name.replace(/\d*$/, '').trim();
        key = cleanName;
      }
    } else {
      // 完全无法匹配的节点，放入其他组
      key = '__others';
    }

    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(proxy);
  }

  // 第三步：对每个分组进行最终重命名
  const result = [];

  for (const key in groups) {
    const group = groups[key];

    if (key === '__others') {
      // 其他组保持原名不变
      result.push(...group);
      continue;
    }

    if (group.length === 1) {
      // 只有一个节点，直接使用分组 key 作为名称（已经是最简形式）
      group[0].name = key;
      result.push(group[0]);
    } else {
      // 多个节点，在 key 后追加序号 1,2,3...
      group.forEach((proxy, index) => {
        proxy.name = `${key}${index + 1}`;
        result.push(proxy);
      });
    }
  }

  return result;
}