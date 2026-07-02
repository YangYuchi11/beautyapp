// ============================================
// 获取我的评分云函数 — 平均分 + 评分人数
// ============================================
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    // 1. 查找用户的活跃照片
    const photoRes = await db.collection('photos')
      .where({ _openid: openid, is_active: true })
      .get();

    if (photoRes.data.length === 0) {
      return {
        code: 0,
        data: {
          has_ratings: false,
          average_score: 0,
          total_count: 0,
        },
      };
    }

    const photoId = photoRes.data[0]._id;

    // 2. 聚合查询评分
    const ratingsRes = await db.collection('ratings')
      .where({ photo_id: photoId })
      .get();

    const totalCount = ratingsRes.data.length;

    if (totalCount === 0) {
      return {
        code: 0,
        data: {
          has_ratings: false,
          average_score: 0,
          total_count: 0,
        },
      };
    }

    // 计算平均分
    const totalScore = ratingsRes.data.reduce((sum, r) => sum + r.score, 0);
    const averageScore = Math.round((totalScore / totalCount) * 10) / 10; // 保留1位小数

    return {
      code: 0,
      data: {
        has_ratings: true,
        average_score: averageScore,
        total_count: totalCount,
      },
    };
  } catch (err) {
    console.error('[getMyRating] 错误:', err);
    return { code: -1, message: '查询失败，请重试' };
  }
};
