const token = $request.headers["Authorization"];
if (token) {
    $persistentStore.write(token, "waimai_token");
    console.log("✅ Token 获取成功:", token);
    $notification.post("Token 获取成功", "", "已存入 Loon，可自动签到");
} else {
    console.log("❌ 未获取到 Token");
    $notification.post("Token 获取失败", "", "请检查抓包规则");
}
$done();
