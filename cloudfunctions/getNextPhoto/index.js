// ============================================
// 获取下一张待评分照片云函数
// 按用户推送偏好随机返回一张未评分的照片
// ============================================
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    // 1. 获取当前用户的推送偏好
    const userRes = await db.collection('users').where({ _openid: openid }).get();
    if (userRes.data.length === 0) {
      return { code: -1, message: '用户不存在' };
    }
    const user = userRes.data[0];
    const pushPref = user.push_gender_pref || 'all';

    // 2. 获取该用户已评分的 photo_id 列表
    const ratedRes = await db.collection('ratings')
      .where({ _openid: openid })
      .field({ photo_id: true })
      .get();
    const ratedPhotoIds = ratedRes.data.map(r => r.photo_id);

    // 3. 查询所有活跃照片（排除自己的）
    let allPhotos = await db.collection('photos')
      .where({
        is_active: true,
        _openid: db.command.neq(openid),
      })
      .get();

    // 4. 按推送偏好过滤性别
    if (pushPref !== 'all') {
      // 需要查照片主人的性别
      const photoOwnerOpenids = [...new Set(allPhotos.data.map(p => p._openid))];
      if (photoOwnerOpenids.length > 0) {
        const ownerUsers = await db.collection('users')
          .where({
            _openid: db.command.in(photoOwnerOpenids),
            gender: pushPref,
          })
          .field({ _openid: true })
          .get();
        const matchedOpenids = new Set(ownerUsers.data.map(u => u._openid));
        allPhotos.data = allPhotos.data.filter(p => matchedOpenids.has(p._openid));
      } else {
        allPhotos.data = [];
      }
    }

    // 5. 排除已评分的照片
    const unratedPhotos = allPhotos.data.filter(p => !ratedPhotoIds.includes(p._id));

    if (unratedPhotos.length === 0) {
      return { code: 0, data: null };
    }

    // 6. 随机选择一张
    const randomIndex = Math.floor(Math.random() * unratedPhotos.length);
    const photo = unratedPhotos[randomIndex];

    // 7. 获取临时下载链接
    let tempUrl = '';
    try {
      const urlRes = await cloud.getTempFileURL({
        fileList: [photo.cloud_file_id],
      });
      if (urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) {
        tempUrl = urlRes.fileList[0].tempFileURL;
      }
    } catch (e) {
      console.warn('[getNextPhoto] 获取临时链接失败:', e);
    }

    return {
      code: 0,
      data: {
        photo_id: photo._id,
        url: tempUrl,
      },
    };
  } catch (err) {
    console.error('[getNextPhoto] 错误:', err);
    return { code: -1, message: '加载失败，请重试' };
  }
};
