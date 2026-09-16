// ============================================
// 上传照片云函数 — 记录照片到数据库 + 提交内容安全检测
// 前端先通过 wx.cloud.uploadFile 上传到云存储，再调用此函数记录
//
// 合规要求：用户上传的图片属于用户发布内容，必须先通过微信内容安全检测
// （security.mediaCheckAsync，异步接口）才能展示给其他人。
// 因此照片入库时为「审核中」且 is_active = false，检测通过后才由
// mediaCheckCallback 云函数置为可展示状态。
// ============================================
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 内容安全检测场景：1 资料；2 评论；3 论坛；4 社交日志
const SEC_CHECK_SCENE = 2;

// 回滚：检测提交失败的照片一律不入库、不展示
async function rollback(photoId, cloudFileId) {
  try {
    await db.collection('photos').doc(photoId).remove();
  } catch (e) {
    console.warn('[uploadPhoto] 回滚照片记录失败:', e);
  }
  try {
    await cloud.deleteFile({ fileList: [cloudFileId] });
  } catch (e) {
    console.warn('[uploadPhoto] 回滚云存储文件失败:', e);
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const { cloud_file_id } = event;

  if (!cloud_file_id) {
    return { code: -1, message: '缺少文件ID' };
  }

  try {
    // 1. 查找用户，确认已设置性别
    const userRes = await db.collection('users').where({ _openid: openid }).get();
    if (userRes.data.length === 0) {
      return { code: -1, message: '用户不存在' };
    }

    const user = userRes.data[0];
    if (!user.gender) {
      return { code: -1, message: '请先设置性别后再上传照片' };
    }

    // 2. 先将旧照片设为非活跃（如有）
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

    // 3. 新照片先入库为「审核中」，此时不会出现在他人的打分页
    const createRes = await db.collection('photos').add({
      data: {
        _openid: openid,
        cloud_file_id,
        status: 'checking',
        is_active: false,
        created_at: new Date(),
      },
    });

    const photoId = createRes._id;

    // 4. 提交内容安全异步检测（图片）
    // 检测结果由微信推送到消息接收方，由 mediaCheckCallback 云函数处理
    let traceId = '';
    try {
      const urlRes = await cloud.getTempFileURL({ fileList: [cloud_file_id] });
      const mediaUrl = urlRes.fileList[0] && urlRes.fileList[0].tempFileURL;
      if (!mediaUrl) {
        throw new Error('无法获取图片访问链接');
      }

      const checkRes = await cloud.openapi.security.mediaCheckAsync({
        mediaUrl,
        mediaType: 2, // 2：图片
        version: 2,
        scene: SEC_CHECK_SCENE,
        openid, // 要求用户近两小时内访问过小程序
      });

      console.log('[uploadPhoto] 内容安全检测返回:', JSON.stringify(checkRes));

      // 云调用出错会直接抛异常；返回体若带 errcode 则需为 0
      if (checkRes && typeof checkRes.errcode === 'number' && checkRes.errcode !== 0) {
        throw new Error(`errcode=${checkRes.errcode} errmsg=${checkRes.errmsg}`);
      }

      // 成功时以是否拿到检测任务 id 为准（traceId / trace_id 两种写法都兼容）
      traceId = (checkRes && (checkRes.traceId || checkRes.trace_id)) || '';

      if (!traceId) {
        throw new Error(`未获取到检测任务 id，返回值：${JSON.stringify(checkRes)}`);
      }
    } catch (e) {
      // 未能提交检测的图片绝不展示，直接回滚
      console.error('[uploadPhoto] 提交内容安全检测失败:', e);

      // -604101：云调用权限尚未生效（config.json 的权限配置有 10 分钟缓存）
      const detail = String((e && e.message) || e);
      const message = detail.indexOf('-604101') >= 0
        ? '内容安全检测权限尚未生效，请 10 分钟后重试'
        : '照片检测提交失败，请稍后重试';

      await rollback(photoId, cloud_file_id);
      return { code: -1, message };
    }

    await db.collection('photos').doc(photoId).update({
      data: {
        check_trace_id: traceId,
        check_submitted_at: new Date(),
      },
    });

    return {
      code: 0,
      data: {
        photo_id: photoId,
        status: 'checking',
      },
    };
  } catch (err) {
    console.error('[uploadPhoto] 错误:', err);
    return { code: -1, message: '上传失败，请重试' };
  }
};
