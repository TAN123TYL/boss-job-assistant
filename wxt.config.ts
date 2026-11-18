import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  manifest: {
    name: 'Boss 岗位助手',
    short_name: 'Boss 岗位助手',
    description: '基于简历匹配、城市过滤、AI 复核和公司全网核验的 Boss 直聘求职助手。',
    version: '0.4.1',
    permissions: [
      'storage',
      'unlimitedStorage',
      'sidePanel',
      'activeTab',
      'tabs',
      'alarms',
      'notifications',
    ],
    host_permissions: ['https://www.zhipin.com/*'],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    action: {
      default_title: '打开 Boss 岗位助手',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
      },
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
  },
});
