# Supabase 配置步骤（可选——不配置则以纯游客模式运行）

1. 到 https://supabase.com 免费注册并新建一个项目（免费层即可）。
2. 打开项目的 SQL Editor，把本目录 `schema.sql` 的全部内容粘贴执行
   （建 profiles / match_history / card_sets / skin_packs 表 + RLS 策略 + card-faces 存储桶）。
3. 在 Project Settings → API 页面拿到：
   - Project URL
   - anon public key
4. 复制根目录 `.env.example` 为 `.env.local`（前端）与 `server/.env`（后端），填入：

   ```
   # client/.env.local（实际放根目录即可，Vite 会读取）
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...

   # server/.env
   # JWT 验证方式二选一：
   # ① 旧式对称密钥（Project Settings → API → JWT Settings → JWT Secret）
   SUPABASE_JWT_SECRET=你的-jwt-secret
   # ② 新式非对称密钥（Project Settings → API → JWT Signing Keys 页面有 JWKS URL）
   # SUPABASE_JWKS_URL=https://xxxx.supabase.co/auth/v1/.well-known/jwks.json
   ```

5. 重启 `npm run dev`。登录页会出现邮箱登录/注册；对局中上传的卡面照片会同步到云端。

## 不配置会怎样？

- 游戏完整可玩（昵称进入、联机、定制都用 localStorage）
- 无账号体系、无云端卡组/皮肤同步
- 服务器不校验 JWT（`server/.env` 无密钥时自动降级为游客模式）

## 免费额度参考（2026）

- Auth 5 万月活、数据库 500MB、存储 1GB、单文件 ≤50MB —— 对本项目绰绰有余
- 免费层项目约 1 周无请求会暂停，个人项目可在 Dashboard 手动恢复
- 图片变换（缩略图）是付费功能——本项目已在浏览器端 canvas 压缩，无需该服务
