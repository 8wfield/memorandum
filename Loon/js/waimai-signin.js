/**
 * @name 歪麦霸王餐自动签到
 * @version 1.0
 * @description 每日自动签到，领取饭票
 */

const token = $persistentStore.read("waimai_token");  // 读取 Token

if (!token) {
    console.log("❌ 未找到 Token，请先手动抓取");
    $notification.post("歪麦霸王餐签到失败", "", "请检查 Token 获取功能是否开启");
    $done();
}

// 签到 API（假设为 /api/signin）
const signin_url = "https://api.waimai.com/signin";

const request = {
    url: signin_url,
    method: "POST",
    headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
    },
    body: JSON.stringify({ action: "checkin" })  // 可能需要调整
};

$httpClient.post(request, (error, response, data) => {
    if (error) {
        console.log("❌ 签到失败:", error);
        $notification.post("歪麦霸王餐签到失败", "", "网络请求失败");
    } else {
        const result = JSON.parse(data);
        if (result.success) {
            console.log("✅ 签到成功，获得饭票:", result.reward);
            $notification.post("歪麦霸王餐签到成功", "", `获得饭票: ${result.reward}`);
        } else {
            console.log("❌ 签到失败:", result.message);
            $notification.post("歪麦霸王餐签到失败", "", result.message);
        }
    }
    $done();
});
