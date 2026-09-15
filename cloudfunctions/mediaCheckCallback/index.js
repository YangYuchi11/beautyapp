// ============================================
// 内容安全异步检测结果回调云函数
//
// 微信服务器在 30 分钟内会把 security.mediaCheckAsync 的检测结果推送到
// 消息接收方。本云函数需要用「云函数接收消息推送」方式接入：
//   云开发控制台 - 设置 - 其他设置 - 消息推送 - 推送模式选「云函数」
//   新增配置：消息类型 event，事件类型 wxa_media_check，选择本云函数
//
// 处理规则：
//   pass           → 照片置为可展示，其他人才会在打分页看到
//   risky / review → 一律按未通过处理：删除云存储文件，照片不再展示，由用户重新上传
// ============================================
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 更新照片的检测状态
function updatePhoto(photoId, data) {
  return db.collection('photos').doc(photoId).update({ data });
}

exports.main = async (event, context) => {
  // 只处理多媒体内容安全检测结果事件
  if (!event || event.Event !== 'wxa_media_check') {
    return { code: 0, message: 'ignored' };
  }

  // trace_id 由微信生成且不下发给前端，用它定位照片，外部无法伪造结果
  const traceId = event.trace_id;
  if (!traceId) {
    return { code: 0, message: 'missing trace_id' };
  }

  try {
    const photoRes = await db.collection('photos')
      .where({ check_trace_id: traceId })
      .get();

    if (photoRes.data.length === 0) {
      return { code: 0, message: 'photo not found' };
    }

    const photo = photoRes.data[0];

    // 幂等：已处理过（或照片已被用户删除重传）则跳过
    if (photo.status !== 'checking') {
      return { code: 0, message: 'already handled' };
    }

    const now = new Date();

    // 检测服务本身出错（如 -1008 下载失败），保持不展示并记录，由用户重新上传
    if (event.errcode !== 0) {
      console.warn('[mediaCheckCallback] 检测异常:', event.errcode, event.errmsg);
      await updatePhoto(photo._id, {
        check_error: event.errcode,
        checked_at: now,
      });
      return { code: 0, message: 'check error' };
    }

    const suggest = (event.result && event.result.suggest) || '';
    const label = (event.result && event.result.label) || 0;

    // 检测通过：照片可以展示给其他人
    if (suggest === 'pass') {
      await updatePhoto(photo._id, {
        status: 'approved',
        is_active: true,
        check_label: label,
        checked_at: now,
      });
      return { code: 0, message: 'approved' };
    }

    // 其余结果（risky 违规、review 建议人工复核等）一律按未通过处理：
    // 删除云存储文件，照片不再展示，由用户重新上传
    try {
      await cloud.deleteFile({ fileList: [photo.cloud_file_id] });
    } catch (e) {
      console.warn('[mediaCheckCallback] 删除未通过文件失败:', e);
    }

    await updatePhoto(photo._id, {
      status: 'rejected',
      is_active: false,
      check_label: label,
      check_suggest: suggest,
      checked_at: now,
    });
    return { code: 0, message: 'rejected' };
  } catch (err) {
    console.error('[mediaCheckCallback] 错误:', err);
    return { code: -1, message: '处理失败' };
  }
};
