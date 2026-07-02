// ============================================
// 上传照片云函数 — 记录照片到数据库
// 前端先通过 wx.cloud.uploadFile 上传到云存储，再调用此函数记录
// ============================================
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const { cloud_file_id } = event;

  if (!cloud_file_id) {
    return { code: -1, message: '缺少文件ID' };
  }

  try {
    // 查找用户，确认已设置性别
    const userRes = await db.collection('users').where({ _openid: openid }).get();
    if (userRes.data.length === 0) {
      return { code: -1, message: '用户不存在' };
    }

    const user = userRes.data[0];
    if (!user.gender) {
      return { code: -1, message: '请先设置性别后再上传照片' };
    }

    // 先将旧照片设为非活跃（如有）
    const oldPhotos = await db.collection('photos')
      .where({ _openid: openid, is_active: true })
      .get();

    if (oldPhotos.data.length > 0) {
      // 删除旧的云存储文件
      for (const photo of oldPhotos.data) {
        try {
          await cloud.deleteFile({ fileList: [photo.cloud_file_id] });
        } catch (e) {
          console.warn('[uploadPhoto] 删除旧云存储文件失败:', e);
        }
      }
      // 批量标记旧照片为非活跃
      const oldIds = oldPhotos.data.map(p => p._id);
      await Promise.all(oldIds.map(id =>
        db.collection('photos').doc(id).update({ data: { is_active: false } })
      ));
    }

    // 创建新照片记录
    const createRes = await db.collection('photos').add({
      data: {
        _openid: openid,
        cloud_file_id,
        status: 'approved',
        is_active: true,
        created_at: new Date(),
      },
    });

    return {
      code: 0,
      data: {
        photo_id: createRes._id,
      },
    };
  } catch (err) {
    console.error('[uploadPhoto] 错误:', err);
    return { code: -1, message: '上传失败，请重试' };
  }
};
