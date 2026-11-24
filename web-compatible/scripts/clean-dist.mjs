import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

// 清空 dist，避免已删除源文件留下的旧编译产物混进发行包
rmSync(fileURLToPath(new URL("../dist/", import.meta.url)), { recursive: true, force: true });
