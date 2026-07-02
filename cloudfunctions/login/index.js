// ============================================
// 登录云函数 — 获取/创建用户
// ============================================
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    // 查找已有用户
    const userRes = await db.collection('users').where({ _openid: openid }).get();

    if (userRes.data.length > 0) {
      // 老用户，返回资料
      const user = userRes.data[0];
      return {
        code: 0,
        data: {
          user_id: user._id,
          gender: user.gender || null,
          push_gender_pref: user.push_gender_pref || 'all',
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
        created_at: new Date(),
      },
    });

    return {
      code: 0,
      data: {
        user_id: createRes._id,
        gender: null,
        push_gender_pref: 'all',
        is_new: true,
      },
    };
  } catch (err) {
    console.error('[login] 错误:', err);
    return { code: -1, message: '登录失败，请重试' };
  }
};
