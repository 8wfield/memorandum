const $ = new Env("ouo机场签到");

let ouoEmail = "";
let ouoPwd = "";

!(async () => {
    if ($.isNode()) {
        console.log("当前为node.js环境");
        ouoEmail = process.env.ouoEmail || ouoEmail;
        ouoPwd = process.env.ouoPwd || ouoPwd;
    } else {
        console.log("当前为ios环境");
        ouoEmail = $.getdata("ouoEmail") || ouoEmail;
        ouoPwd = $.getdata("ouoPwd") || ouoPwd;
    }
    if (ouoEmail.length === 0 || ouoPwd.length === 0) {
        await sendMessage($.name, "你还没有设置邮箱和密码...");
    } else {
        const cookie = await getCookie();
        const option = {
            url: "https://login.ouonetwork.com/skyapi?action=checkin",
            headers: {
                Cookie: `lang=zh-cn; auth=${cookie}`,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
            },
        };

        const opt = await $.http.get(option);
        const body = JSON.parse(opt.body);
        console.log(body);

        let msg;

        if (body.data) {
            msg = `今天签到第${body.top}名，获得${body.data}MB流量`;
        } else if (body.message) {
            msg = "今天已经签过到了，请明天再来！";
        } else {
            msg = "签到请求出错了...请进官网手动尝试";
        }

        await sendMessage($.name, msg);
    }
})()
    .catch(async (e) => {
        $.logErr(e);
        await sendMessage($.name, e.message || e);
    })
    .finally(() => $.done());

async function getCookie() {
    const option = {
        url: `https://board.ouonet.work/api/?action=login&email=${ouoEmail}&password=${ouoPwd}`,
        headers: {
            Host: "board.ouonet.work",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
            Cookie: "lang=zh-cn; auth=no;",
        },
    };

    const opt = await $.http.get(option);
    const body = JSON.parse(opt.body);
    return body.data;
}

async function sendMessage(title = $.name, message, content = "", url = "") {
    if ($.isNode()) {
        const notify = require("./sendNotify");
        await notify.sendNotify(title, message, { url: url });
    } else {
        $.msg(title, message, content, { "open-url": url });
    }
}

