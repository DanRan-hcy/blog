import { defineConfig } from 'vitepress'

// https://vitepress.vuejs.org/config/app-configs
export default defineConfig({
  // 站点配置
  title: '我的技术博客',
  description: '分享编程技术和学习心得',
  lang: 'zh-CN',
  lastUpdated: true,
  
  // GitHub Pages部署配置
  // 如果部署到 https://<USERNAME>.github.io/<REPO>/ 则需要设置 base
  // 将此处的 'blog' 替换为您的GitHub仓库名称
  base: '/blog/',
  
  // 主题配置
  themeConfig: {
    logo: '/logo.png',
    nav: [
      { text: '首页', link: '/' },
      { text: '文章', link: '/articles/' },
      { text: '关于', link: '/about/' }
    ],
    sidebar: {
      '/articles/': [
        {
          text: '文章分类',
          items: [
            { text: 'JavaScript', link: '/articles/javascript/' },
            { text: 'Vue', link: '/articles/vue/' },
            { text: 'Node.js', link: '/articles/nodejs/' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/DanRan-hcy' }
    ],
    footer: {
      message: '基于 VitePress 构建',
      copyright: 'Copyright © 2023-present'
    }
  }
})