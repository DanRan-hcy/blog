---
inclusion: always
---

# AI 开发规则

本文档定义了该 VitePress 博客项目的 AI 辅助开发规范和最佳实践。

## 项目概述

这是一个基于 VitePress 和 @sugarat/theme 的个人博客项目，使用 pnpm 作为包管理器。

### 技术栈
- **框架**: VitePress 1.6.3
- **主题**: @sugarat/theme ^0.5.4
- **UI 库**: Element Plus ^2.7.2
- **包管理器**: pnpm
- **部署**: GitHub Pages + GitHub Actions
- **语言**: TypeScript, Vue 3.5.12

## 项目结构规范

### 目录组织
```
docs/
├── .vitepress/          # VitePress 配置目录
│   ├── config.mts       # 主配置文件
│   ├── blog-theme.ts    # 博客主题配置
│   └── theme/           # 自定义主题
│       ├── index.ts     # 主题入口
│       ├── style.scss   # 自定义样式
│       └── assets/      # 主题资源
├── posts/               # 博客文章目录
│   └── daily/           # 开发日常分类
│       ├── index.md     # 分类首页
│       └── php/         # PHP 相关文章
├── public/              # 静态资源
├── index.md             # 首页
└── about.md             # 关于页面
```

### 文章组织规则
- 所有文章放在 `docs/posts/` 目录下
- 按照技术分类创建子目录（如 `daily/php/`, `daily/javascript/`）
- 每个分类目录需要有 `index.md` 作为导航页
- 文章文件名使用小写字母和连字符（kebab-case）

## 开发命令

### 必须使用的命令
```bash
# 安装依赖（首次或依赖变更时）
pnpm install

# 本地开发（启动开发服务器）
pnpm dev

# 构建生产版本
pnpm build

# 预览构建产物
pnpm serve
```

### 命令使用规则
- **禁止使用 npm 或 yarn**，必须使用 pnpm
- 开发时使用 `pnpm dev`，不要使用 `vitepress dev docs`
- 构建前确保所有依赖已正确安装

## 文章编写规范

### Front Matter 必填字段
每篇文章必须包含以下 Front Matter：

```yaml
---
title: 文章标题
date: YYYY-MM-DD
tags:
  - 标签1
  - 标签2
category:
  - 分类名称
---
```

### 可选字段
```yaml
sticky: 1              # 置顶优先级（数字越大越靠前）
readingTime: true      # 显示阅读时间
description: 文章描述  # SEO 描述
hidden: true           # 隐藏文章（不在列表显示）
```

### 文章结构建议
1. 使用一级标题作为文章主标题
2. 使用二级、三级标题组织内容（会显示在目录中）
3. 代码块必须指定语言类型
4. 重要概念使用加粗或代码标记
5. 添加参考资料链接

### 代码示例规范
```markdown
\`\`\`php
// PHP 代码示例
declare(strict_types=1);

namespace App\Example;

class Example
{
    // 代码内容
}
\`\`\`
```

## 配置文件修改规则

### config.mts 配置规范

#### Base 路径配置
- 如果部署到 `username.github.io`，使用 `base: '/'`
- 如果部署到 `username.github.io/repo-name`，使用 `base: '/repo-name/'`
- 当前项目使用：`base: '/blog/'`

#### 导航栏配置
```typescript
nav: [
  { text: '首页', link: '/' },
  { text: '分类名称', link: '/posts/category/' },
  { text: '关于我', link: '/about' },
]
```

#### 侧边栏配置
- 为每个文章分类配置侧边栏
- 使用 `collapsed: false` 默认展开
- 保持层级结构清晰

```typescript
sidebar: {
  '/posts/daily/': [
    {
      text: '开发日常',
      items: [
        {
          text: '技术分类',
          collapsed: false,
          items: [
            { text: '文章标题', link: '/posts/daily/category/article' }
          ]
        }
      ]
    }
  ]
}
```

