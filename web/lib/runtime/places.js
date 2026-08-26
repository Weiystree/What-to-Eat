// Google Places (New) 附近餐厅查询。
// 由 lib/runtime/runners.js 的 runRecommend 在场景=餐厅且有定位时消费。

// 文档：https://developers.google.com/maps/documentation/places/web-service/nearby-search
// 注意用的是 v1 endpoint（新版），FieldMask 精确挑字段控成本
async function fetchNearbyRestaurants(loc, scene) {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) return []

  // 场景=餐厅：涵盖堂食 + 外卖 + 快餐，3000m 半径（大陆 Google 数据稀疏）
  const radius = 3000
  const includedTypes = ['restaurant', 'meal_takeaway', 'fast_food_restaurant', 'cafe', 'bakery']
  const body = {
    includedTypes,
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: loc.lat, longitude: loc.lng },
        radius
      }
    },
    rankPreference: 'DISTANCE',
    languageCode: 'zh-CN'
  }
  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.primaryType',
    'places.types',
    'places.rating',
    'places.userRatingCount',
    'places.priceLevel',
    'places.location',
    'places.formattedAddress',
    'places.currentOpeningHours.openNow'
  ].join(',')

  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': fieldMask
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error('places_http_' + res.status + ' ' + text.slice(0, 200))
  }
  const data = await res.json()
  const rawPlaces = (data && data.places) || []
  console.log('[places] google raw count:', rawPlaces.length)

  return rawPlaces
    .filter(p => p && p.location && p.displayName)
    .map(p => {
      const dm = haversineMeters(loc.lat, loc.lng, p.location.latitude, p.location.longitude)
      return {
        placeId: p.id || '',
        name: (p.displayName && p.displayName.text) || '',
        primaryType: p.primaryType || (p.types && p.types[0]) || '',
        types: (p.types || []).slice(0, 4),
        rating: p.rating || null,
        userRatingCount: p.userRatingCount || 0,
        priceLevel: p.priceLevel || null,
        openNow: !!(p.currentOpeningHours && p.currentOpeningHours.openNow),
        address: p.formattedAddress || '',
        distanceMeters: Math.round(dm),
        typicalDishes: dishHintByType(p.primaryType || (p.types && p.types[0]) || '')
      }
    })
    // 大陆 Google Places 覆盖稀疏，放宽评级和评分数阈值
    .filter(p => (p.rating || 0) >= 3.0 && p.userRatingCount >= 3)
    // 排序：先按评分再按距离
    .sort((a, b) => (b.rating - a.rating) || (a.distanceMeters - b.distanceMeters))
    .slice(0, 8)
}

// primary type → 该店大概会有的菜品线索，帮模型判断
function dishHintByType(type) {
  const t = (type || '').toLowerCase()
  const hints = {
    chinese_restaurant: ['家常菜', '面条', '盖饭'],
    japanese_restaurant: ['寿司', '拉面', '定食'],
    korean_restaurant: ['石锅拌饭', '烤肉', '部队锅'],
    italian_restaurant: ['意面', '披萨', '沙拉'],
    thai_restaurant: ['冬阴功', '咖喱', '芒果糯米饭'],
    indian_restaurant: ['咖喱', '烤饼', '香饭'],
    mexican_restaurant: ['塔可', '卷饼', '玉米片'],
    american_restaurant: ['汉堡', '牛排', '沙拉'],
    seafood_restaurant: ['海鲜', '鱼汤'],
    steak_house: ['牛排'],
    sushi_restaurant: ['寿司', '刺身'],
    ramen_restaurant: ['拉面'],
    fast_food_restaurant: ['汉堡', '炸鸡', '薯条'],
    hamburger_restaurant: ['汉堡'],
    pizza_restaurant: ['披萨'],
    cafe: ['咖啡', '三明治', '轻食'],
    bakery: ['面包', '甜点'],
    meal_takeaway: ['盖饭', '面条', '快餐'],
    vegetarian_restaurant: ['素菜', '沙拉']
  }
  return hints[t] || []
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export { fetchNearbyRestaurants }
