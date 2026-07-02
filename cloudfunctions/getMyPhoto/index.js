// ============================================
// 获取我的照片云函数
// ============================================
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const photoRes = await db.collection('photos')
      .where({ _openid: openid, is_active: true })
      .orderBy('created_at', 'desc')
      .limit(1)
      .get();

    if (photoRes.data.length === 0) {
      return { code: 0, data: null };
    }

    const photo = photoRes.data[0];

    // 获取临时下载链接
    let tempUrl = '';
    try {
      const urlRes = await cloud.getTempFileURL({
        fileList: [photo.cloud_file_id],
      });
      if (urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) {
        tempUrl = urlRes.fileList[0].tempFileURL;
      }
    } catch (e) {
      console.warn('[getMyPhoto] 获取临时链接失败:', e);
    }

    return {
      code: 0,
      data: {
        photo_id: photo._id,
        cloud_file_id: photo.cloud_file_id,
        url: tempUrl,
        created_at: photo.created_at,
      },
    };
  } catch (err) {
    console.error('[getMyPhoto] 错误:', err);
    return { code: -1, message: '查询失败，请重试' };
  }
};
