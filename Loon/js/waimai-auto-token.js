/*
 * 歪麦霸王餐 Token 自动获取
 * 触发条件：当用户打开歪麦 APP 并访问 `api.waimai.com/user/info` 时，自动获取 Token 并存储
 */

const tokenKey = "waimaiToken";

if ($request.headers) {
  let token = $request.headers["Authorization"] || $request.headers["authorization"];
  if (token) {
    $persistentStore.write(token, tokenKey);
    console.log("✅ 歪麦 Token 获取成功: " + token);
    $notification.post("歪麦 Token 更新成功", "", "已自动获取最新 Token");
  } else {
    console.log("⚠️ 未找到 Authorization 头部");
    $notification.post("歪麦 Token 获取失败", "", "未找到 Authorization 头部");
  }
} else {
  console.log("⚠️ 请求头不存在");
  $notification.post("歪麦 Token 获取失败", "", "请求头不存在");
}

$done();
