# 我的技术博客

这是一个基于VitePress构建的技术博客，用于分享编程技术和学习心得。

## 特性

- 基于VitePress构建，享受Vue.js的开发体验
- 响应式设计，适配各种设备
- 自动部署到GitHub Pages
- 支持Markdown编写文章
- 内置搜索功能

## 部署说明

本博客已配置GitHub Actions自动部署到GitHub Pages。当代码推送到main分支时，会自动触发构建和部署流程。

### 部署步骤

1. 确保你的GitHub仓库已启用GitHub Pages功能
2. 将代码推送到main分支
3. GitHub Actions会自动构建并部署到gh-pages分支
4. 访问 https://<你的用户名>.github.io/blog/ 查看部署结果

## 本地开发

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

### 构建静态网站

```bash
npm run build
```

### 预览构建结果

```bash
npm run serve
```

## 目录结构

```
.
├── docs                  # 文档目录
│   ├── .vitepress       # VitePress配置
│   │   └── config.ts    # 配置文件
│   ├── public           # 静态资源
│   ├── about            # 关于页面
│   ├── articles         # 文章目录
│   └── index.md         # 首页
├── .github              # GitHub配置
│   └── workflows        # GitHub Actions工作流
└── package.json         # 项目配置
```