// ============================================
// 获取我的照片云函数
// 返回最近一次上传的照片及其内容安全检测状态：
//   checking  审核中（尚未对其他人展示）
//   approved  已通过，正常展示
//   rejected  含违规信息，已下架并删除文件
// ============================================
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const photoRes = await db.collection('photos')
      .where({ _openid: openid })
      .orderBy('created_at', 'desc')
      .limit(1)
      .get();

    if (photoRes.data.length === 0) {
      return { code: 0, data: null };
    }

    const photo = photoRes.data[0];
    const status = photo.status || (photo.is_active ? 'approved' : 'checking');

    // 违规照片的文件已删除，不再返回访问链接
    let tempUrl = '';
    if (status !== 'rejected') {
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
    }

    return {
      code: 0,
      data: {
        photo_id: photo._id,
        cloud_file_id: photo.cloud_file_id,
        url: tempUrl,
        status,
        is_active: !!photo.is_active,
        check_submitted_at: photo.check_submitted_at || photo.created_at,
        created_at: photo.created_at,
      },
    };
  } catch (err) {
    console.error('[getMyPhoto] 错误:', err);
    return { code: -1, message: '查询失败，请重试' };
  }
};
