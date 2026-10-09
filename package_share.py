"""Refresh the portable ZIP with only the files needed to run the simulator."""

import os
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


here = Path(__file__).resolve().parent
target = here.parent / "拼装模拟器-分享版.zip"
temporary = target.with_suffix(".zip.tmp")
runtime = ["index.html", "styles.css", "app.js", "engine.js", "data.js"]
runtime += [image.relative_to(here).as_posix() for image in sorted((here / "assets").rglob("*"))
            if image.is_file() and image.suffix.lower() in {".png", ".webp"}]
instructions = """拼装模拟器 · 分享版

1. 解压整个压缩包。
2. 双击 index.html，用浏览器打开。
3. 选择左侧新卡，点击“重新拼装”，再点击左右卡牌的一段描述。

主体只会抽到随从；左右组件可以是随从、法术、武器等卡牌。
拉夏使用14张牌的专属池，拼装结果显示为“阳炎耀光”被动英雄技能。

请保留 index.html、styles.css、app.js、engine.js、data.js 和 assets 文件夹在同一目录。
无需安装软件或联网；所有候选卡与来源卡的图片均已放在 assets 文件夹内。
已依据试玩服标签筛选组件和主体；4578 与主体或组件自带的回合结束效果互斥。其他标签规则仍需游戏内验证，不代表精确概率。
"""

with ZipFile(temporary, "w", ZIP_DEFLATED) as bundle:
    for relative in runtime:
        bundle.write(here / relative, relative)
    bundle.writestr("使用说明.txt", instructions)
os.replace(temporary, target)
print(f"Updated {target} ({len(runtime) + 1} files)")
