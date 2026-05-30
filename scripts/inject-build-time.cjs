const fs = require("fs");
const t = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

let html = fs.readFileSync("index.html", "utf8");

// Remove any old build timestamp divs
html = html.replace(
  /<div[^>]*data-build-stamp[^>]*>[^<]*<\s*\/\s*div>/gi,
  ""
);

html = html.replace(
  "</body>",
  `<div data-build-stamp style="text-align:center;color:#9ca3af;font-size:11px;padding:2px 0;position:fixed;bottom:0;left:0;right:0;background:#fff;z-index:9999;border-top:1px solid #e5e7eb">Build: ${t}</div></body>`
);

fs.writeFileSync("index.html", html);
console.log("Build timestamp injected:", t);