### 主题配置规范
- 评论系统使用 Giscus
- 保持现有的评论配置不变
- 修改主题色时编辑 `theme/user-theme.css`
- 自定义样式写在 `theme/style.scss`

## 部署规范

### GitHub Pages 部署要求
1. 确保 GitHub Pages 设置为 GitHub Actions 部署
2. 推送到 `main` 分支自动触发部署
3. 部署配置文件：`.github/workflows/deploy.yml`

### 部署前检查清单
- [ ] `config.mts` 中的 `base` 路径正确
- [ ] 所有图片和资源路径正确
- [ ] 本地构建成功（`pnpm build`）
- [ ] 预览构建产物正常（`pnpm serve`）

## AI 辅助开发指南

### 创建新文章时
1. 确定文章分类和技术标签
2. 在对应分类目录下创建 markdown 文件
3. 添加完整的 Front Matter
4. 更新 `config.mts` 中的侧边栏配置
5. 如果是新分类，创建分类的 `index.md`

### 修改配置时
1. 修改 `config.mts` 后需要重启开发服务器
2. 修改主题样式后会热更新
3. 修改 `package.json` 后需要重新安装依赖

### 添加新功能时
1. 优先使用 @sugarat/theme 提供的功能
2. 自定义功能在 `theme/` 目录下实现
3. 保持与主题的兼容性
4. 更新依赖时注意版本兼容性

### 调试问题时
1. 检查浏览器控制台错误
2. 检查 VitePress 开发服务器输出
3. 验证文件路径和链接正确性
4. 确认 Front Matter 格式正确

## 代码风格规范

### TypeScript/JavaScript
- 使用 TypeScript 编写配置文件
- 使用 ES6+ 语法
- 导入语句放在文件顶部
- 使用有意义的变量名

### Markdown
- 使用中文标点符号
- 代码块指定语言
- 链接使用描述性文本
- 保持段落间空行

### 样式文件
- 使用 SCSS 语法
- 遵循 BEM 命名规范
- 避免过深的选择器嵌套
- 使用 CSS 变量定义主题色

## 注意事项

### 禁止操作
- ❌ 不要直接修改 `node_modules/`
- ❌ 不要提交 `.vitepress/cache/` 和 `.vitepress/dist/`
- ❌ 不要使用 npm 或 yarn 安装依赖
- ❌ 不要在生产环境使用开发模式

### 推荐实践
- ✅ 定期更新依赖版本
- ✅ 使用语义化的提交信息
- ✅ 文章添加适当的标签和分类
- ✅ 保持代码和配置的一致性
- ✅ 添加有意义的注释

## 常见问题处理

### 构建失败
1. 检查 Node.js 版本（需要 v20）
2. 删除 `node_modules` 和 `pnpm-lock.yaml`，重新安装
3. 检查文章 Front Matter 格式
4. 验证所有链接和资源路径

### 样式不生效
1. 确认样式文件已正确导入
2. 检查 CSS 选择器优先级
3. 清除浏览器缓存
4. 重启开发服务器

### 部署后页面 404
1. 检查 `base` 配置是否正确
2. 验证 GitHub Pages 设置
3. 确认文件路径大小写一致
4. 检查 `.github/workflows/deploy.yml` 配置

## 版本控制

### Git 提交规范
```
feat: 添加新功能
fix: 修复问题
docs: 文档更新
style: 样式调整
refactor: 代码重构
chore: 构建/工具变动
```

### 分支策略
- `main`: 生产分支，自动部署
- `dev`: 开发分支（可选）
- `feature/*`: 功能分支（可选）

## 性能优化建议

1. 图片使用 WebP 格式
2. 大图片放在 CDN
3. 合理使用代码分割
4. 避免过大的 markdown 文件
5. 使用 Pagefind 进行搜索优化

## 更新日志

在进行重大更改时，在此记录：

- 2026-01-19: 创建 AI 开发规则文档
