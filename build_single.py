#!/usr/bin/env python3
# 从模块化源码重建单文件分发版 模拟球员-单文件版.html
# 规则（复现原始构建）：
#   - style.css 内联进 <style>
#   - HTML 内 <img src="assets/x.webp"> 换成 data URI
#   - 脚本前置 PLAYER_ASSETS(base64) 映射，并把 app.js 里的 "assets/x.webp" 换成 PLAYER_ASSETS["assets/x.webp"]
# 只打包被 index.html / app.js 实际引用的图片。
import base64, re, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent
index = (ROOT / "index.html").read_text(encoding="utf-8")
style = (ROOT / "style.css").read_text(encoding="utf-8")
app = (ROOT / "app.js").read_text(encoding="utf-8")

def data_uri(name: str) -> str:
    suffix = pathlib.Path(name).suffix.lower()
    mime = {".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}.get(suffix, "application/octet-stream")
    return f"data:{mime};base64," + base64.b64encode((ROOT / name).read_bytes()).decode("ascii")

# 收集被引用的图片
refs = sorted(set(re.findall(r'assets/[\w-]+\.(?:webp|png|jpg|jpeg)', index + app)))
uris = {a: data_uri(a) for a in refs if (ROOT / a).exists()}

# 1) 样式内联
html = index.replace('<link rel="stylesheet" href="style.css">', "<style>\n" + style + "\n</style>")

# 2) HTML 内 <img>/<link> 的 assets 路径换 data URI
for a, uri in uris.items():
    html = html.replace(a, uri)  # 在 HTML 段落里，assets/x 只出现在 src/href

# 3) 脚本：PLAYER_ASSETS 前置 + app.js 里字面量替换
player_assets = "const PLAYER_ASSETS = Object.freeze({" + ",".join('"%s":"%s"' % (a, uris[a]) for a in uris) + "});\n"
app_t = re.sub(r'"(assets/[\w-]+\.(?:webp|png|jpg|jpeg))"', r'PLAYER_ASSETS["\1"]', app)
html = html.replace('<script src="app.js"></script>', "<script>\n" + player_assets + app_t + "\n</script>")

out = ROOT / "模拟球员-单文件版.html"
out.write_text(html, encoding="utf-8")
remaining = re.findall(r'src="assets/[\w-]+\.(?:webp|png|jpg|jpeg)"', html)
print("已生成:", out.name, "| %.0f KB" % (out.stat().st_size/1024))
print("  内联图片:", len(uris), "->", ", ".join(uris))
print("  残留未内联 src=assets:", len(remaining), "(应0)")
print("  PLAYER_ASSETS:", "const PLAYER_ASSETS" in html, "| 含丰富事件:", "铁丝网外面站着两个人" in html)
if remaining: sys.exit(1)
