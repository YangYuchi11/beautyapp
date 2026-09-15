// ============================================
// 获取我的评分云函数
// 1. 门槛校验：累计给他人打分满 REQUIRED_GIVEN_COUNT 次后才能查看自己的分数
// 2. 返回：平均分 + 打分人数 + 全站排名
// ============================================
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const $ = db.command.aggregate;

// 查看自己分数前，需要先给他人打分的累计次数
const REQUIRED_GIVEN_COUNT = 5;

// 云数据库单次查询上限
const QUERY_LIMIT = 1000;

// 拉取活跃照片的最大批数（防止照片量过大时循环过久）
const MAX_PHOTO_BATCH = 10;

/**
 * 已给他人打分的次数
 * 优先读 users.ratings_given（由 submitRating 累加，不随照片被删除而减少）；
 * 老用户没有该字段时，按实际评分记录统计一次并回填。
 */
async function resolveGivenCount(openid, user) {
  if (user && typeof user.ratings_given === 'number') {
    return user.ratings_given;
  }

  const countRes = await db.collection('ratings').where({ _openid: openid }).count();
  const total = countRes.total || 0;

  if (user) {
    try {
      await db.collection('users').doc(user._id).update({
        data: { ratings_given: total },
      });
    } catch (e) {
      console.warn('[getMyRating] 回填已评价次数失败:', e);
    }
  }

  return total;
}

/**
 * 拉取所有活跃照片的 _id（已删除/被替换的照片不计入排名）
 */
async function getActivePhotoIds() {
  const ids = [];

  for (let i = 0; i < MAX_PHOTO_BATCH; i++) {
    const res = await db.collection('photos')
      .where({ is_active: true })
      .field({ _id: true })
      .skip(i * QUERY_LIMIT)
      .limit(QUERY_LIMIT)
      .get();

    res.data.forEach(p => ids.push(p._id));

    if (res.data.length < QUERY_LIMIT) break;
  }

  return ids;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    // 1. 读取用户资料与「已评价他人次数」
    const userRes = await db.collection('users').where({ _openid: openid }).get();
    const user = userRes.data.length > 0 ? userRes.data[0] : null;
    const givenCount = await resolveGivenCount(openid, user);

    // 2. 门槛校验：不满足时不下发任何分数与排名数据
    if (givenCount < REQUIRED_GIVEN_COUNT) {
      return {
        code: 0,
        data: {
          can_view: false,
          given_count: givenCount,
          required_count: REQUIRED_GIVEN_COUNT,
        },
      };
    }

    const base = {
      can_view: true,
      given_count: givenCount,
      required_count: REQUIRED_GIVEN_COUNT,
    };

    // 3. 查找我的活跃照片
    const photoRes = await db.collection('photos')
      .where({ _openid: openid, is_active: true })
      .orderBy('created_at', 'desc')
      .limit(1)
      .get();

    if (photoRes.data.length === 0) {
      return {
        code: 0,
        data: Object.assign({}, base, {
          has_photo: false,
          has_ratings: false,
          average_score: 0,
          total_count: 0,
          rank: null,
          rank_total: 0,
          beat_percent: 0,
        }),
      };
    }

    const myPhotoId = photoRes.data[0]._id;

    // 4. 按 photo_id 汇总所有评分（聚合分组，不受单次查询 1000 条限制影响分组结果）
    const groupRes = await db.collection('ratings')
      .aggregate()
      .group({
        _id: '$photo_id',
        total: $.sum('$score'),
        count: $.sum(1),
      })
      .limit(QUERY_LIMIT)
      .end();

    // 5. 只保留当前活跃的照片，算出每张照片的平均分
    const activeIds = await getActivePhotoIds();
    const activeSet = new Set(activeIds);

    const entries = groupRes.list
      .filter(g => activeSet.has(g._id))
      .map(g => ({
        photo_id: g._id,
        avg: g.count > 0 ? g.total / g.count : 0,
        count: g.count,
      }));

    const mine = entries.find(e => e.photo_id === myPhotoId);

    if (!mine) {
      // 已解锁但还没有人给我打分
      return {
        code: 0,
        data: Object.assign({}, base, {
          has_photo: true,
          has_ratings: false,
          average_score: 0,
          total_count: 0,
          rank: null,
          rank_total: entries.length,
          beat_percent: 0,
        }),
      };
    }

    // 6. 排名：平均分比我高的人数 + 1（同分并列，分母为所有已上榜照片）
    const averageScore = Math.round(mine.avg * 10) / 10; // 展示用，保留 1 位小数
    let higherCount = 0;
    let lowerCount = 0;

    entries.forEach((e) => {
      if (e.avg > mine.avg) higherCount++;
      else if (e.avg < mine.avg) lowerCount++;
    });

    const rankTotal = entries.length;
    const beatPercent = rankTotal > 1
      ? Math.round((lowerCount / (rankTotal - 1)) * 100)
      : 0;

    return {
      code: 0,
      data: Object.assign({}, base, {
        has_photo: true,
        has_ratings: true,
        average_score: averageScore,
        total_count: mine.count,
        rank: higherCount + 1,
        rank_total: rankTotal,
        beat_percent: beatPercent,
      }),
    };
  } catch (err) {
    console.error('[getMyRating] 错误:', err);
    return { code: -1, message: '查询失败，请重试' };
  }
};
