// ============================================
// 提交评分云函数
// ============================================
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const { photo_id, score } = event;

  // 参数校验
  if (!photo_id) {
    return { code: -1, message: '缺少照片ID' };
  }

  const scoreNum = parseInt(score, 10);
  if (isNaN(scoreNum) || scoreNum < 1 || scoreNum > 10) {
    return { code: -1, message: '分数必须在 1-10 之间' };
  }

  try {
    // 1. 查询照片是否存在
    const photoRes = await db.collection('photos').doc(photo_id).get();
    if (!photoRes.data) {
      return { code: -1, message: '照片不存在' };
    }

    const photo = photoRes.data;

    // 2. 不能给自己的照片打分
    if (photo._openid === openid) {
      return { code: -1, message: '不能给自己的照片打分' };
    }

    // 3. 检查是否已评分（唯一性）
    const existRes = await db.collection('ratings')
      .where({ photo_id, _openid: openid })
      .get();

    if (existRes.data.length > 0) {
      return { code: -1, message: '您已经给这张照片打过分了' };
    }

    // 4. 插入评分
    await db.collection('ratings').add({
      data: {
        _openid: openid,
        photo_id,
        score: scoreNum,
        created_at: new Date(),
      },
    });

    // 5. 累加「已给他人打分次数」
    // 该计数用于判断是否可以查看自己的分数，独立累加不随照片被删除而减少
    try {
      await db.collection('users')
        .where({ _openid: openid })
        .update({
          data: {
            ratings_given: db.command.inc(1),
          },
        });
    } catch (e) {
      // 计数失败不影响评分本身（极端情况下用户需要多打一次分才能解锁）
      console.warn('[submitRating] 更新已评价次数失败:', e);
    }

    return { code: 0, message: '评分成功' };
  } catch (err) {
    console.error('[submitRating] 错误:', err);
    return { code: -1, message: '提交失败，请重试' };
  }
};
