// ============================================
// 删除照片云函数 — 删除云存储文件 + 数据库记录 + 评分
// ============================================
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    // 查找用户活跃照片
    const photoRes = await db.collection('photos')
      .where({ _openid: openid, is_active: true })
      .get();

    if (photoRes.data.length === 0) {
      return { code: -1, message: '没有可删除的照片' };
    }

    const photo = photoRes.data[0];

    // 1. 删除云存储文件
    try {
      await cloud.deleteFile({ fileList: [photo.cloud_file_id] });
    } catch (e) {
      console.warn('[deletePhoto] 删除云存储文件失败:', e);
    }

    // 2. 删除该照片的所有评分
    const ratingsRes = await db.collection('ratings')
      .where({ photo_id: photo._id })
      .get();

    if (ratingsRes.data.length > 0) {
      await Promise.all(ratingsRes.data.map(r =>
        db.collection('ratings').doc(r._id).remove()
      ));
    }

    // 3. 删除照片记录
    await db.collection('photos').doc(photo._id).remove();

    return { code: 0, message: '删除成功' };
  } catch (err) {
    console.error('[deletePhoto] 错误:', err);
    return { code: -1, message: '删除失败，请重试' };
  }
};
