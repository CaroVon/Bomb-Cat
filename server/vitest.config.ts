import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 顺序执行测试文件：计时器测试会覆盖 GameRoom.turnTimeoutMs 静态字段，
    // 并行/共享模块图时会污染其他用例（isolate 默认开启，顺序跑即可隔离）。
    fileParallelism: false,
  },
});