function Env(t, e) {
    class s {
        constructor(t) {
            this.env = t;
        }
        send(t, e = "GET") {
            t = typeof t === "string" ? { url: t } : t;
            let s = this.get;
            if (e === "POST") s = this.post;
            return new Promise((e, i) => {
                s.call(this, t, (t, s, r) => {
                    if (t) i(t);
                    else e(s);
                });
            });
        }
        get(t) {
            return this.send.call(this.env, t);
        }
        post(t) {
            return this.send.call(this.env, t, "POST");
        }
    }
    return new (class {
        constructor(t, e) {
            this.name = t;
            this.http = new s(this);
            this.data = null;
            this.dataFile = "box.dat";
            this.logs = [];
            this.isMute = false;
            this.isNeedRewrite = false;
            this.logSeparator = "\n";
            this.encoding = "utf-8";
            this.startTime = new Date().getTime();
            Object.assign(this, e);
            this.log("", `🔔${this.name}, 开始!`);
        }
        isNode() {
            return typeof module !== "undefined" && !!module.exports;
        }
        isQuanX() {
            return typeof $task !== "undefined";
        }
        isSurge() {
            return typeof $httpClient !== "undefined" && typeof $loon === "undefined";
        }
        isLoon() {
            return typeof $loon !== "undefined";
        }
        isShadowrocket() {
            return typeof $rocket !== "undefined";
        }
        isStash() {
            return typeof $environment !== "undefined" && $environment["stash-version"];
        }
        toObj(t, e = null) {
            try {
                return JSON.parse(t);
            } catch {
                return e;
            }
        }
        toStr(t, e = null) {
            try {
                return JSON.stringify(t);
            } catch {
                return e;
            }
        }
        getjson(t, e) {
            let s = e;
            const i = this.getdata(t);
            if (i) {
                try {
                    s = JSON.parse(this.getdata(t));
                } catch {}
            }
            return s;
        }
        setjson(t, e) {
            try {
                return this.setdata(JSON.stringify(t), e);
            } catch {
                return false;
            }
        }
        getScript(t) {
            return new Promise((e) => {
                this.get({ url: t }, (t, s, i) => e(i));
            });
        }
        runScript(t, e) {
            return new Promise((s) => {
                let i = this.getdata("@chavy_boxjs_userCfgs.httpapi");
                i = i ? i.replace(/\n/g, "").trim() : i;
                let r = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");
                r = r ? 1 * r : 20;
                r = e && e.timeout ? e.timeout : r;
                const [o, h] = i.split("@");
                const n = {
                    url: `http://${h}/v1/scripting/evaluate`,
                    body: { script_text: t, mock_type: "cron", timeout: r },
                    headers: { "X-Key": o, Accept: "*/*" },
                };
                this.post(n, (t, e, i) => s(i));
            }).catch((t) => this.logErr(t));
        }
        loaddata() {
            if (!this.isNode()) return {};
            this.fs = this.fs ? this.fs : require("fs");
            this.path = this.path ? this.path : require("path");
            const t = this.path.resolve(this.dataFile);
            const e = this.path.resolve(process.cwd(), this.dataFile);
            const s = this.fs.existsSync(t);
            const i = !s && this.fs.existsSync(e);
            if (!s && !i) return {};
            const r = s ? t : e;
            try {
                return JSON.parse(this.fs.readFileSync(r));
            } catch (t) {
                return {};
            }
        }
        writedata() {
            if (!this.isNode()) return;
            this.fs = this.fs ? this.fs : require("fs");
            this.path = this.path ? this.path : require("path");
            const t = this.path.resolve(this.dataFile);
            const e = this.path.resolve(process.cwd(), this.dataFile);
            const s = this.fs.existsSync(t);
            const i = !s && this.fs.existsSync(e);
            const r = JSON.stringify(this.data);
            if (s) this.fs.writeFileSync(t, r);
            else if (i) this.fs.writeFileSync(e, r);
            else this.fs.writeFileSync(t, r);
        }
        lodash_get(t, e, s) {
            const i = e.replace(/\[(\d+)\]/g, ".$1").split(".");
            let r = t;
            for (const t of i) {
                r = Object(r)[t];
                if (r === undefined) return s;
            }
            return r;
        }
        lodash_set(t, e, s) {
            if (Object(t) !== t) return t;
            if (!Array.isArray(e)) e = e.toString().match(/[^.[\]]+/g) || [];
            e.slice(0, -1).reduce(
                (t, s, i) =>
                    Object(t[s]) === t[s]
                        ? t[s]
                        : (t[s] = Math.abs(e[i + 1]) >> 0 == +e[i + 1] ? [] : {}),
                t
            )[e[e.length - 1]] = s;
            return t;
        }
        getdata(t) {
            let e = this.getval(t);
            if (/^@/.test(t)) {
                const [, s, i] = /^@(.*?)\.(.*?)$/.exec(t);
                const r = s ? this.getval(s) : "";
                if (r) {
                    try {
                        const t = JSON.parse(r);
                        e = t ? this.lodash_get(t, i, "") : e;
                    } catch {
                        e = "";
                    }
                }
            }
            return e;
        }
        setdata(t, e) {
            let s = false;
            if (/^@/.test(e)) {
                const [, i, r] = /^@(.*?)\.(.*?)$/.exec(e);
                const o = this.getval(i);
                const h = i ? (o === "null" ? null : o || "{}") : "{}";
                try {
                    const e = JSON.parse(h);
                    this.lodash_set(e, r, t);
                    s = this.setval(JSON.stringify(e), i);
                } catch {
                    const o = {};
                    this.lodash_set(o, r, t);
                    s = this.setval(JSON.stringify(o), i);
                }
            } else {
                s = this.setval(t, e);
            }
            return s;
        }
        getval(t) {
            if (this.isSurge() || this.isLoon()) return $persistentStore.read(t);
            if (this.isQuanX()) return $prefs.valueForKey(t);
            if (this.isNode()) {
                this.data = this.loaddata();
                return this.data[t];
            }
            return (this.data && this.data[t]) || null;
        }
        setval(t, e) {
            if (this.isSurge() || this.isLoon()) return $persistentStore.write(t, e);
            if (this.isQuanX()) return $prefs.setValueForKey(t, e);
            if (this.isNode()) {
                this.data = this.loaddata();
                this.data[e] = t;
                this.writedata();
                return true;
            }
            return (this.data && (this.data[e] = t)) || null;
        }
        initGotEnv(t) {
            this.got = this.got ? this.got : require("got");
            this.cktough = this.cktough ? this.cktough : require("tough-cookie");
            this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar();
            if (t) {
                t.headers = t.headers ? t.headers : {};
                if (t.headers.Cookie === undefined && t.cookieJar === undefined) {
                    t.cookieJar = this.ckjar;
                }
            }
        }
        get(t, e = () => {}) {
            if (t.headers) {
                delete t.headers["Content-Type"];
                delete t.headers["Content-Length"];
            }
            if (this.isSurge() || this.isLoon()) {
                if (this.isSurge() && this.isNeedRewrite) {
                    t.headers = t.headers || {};
                    Object.assign(t.headers, { "X-Surge-Skip-Scripting": false });
                }
                $httpClient.get(t, (t, s, i) => {
                    if (!t && s) {
                        s.body = i;
                        s.statusCode = s.status;
                    }
                    e(t, s, i);
                });
            } else if (this.isQuanX()) {
                if (this.isNeedRewrite) {
                    t.opts = t.opts || {};
                    Object.assign(t.opts, { hints: false });
                }
                $task.fetch(t).then(
                    (t) => {
                        const { statusCode: s, statusCode: i, headers: r, body: o } = t;
                        e(null, { status: s, statusCode: i, headers: r, body: o }, o);
                    },
                    (t) => e(t)
                );
            } else if (this.isNode()) {
                let s = require("iconv-lite");
                this.initGotEnv(t);
                this.got(t)
                    .on("redirect", (t, e) => {
                        try {
                            if (t.headers["set-cookie"]) {
                                const s = t.headers["set-cookie"]
                                    .map(this.cktough.Cookie.parse)
                                    .toString();
                                if (s) this.ckjar.setCookieSync(s, null);
                                e.cookieJar = this.ckjar;
                            }
                        } catch (t) {
                            this.logErr(t);
                        }
                    })
                    .then(
                        (t) => {
                            const { statusCode: i, statusCode: r, headers: o, rawBody: h } = t;
                            const n = s.decode(h, this.encoding);
                            e(null, { status: i, statusCode: r, headers: o, rawBody: h, body: n }, n);
                        },
                        (t) => {
                            const { message: i, response: r } = t;
                            e(i, r, r && s.decode(r.rawBody, this.encoding));
                        }
                    );
            }
        }
        post(t, e = () => {}) {
            const s = t.method ? t.method.toLocaleLowerCase() : "post";
            if (t.body && t.headers && !t.headers["Content-Type"]) {
                t.headers["Content-Type"] = "application/x-www-form-urlencoded";
            }
            if (t.headers) delete t.headers["Content-Length"];
            if (this.isSurge() || this.isLoon()) {
                if (this.isSurge() && this.isNeedRewrite) {
                    t.headers = t.headers || {};
                    Object.assign(t.headers, { "X-Surge-Skip-Scripting": false });
                }
                $httpClient[s](t, (t, s, i) => {
                    if (!t && s) {
                        s.body = i;
                        s.statusCode = s.status;
                    }
                    e(t, s, i);
                });
            } else if (this.isQuanX()) {
                t.method = s;
                if (this.isNeedRewrite) {
                    t.opts = t.opts || {};
                    Object.assign(t.opts, { hints: false });
                }
                $task.fetch(t).then(
                    (t) => {
                        const { statusCode: s, statusCode: i, headers: r, body: o } = t;
                        e(null, { status: s, statusCode: i, headers: r, body: o }, o);
                    },
                    (t) => e(t)
                );
            } else if (this.isNode()) {
                let i = require("iconv-lite");
                this.initGotEnv(t);
                const { url: r, ...o } = t;
                this.got[s](r, o).then(
                    (t) => {
                        const { statusCode: s, statusCode: r, headers: o, rawBody: h } = t;
                        const n = i.decode(h, this.encoding);
                        e(null, { status: s, statusCode: r, headers: o, rawBody: h, body: n }, n);
                    },
                    (t) => {
                        const { message: s, response: r } = t;
                        e(s, r, r && i.decode(r.rawBody, this.encoding));
                    }
                );
            }
        }
        time(t, e = null) {
            const s = e ? new Date(e) : new Date();
            let i = {
                "M+": s.getMonth() + 1,
                "d+": s.getDate(),
                "H+": s.getHours(),
                "m+": s.getMinutes(),
                "s+": s.getSeconds(),
                "q+": Math.floor((s.getMonth() + 3) / 3),
                S: s.getMilliseconds(),
            };
            if (/(y+)/.test(t)) {
                t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length));
            }
            for (let e in i) {
                if (new RegExp("(" + e + ")").test(t)) {
                    t = t.replace(
                        RegExp.$1,
                        RegExp.$1.length === 1 ? i[e] : ("00" + i[e]).substr(("" + i[e]).length)
                    );
                }
-radio
            }
            return t;
        }
        msg(e = t, s = "", i = "", r) {
            const o = (t) => {
                if (!t) return t;
                if (typeof t === "string") {
                    if (this.isLoon()) return t;
                    if (this.isQuanX()) return { "open-url": t };
                    if (this.isSurge()) return { url: t };
                    return undefined;
                }
                if (typeof t === "object") {
                    if (this.isLoon()) {
                        let e = t.openUrl || t.url || t["open-url"];
                        let s = t.mediaUrl || t["media-url"];
                        return { openUrl: e, mediaUrl: s };
                    }
                    if (this.isQuanX()) {
                        let e = t["open-url"] || t.url || t.openUrl;
                        let s = t["media-url"] || t.mediaUrl;
                        let i = t["update-pasteboard"] || t.updatePasteboard;
                        return { "open-url": e, "media-url": s, "update-pasteboard": i };
                    }
                    if (this.isSurge()) {
                        let e = t.url || t.openUrl || t["open-url"];
                        return { url: e };
                    }
                }
            };
            if (!this.isMute) {
                if (this.isSurge() || this.isLoon()) {
                    $notification.post(e, s, i, o(r));
                } else if (this.isQuanX()) {
                    $notify(e, s, i, o(r));
                }
            }
            if (!this.isMuteLog) {
                let t = ["", "==============📢系统通知📢=============="];
                t.push(e);
                if (s) t.push(s);
                if (i) t.push(i);
                console.log(t.join("\n"));
                this.logs = this.logs.concat(t);
            }
        }
        log(...t) {
            if (t.length > 0) {
                this.logs = [...this.logs, ...t];
            }
            console.log(t.join(this.logSeparator));
        }
        logErr(t, e) {
            const s = !this.isSurge() && !this.isQuanX() && !this.isLoon();
            if (s) {
                this.log("", `❗️${this.name}, 错误!`, t.stack);
            } else {
                this.log("", `❗️${this.name}, 错误!`, t);
            }
        }
        wait(t) {
            return new Promise((e) => setTimeout(e, t));
        }
        done(t = {}) {
            const e = new Date().getTime();
            const s = (e - this.startTime) / 1000;
            this.log("", `🔔${this.name}, 结束! 🕛 ${s} 秒`);
            this.log();
            if (this.isSurge() || this.isQuanX() || this.isLoon()) {
                $done(t);
            } else if (this.isNode()) {
                process.exit(1);
            }
        }
    })(t, e);
}