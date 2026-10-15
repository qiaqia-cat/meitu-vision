import type { MarketProfile, PlatformTemplate } from '@/types/editor'

export const platformTemplates: PlatformTemplate[] = [
  { id: 'tiktok', ratio: '9:16', width: 720, height: 1280, safeTop: 160, safeBottom: 220, accent: '#00d4ff' },
  { id: 'instagramPost', ratio: '4:5', width: 1080, height: 1350, safeTop: 90, safeBottom: 120, accent: '#ff4f9a' },
  { id: 'instagramStory', ratio: '9:16', width: 720, height: 1280, safeTop: 140, safeBottom: 190, accent: '#ff7b54' },
  { id: 'youtubeShorts', ratio: '9:16', width: 720, height: 1280, safeTop: 140, safeBottom: 240, accent: '#ff0033' },
  { id: 'pinterest', ratio: '2:3', width: 800, height: 1200, safeTop: 90, safeBottom: 120, accent: '#bd081c' },
  { id: 'shopee', ratio: '1:1', width: 1000, height: 1000, safeTop: 80, safeBottom: 110, accent: '#ee4d2d' },
  { id: 'etsy', ratio: '4:3', width: 1200, height: 900, safeTop: 70, safeBottom: 90, accent: '#f56400' }
]

export const marketProfiles: MarketProfile[] = [
  { id: 'northAmerica', colors: ['#f8fafc', '#111827', '#2563eb'], language: 'en' },
  { id: 'latinAmerica', colors: ['#fff7ed', '#f97316', '#be123c'], language: 'es' },
  { id: 'japanKorea', colors: ['#fff1f2', '#64748b', '#db2777'], language: 'ja' },
  { id: 'southeastAsia', colors: ['#ecfeff', '#0891b2', '#facc15'], language: 'en' },
  { id: 'europe', colors: ['#f4f4f5', '#18181b', '#16a34a'], language: 'en' }
]

export const stickers = ['NEW', 'SALE', 'AI', '2026', 'BEST', 'HOT']
