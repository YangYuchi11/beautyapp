// ============================================
// 更新用户资料云函数
// ============================================
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const { gender, push_gender_pref } = event;

  // 至少需要更新一个字段
  if (!gender && !push_gender_pref) {
    return { code: -1, message: '没有需要更新的数据' };
  }

  try {
    // 查找用户
    const userRes = await db.collection('users').where({ _openid: openid }).get();
    if (userRes.data.length === 0) {
      return { code: -1, message: '用户不存在' };
    }

    const updateData = {};
    if (gender) {
      if (!['male', 'female'].includes(gender)) {
        return { code: -1, message: '性别参数无效' };
      }
      updateData.gender = gender;
    }
    if (push_gender_pref) {
      if (!['all', 'male', 'female'].includes(push_gender_pref)) {
        return { code: -1, message: '推送偏好参数无效' };
      }
      updateData.push_gender_pref = push_gender_pref;
    }

    await db.collection('users').where({ _openid: openid }).update({
      data: updateData,
    });

    return { code: 0, data: updateData };
  } catch (err) {
    console.error('[updateProfile] 错误:', err);
    return { code: -1, message: '更新失败，请重试' };
  }
};
