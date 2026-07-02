// ============================================
// API 请求封装 — 微信云开发版本
// 所有接口通过 wx.cloud.callFunction 调用云函数
// ============================================

/**
 * 通用云函数调用方法
 */
function callFunction(name, data = {}) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data,
      success(res) {
        if (res.result.code === 0) {
          resolve(res.result.data);
        } else {
          reject({ code: res.result.code, message: res.result.message });
        }
      },
      fail(err) {
        console.error(`[云函数] ${name} 调用失败:`, err);
        reject({
          code: -1,
          message: '网络异常，请检查网络连接',
          error: err,
        });
      },
    });
  });
}

/**
 * 上传照片到云存储，然后调用 uploadPhoto 云函数记录到数据库
 */
function uploadPhoto(filePath, fileName) {
  return new Promise((resolve, reject) => {
    // Step 1: 上传到云存储
    const cloudPath = `photos/${Date.now()}_${fileName || 'photo.jpg'}`;
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success(res1) {
        // Step 2: 调用云函数记录到数据库
        callFunction('uploadPhoto', { cloud_file_id: res1.fileID })
          .then(resolve)
          .catch(reject);
      },
      fail(err) {
        console.error('[上传] 云存储上传失败:', err);
        reject({
          code: -1,
          message: '上传失败，请检查网络连接',
          error: err,
        });
      },
    });
  });
}

// ============================================
// API 接口
// ============================================

module.exports = {
  // 登录：云函数中自动获取 OPENID，无需传 code
  login() {
    return callFunction('login');
  },

  getUserProfile() {
    return callFunction('login'); // login 云函数返回用户资料
  },

  updateUserProfile(data) {
    return callFunction('updateProfile', data);
  },

  uploadPhoto,

  getMyPhoto() {
    return callFunction('getMyPhoto');
  },

  deletePhoto() {
    return callFunction('deletePhoto');
  },

  getNextPhoto() {
    return callFunction('getNextPhoto');
  },

  submitRating(photoId, score) {
    return callFunction('submitRating', { photo_id: photoId, score });
  },

  getMyRating() {
    return callFunction('getMyRating');
  },
};
