// ============================================
// 登录云函数 — 获取/创建用户
// ============================================
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

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
      console.warn('[login] 回填已评价次数失败:', e);
    }
  }

  return total;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    // 查找已有用户
    const userRes = await db.collection('users').where({ _openid: openid }).get();

    if (userRes.data.length > 0) {
      // 老用户，返回资料
      const user = userRes.data[0];
      const givenCount = await resolveGivenCount(openid, user);
      return {
        code: 0,
        data: {
          user_id: user._id,
          gender: user.gender || null,
          push_gender_pref: user.push_gender_pref || 'all',
          given_rating_count: givenCount,
          is_new: false,
        },
      };
    }

    // 新用户，创建记录
    const createRes = await db.collection('users').add({
      data: {
        _openid: openid,
        nickname: '',
        gender: null,
        push_gender_pref: 'all',
        ratings_given: 0,
        created_at: new Date(),
      },
    });

    return {
      code: 0,
      data: {
        user_id: createRes._id,
        gender: null,
        push_gender_pref: 'all',
        given_rating_count: 0,
        is_new: true,
      },
    };
  } catch (err) {
    console.error('[login] 错误:', err);
    return { code: -1, message: '登录失败，请重试' };
  }
};
